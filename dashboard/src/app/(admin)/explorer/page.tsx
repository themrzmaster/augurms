"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Card from "@/components/Card";

interface ManifestFile {
  name: string;
  size: number;
}

interface DirChild {
  name: string;
  type: "dir" | "img";
  size: number;
  childCount?: number;
}

interface PropNodeView {
  name: string;
  type: "sub" | "string" | "int" | "canvas" | "vector" | "other";
  value?: string | number;
  children?: PropNodeView[];
  width?: number;
  height?: number;
  format?: number;
  formatSupported?: boolean;
  decodeError?: string;
  x?: number;
  y?: number;
  rawTypeName?: string;
  rawSize?: number;
}

interface ImgResponse {
  path: string;
  bytes: number;
  tree: PropNodeView;
}

interface SearchMatch {
  path: string;
  kind: "dir" | "img" | "string";
  size?: number;
  preview?: string;
  propPath?: string;
}

const HEAVY_FILES = new Set(["Map.wz", "Mob.wz"]);

// Files we know aren't WZ at all (DLLs, configs, exe). Hide from explorer.
const NON_WZ = (name: string) =>
  !name.toLowerCase().endsWith(".wz");

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

type Source = "client" | "server";

export default function ExplorerPage() {
  // useSearchParams forces client-side render — Next.js needs the consumer
  // wrapped in Suspense or the prerender step bails.
  return (
    <Suspense
      fallback={<div className="p-6 text-sm text-text-muted">Loading explorer…</div>}
    >
      <ExplorerInner />
    </Suspense>
  );
}

function ExplorerInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFile = searchParams.get("file");
  const initialPath = searchParams.get("path");
  const initialSource = (searchParams.get("source") as Source) || "client";

  const [files, setFiles] = useState<ManifestFile[]>([]);
  const [serverFiles, setServerFiles] = useState<ManifestFile[]>([]);
  const [activeSource, setActiveSource] = useState<Source>(initialSource);
  const [active, setActive] = useState<string | null>(initialFile);
  const [activeForce, setActiveForce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tree state per file
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [childrenByPath, setChildrenByPath] = useState<
    Map<string, DirChild[]>
  >(new Map());
  const [loadingPath, setLoadingPath] = useState<string | null>(null);

  // Detail state
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [detail, setDetail] = useState<ImgResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Search state
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchMatch[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Initial load: fetch client manifest + server XML top-level listing
  useEffect(() => {
    (async () => {
      try {
        const [manifestRes, serverRes] = await Promise.all([
          fetch("/api/admin/wz/list"),
          fetch("/api/admin/wz/explore/tree?source=server&path=/").catch(() => null),
        ]);

        const manifestData = manifestRes.ok ? await manifestRes.json() : { files: [] };
        const wzFiles = (manifestData.files || []).filter(
          (f: ManifestFile) => !NON_WZ(f.name)
        );
        setFiles(wzFiles);

        if (serverRes && serverRes.ok) {
          const sd = await serverRes.json();
          // Each child is a top-level WZ subdir under server-wz/wz/.
          setServerFiles(
            (sd.children || []).map((c: any) => ({
              name: c.name,
              size: c.childCount ?? 0,
            }))
          );
        }

        const initialValidClient =
          initialFile && wzFiles.some((f: ManifestFile) => f.name === initialFile);
        if (!initialValidClient && activeSource === "client" && !active && wzFiles.length > 0) {
          setActive(wzFiles[0].name);
        }
        if (initialValidClient && HEAVY_FILES.has(initialFile!)) {
          setActiveForce(true);
        }
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reflect state into the URL (router.replace, no history clutter).
  const updateUrl = useCallback(
    (file: string | null, path: string | null, source: Source) => {
      const params = new URLSearchParams();
      if (source !== "client") params.set("source", source);
      if (file) params.set("file", file);
      if (path) params.set("path", path);
      const qs = params.toString();
      router.replace(`/explorer${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router]
  );

  const loadChildren = useCallback(
    async (path: string) => {
      if (!active) return;
      if (childrenByPath.has(path)) return;
      setLoadingPath(path);
      try {
        const url = new URL("/api/admin/wz/explore/tree", window.location.origin);
        url.searchParams.set("source", activeSource);
        url.searchParams.set("file", active);
        url.searchParams.set("path", path);
        if (activeForce) url.searchParams.set("force", "1");
        const res = await fetch(url);
        if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
        const data = await res.json();
        setChildrenByPath((m) => {
          const next = new Map(m);
          next.set(path, data.children || []);
          return next;
        });
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoadingPath(null);
      }
    },
    [active, activeForce, activeSource, childrenByPath]
  );

  // When active file (or source) changes, reset state and load root.
  useEffect(() => {
    if (!active) return;
    setExpanded(new Set());
    setChildrenByPath(new Map());
    setSelectedPath(null);
    setDetail(null);
    setSearchResults(null);
    setError(null);
    loadChildren("/");
    updateUrl(active, selectedPath, activeSource);
  }, [active, activeSource]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore selection from initial URL once children exist.
  const [restoredFromUrl, setRestoredFromUrl] = useState(false);
  useEffect(() => {
    if (restoredFromUrl) return;
    if (!active || !initialPath) return;
    if (!childrenByPath.has("/")) return;
    setRestoredFromUrl(true);
    const looksLikeImg =
      initialPath.endsWith(".img") || initialPath.endsWith(".img.xml");
    if (looksLikeImg) {
      const segs = initialPath.split("/").filter(Boolean);
      const acc: string[] = ["/"];
      for (let i = 0; i < segs.length - 1; i++) {
        acc.push("/" + segs.slice(0, i + 1).join("/"));
      }
      setExpanded((e) => {
        const next = new Set(e);
        acc.forEach((p) => next.add(p));
        return next;
      });
      acc.forEach((p) => loadChildren(p));
      openImg(initialPath);
    }
  }, [active, initialPath, childrenByPath, restoredFromUrl, loadChildren]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = (path: string) => {
    setExpanded((e) => {
      const next = new Set(e);
      if (next.has(path)) next.delete(path);
      else {
        next.add(path);
        if (!childrenByPath.has(path)) loadChildren(path);
      }
      return next;
    });
  };

  const openImg = useCallback(
    async (path: string) => {
      if (!active) return;
      setSelectedPath(path);
      setDetail(null);
      setDetailError(null);
      setDetailLoading(true);
      updateUrl(active, path, activeSource);
      try {
        const url = new URL("/api/admin/wz/explore/img", window.location.origin);
        url.searchParams.set("source", activeSource);
        url.searchParams.set("file", active);
        url.searchParams.set("path", path);
        if (activeForce) url.searchParams.set("force", "1");
        const res = await fetch(url);
        if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
        const data = (await res.json()) as ImgResponse;
        setDetail(data);
      } catch (e: any) {
        setDetailError(e.message);
      } finally {
        setDetailLoading(false);
      }
    },
    [active, activeForce, activeSource, updateUrl]
  );

  const runSearch = useCallback(async () => {
    if (!active || query.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const url = new URL("/api/admin/wz/explore/search", window.location.origin);
      url.searchParams.set("source", activeSource);
      url.searchParams.set("file", active);
      url.searchParams.set("q", query.trim());
      if (activeForce) url.searchParams.set("force", "1");
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      const data = await res.json();
      setSearchResults(data.matches || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  }, [active, query, activeForce, activeSource]);

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    const t = setTimeout(runSearch, 300);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  return (
    <div className="flex h-[calc(100vh-1rem)] flex-col p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">WZ Explorer</h1>
          <p className="text-xs text-text-muted">
            Read-only browser for everything in the launcher manifest. Click any{" "}
            <code className="rounded bg-bg-card px-1">.img</code> to inspect its property tree.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={`${activeSource}:${active || ""}`}
            onChange={(e) => {
              const [src, f] = e.target.value.split(":") as [Source, string];
              if (src === "client" && HEAVY_FILES.has(f) && !activeForce) {
                if (
                  !confirm(
                    `${f} is huge (>500MB) and may OOM the dashboard pod. Load anyway?`
                  )
                ) {
                  return;
                }
                setActiveForce(true);
              } else {
                setActiveForce(false);
              }
              setActiveSource(src);
              setActive(f);
            }}
            className="rounded border border-border bg-bg-secondary px-2 py-1 text-sm text-text-primary"
          >
            <optgroup label="Client WZ (R2 binary)">
              {files.map((f) => (
                <option key={`client:${f.name}`} value={`client:${f.name}`}>
                  {f.name} ({formatSize(f.size)})
                  {HEAVY_FILES.has(f.name) ? " ⚠" : ""}
                </option>
              ))}
            </optgroup>
            {serverFiles.length > 0 && (
              <optgroup label="Server XML (server-wz.tar.gz)">
                {serverFiles.map((f) => (
                  <option key={`server:${f.name}`} value={`server:${f.name}`}>
                    {f.name} ({f.size} entries)
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </header>

      {error && (
        <Card className="mb-3 border-accent-red/30 bg-accent-red/5">
          <p className="text-sm text-accent-red">{error}</p>
        </Card>
      )}

      <div className="flex flex-1 gap-3 overflow-hidden">
        {/* Tree pane */}
        <div className="flex w-96 flex-col rounded-lg border border-border bg-bg-secondary/50">
          <div className="border-b border-border p-2">
            <input
              type="text"
              placeholder="Search this WZ (≥2 chars)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded border border-border bg-bg-secondary px-2 py-1 text-sm text-text-primary focus:border-accent-gold focus:outline-none"
            />
            {searching && (
              <p className="mt-1 text-[10px] text-text-muted">searching…</p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 text-sm">
            {searchResults ? (
              <SearchResultsList
                matches={searchResults}
                onPick={(m) => {
                  // For server XML the search returns absolute paths under
                  // /Character.wz/..., so we need to peel off the active file
                  // prefix before opening.
                  const path =
                    activeSource === "server" && active && m.path.startsWith(`/${active}/`)
                      ? m.path.slice(active.length + 1)
                      : m.path;
                  if (m.kind === "img" || m.kind === "string") {
                    openImg(path);
                  } else {
                    // expand to show the dir
                    const segs = path.split("/").filter(Boolean);
                    const acc: string[] = ["/"];
                    for (let i = 0; i < segs.length; i++) {
                      acc.push("/" + segs.slice(0, i + 1).join("/"));
                    }
                    setExpanded((e) => {
                      const next = new Set(e);
                      acc.forEach((p) => next.add(p));
                      return next;
                    });
                    acc.forEach((p) => loadChildren(p));
                    setSearchResults(null);
                    setQuery("");
                  }
                }}
              />
            ) : (
              <TreeNode
                path="/"
                childrenByPath={childrenByPath}
                expanded={expanded}
                loadingPath={loadingPath}
                onToggle={toggleExpand}
                onOpenImg={openImg}
                selectedPath={selectedPath}
                isRoot
              />
            )}
          </div>
        </div>

        {/* Detail pane */}
        <div className="flex-1 overflow-y-auto rounded-lg border border-border bg-bg-secondary/50 p-4">
          {!selectedPath ? (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
              Pick an .img on the left to inspect.
            </div>
          ) : detailLoading ? (
            <p className="text-sm text-text-muted">Parsing {selectedPath}…</p>
          ) : detailError ? (
            <Card className="border-accent-red/30 bg-accent-red/5">
              <p className="text-sm text-accent-red">{detailError}</p>
            </Card>
          ) : detail && active ? (
            <DetailView file={active} path={selectedPath} response={detail} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TreeNode({
  path,
  childrenByPath,
  expanded,
  loadingPath,
  onToggle,
  onOpenImg,
  selectedPath,
  isRoot,
}: {
  path: string;
  childrenByPath: Map<string, DirChild[]>;
  expanded: Set<string>;
  loadingPath: string | null;
  onToggle: (path: string) => void;
  onOpenImg: (path: string) => void;
  selectedPath: string | null;
  isRoot?: boolean;
}) {
  const children = childrenByPath.get(path);
  const isLoading = loadingPath === path;

  if (isRoot) {
    if (isLoading && !children) return <p className="text-text-muted text-xs">loading…</p>;
    if (!children) return null;
    return (
      <ul className="space-y-0.5">
        {children.map((c) => {
          const childPath = "/" + c.name;
          return (
            <ChildRow
              key={childPath}
              child={c}
              path={childPath}
              childrenByPath={childrenByPath}
              expanded={expanded}
              loadingPath={loadingPath}
              onToggle={onToggle}
              onOpenImg={onOpenImg}
              selectedPath={selectedPath}
            />
          );
        })}
      </ul>
    );
  }
  return null;
}

function ChildRow({
  child,
  path,
  childrenByPath,
  expanded,
  loadingPath,
  onToggle,
  onOpenImg,
  selectedPath,
}: {
  child: DirChild;
  path: string;
  childrenByPath: Map<string, DirChild[]>;
  expanded: Set<string>;
  loadingPath: string | null;
  onToggle: (p: string) => void;
  onOpenImg: (p: string) => void;
  selectedPath: string | null;
}) {
  const isExpanded = expanded.has(path);
  const isSelected = selectedPath === path;
  const subChildren = childrenByPath.get(path);
  const isLoading = loadingPath === path && !subChildren;

  return (
    <li>
      <button
        onClick={() => {
          if (child.type === "dir") onToggle(path);
          else onOpenImg(path);
        }}
        className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-bg-card ${
          isSelected ? "bg-accent-gold/10 text-accent-gold" : ""
        }`}
      >
        <span className="w-3 text-text-muted">
          {child.type === "dir" ? (isExpanded ? "▾" : "▸") : "•"}
        </span>
        <span className="flex-1 truncate text-text-primary">{child.name}</span>
        <span className="text-[10px] text-text-muted">
          {child.type === "dir"
            ? child.childCount != null
              ? `${child.childCount}`
              : ""
            : formatSize(child.size)}
        </span>
      </button>
      {child.type === "dir" && isExpanded && (
        <div className="ml-3 border-l border-border/40 pl-2">
          {isLoading ? (
            <p className="text-[11px] text-text-muted">loading…</p>
          ) : subChildren ? (
            <ul className="space-y-0.5">
              {subChildren.map((c) => (
                <ChildRow
                  key={path + "/" + c.name}
                  child={c}
                  path={path + "/" + c.name}
                  childrenByPath={childrenByPath}
                  expanded={expanded}
                  loadingPath={loadingPath}
                  onToggle={onToggle}
                  onOpenImg={onOpenImg}
                  selectedPath={selectedPath}
                />
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </li>
  );
}

function SearchResultsList({
  matches,
  onPick,
}: {
  matches: SearchMatch[];
  onPick: (m: SearchMatch) => void;
}) {
  if (matches.length === 0) {
    return <p className="p-1 text-xs text-text-muted">No matches.</p>;
  }
  return (
    <ul className="space-y-0.5">
      {matches.map((m, i) => (
        <li key={`${m.path}:${m.propPath ?? ""}:${i}`}>
          <button
            onClick={() => onPick(m)}
            className="flex w-full items-start gap-1 rounded px-1 py-0.5 text-left hover:bg-bg-card"
            title={m.path + (m.propPath ? "/" + m.propPath : "")}
          >
            <span className="mt-0.5 w-3 text-text-muted">
              {m.kind === "dir" ? "▸" : m.kind === "string" ? "“" : "•"}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block truncate text-xs text-text-primary">{m.path}</span>
              {m.kind === "string" && m.propPath && (
                <span className="block truncate text-[10px] text-text-muted">
                  {m.propPath} = <span className="text-text-secondary">{m.preview}</span>
                </span>
              )}
            </span>
            {m.size != null && (
              <span className="text-[10px] text-text-muted">{formatSize(m.size)}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function CopyButton({
  value,
  className,
  title,
}: {
  value: string;
  className?: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      title={title || `Copy: ${value.slice(0, 60)}${value.length > 60 ? "…" : ""}`}
      className={`rounded px-1 text-[10px] text-text-muted opacity-50 hover:opacity-100 ${className || ""}`}
    >
      {copied ? "✓" : "⎘"}
    </button>
  );
}

function DetailView({
  file,
  path,
  response,
}: {
  file: string;
  path: string;
  response: ImgResponse;
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 break-all font-mono text-xs text-text-muted">
        <span>{path}</span>
        <CopyButton value={`${file}${path}`} title="Copy full path" />
      </p>
      <p className="mb-3 text-xs text-text-secondary">
        {formatSize(response.bytes)} on disk
      </p>
      <div className="rounded-lg border border-border bg-bg-card/30 p-2 font-mono text-xs">
        <PropTreeNode
          file={file}
          imgPath={path}
          propPath=""
          node={response.tree}
          depth={0}
        />
      </div>
    </div>
  );
}

function PropTreeNode({
  file,
  imgPath,
  propPath,
  node,
  depth,
}: {
  file: string;
  imgPath: string;
  propPath: string;
  node: PropNodeView;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const indent = { paddingLeft: `${depth * 12}px` };

  if (node.type === "sub") {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={indent}
          className="flex w-full items-center gap-1 py-0.5 text-left hover:bg-bg-card/50"
        >
          <span className="w-3 text-text-muted">{expanded ? "▾" : "▸"}</span>
          <span className="text-text-primary">{node.name}</span>
          <span className="text-text-muted">
            ({node.children?.length ?? 0})
          </span>
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((c, i) => (
              <PropTreeNode
                key={`${c.name}-${i}`}
                file={file}
                imgPath={imgPath}
                propPath={propPath ? `${propPath}/${c.name}` : c.name}
                node={c}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (node.type === "string") {
    const v = String(node.value ?? "");
    return (
      <div style={indent} className="flex items-start gap-1 py-0.5">
        <span className="w-3 text-text-muted">·</span>
        <span className="text-accent-blue">{node.name}</span>
        <span className="text-text-muted">=</span>
        <span className="break-all text-text-primary">{v}</span>
        <span className="text-[10px] text-text-muted">str</span>
        <CopyButton value={v} title="Copy value" />
      </div>
    );
  }

  if (node.type === "int") {
    const v = String(node.value ?? "");
    return (
      <div style={indent} className="flex items-center gap-1 py-0.5">
        <span className="w-3 text-text-muted">·</span>
        <span className="text-accent-blue">{node.name}</span>
        <span className="text-text-muted">=</span>
        <span className="text-text-primary">{v}</span>
        <span className="text-[10px] text-text-muted">int</span>
        <CopyButton value={v} title="Copy value" />
      </div>
    );
  }

  if (node.type === "vector") {
    const v = `${node.x ?? "?"},${node.y ?? "?"}`;
    return (
      <div style={indent} className="flex items-center gap-1 py-0.5">
        <span className="w-3 text-text-muted">·</span>
        <span className="text-accent-blue">{node.name}</span>
        <span className="text-text-muted">=</span>
        <span className="text-text-primary">({v})</span>
        <span className="text-[10px] text-text-muted">vec</span>
        <CopyButton value={v} title="Copy as x,y" />
      </div>
    );
  }

  if (node.type === "canvas") {
    const canvasUrl = node.decodeError
      ? null
      : `/api/admin/wz/explore/canvas?file=${encodeURIComponent(file)}&path=${encodeURIComponent(imgPath)}&prop=${encodeURIComponent(propPath)}`;
    return (
      <div style={indent} className="flex items-start gap-2 py-1">
        <span className="w-3 text-text-muted">·</span>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <span className="text-accent-blue">{node.name}</span>
            <span className="text-text-muted">
              ({node.width}×{node.height}, fmt {node.format}
              {node.formatSupported === false ? " unsupported" : ""})
            </span>
            {canvasUrl && (
              <CopyButton
                value={typeof window !== "undefined" ? window.location.origin + canvasUrl : canvasUrl}
                title="Copy PNG URL"
              />
            )}
          </div>
          {canvasUrl ? (
            <img
              src={canvasUrl}
              alt={node.name}
              loading="lazy"
              style={{
                imageRendering: "pixelated",
                maxHeight: 200,
                maxWidth: 320,
                background:
                  "repeating-conic-gradient(#444 0% 25%, transparent 0% 50%) 50% / 12px 12px",
              }}
              className="rounded border border-border"
            />
          ) : node.decodeError ? (
            <span className="text-[10px] text-accent-red">{node.decodeError}</span>
          ) : null}
        </div>
      </div>
    );
  }

  // other / unknown
  return (
    <div style={indent} className="flex items-center gap-1 py-0.5">
      <span className="w-3 text-text-muted">·</span>
      <span className="text-accent-blue">{node.name}</span>
      <span className="text-text-muted">
        [{node.rawTypeName || "binary"}, {node.rawSize ?? 0}b]
      </span>
    </div>
  );
}
