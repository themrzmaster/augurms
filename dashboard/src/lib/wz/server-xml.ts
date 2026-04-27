// Server-side WZ XML browsing — companion to explorer.ts but reading from
// the extracted server-wz.tar.gz mirror at /cosmic/wz-cache/server-xml/wz/.
//
// The server tarball contains XML mirrors of every .img the game server
// reads. Browsing it lets you confirm "did my published item make it into
// the server's view?" in addition to what the client sees.

import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { execSync } from "child_process";
import { dirname, join, relative, sep } from "path";

import type {
  DirChild,
  DirListing,
  ImgResponse,
  PropNodeView,
  SearchMatch,
  SearchResult,
} from "./explorer";

const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL ||
  "https://pub-34b8b332208f464a9e74fa14104be3e2.r2.dev";

const CACHE_ROOT = join(process.env.COSMIC_ROOT || "/cosmic", "wz-cache");
const TAR_PATH = join(CACHE_ROOT, "server-wz.tar.gz");
const EXTRACT_ROOT = join(CACHE_ROOT, "server-xml");
// Tarball top-level dir is `wz/`, so resolved entries live here:
const WZ_ROOT = join(EXTRACT_ROOT, "wz");

const ETAG_CHECK_TTL_MS = 60 * 1000;

interface ServerXmlState {
  etag: string | null;
  fetchedAt: number;
}
let STATE: ServerXmlState = { etag: null, fetchedAt: 0 };
let IN_FLIGHT: Promise<void> | null = null;

// ---------- Download + extract ----------

async function fetchEtag(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) return null;
    return res.headers.get("etag");
  } catch {
    return null;
  }
}

async function downloadTar(): Promise<void> {
  const res = await fetch(`${R2_PUBLIC_URL}/server-wz.tar.gz`);
  if (!res.ok) {
    throw new Error(`server-wz.tar.gz fetch failed: HTTP ${res.status}`);
  }
  if (!res.body) throw new Error("server-wz.tar.gz: no body");
  mkdirSync(dirname(TAR_PATH), { recursive: true });
  const readable = Readable.fromWeb(res.body as any);
  await pipeline(readable, createWriteStream(TAR_PATH));
}

function extractTar(): void {
  // Wipe + re-extract so we never serve stale files mixed with fresh ones.
  if (existsSync(EXTRACT_ROOT)) {
    rmSync(EXTRACT_ROOT, { recursive: true, force: true });
  }
  mkdirSync(EXTRACT_ROOT, { recursive: true });
  execSync(`tar xzf "${TAR_PATH}" -C "${EXTRACT_ROOT}"`, { timeout: 300000 });
}

/** Ensure the server-xml mirror is on disk and reasonably fresh. */
export async function ensureServerXml(): Promise<void> {
  if (IN_FLIGHT) return IN_FLIGHT;
  if (
    existsSync(WZ_ROOT) &&
    Date.now() - STATE.fetchedAt < ETAG_CHECK_TTL_MS
  ) {
    return;
  }

  IN_FLIGHT = (async () => {
    try {
      const remoteEtag = await fetchEtag(`${R2_PUBLIC_URL}/server-wz.tar.gz`);
      const fresh =
        existsSync(WZ_ROOT) && remoteEtag && STATE.etag === remoteEtag;
      if (fresh) {
        STATE = { etag: STATE.etag, fetchedAt: Date.now() };
        return;
      }
      await downloadTar();
      extractTar();
      STATE = { etag: remoteEtag, fetchedAt: Date.now() };
    } finally {
      IN_FLIGHT = null;
    }
  })();
  return IN_FLIGHT;
}

// ---------- Tree listing ----------

/**
 * subPath is slash-separated relative to wz/ root, e.g.
 *   ""             → top-level Character.wz / Item.wz / ...
 *   "/Character.wz" → Hair / Face / ...
 *   "/Character.wz/Hair" → 00030000.img.xml ...
 */
export function getServerDirectoryListing(subPath: string): DirListing {
  const parts = subPath.split("/").filter(Boolean);
  const dir = join(WZ_ROOT, ...parts);
  if (!existsSync(dir)) {
    throw new Error(`Path not found: ${subPath}`);
  }
  const stat = statSync(dir);
  if (!stat.isDirectory()) {
    throw new Error(`${subPath} is not a directory`);
  }
  const entries = readdirSync(dir, { withFileTypes: true });
  const children: DirChild[] = entries
    .filter((e) => !e.name.startsWith("."))
    .map((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        const sub = readdirSync(full).filter((n) => !n.startsWith("."));
        return {
          name: e.name,
          type: "dir" as const,
          size: 0,
          childCount: sub.length,
        };
      }
      const sz = statSync(full).size;
      return { name: e.name, type: "img" as const, size: sz };
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  return { path: subPath, children };
}

// ---------- XML → PropNodeView ----------

const TOKEN_RE = /<(\/?)(\w+)((?:\s+\w+="[^"]*")*)\s*(\/)?>/g;
const ATTR_RE = /(\w+)="([^"]*)"/g;

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(s))) {
    out[m[1]] = m[2]
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }
  return out;
}

function tagToProp(tag: string, attrs: Record<string, string>): PropNodeView {
  const name = attrs.name || "";
  switch (tag) {
    case "imgdir":
    case "extended":
      return { name, type: "sub", children: [] };
    case "int":
    case "short":
      return { name, type: "int", value: parseInt(attrs.value || "0", 10) };
    case "double":
    case "float":
      return {
        name,
        type: "int",
        value: parseFloat((attrs.value || "0").replace(",", ".")),
      };
    case "string":
    case "uol":
      return { name, type: "string", value: attrs.value || "" };
    case "canvas":
      return {
        name,
        type: "canvas",
        width: parseInt(attrs.width || "0", 10),
        height: parseInt(attrs.height || "0", 10),
        format: -1,
        formatSupported: false,
        decodeError: "Server XML has no pixel data — metadata only.",
      };
    case "vector":
      return {
        name,
        type: "vector",
        x: parseInt(attrs.x || "0", 10),
        y: parseInt(attrs.y || "0", 10),
      };
    default:
      return { name, type: "other", rawTypeName: tag };
  }
}

export function parseServerImgXmlString(xml: string, rootName: string): PropNodeView {
  const stack: PropNodeView[] = [];
  let root: PropNodeView | null = null;

  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(xml))) {
    const [, slash, tag, attrsStr, selfClose] = m;
    if (slash) {
      stack.pop();
      continue;
    }
    if (tag === "xml") continue; // <?xml ...?> tokens won't match TOKEN_RE anyway, defensive
    const attrs = parseAttrs(attrsStr);
    const node = tagToProp(tag, attrs);
    if (stack.length === 0) {
      root = node;
    } else {
      const parent = stack[stack.length - 1];
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    }
    if (!selfClose && (tag === "imgdir" || tag === "extended" || tag === "canvas")) {
      stack.push(node);
    }
  }

  if (!root) {
    return { name: rootName, type: "sub", children: [] };
  }
  // Use the .img name as the root display name for consistency with binary side.
  return { ...root, name: rootName };
}

export function getServerImgXml(subPath: string): ImgResponse {
  const parts = subPath.split("/").filter(Boolean);
  const filePath = join(WZ_ROOT, ...parts);
  if (!existsSync(filePath)) throw new Error(`Path not found: ${subPath}`);
  const stat = statSync(filePath);
  if (stat.isDirectory()) throw new Error(`${subPath} is a directory`);
  const xml = readFileSync(filePath, "utf-8");
  const baseName = parts[parts.length - 1];
  const tree = parseServerImgXmlString(xml, baseName);
  return {
    path: subPath,
    bytes: stat.size,
    tree,
  };
}

// ---------- Search ----------

export function searchServerXml(query: string, limit = 100): SearchResult {
  const q = query.toLowerCase();
  const matches: SearchMatch[] = [];
  let truncated = false;

  function walk(dir: string) {
    if (matches.length >= limit) {
      truncated = true;
      return;
    }
    let entries: import("fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (matches.length >= limit) {
        truncated = true;
        return;
      }
      const full = join(dir, e.name);
      const rel = "/" + relative(WZ_ROOT, full).split(sep).join("/");
      if (e.name.toLowerCase().includes(q)) {
        if (e.isDirectory()) {
          matches.push({ path: rel, kind: "dir" });
        } else {
          const sz = statSync(full).size;
          matches.push({ path: rel, kind: "img", size: sz });
        }
      }
      if (e.isDirectory()) walk(full);
    }
  }

  if (existsSync(WZ_ROOT)) walk(WZ_ROOT);
  return { query, matches, truncated };
}

// ---------- Helper: list top-level WZ subdirs (for the file dropdown) ----------

export function getServerWzTopLevel(): { name: string; size: number }[] {
  if (!existsSync(WZ_ROOT)) return [];
  return readdirSync(WZ_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => {
      // Approximate "size" as count of immediate children so the UI has
      // something to display alongside the name.
      try {
        const sub = readdirSync(join(WZ_ROOT, e.name));
        return { name: e.name, size: sub.length };
      } catch {
        return { name: e.name, size: 0 };
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
