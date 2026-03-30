"use client";

import { useState, useEffect } from "react";

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
  reviewed_at: string | null;
  review_result: string | null;
  review_notes: string | null;
  flagged_at: string;
}

interface CheatSummary {
  account_id: number;
  character_name: string;
  flag_count: number;
  violation_types: string;
  last_flagged: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  threshold: "bg-accent-orange/10 text-accent-orange",
  godmode: "bg-accent-red/10 text-accent-red",
  spam: "bg-accent-gold/10 text-accent-gold",
};

const RESULT_COLORS: Record<string, string> = {
  innocent: "bg-accent-green/10 text-accent-green",
  warning: "bg-accent-orange/10 text-accent-orange",
  ban: "bg-accent-red/10 text-accent-red",
};

export default function CheatsPage() {
  const [flags, setFlags] = useState<CheatFlag[]>([]);
  const [summary, setSummary] = useState<CheatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"unreviewed" | "reviewed" | "all">("unreviewed");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  async function fetchFlags() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter === "unreviewed") params.set("reviewed", "0");
      else if (filter === "reviewed") params.set("reviewed", "1");
      params.set("limit", "100");

      const res = await fetch(`/api/gm/cheats?${params}`);
      const data = await res.json();
      setFlags(data.flags || []);
      setSummary(data.summary || []);
    } catch {
      setFlags([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFlags();
  }, [filter]);

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === flags.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(flags.map((f) => f.id)));
    }
  }

  async function reviewSelected(result: "innocent" | "warning" | "ban") {
    if (selected.size === 0) return;
    const notes = prompt(`Notes for marking ${selected.size} flag(s) as "${result}":`);
    if (notes === null) return;

    await fetch("/api/gm/cheats", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flag_ids: Array.from(selected),
        result,
        notes: notes || `Marked as ${result} by admin`,
      }),
    });
    setSelected(new Set());
    fetchFlags();
  }

  const unreviewedCount = summary.reduce((sum, s) => sum + s.flag_count, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Cheat Flags</h1>
        <p className="mt-1.5 text-text-secondary">
          {unreviewedCount > 0
            ? `${unreviewedCount} unreviewed flag${unreviewedCount !== 1 ? "s" : ""} across ${summary.length} player${summary.length !== 1 ? "s" : ""}`
            : "No unreviewed flags"}
        </p>
      </div>

      {/* Summary cards */}
      {summary.length > 0 && filter === "unreviewed" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.map((s) => (
            <div
              key={`${s.account_id}-${s.character_name}`}
              className="rounded-xl border border-border bg-bg-card p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text-primary">{s.character_name}</span>
                <span className="rounded-full bg-accent-red/10 px-2 py-0.5 text-xs font-bold text-accent-red">
                  {s.flag_count}
                </span>
              </div>
              <p className="mt-1 text-xs text-text-muted">Account #{s.account_id}</p>
              <p className="mt-2 text-xs text-text-secondary">{s.violation_types}</p>
              <p className="mt-1 text-xs text-text-muted">
                Last: {new Date(s.last_flagged).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs + bulk actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border bg-bg-secondary/50 p-0.5">
          {(["unreviewed", "reviewed", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                filter === f
                  ? "bg-bg-card text-text-primary shadow-sm"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">{selected.size} selected:</span>
            <button
              onClick={() => reviewSelected("innocent")}
              className="rounded-lg bg-accent-green/10 px-3 py-1.5 text-xs font-medium text-accent-green hover:bg-accent-green/20 transition"
            >
              Innocent
            </button>
            <button
              onClick={() => reviewSelected("warning")}
              className="rounded-lg bg-accent-orange/10 px-3 py-1.5 text-xs font-medium text-accent-orange hover:bg-accent-orange/20 transition"
            >
              Warning
            </button>
            <button
              onClick={() => reviewSelected("ban")}
              className="rounded-lg bg-accent-red/10 px-3 py-1.5 text-xs font-medium text-accent-red hover:bg-accent-red/20 transition"
            >
              Ban
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-xl border border-border bg-bg-card p-8 animate-pulse">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-bg-card-hover" />
            ))}
          </div>
        </div>
      ) : flags.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-card p-12 text-center">
          <span className="text-4xl mb-4 block">
            {filter === "unreviewed" ? "✅" : "🚩"}
          </span>
          <p className="text-text-secondary">
            {filter === "unreviewed"
              ? "All clear — no unreviewed cheat flags."
              : "No flags found."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-secondary/50 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === flags.length && flags.length > 0}
                      onChange={selectAll}
                      className="rounded border-border"
                    />
                  </th>
                  <th className="px-4 py-3">Player</th>
                  <th className="px-4 py-3">Violation</th>
                  <th className="px-4 py-3">Details</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Map</th>
                  <th className="px-4 py-3">When</th>
                  {filter !== "unreviewed" && <th className="px-4 py-3">Verdict</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {flags.map((flag) => (
                  <tr
                    key={flag.id}
                    className={`transition hover:bg-bg-card-hover ${
                      selected.has(flag.id) ? "bg-accent-gold/5" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      {!flag.reviewed && (
                        <input
                          type="checkbox"
                          checked={selected.has(flag.id)}
                          onChange={() => toggleSelect(flag.id)}
                          className="rounded border-border"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-semibold text-text-primary">
                          {flag.character_name}
                        </span>
                        <p className="text-xs text-text-muted">
                          Acc #{flag.account_id}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-text-secondary">
                        {flag.violation_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-xs text-text-secondary truncate" title={flag.details}>
                        {flag.details}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          SEVERITY_COLORS[flag.severity] || "bg-bg-tertiary text-text-muted"
                        }`}
                      >
                        {flag.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">
                      {flag.map_id || "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                      {new Date(flag.flagged_at).toLocaleString()}
                    </td>
                    {filter !== "unreviewed" && (
                      <td className="px-4 py-3">
                        {flag.review_result ? (
                          <div>
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                RESULT_COLORS[flag.review_result] ||
                                "bg-bg-tertiary text-text-muted"
                              }`}
                            >
                              {flag.review_result}
                            </span>
                            {flag.review_notes && (
                              <p
                                className="mt-1 text-xs text-text-muted truncate max-w-[200px]"
                                title={flag.review_notes}
                              >
                                {flag.review_notes}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-text-muted text-xs">-</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
