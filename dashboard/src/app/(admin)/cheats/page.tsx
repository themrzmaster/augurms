"use client";

import { useState, useEffect } from "react";

interface PlayerSummary {
  account_id: number;
  character_name: string;
  total_flags: number;
  unreviewed_flags: number;
  violation_types: string;
  first_flagged: string;
  last_flagged: string;
  unique_maps: number;
  latest_verdict: string | null;
}

interface ViolationSummary {
  violation_type: string;
  cnt: number;
  players: number;
}

interface CheatFlag {
  id: number;
  character_id: number;
  account_id: number;
  character_name: string;
  violation_type: string;
  details: string;
  severity: string;
  points: number;
  map_id: number;
  reviewed: number;
  review_result: string | null;
  review_notes: string | null;
  flagged_at: string;
}

const RESULT_COLORS: Record<string, string> = {
  innocent: "bg-accent-green/10 text-accent-green",
  warning: "bg-accent-orange/10 text-accent-orange",
  ban: "bg-accent-red/10 text-accent-red",
};

export default function CheatsPage() {
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [violations, setViolations] = useState<ViolationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Expanded player detail
  const [expanded, setExpanded] = useState<number | null>(null);
  const [detail, setDetail] = useState<CheatFlag[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  async function fetchPlayers() {
    setLoading(true);
    try {
      const res = await fetch("/api/gm/cheats");
      const data = await res.json();
      setPlayers(data.players || []);
      setViolations(data.violations || []);
    } catch {
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPlayers(); }, []);

  async function expandPlayer(accountId: number) {
    if (expanded === accountId) {
      setExpanded(null);
      setDetail([]);
      return;
    }
    setExpanded(accountId);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/gm/cheats?account_id=${accountId}`);
      const data = await res.json();
      setDetail(data.flags || []);
    } catch {
      setDetail([]);
    } finally {
      setDetailLoading(false);
    }
  }

  async function reviewPlayer(accountId: number, result: "innocent" | "warning" | "ban") {
    const notes = prompt(`Notes for marking all flags as "${result}":`);
    if (notes === null) return;

    await fetch("/api/gm/cheats", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId, result, notes: notes || `Marked as ${result} by admin` }),
    });
    setExpanded(null);
    fetchPlayers();
  }

  const totalUnreviewed = players.reduce((sum, p) => sum + Number(p.unreviewed_flags), 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Cheat Flags</h1>
        <p className="mt-1.5 text-text-secondary">
          {totalUnreviewed > 0
            ? `${totalUnreviewed.toLocaleString()} unreviewed flags across ${players.filter(p => p.unreviewed_flags > 0).length} player${players.filter(p => p.unreviewed_flags > 0).length !== 1 ? "s" : ""}`
            : "No unreviewed flags"}
        </p>
      </div>

      {/* Violation type breakdown */}
      {violations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {violations.map((v) => (
            <div
              key={v.violation_type}
              className="rounded-lg border border-border bg-bg-card px-3 py-2 text-xs"
            >
              <span className="font-mono font-medium text-text-primary">{v.violation_type}</span>
              <span className="ml-2 text-text-muted">
                {v.cnt.toLocaleString()} flags / {v.players} player{v.players !== 1 ? "s" : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Player table */}
      {loading ? (
        <div className="rounded-xl border border-border bg-bg-card p-8 animate-pulse">
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded bg-bg-card-hover" />
            ))}
          </div>
        </div>
      ) : players.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-card p-12 text-center">
          <span className="text-4xl mb-4 block">✅</span>
          <p className="text-text-secondary">No cheat flags recorded yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-secondary/50 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <th className="px-4 py-3">Player</th>
                  <th className="px-4 py-3">Violations</th>
                  <th className="px-4 py-3 text-right">Flags</th>
                  <th className="px-4 py-3 text-right">Unreviewed</th>
                  <th className="px-4 py-3">Maps</th>
                  <th className="px-4 py-3">First Seen</th>
                  <th className="px-4 py-3">Last Seen</th>
                  <th className="px-4 py-3">Verdict</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {players.map((p) => (
                  <>
                    <tr
                      key={p.account_id}
                      onClick={() => expandPlayer(p.account_id)}
                      className={`transition cursor-pointer hover:bg-bg-card-hover ${
                        expanded === p.account_id ? "bg-bg-card-hover" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-semibold text-text-primary">{p.character_name}</span>
                          <p className="text-xs text-text-muted">Account #{p.account_id}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {p.violation_types.split(",").map((v) => (
                            <span
                              key={v}
                              className="rounded bg-bg-tertiary px-1.5 py-0.5 font-mono text-xs text-text-secondary"
                            >
                              {v}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-text-secondary">
                        {Number(p.total_flags).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {Number(p.unreviewed_flags) > 0 ? (
                          <span className="rounded-full bg-accent-red/10 px-2 py-0.5 text-xs font-bold text-accent-red">
                            {Number(p.unreviewed_flags).toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-text-muted text-xs">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-muted">
                        {p.unique_maps}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                        {new Date(p.first_flagged).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                        {new Date(p.last_flagged).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {p.latest_verdict ? (
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              RESULT_COLORS[p.latest_verdict] || "bg-bg-tertiary text-text-muted"
                            }`}
                          >
                            {p.latest_verdict}
                          </span>
                        ) : (
                          <span className="text-text-muted text-xs">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {Number(p.unreviewed_flags) > 0 && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => reviewPlayer(p.account_id, "innocent")}
                              className="rounded px-2 py-1 text-xs font-medium bg-accent-green/10 text-accent-green hover:bg-accent-green/20 transition"
                            >
                              Innocent
                            </button>
                            <button
                              onClick={() => reviewPlayer(p.account_id, "warning")}
                              className="rounded px-2 py-1 text-xs font-medium bg-accent-orange/10 text-accent-orange hover:bg-accent-orange/20 transition"
                            >
                              Warn
                            </button>
                            <button
                              onClick={() => reviewPlayer(p.account_id, "ban")}
                              className="rounded px-2 py-1 text-xs font-medium bg-accent-red/10 text-accent-red hover:bg-accent-red/20 transition"
                            >
                              Ban
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Expanded detail rows */}
                    {expanded === p.account_id && (
                      <tr key={`${p.account_id}-detail`}>
                        <td colSpan={9} className="bg-bg-secondary/30 px-4 py-3">
                          {detailLoading ? (
                            <div className="animate-pulse py-4 text-center text-text-muted text-xs">
                              Loading flags...
                            </div>
                          ) : detail.length === 0 ? (
                            <p className="py-4 text-center text-text-muted text-xs">No flags found.</p>
                          ) : (
                            <div className="max-h-80 overflow-y-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-text-muted uppercase tracking-wider">
                                    <th className="px-3 py-2">Type</th>
                                    <th className="px-3 py-2">Details</th>
                                    <th className="px-3 py-2">Map</th>
                                    <th className="px-3 py-2">When</th>
                                    <th className="px-3 py-2">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                  {detail.map((f) => (
                                    <tr key={f.id} className="hover:bg-bg-card-hover/50">
                                      <td className="px-3 py-2 font-mono text-text-secondary">
                                        {f.violation_type}
                                      </td>
                                      <td className="px-3 py-2 max-w-md text-text-secondary truncate" title={f.details}>
                                        {f.details}
                                      </td>
                                      <td className="px-3 py-2 font-mono text-text-muted">
                                        {f.map_id || "-"}
                                      </td>
                                      <td className="px-3 py-2 text-text-muted whitespace-nowrap">
                                        {new Date(f.flagged_at).toLocaleString()}
                                      </td>
                                      <td className="px-3 py-2">
                                        {f.review_result ? (
                                          <span
                                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                              RESULT_COLORS[f.review_result] || "bg-bg-tertiary text-text-muted"
                                            }`}
                                          >
                                            {f.review_result}
                                          </span>
                                        ) : (
                                          <span className="text-accent-orange">pending</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
