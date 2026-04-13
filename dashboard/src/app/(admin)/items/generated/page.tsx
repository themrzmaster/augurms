"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/components/Card";

type Status = "pending" | "rendering" | "ready" | "published" | "failed" | "rejected";

interface GeneratedItem {
  id: number;
  item_id: number | null;
  session_id: string | null;
  description: string;
  name: string | null;
  item_type: string;
  weapon_type: string | null;
  concept_image_url: string | null;
  glb_url: string | null;
  tripo_task_id: string | null;
  cost_usd: number;
  status: Status;
  error: string | null;
  published_at: string | null;
  created_at: string;
}

interface ItemAssets {
  iconUrl: string | null;
  frames: Record<string, string[]> | null;
  origins: Record<string, Array<{ gripX: number; gripY: number }>> | null;
}

const STATUS_FILTERS: Array<{ key: "all" | Status; label: string }> = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready to publish" },
  { key: "pending", label: "Pending" },
  { key: "rendering", label: "Rendering" },
  { key: "published", label: "Published" },
  { key: "failed", label: "Failed" },
  { key: "rejected", label: "Rejected" },
];

function statusBadge(s: Status) {
  switch (s) {
    case "ready":
      return "bg-accent-green/10 text-accent-green border-accent-green/20";
    case "published":
      return "bg-accent-blue/10 text-accent-blue border-accent-blue/20";
    case "pending":
    case "rendering":
      return "bg-accent-gold/10 text-accent-gold border-accent-gold/20";
    case "failed":
      return "bg-accent-red/10 text-accent-red border-accent-red/20";
    case "rejected":
      return "bg-text-muted/10 text-text-muted border-text-muted/20";
  }
}

function conceptUrl(it: GeneratedItem) {
  return it.concept_image_url ?? `/api/admin/items/generated/${it.id}/concept`;
}

function FramesGallery({ assets }: { assets: ItemAssets }) {
  if (!assets.frames) {
    return <p className="text-xs text-text-muted">Frames not available (item may have failed before rendering).</p>;
  }
  const groups = Object.entries(assets.frames);
  return (
    <div className="space-y-4">
      {assets.iconUrl && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Icon</h4>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assets.iconUrl}
              alt="icon"
              className="h-14 w-14 rounded border border-border bg-bg-primary"
              style={{ imageRendering: "pixelated" }}
            />
            <span className="text-xs text-text-muted">28×28 in-game icon</span>
          </div>
        </div>
      )}
      {groups.map(([anim, frames]) => (
        <div key={anim}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {anim} <span className="text-text-muted">({frames.length} {frames.length === 1 ? "frame" : "frames"})</span>
          </h4>
          <div className="flex flex-wrap gap-2">
            {frames.map((src, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`${anim} ${i}`}
                  className="h-16 w-16 rounded border border-border bg-bg-primary object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
                <span className="text-[10px] text-text-muted">
                  {i}
                  {assets.origins?.[anim]?.[i]
                    ? ` · ${assets.origins[anim][i].gripX},${assets.origins[anim][i].gripY}`
                    : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AssetDetailModal({ item, onClose }: { item: GeneratedItem; onClose: () => void }) {
  const [assets, setAssets] = useState<ItemAssets | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/items/generated/${item.id}`);
        if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setAssets(data.assets ?? { iconUrl: null, frames: null, origins: null });
      } catch (e: any) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-6xl rounded-xl border border-border bg-bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-text-primary">
              {item.name || "(unnamed)"}
            </h2>
            <p className="text-xs text-text-muted">
              #{item.id}
              {item.item_id ? ` → item ${item.item_id}` : ""}
              {item.weapon_type ? ` · ${item.weapon_type}` : ""}
              {" · "}
              {item.status}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-card-hover"
          >
            Close (Esc)
          </button>
        </header>

        <div className="grid gap-6 p-5 lg:grid-cols-[380px,1fr]">
          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                AI Concept (Flux)
              </h4>
              <div className="overflow-hidden rounded-lg border border-border bg-bg-primary">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={conceptUrl(item)} alt="concept" className="h-full w-full object-contain" />
              </div>
            </div>
            {item.glb_url && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  3D Model (Tripo3D)
                </h4>
                <a
                  href={item.glb_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-primary px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-card-hover"
                >
                  Download GLB
                  <span className="text-text-muted">↗</span>
                </a>
                {item.tripo_task_id && (
                  <p className="mt-1 break-all text-[10px] text-text-muted">task {item.tripo_task_id}</p>
                )}
              </div>
            )}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Description</h4>
              <p className="whitespace-pre-wrap text-xs text-text-secondary">{item.description}</p>
            </div>
            {item.error && (
              <p className="rounded bg-accent-red/10 px-2 py-1 text-xs text-accent-red">{item.error}</p>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              MapleStory Sprites (headless Three.js render)
            </h4>
            {loading ? (
              <p className="text-xs text-text-muted">Loading frames...</p>
            ) : err ? (
              <p className="text-xs text-accent-red">{err}</p>
            ) : assets ? (
              <FramesGallery assets={assets} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GeneratedItemsPage() {
  const [items, setItems] = useState<GeneratedItem[]>([]);
  const [status, setStatus] = useState<"all" | Status>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = status === "all" ? "" : `?status=${status}`;
      const res = await fetch(`/api/admin/items/generated${qs}`);
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: number, action: "publish" | "reject") => {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/items/generated/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">AI-Generated Items</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Items the GM has synthesized from text descriptions. Click a card to inspect all generated assets.
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-border bg-bg-card px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-card-hover"
        >
          Refresh
        </button>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              status === f.key
                ? "border-accent-gold bg-accent-gold/10 text-accent-gold"
                : "border-border text-text-secondary hover:border-border-light"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <Card className="mb-4 border-accent-red/30 bg-accent-red/5">
          <p className="text-sm text-accent-red">{error}</p>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-text-secondary">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-secondary">No items in this view.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((it) => {
              const isOpen = expanded === it.id;
              return (
                <Card
                  key={it.id}
                  className={`flex flex-col gap-3 cursor-pointer transition ${
                    isOpen ? "ring-2 ring-accent-gold/40" : ""
                  }`}
                  onClick={() => setExpanded(isOpen ? null : it.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-text-primary">
                        {it.name || <span className="text-text-muted">(no name)</span>}
                      </h3>
                      <p className="text-xs text-text-muted">
                        #{it.id}
                        {it.item_id ? ` → item ${it.item_id}` : ""}
                        {it.weapon_type ? ` · ${it.weapon_type}` : ""}
                      </p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusBadge(it.status)}`}>
                      {it.status}
                    </span>
                  </div>

                  <div className="aspect-square w-full overflow-hidden rounded-lg border border-border bg-bg-primary">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={conceptUrl(it)}
                      alt={it.name ?? "concept"}
                      className="h-full w-full object-contain"
                      onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                    />
                  </div>

                  <p className="line-clamp-2 text-xs text-text-secondary" title={it.description}>
                    {it.description}
                  </p>

                  {it.error && (
                    <p className="rounded bg-accent-red/10 px-2 py-1 text-xs text-accent-red line-clamp-2">
                      {it.error}
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between text-[11px] text-text-muted">
                    <span>{new Date(it.created_at).toLocaleString()}</span>
                    {it.cost_usd > 0 && <span>${Number(it.cost_usd).toFixed(3)}</span>}
                  </div>

                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    {it.status === "ready" && (
                      <button
                        disabled={busy === it.id}
                        onClick={() => act(it.id, "publish")}
                        className="flex-1 rounded-lg bg-accent-green/15 px-3 py-1.5 text-xs font-medium text-accent-green hover:bg-accent-green/25 disabled:opacity-50"
                      >
                        {busy === it.id ? "Publishing..." : "Publish"}
                      </button>
                    )}
                    {(it.status === "ready" || it.status === "pending" || it.status === "rendering") && (
                      <button
                        disabled={busy === it.id}
                        onClick={() => act(it.id, "reject")}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-card-hover disabled:opacity-50"
                      >
                        Reject
                      </button>
                    )}
                    <button
                      onClick={() => setExpanded(it.id)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-card-hover"
                    >
                      View assets
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>

        </div>
      )}

      {expanded && (() => {
        const target = items.find((i) => i.id === expanded);
        return target ? (
          <AssetDetailModal item={target} onClose={() => setExpanded(null)} />
        ) : null;
      })()}
    </div>
  );
}
