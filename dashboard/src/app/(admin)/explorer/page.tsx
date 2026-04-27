"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  png?: string;
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
  kind: "dir" | "img";
  size?: number;
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

export default function ExplorerPage() {
  const [files, setFiles] = useState<ManifestFile[]>([]);
  const [active, setActive] = useState<string | null>(null);
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

  // Initial load: fetch manifest
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/wz/list");
        if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
        const data = await res.json();
        const wzFiles = (data.files || []).filter(
          (f: ManifestFile) => !NON_WZ(f.name)
        );
        setFiles(wzFiles);
        if (wzFiles.length > 0 && !active) setActive(wzFiles[0].name);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadChildren = useCallback(
    async (path: string) => {
      if (!active) return;
      if (childrenByPath.has(path)) return;
      setLoadingPath(path);
      try {
        const url = new URL("/api/admin/wz/explore/tree", window.location.origin);
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
    [active, activeForce, childrenByPath]
  );

  // When active file changes, reset state and load root
  useEffect(() => {
    if (!active) return;
    setExpanded(new Set());
    setChildrenByPath(new Map());
    setSelectedPath(null);
    setDetail(null);
    setSearchResults(null);
    setError(null);
    loadChildren("/");
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

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
      try {
        const url = new URL("/api/admin/wz/explore/img", window.location.origin);
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
    [active, activeForce]
  );

  const runSearch = useCallback(async () => {
    if (!active || query.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const url = new URL("/api/admin/wz/explore/search", window.location.origin);
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
  }, [active, query, activeForce]);

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
            value={active || ""}
            onChange={(e) => {
              const f = e.target.value;
              if (HEAVY_FILES.has(f) && !activeForce) {
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
              setActive(f);
            }}
            className="rounded border border-border bg-bg-secondary px-2 py-1 text-sm text-text-primary"
          >
            {files.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name} ({formatSize(f.size)})
                {HEAVY_FILES.has(f.name) ? " ⚠" : ""}
              </option>
            ))}
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
                  if (m.kind === "img") openImg(m.path);
                  else {
                    // expand to show the dir
                    const segs = m.path.split("/").filter(Boolean);
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
          ) : detail ? (
            <DetailView path={selectedPath} response={detail} />
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
      {matches.map((m) => (
        <li key={m.path}>
          <button
            onClick={() => onPick(m)}
            className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-bg-card"
            title={m.path}
          >
            <span className="w-3 text-text-muted">{m.kind === "dir" ? "▸" : "•"}</span>
            <span className="flex-1 truncate text-xs text-text-primary">{m.path}</span>
            {m.size != null && (
              <span className="text-[10px] text-text-muted">{formatSize(m.size)}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function DetailView({ path, response }: { path: string; response: ImgResponse }) {
  return (
    <div>
      <p className="mb-1 break-all font-mono text-xs text-text-muted">{path}</p>
      <p className="mb-3 text-xs text-text-secondary">
        {formatSize(response.bytes)} on disk
      </p>
      <div className="rounded-lg border border-border bg-bg-card/30 p-2 font-mono text-xs">
        <PropTreeNode node={response.tree} depth={0} />
      </div>
    </div>
  );
}

function PropTreeNode({ node, depth }: { node: PropNodeView; depth: number }) {
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
              <PropTreeNode key={`${c.name}-${i}`} node={c} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (node.type === "string") {
    return (
      <div style={indent} className="flex items-start gap-1 py-0.5">
        <span className="w-3 text-text-muted">·</span>
        <span className="text-accent-blue">{node.name}</span>
        <span className="text-text-muted">=</span>
        <span className="break-all text-text-primary">
          {String(node.value ?? "")}
        </span>
        <span className="text-[10px] text-text-muted">str</span>
      </div>
    );
  }

  if (node.type === "int") {
    return (
      <div style={indent} className="flex items-center gap-1 py-0.5">
        <span className="w-3 text-text-muted">·</span>
        <span className="text-accent-blue">{node.name}</span>
        <span className="text-text-muted">=</span>
        <span className="text-text-primary">{String(node.value ?? "")}</span>
        <span className="text-[10px] text-text-muted">int</span>
      </div>
    );
  }

  if (node.type === "vector") {
    return (
      <div style={indent} className="flex items-center gap-1 py-0.5">
        <span className="w-3 text-text-muted">·</span>
        <span className="text-accent-blue">{node.name}</span>
        <span className="text-text-muted">=</span>
        <span className="text-text-primary">
          ({node.x ?? "?"}, {node.y ?? "?"})
        </span>
        <span className="text-[10px] text-text-muted">vec</span>
      </div>
    );
  }

  if (node.type === "canvas") {
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
          </div>
          {node.png ? (
            <img
              src={node.png}
              alt={node.name}
              style={{
                imageRendering: "pixelated",
                maxHeight: 200,
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
