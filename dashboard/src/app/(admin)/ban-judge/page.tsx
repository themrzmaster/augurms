"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Tab = "overview" | "verdicts" | "sessions" | "memory";

interface Schedule {
  enabled: boolean;
  model: string;
  dailyHourUtc: number;
  autoApplyThreshold: number;
  lookbackDays: number;
  lastRun: string | null;
  nextRun: string | null;
}

interface Verdict {
  id: number;
  session_id: string;
  account_id: number;
  character_id: number | null;
  character_name: string | null;
  verdict: "innocent" | "watch" | "warn" | "ban" | "escalate";
  confidence: number;
  reasoning: string;
  evidence_json: any;
  flag_ids_considered: any;
  applied: number;
  applied_at: string | null;
  applied_by: string | null;
  overturned_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  account_banned: number;
  account_banreason: string | null;
}

interface SessionRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  model: string;
  summary: string | null;
  accounts_reviewed: number;
  verdicts_count: number;
  error: string | null;
}

interface Memory {
  id: number;
  session_id: string | null;
  account_id: number | null;
  content: string;
  tags: any;
  created_at: string;
  expires_at: string | null;
}

const VERDICT_COLORS: Record<string, string> = {
  ban: "bg-accent-red/10 text-accent-red",
  warn: "bg-accent-orange/10 text-accent-orange",
  watch: "bg-accent-gold/10 text-accent-gold",
  escalate: "bg-purple-500/10 text-purple-400",
  innocent: "bg-accent-green/10 text-accent-green",
};

function parseJson(v: any): any {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return v; }
}

export default function BanJudgePage() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Ban Judge</h1>
        <p className="mt-1.5 text-text-secondary">
          AI agent that reviews cheat flags daily. Verdicts queue here for your approval — nothing auto-bans unless you lower the threshold.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(["overview", "verdicts", "sessions", "memory"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition ${
              tab === t
                ? "border-b-2 border-accent-gold text-accent-gold"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "verdicts" && <VerdictsTab />}
      {tab === "sessions" && <SessionsTab />}
      {tab === "memory" && <MemoryTab />}
    </div>
  );
}

// -------------------- Overview --------------------

function OverviewTab() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [counts, setCounts] = useState<{ pending: number; applied: number } | null>(null);

  const load = useCallback(async () => {
    const [s, pending, applied] = await Promise.all([
      fetch("/api/ban-judge/schedule").then((r) => r.json()),
      fetch("/api/ban-judge/verdicts?status=pending").then((r) => r.json()),
      fetch("/api/ban-judge/verdicts?status=applied").then((r) => r.json()),
    ]);
    setSchedule(s);
    setCounts({
      pending: pending.verdicts?.length || 0,
      applied: applied.verdicts?.length || 0,
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(patch: Partial<Schedule>) {
    setSaving(true);
    try {
      const res = await fetch("/api/ban-judge/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      setSchedule(data);
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    if (!confirm("Run the ban judge now? This uses API credits.")) return;
    setTriggering(true);
    try {
      const res = await fetch("/api/ban-judge/cron", { method: "POST" });
      const data = await res.json();
      if (data.error) alert(`Error: ${data.error}`);
      else alert(`Done. Session ${data.sessionId.slice(0, 8)} — ${data.verdictsCount} verdicts on ${data.accountsReviewed} accounts.`);
      load();
    } finally {
      setTriggering(false);
    }
  }

  if (!schedule) return <div className="text-text-muted">Loading...</div>;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-border bg-bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Schedule</h2>

        <div className="flex items-center justify-between">
          <span className="text-sm">Enabled</span>
          <button
            onClick={() => save({ enabled: !schedule.enabled })}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              schedule.enabled ? "bg-accent-green" : "bg-bg-tertiary"
            }`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white transition ${schedule.enabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-text-muted">Daily run hour (UTC)</span>
          <input
            type="number"
            min={0}
            max={23}
            value={schedule.dailyHourUtc}
            onChange={(e) => save({ dailyHourUtc: Number(e.target.value) })}
            className="w-full rounded bg-bg-tertiary px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-text-muted">Lookback window (days)</span>
          <input
            type="number"
            min={1}
            max={90}
            value={schedule.lookbackDays}
            onChange={(e) => save({ lookbackDays: Number(e.target.value) })}
            className="w-full rounded bg-bg-tertiary px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-text-muted">Model</span>
          <input
            value={schedule.model}
            onChange={(e) => save({ model: e.target.value })}
            className="w-full rounded bg-bg-tertiary px-3 py-2 font-mono text-xs"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-text-muted">
            Auto-apply threshold (confidence 0-100; 101 = never auto-ban)
          </span>
          <input
            type="number"
            min={0}
            max={101}
            value={schedule.autoApplyThreshold}
            onChange={(e) => save({ autoApplyThreshold: Number(e.target.value) })}
            className="w-full rounded bg-bg-tertiary px-3 py-2 text-sm"
          />
          <p className="text-xs text-text-muted">
            {schedule.autoApplyThreshold >= 101
              ? "Phase 1: every verdict queues for your review."
              : `Ban verdicts at ≥${schedule.autoApplyThreshold} confidence auto-apply without review.`}
          </p>
        </label>

        <button
          onClick={runNow}
          disabled={triggering}
          className="w-full rounded-lg bg-accent-gold/20 px-4 py-2 text-sm font-medium text-accent-gold hover:bg-accent-gold/30 disabled:opacity-50"
        >
          {triggering ? "Running..." : "Run now"}
        </button>
      </div>

      <div className="rounded-xl border border-border bg-bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Status</h2>

        <div className="grid grid-cols-2 gap-4">
          <Stat label="Last run" value={schedule.lastRun ? new Date(schedule.lastRun).toLocaleString() : "—"} />
          <Stat label="Next run" value={schedule.nextRun ? new Date(schedule.nextRun).toLocaleString() : "—"} />
          <Stat label="Pending verdicts" value={counts?.pending ?? "—"} />
          <Stat label="Applied verdicts" value={counts?.applied ?? "—"} />
        </div>

        <div className="rounded-lg bg-bg-tertiary/50 p-3 text-xs text-text-secondary">
          <p className="font-medium text-text-primary">How it works</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>External cron pings <code className="text-accent-gold">/api/ban-judge/cron/check</code> every ~15 min.</li>
            <li>If enabled and <code>next_run</code> has passed, the daily run fires.</li>
            <li>Agent pulls unreviewed <code>cheat_flags</code> from the last {schedule.lookbackDays} day(s), evaluates each suspect account using its dossier + memory from prior runs, writes verdicts.</li>
            <li>Verdicts land here; you apply, dismiss, or overturn.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{value}</p>
    </div>
  );
}

// -------------------- Verdicts --------------------

function VerdictsTab() {
  const [status, setStatus] = useState<"pending" | "applied" | "dismissed" | "overturned">("pending");
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ban-judge/verdicts?status=${status}`);
      const data = await res.json();
      setVerdicts(data.verdicts || []);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  async function act(id: number, action: "apply" | "dismiss" | "overturn") {
    const v = verdicts.find((x) => x.id === id);
    if (!v) return;
    if (action === "apply" && v.verdict === "ban") {
      if (!confirm(`Apply BAN on account #${v.account_id} (${v.character_name || "?"})? This will set accounts.banned=1.`)) return;
    }
    if (action === "overturn" && v.applied && v.verdict === "ban") {
      if (!confirm(`Unban account #${v.account_id}?`)) return;
    }
    const note = action === "dismiss" ? prompt("Dismissal note (optional):") || null : null;
    await fetch(`/api/ban-judge/verdicts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["pending", "applied", "dismissed", "overturned"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-lg px-3 py-1 text-xs font-medium capitalize transition ${
              status === s ? "bg-accent-gold/20 text-accent-gold" : "bg-bg-card text-text-secondary hover:bg-bg-card-hover"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-text-muted">Loading...</p>
      ) : verdicts.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-card p-12 text-center text-text-secondary">
          No {status} verdicts.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-secondary/50 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Verdict</th>
                <th className="px-4 py-3 text-right">Confidence</th>
                <th className="px-4 py-3">Reasoning</th>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {verdicts.map((v) => (
                <>
                  <tr
                    key={v.id}
                    onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                    className="cursor-pointer hover:bg-bg-card-hover"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{v.character_name || "—"}</div>
                      <div className="text-xs text-text-muted">
                        Account #{v.account_id}
                        {v.account_banned ? <span className="ml-2 text-accent-red">[banned]</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium uppercase ${VERDICT_COLORS[v.verdict]}`}>
                        {v.verdict}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <ConfidenceBar value={v.confidence} />
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary max-w-md truncate" title={v.reasoning}>
                      {v.reasoning}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                      {new Date(v.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <VerdictActions v={v} onAct={act} />
                    </td>
                  </tr>

                  {expanded === v.id && (
                    <tr key={`${v.id}-detail`}>
                      <td colSpan={6} className="bg-bg-secondary/30 p-4">
                        <VerdictDetail v={v} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VerdictActions({ v, onAct }: { v: Verdict; onAct: (id: number, action: "apply" | "dismiss" | "overturn") => void }) {
  const isPending = !v.applied && !v.dismissed_at && !v.overturned_at;
  const isApplied = !!v.applied && !v.overturned_at;

  if (isPending) {
    return (
      <div className="flex gap-1">
        <button onClick={() => onAct(v.id, "apply")} className="rounded bg-accent-red/10 px-2 py-1 text-xs font-medium text-accent-red hover:bg-accent-red/20">
          Apply
        </button>
        <button onClick={() => onAct(v.id, "dismiss")} className="rounded bg-bg-tertiary px-2 py-1 text-xs font-medium text-text-secondary hover:bg-bg-card-hover">
          Dismiss
        </button>
      </div>
    );
  }
  if (isApplied) {
    return (
      <button onClick={() => onAct(v.id, "overturn")} className="rounded bg-accent-orange/10 px-2 py-1 text-xs font-medium text-accent-orange hover:bg-accent-orange/20">
        Overturn
      </button>
    );
  }
  return <span className="text-xs text-text-muted">—</span>;
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 85 ? "bg-accent-red" : value >= 70 ? "bg-accent-orange" : value >= 50 ? "bg-accent-gold" : "bg-accent-green";
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-bg-tertiary">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs">{value}</span>
    </div>
  );
}

function VerdictDetail({ v }: { v: Verdict }) {
  const evidence = parseJson(v.evidence_json);
  const flagIds = parseJson(v.flag_ids_considered);
  return (
    <div className="grid gap-4 text-xs md:grid-cols-2">
      <div className="space-y-2">
        <p className="font-semibold text-text-primary">Reasoning</p>
        <p className="whitespace-pre-wrap text-text-secondary">{v.reasoning}</p>
        {v.session_id && (
          <p className="text-text-muted">
            Session <Link href={`/ban-judge/sessions/${v.session_id}`} className="text-accent-gold hover:underline font-mono">{v.session_id.slice(0, 8)}</Link>
          </p>
        )}
      </div>
      <div className="space-y-2">
        {evidence && (
          <>
            <p className="font-semibold text-text-primary">Evidence</p>
            <pre className="max-h-48 overflow-auto rounded bg-bg-tertiary/50 p-2 text-xs text-text-secondary">{JSON.stringify(evidence, null, 2)}</pre>
          </>
        )}
        {flagIds?.length ? (
          <p className="text-text-muted">Flags considered: <span className="font-mono text-text-secondary">{flagIds.join(", ")}</span></p>
        ) : null}
      </div>
    </div>
  );
}

// -------------------- Sessions --------------------

function SessionsTab() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  useEffect(() => {
    fetch("/api/ban-judge/sessions").then((r) => r.json()).then((d) => setSessions(d.sessions || []));
  }, []);

  return sessions.length === 0 ? (
    <div className="rounded-xl border border-border bg-bg-card p-12 text-center text-text-secondary">No sessions yet. Run one from the Overview tab.</div>
  ) : (
    <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-secondary/50 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
            <th className="px-4 py-3">When</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Model</th>
            <th className="px-4 py-3 text-right">Accounts</th>
            <th className="px-4 py-3 text-right">Verdicts</th>
            <th className="px-4 py-3">Summary</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sessions.map((s) => (
            <tr key={s.id} className="hover:bg-bg-card-hover">
              <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                <Link href={`/ban-judge/sessions/${s.id}`} className="text-accent-gold hover:underline">
                  {new Date(s.started_at).toLocaleString()}
                </Link>
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs ${
                  s.status === "complete" ? "bg-accent-green/10 text-accent-green" :
                  s.status === "error" ? "bg-accent-red/10 text-accent-red" :
                  "bg-accent-gold/10 text-accent-gold"
                }`}>
                  {s.status}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-text-muted">{s.model}</td>
              <td className="px-4 py-3 text-right">{s.accounts_reviewed}</td>
              <td className="px-4 py-3 text-right">{s.verdicts_count}</td>
              <td className="px-4 py-3 text-xs text-text-secondary max-w-md truncate" title={s.summary || s.error || ""}>
                {s.summary || s.error || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// -------------------- Memory --------------------

function MemoryTab() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newAccountId, setNewAccountId] = useState("");

  async function load() {
    const res = await fetch("/api/ban-judge/memory");
    const data = await res.json();
    setMemories(data.memories || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!newContent.trim()) return;
    await fetch("/api/ban-judge/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: newContent,
        tags: newTags ? newTags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        account_id: newAccountId ? Number(newAccountId) : null,
      }),
    });
    setNewContent(""); setNewTags(""); setNewAccountId("");
    load();
  }

  async function del(id: number) {
    if (!confirm("Delete this memory?")) return;
    await fetch(`/api/ban-judge/memory?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-bg-card p-4 space-y-3">
        <p className="text-sm font-medium text-text-primary">Seed a memory</p>
        <p className="text-xs text-text-muted">Add a note the agent will read on its next run. Useful for seeding watchlists or policy hints.</p>
        <textarea
          placeholder="e.g. account 4812 is a donator — be extra careful before banning"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          className="w-full rounded bg-bg-tertiary px-3 py-2 text-sm"
          rows={2}
        />
        <div className="flex gap-2">
          <input
            placeholder="tags (comma-separated)"
            value={newTags}
            onChange={(e) => setNewTags(e.target.value)}
            className="flex-1 rounded bg-bg-tertiary px-3 py-2 text-xs"
          />
          <input
            placeholder="account id (optional)"
            value={newAccountId}
            onChange={(e) => setNewAccountId(e.target.value)}
            className="w-40 rounded bg-bg-tertiary px-3 py-2 text-xs"
          />
          <button onClick={add} className="rounded bg-accent-gold/20 px-4 py-2 text-xs font-medium text-accent-gold hover:bg-accent-gold/30">
            Add
          </button>
        </div>
      </div>

      {memories.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-card p-12 text-center text-text-secondary">
          No memories yet. The agent will write its own as it runs.
        </div>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => {
            const tags = parseJson(m.tags);
            return (
              <div key={m.id} className="rounded-lg border border-border bg-bg-card p-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <p className="whitespace-pre-wrap text-text-primary">{m.content}</p>
                  <button onClick={() => del(m.id)} className="text-xs text-text-muted hover:text-accent-red">Delete</button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  <span>{new Date(m.created_at).toLocaleString()}</span>
                  {m.account_id && <span className="font-mono">account #{m.account_id}</span>}
                  {Array.isArray(tags) && tags.map((t: string) => (
                    <span key={t} className="rounded bg-bg-tertiary px-1.5 py-0.5 font-mono">{t}</span>
                  ))}
                  {m.expires_at && <span className="text-accent-orange">expires {new Date(m.expires_at).toLocaleDateString()}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
