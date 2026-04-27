import {
  parseWzFile,
  parseImgBytes,
  type WzFileInfo,
  type WzEntry,
  type PropNode,
} from "./patcher";
import {
  decodeCanvasRawBytes,
  decodeVectorRawBytes,
  peekOtherTypeName,
} from "./canvas-decoder";
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
} from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { dirname, join } from "path";

const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL ||
  "https://pub-34b8b332208f464a9e74fa14104be3e2.r2.dev";

const CACHE_ROOT = join(process.env.COSMIC_ROOT || "/cosmic", "wz-cache");

// WZ files we know are too big to fit on the dashboard's pod budget. Listed
// for completeness in /api/admin/wz/list (so the user sees them) but the
// explorer refuses to auto-load them; force=1 overrides the guard for users
// who really do want to wait on a 600 MB+ download.
export const HEAVY_FILES = new Set(["Map.wz", "Mob.wz"]);

interface CacheEntry {
  wzInfo: WzFileInfo;
  etag: string | null;
  fetchedAt: number;
}
const CACHE = new Map<string, CacheEntry>();
const IN_FLIGHT = new Map<string, Promise<WzFileInfo>>();
// Skip the HEAD request if we last checked the remote within this window.
const ETAG_CHECK_TTL_MS = 60 * 1000;

// ---------- Cache + download ----------

async function fetchEtag(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) return null;
    return res.headers.get("etag");
  } catch {
    return null;
  }
}

async function downloadWz(name: string, destPath: string): Promise<void> {
  const url = `${R2_PUBLIC_URL}/${name}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${name}: HTTP ${res.status}`);
  if (!res.body) throw new Error(`No body for ${name}`);
  mkdirSync(dirname(destPath), { recursive: true });
  const readable = Readable.fromWeb(res.body as any);
  await pipeline(readable, createWriteStream(destPath));
}

/** Get a parsed WzFileInfo for `name`, downloading + caching as needed. */
export async function getWzCached(
  name: string,
  opts: { force?: boolean } = {}
): Promise<WzFileInfo> {
  if (HEAVY_FILES.has(name) && !opts.force) {
    throw new Error(
      `${name} is over the auto-load size cap. Pass force=1 to download anyway (slow).`
    );
  }

  const existing = IN_FLIGHT.get(name);
  if (existing) return existing;

  const url = `${R2_PUBLIC_URL}/${name}`;
  const cachePath = join(CACHE_ROOT, name);
  const cached = CACHE.get(name);

  // Fast path: cache hit and we checked the etag recently.
  if (cached && Date.now() - cached.fetchedAt < ETAG_CHECK_TTL_MS) {
    return cached.wzInfo;
  }

  // Slow path: HEAD the remote to compare etag, then return cache or refetch.
  const promise = (async () => {
    try {
      const remoteEtag = await fetchEtag(url);
      const stale = !cached || (remoteEtag && cached.etag !== remoteEtag);
      if (cached && !stale) {
        // Same etag: bump fetchedAt to avoid HEADing again for a while.
        CACHE.set(name, { ...cached, fetchedAt: Date.now() });
        return cached.wzInfo;
      }
      if (!existsSync(cachePath) || stale) {
        await downloadWz(name, cachePath);
      }
      const wzInfo = parseWzFile(cachePath);
      CACHE.set(name, { wzInfo, etag: remoteEtag, fetchedAt: Date.now() });
      return wzInfo;
    } finally {
      IN_FLIGHT.delete(name);
    }
  })();

  IN_FLIGHT.set(name, promise);
  return promise;
}

// ---------- Path navigation ----------

/** Walk wzInfo.root by slash-separated path. Returns null if not found. */
function resolvePath(
  wzInfo: WzFileInfo,
  path: string
): WzEntry | { children: WzEntry[]; isRoot: true } | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) {
    return { children: wzInfo.root, isRoot: true };
  }
  let current: WzEntry | undefined;
  let pool: WzEntry[] = wzInfo.root;
  for (const part of parts) {
    current = pool.find((e) => e.name === part);
    if (!current) return null;
    if (current.type === "dir") {
      pool = current.children || [];
    } else {
      // .img — terminal
      return current;
    }
  }
  return current!;
}

// ---------- Directory listing ----------

export interface DirChild {
  name: string;
  type: "dir" | "img";
  size: number;
  childCount?: number;
}

export interface DirListing {
  path: string;
  children: DirChild[];
}

export function getDirectoryListing(
  wzInfo: WzFileInfo,
  path: string
): DirListing {
  const target = resolvePath(wzInfo, path);
  if (!target) throw new Error(`Path not found: ${path}`);
  if ("isRoot" in target) {
    return {
      path,
      children: target.children.map((e) => mapChild(e)),
    };
  }
  if (target.type === "img") {
    throw new Error(`${path} is an .img file, not a directory`);
  }
  return {
    path,
    children: (target.children || []).map((e) => mapChild(e)),
  };
}

function mapChild(e: WzEntry): DirChild {
  return {
    name: e.name,
    type: e.type,
    size: e.blockSize,
    childCount: e.type === "dir" ? (e.children?.length ?? 0) : undefined,
  };
}

// ---------- .img property tree ----------

export interface PropNodeView {
  name: string;
  type: "sub" | "string" | "int" | "canvas" | "vector" | "other";
  value?: string | number;
  children?: PropNodeView[];
  // canvas
  png?: string; // data URL
  width?: number;
  height?: number;
  format?: number;
  formatSupported?: boolean;
  decodeError?: string;
  // vector
  x?: number;
  y?: number;
  // other (unrecognized "extended" type)
  rawTypeName?: string;
  rawSize?: number;
}

export interface ImgResponse {
  path: string;
  bytes: number;
  tree: PropNodeView;
}

function readImgBytes(wzInfo: WzFileInfo, entry: WzEntry): Buffer {
  if (entry.data) return entry.data;
  if (entry.originalOffset == null) {
    throw new Error(
      `${entry.name} has neither data nor originalOffset (was the WZ parsed correctly?)`
    );
  }
  const fd = openSync(wzInfo.filePath, "r");
  try {
    const buf = Buffer.alloc(entry.blockSize);
    readSync(fd, buf, 0, entry.blockSize, entry.originalOffset);
    return buf;
  } finally {
    closeSync(fd);
  }
}

/** Convert a PropNode tree (with raw "other" extended types) into the
 *  serializable view the API ships, decoding canvases / vectors inline. */
function shapeNode(node: PropNode): PropNodeView {
  if (node.type === "string") {
    return { name: node.name, type: "string", value: node.value as string };
  }
  if (node.type === "int") {
    return { name: node.name, type: "int", value: node.value as number };
  }
  if (node.type === "sub") {
    return {
      name: node.name,
      type: "sub",
      children: (node.children || []).map(shapeNode),
    };
  }
  // type === "other": dispatch on the type tag inside rawBytes
  const raw = node.rawBytes;
  if (!raw) {
    return { name: node.name, type: "other", rawSize: 0 };
  }
  const typeName = peekOtherTypeName(raw);
  if (typeName === "Canvas") {
    try {
      const c = decodeCanvasRawBytes(raw);
      return {
        name: node.name,
        type: "canvas",
        width: c.width,
        height: c.height,
        format: c.format,
        formatSupported: c.formatSupported,
        png: `data:image/png;base64,${c.png.toString("base64")}`,
      };
    } catch (err: any) {
      return {
        name: node.name,
        type: "canvas",
        decodeError: err.message,
        rawSize: raw.length,
      };
    }
  }
  if (typeName === "Shape2D#Vector2D") {
    try {
      const v = decodeVectorRawBytes(raw);
      return { name: node.name, type: "vector", x: v.x, y: v.y };
    } catch (err: any) {
      return {
        name: node.name,
        type: "vector",
        decodeError: err.message,
        rawSize: raw.length,
      };
    }
  }
  return {
    name: node.name,
    type: "other",
    rawTypeName: typeName || undefined,
    rawSize: raw.length,
  };
}

export function getImgPropertyTree(
  wzInfo: WzFileInfo,
  path: string
): ImgResponse {
  const target = resolvePath(wzInfo, path);
  if (!target) throw new Error(`Path not found: ${path}`);
  if ("isRoot" in target || target.type !== "img") {
    throw new Error(`${path} is not an .img file`);
  }
  const imgData = readImgBytes(wzInfo, target);
  const tree = parseImgBytes(imgData, wzInfo.keyStream);
  return {
    path,
    bytes: target.blockSize,
    tree: shapeNode({ ...tree, name: target.name }),
  };
}

// ---------- Search ----------

export interface SearchMatch {
  path: string;
  kind: "dir" | "img";
  size?: number;
}

export interface SearchResult {
  query: string;
  matches: SearchMatch[];
  truncated: boolean;
}

export function searchWz(
  wzInfo: WzFileInfo,
  query: string,
  limit = 100
): SearchResult {
  const q = query.toLowerCase();
  const matches: SearchMatch[] = [];
  let truncated = false;

  function walk(entries: WzEntry[], prefix: string) {
    for (const e of entries) {
      if (matches.length >= limit) {
        truncated = true;
        return;
      }
      const path = prefix + "/" + e.name;
      if (e.name.toLowerCase().includes(q)) {
        matches.push({
          path,
          kind: e.type,
          size: e.blockSize,
        });
      }
      if (e.type === "dir" && e.children) {
        walk(e.children, path);
      }
    }
  }
  walk(wzInfo.root, "");
  return { query, matches, truncated };
}

// ---------- Cache invalidation ----------

/**
 * Drop the in-memory parsed entry for one WZ file (or all of them). Doesn't
 * delete the cached file on disk — next request will refetch + reparse.
 */
export function invalidateExplorerCache(name?: string) {
  if (name) {
    CACHE.delete(name);
    IN_FLIGHT.delete(name);
  } else {
    CACHE.clear();
    IN_FLIGHT.clear();
  }
}
