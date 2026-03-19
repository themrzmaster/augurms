"use client";

import { useState, useEffect } from "react";
import SpriteImage from "@/components/SpriteImage";

interface MobSpawn {
  world: number;
  map: number;
  life: number;
  type: string;
  x: number;
  y: number;
  mobtime: number;
}

interface GlobalDrop {
  itemid: number;
  chance: number;
  minimum_quantity: number;
  maximum_quantity: number;
  comments: string;
}

interface EventAction {
  tool_name: string;
  tool_input: string;
  tool_result: string;
  executed_at: string;
}

interface GroupedEvent {
  name: string;
  mapId?: number;
  spawns: MobSpawn[];
  drops: GlobalDrop[];
  createdAt?: string;
}

export default function EventsPage() {
  const [spawns, setSpawns] = useState<MobSpawn[]>([]);
  const [globalDrops, setGlobalDrops] = useState<GlobalDrop[]>([]);
  const [eventHistory, setEventHistory] = useState<EventAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function fetchData() {
    try {
      const [evtRes, histRes] = await Promise.all([
        fetch("/api/gm/event"),
        fetch("/api/gm/history?type=actions&limit=50"),
      ]);
      if (evtRes.ok) {
        const data = await evtRes.json();
        setSpawns(data.customSpawns || []);
        setGlobalDrops(data.globalDrops || []);
      }
      if (histRes.ok) {
        const hist = await histRes.json();
        const actions = (hist.actions || []).filter(
          (a: any) => ["create_event", "batch_update_drops", "add_map_spawn"].includes(a.toolName)
        );
        setEventHistory(actions.map((a: any) => ({
          tool_name: a.toolName,
          tool_input: a.toolInput || "",
          tool_result: a.toolResult || "",
          executed_at: a.executedAt,
        })));
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  // Group spawns by map
  const spawnsByMap = spawns.reduce<Record<number, MobSpawn[]>>((acc, s) => {
    (acc[s.map] ||= []).push(s);
    return acc;
  }, {});

  // Group global drops by event name (from comments)
  const dropsByEvent = globalDrops.reduce<Record<string, GlobalDrop[]>>((acc, d) => {
    const name = d.comments?.replace(/^Event:\s*/, "") || "Unknown";
    (acc[name] ||= []).push(d);
    return acc;
  }, {});

  async function cleanupEvent(mapId?: number, clearDrops?: boolean) {
    const body: any = {};
    if (mapId) body.mapId = mapId;
    if (clearDrops) body.clearGlobalDrops = true;

    if (!confirm(
      mapId && clearDrops
        ? `Remove all spawns on map ${mapId} and all event global drops?`
        : mapId
          ? `Remove all custom spawns on map ${mapId}?`
          : "Remove ALL event global drops?"
    )) return;

    try {
      const res = await fetch("/api/gm/event", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ type: "success", message: data.actions?.join(", ") || "Cleaned up" });
        fetchData();
      } else {
        setFeedback({ type: "error", message: data.error || "Failed" });
      }
    } catch {
      setFeedback({ type: "error", message: "Request failed" });
    }
  }

  function chanceToPercent(chance: number): string {
    return (chance / 10000).toFixed(chance < 10000 ? 2 : 1) + "%";
  }

  function formatDate(d: string): string {
    return new Date(d).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Events</h1>
        <p className="mt-1.5 text-text-secondary">
          Active event spawns, global drops, and event history from the AI Game Master.
        </p>
      </div>

      {feedback && (
        <div className={`rounded-lg border px-4 py-2 text-sm font-medium ${
          feedback.type === "success"
            ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
            : "border-accent-red/30 bg-accent-red/10 text-accent-red"
        }`}>
          {feedback.message}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-border bg-bg-card p-8 animate-pulse">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-bg-card-hover" />
            ))}
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* Active Mob Spawns */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-text-primary">
                Active Mob Spawns
                <span className="ml-2 text-sm font-normal text-text-muted">
                  ({spawns.length} total)
                </span>
              </h2>
            </div>

            {Object.keys(spawnsByMap).length === 0 ? (
              <div className="rounded-xl border border-border bg-bg-card px-6 py-10 text-center text-text-muted text-sm">
                No custom mob spawns active.
              </div>
            ) : (
              Object.entries(spawnsByMap).map(([mapId, mapSpawns]) => {
                // Count unique mobs
                const mobCounts: Record<number, number> = {};
                for (const s of mapSpawns) mobCounts[s.life] = (mobCounts[s.life] || 0) + 1;

                return (
                  <div key={mapId} className="rounded-xl border border-border bg-bg-card overflow-hidden">
                    <div className="flex items-center justify-between border-b border-border bg-bg-secondary/50 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-accent-gold font-semibold">Map {mapId}</span>
                        <span className="text-text-muted text-xs">({mapSpawns.length} spawns)</span>
                      </div>
                      <button
                        onClick={() => cleanupEvent(Number(mapId))}
                        className="rounded-lg bg-accent-red/10 px-3 py-1.5 text-xs font-medium text-accent-red hover:bg-accent-red/20 transition"
                      >
                        Remove All
                      </button>
                    </div>
                    <div className="divide-y divide-border">
                      {Object.entries(mobCounts).map(([mobId, count]) => (
                        <div key={mobId} className="flex items-center gap-3 px-4 py-3">
                          <SpriteImage type="mob" id={Number(mobId)} size={36} />
                          <div className="flex-1">
                            <span className="font-medium text-text-primary">Mob {mobId}</span>
                            <span className="ml-2 text-xs text-text-muted">x{count}</span>
                          </div>
                          <span className="text-xs text-text-muted">
                            Respawn: {mapSpawns.find(s => s.life === Number(mobId))?.mobtime || 0}s
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </section>

          {/* Global Event Drops */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-text-primary">
                Global Event Drops
                <span className="ml-2 text-sm font-normal text-text-muted">
                  ({globalDrops.length} active)
                </span>
              </h2>
              {globalDrops.length > 0 && (
                <button
                  onClick={() => cleanupEvent(undefined, true)}
                  className="rounded-lg bg-accent-red/10 px-3 py-1.5 text-xs font-medium text-accent-red hover:bg-accent-red/20 transition"
                >
                  Clear All Event Drops
                </button>
              )}
            </div>

            {Object.keys(dropsByEvent).length === 0 ? (
              <div className="rounded-xl border border-border bg-bg-card px-6 py-10 text-center text-text-muted text-sm">
                No global event drops active.
              </div>
            ) : (
              Object.entries(dropsByEvent).map(([eventName, drops]) => (
                <div key={eventName} className="rounded-xl border border-border bg-bg-card overflow-hidden">
                  <div className="border-b border-border bg-bg-secondary/50 px-4 py-3">
                    <span className="font-semibold text-accent-purple">{eventName}</span>
                    <span className="ml-2 text-text-muted text-xs">({drops.length} drops)</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                          <th className="px-4 py-2">Item</th>
                          <th className="px-4 py-2">ID</th>
                          <th className="px-4 py-2">Chance</th>
                          <th className="px-4 py-2">Quantity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {drops.map((d, i) => (
                          <tr key={i} className="hover:bg-bg-card-hover transition">
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <SpriteImage type="item" id={d.itemid} size={28} />
                                <span className="text-text-primary">{d.itemid}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 font-mono text-text-muted">{d.itemid}</td>
                            <td className="px-4 py-2">
                              <span className={`font-medium ${
                                d.chance >= 500000 ? "text-accent-green" :
                                d.chance >= 100000 ? "text-accent-gold" :
                                "text-accent-red"
                              }`}>
                                {chanceToPercent(d.chance)}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-text-secondary">
                              {d.minimum_quantity === d.maximum_quantity
                                ? d.minimum_quantity
                                : `${d.minimum_quantity}-${d.maximum_quantity}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </section>

          {/* Event History */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">
              Event History
              <span className="ml-2 text-sm font-normal text-text-muted">
                (recent GM event actions)
              </span>
            </h2>

            {eventHistory.length === 0 ? (
              <div className="rounded-xl border border-border bg-bg-card px-6 py-10 text-center text-text-muted text-sm">
                No event actions recorded yet.
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
                <div className="divide-y divide-border">
                  {eventHistory.map((action, i) => {
                    let parsed: any = {};
                    try { parsed = JSON.parse(action.tool_input); } catch {}
                    let result: any = {};
                    try { result = JSON.parse(action.tool_result); } catch {}

                    return (
                      <div key={i} className="px-4 py-3 hover:bg-bg-card-hover transition">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            action.tool_name === "create_event"
                              ? "bg-accent-purple/10 text-accent-purple"
                              : action.tool_name === "add_map_spawn"
                                ? "bg-accent-blue/10 text-accent-blue"
                                : "bg-accent-gold/10 text-accent-gold"
                          }`}>
                            {action.tool_name}
                          </span>
                          {parsed.name && (
                            <span className="font-medium text-text-primary text-sm">{parsed.name}</span>
                          )}
                          {parsed.mapId && (
                            <span className="text-xs text-text-muted">Map {parsed.mapId}</span>
                          )}
                          <span className="ml-auto text-xs text-text-muted">
                            {formatDate(action.executed_at)}
                          </span>
                        </div>
                        {result.error && (
                          <p className="text-xs text-accent-red mt-1">{result.error}: {result.details}</p>
                        )}
                        {result.success && result.actions && (
                          <p className="text-xs text-text-muted mt-1">
                            {result.actions.slice(0, 3).join(" · ")}
                            {result.actions.length > 3 && ` (+${result.actions.length - 3} more)`}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
