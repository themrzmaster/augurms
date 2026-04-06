"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Card from "@/components/Card";

interface CustomReactor {
  reactor_id: number;
  name: string;
  event_type: number;
  hits_to_break: number;
  animation_style: string;
  script_template: string;
  idle_png_url: string | null;
  published: boolean;
  created_at: string;
}

const EVENT_TYPE_LABELS: Record<number, string> = {
  0: "Click/Hit",
  100: "Item Drop",
  101: "Timed",
};

export default function ReactorsPage() {
  const [reactors, setReactors] = useState<CustomReactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/reactors")
      .then((r) => r.json())
      .then((data) => {
        setReactors(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handlePublish(mode: "local" | "r2") {
    setPublishing(true);
    setPublishStatus(mode === "local" ? "Building local WZ..." : "Starting R2 publish...");
    try {
      if (mode === "local") {
        const res = await fetch("/api/admin/reactors/publish-local", { method: "POST" });
        const data = await res.json();
        setPublishing(false);
        if (data.success) {
          setPublishStatus(`Done! ${data.actions?.join(" | ")}\n\nCopy Reactor.wz from ${data.output} to your game client folder, then restart server.`);
        } else {
          setPublishStatus(`Error: ${data.error}`);
        }
      } else {
        await fetch("/api/admin/reactors/publish", { method: "POST" });
        const poll = setInterval(async () => {
          const res = await fetch("/api/admin/reactors/publish");
          const status = await res.json();
          setPublishStatus(status.step || status.status);
          if (status.status === "done" || status.status === "error") {
            clearInterval(poll);
            setPublishing(false);
            if (status.status === "done") {
              const r = await fetch("/api/admin/reactors");
              const data = await r.json();
              setReactors(Array.isArray(data) ? data : []);
            }
          }
        }, 1000);
      }
    } catch {
      setPublishing(false);
      setPublishStatus("Publish failed");
    }
  }

  async function handleDelete(reactorId: number) {
    if (!confirm(`Delete reactor ${reactorId}? This removes all placements and drops too.`)) return;
    await fetch("/api/admin/reactors", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reactorId }),
    });
    setReactors((prev) => prev.filter((r) => r.reactor_id !== reactorId));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Custom Reactors</h1>
        <div className="flex gap-3">
          <button
            onClick={() => handlePublish("local")}
            disabled={publishing || reactors.length === 0}
            className="rounded-lg bg-accent-green/20 px-4 py-2 text-sm font-medium text-accent-green transition-colors hover:bg-accent-green/30 disabled:opacity-50"
          >
            {publishing ? "Building..." : "Build Local WZ"}
          </button>
          <button
            onClick={() => handlePublish("r2")}
            disabled={publishing || reactors.length === 0}
            className="rounded-lg bg-accent-purple/20 px-4 py-2 text-sm font-medium text-accent-purple transition-colors hover:bg-accent-purple/30 disabled:opacity-50"
          >
            {publishing ? "Publishing..." : "Publish to R2"}
          </button>
          <Link
            href="/reactors/create"
            className="rounded-lg bg-accent-blue/20 px-4 py-2 text-sm font-medium text-accent-blue transition-colors hover:bg-accent-blue/30"
          >
            + Create Reactor
          </Link>
        </div>
      </div>

      {publishStatus && (
        <div className="rounded-lg border border-border bg-bg-card p-3 text-sm text-text-secondary">
          {publishStatus}
        </div>
      )}

      {loading ? (
        <div className="text-center text-text-secondary py-12">Loading...</div>
      ) : reactors.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-text-secondary mb-4">No custom reactors yet</p>
            <Link
              href="/reactors/create"
              className="text-accent-blue hover:underline"
            >
              Create your first reactor
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reactors.map((r) => (
            <Card key={r.reactor_id} className="relative">
              <div className="flex items-start gap-4">
                {r.idle_png_url ? (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-bg-dark">
                    <img
                      src={r.idle_png_url}
                      alt={r.name}
                      className="max-h-14 max-w-14 object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                  </div>
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-bg-dark text-2xl">
                    💥
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-text-primary truncate">{r.name}</h3>
                  <p className="text-xs text-text-muted">ID: {r.reactor_id}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="inline-block rounded bg-bg-dark px-1.5 py-0.5 text-xs text-text-secondary">
                      {EVENT_TYPE_LABELS[r.event_type] ?? `Type ${r.event_type}`}
                    </span>
                    <span className="inline-block rounded bg-bg-dark px-1.5 py-0.5 text-xs text-text-secondary">
                      {r.hits_to_break} hit{r.hits_to_break !== 1 ? "s" : ""}
                    </span>
                    <span className="inline-block rounded bg-bg-dark px-1.5 py-0.5 text-xs text-text-secondary">
                      {r.animation_style}
                    </span>
                    {r.published && (
                      <span className="inline-block rounded bg-accent-green/20 px-1.5 py-0.5 text-xs text-accent-green">
                        Published
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="absolute top-3 right-3 flex gap-2">
                <Link
                  href={`/reactors/${r.reactor_id}/edit`}
                  className="text-text-muted hover:text-accent-blue transition-colors text-xs"
                >
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(r.reactor_id)}
                  className="text-text-muted hover:text-accent-red transition-colors text-xs"
                >
                  Delete
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
