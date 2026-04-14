"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Action {
  id: number;
  tool_name: string;
  tool_input: string;
  tool_result: string;
  reasoning: string | null;
  executed_at: string;
}

interface Verdict {
  id: number;
  account_id: number;
  character_name: string | null;
  verdict: string;
  confidence: number;
  reasoning: string;
  evidence_json: any;
  flag_ids_considered: any;
  applied: number;
  created_at: string;
}

interface MemoryRow {
  id: number;
  account_id: number | null;
  content: string;
  tags: any;
  created_at: string;
}

interface Session {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  model: string;
  summary: string | null;
  accounts_reviewed: number;
  verdicts_count: number;
  full_log: string | null;
  error: string | null;
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

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<{
    session: Session;
    actions: Action[];
    verdicts: Verdict[];
    memories: MemoryRow[];
  } | null>(null);
  const [openAction, setOpenAction] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/ban-judge/sessions/${id}`).then((r) => r.json()).then(setData);
  }, [id]);

  if (!data) return <div className="text-text-muted">Loading...</div>;
  if ((data as any).error) return <div className="text-accent-red">{(data as any).error}</div>;

  const { session, actions, verdicts, memories } = data;
  const durationMs = session.completed_at
    ? new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/ban-judge" className="text-xs text-text-muted hover:text-accent-gold">&larr; Back to Ban Judge</Link>
        <h1 className="mt-2 text-2xl font-bold text-text-primary">Session {session.id.slice(0, 8)}</h1>
        <p className="text-sm text-text-secondary">
          {new Date(session.started_at).toLocaleString()} — {session.status}
          {durationMs !== null && <span className="ml-2 text-text-muted">({(durationMs / 1000).toFixed(1)}s)</span>}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Model" value={session.model} />
        <Stat label="Accounts reviewed" value={session.accounts_reviewed} />
        <Stat label="Verdicts" value={session.verdicts_count} />
        <Stat label="Tool calls" value={actions.length} />
      </div>

      {session.summary && (
        <div className="rounded-xl border border-border bg-bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-2">Summary</h2>
          <p className="whitespace-pre-wrap text-sm text-text-secondary">{session.summary}</p>
        </div>
      )}

      {session.error && (
        <div className="rounded-xl border border-accent-red/30 bg-accent-red/5 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-accent-red mb-2">Error</h2>
          <p className="font-mono text-xs text-accent-red">{session.error}</p>
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-3">
          Verdicts ({verdicts.length})
        </h2>
        {verdicts.length === 0 ? (
          <p className="text-sm text-text-muted">No verdicts recorded.</p>
        ) : (
          <div className="space-y-2">
            {verdicts.map((v) => {
              const evidence = parseJson(v.evidence_json);
              const flagIds = parseJson(v.flag_ids_considered);
              return (
                <div key={v.id} className="rounded-lg border border-border bg-bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${VERDICT_COLORS[v.verdict]}`}>
                        {v.verdict}
                      </span>
                      <span className="font-medium text-text-primary">{v.character_name || "—"}</span>
                      <span className="text-xs text-text-muted">account #{v.account_id}</span>
                    </div>
                    <span className="text-xs font-mono text-text-muted">confidence {v.confidence}</span>
                  </div>
                  <p className="mt-2 text-sm text-text-secondary whitespace-pre-wrap">{v.reasoning}</p>
                  {evidence && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-text-muted hover:text-accent-gold">Evidence JSON</summary>
                      <pre className="mt-1 max-h-40 overflow-auto rounded bg-bg-tertiary/50 p-2 text-xs">{JSON.stringify(evidence, null, 2)}</pre>
                    </details>
                  )}
                  {flagIds?.length ? (
                    <p className="mt-2 text-xs text-text-muted">Flags: <span className="font-mono">{flagIds.join(", ")}</span></p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {memories.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-3">
            Memory written ({memories.length})
          </h2>
          <div className="space-y-2">
            {memories.map((m) => {
              const tags = parseJson(m.tags);
              return (
                <div key={m.id} className="rounded-lg border border-border bg-bg-card p-3 text-sm">
                  <p className="text-text-primary whitespace-pre-wrap">{m.content}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-text-muted">
                    {m.account_id && <span className="font-mono">account #{m.account_id}</span>}
                    {Array.isArray(tags) && tags.map((t: string) => (
                      <span key={t} className="rounded bg-bg-tertiary px-1.5 py-0.5 font-mono">{t}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-3">
          Tool trace ({actions.length})
        </h2>
        <div className="space-y-1">
          {actions.map((a) => {
            const isOpen = openAction === a.id;
            return (
              <div key={a.id} className="rounded border border-border bg-bg-card">
                <button
                  onClick={() => setOpenAction(isOpen ? null : a.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-bg-card-hover"
                >
                  <span className="font-mono text-xs text-text-primary">{a.tool_name}</span>
                  <span className="text-xs text-text-muted">{new Date(a.executed_at).toLocaleTimeString()}</span>
                </button>
                {isOpen && (
                  <div className="border-t border-border p-3 space-y-2 text-xs">
                    {a.reasoning && (
                      <div>
                        <p className="text-text-muted font-semibold">Reasoning</p>
                        <p className="whitespace-pre-wrap text-text-secondary">{a.reasoning}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-text-muted font-semibold">Input</p>
                      <pre className="max-h-40 overflow-auto rounded bg-bg-tertiary/50 p-2">{a.tool_input}</pre>
                    </div>
                    <div>
                      <p className="text-text-muted font-semibold">Result</p>
                      <pre className="max-h-60 overflow-auto rounded bg-bg-tertiary/50 p-2">{a.tool_result}</pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{value}</p>
    </div>
  );
}
