"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Card from "@/components/Card";

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

interface ToolResult {
  toolCallId: string;
  name: string;
  result: any;
}

interface LogEntry {
  type: "thinking" | "tool_call" | "text";
  text?: string;
  tool?: ToolCall;
  result?: ToolResult;
}

interface SessionInfo {
  id: string;
  status: "running" | "complete" | "error";
  summary?: string;
  error?: string;
}

interface ScheduleConfig {
  enabled: boolean;
  intervalHours: number;
  model: string;
  lastRun: string | null;
  nextRun: string | null;
}

interface PastSession {
  id: string;
  startedAt: string;
  completedAt: string | null;
  trigger: string;
  prompt: string;
  summary: string | null;
  status: string;
  changesMade: number;
}

interface PastAction {
  id: number;
  sessionId: string;
  executedAt: string;
  toolName: string;
  toolInput: any;
  reasoning: string | null;
  category: string;
}

interface Goal {
  id: number;
  goal: string;
  targetMetric: string;
  targetValue: number;
  currentValue: number | null;
  status: string;
  lastChecked: string | null;
}

// A chat message: either user text or a GM response (log entries + session)
interface ChatMessage {
  role: "user" | "gm";
  text?: string;
  log?: LogEntry[];
  session?: SessionInfo;
  timestamp: number;
}

const PRESET_PROMPTS = [
  { label: "Full Analysis", prompt: "Analyze the current game state — economy, progression, activity, and health. Report what's notable, what needs attention, and suggest specific changes." },
  { label: "Balance Check", prompt: "Check if the mob difficulty curve is appropriate for the current player base. Look at player levels vs mob stats in popular training areas." },
  { label: "Economy Audit", prompt: "Audit the economy: meso circulation, item distribution, shop prices. Flag any inflation or deflation concerns." },
  { label: "Create Event", prompt: "Design and deploy a fun limited-time event for the current players. Consider their levels and gear when choosing event mobs and rewards." },
  { label: "Drop Rebalance", prompt: "Review drop tables for the top 10 most popular grinding maps. Ensure drops are rewarding but not economy-breaking." },
];

function prettyToolName(name: string) {
  return name
    .replace(/^(get_|search_|update_|add_|remove_|batch_update_|set_|create_|cleanup_|give_|take_)/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toolIcon(name: string) {
  if (name.includes("analytic") || name.includes("trend") || name.includes("snapshot")) return "\u25C8";
  if (name.includes("mob") || name.includes("drop")) return "\u25C6";
  if (name.includes("character") || name.includes("item")) return "\u25CF";
  if (name.includes("event") || name.includes("announce")) return "\u2726";
  if (name.includes("rate") || name.includes("config")) return "\u2699";
  if (name.includes("map") || name.includes("spawn") || name.includes("reactor")) return "\u25A0";
  if (name.includes("shop")) return "\u25B2";
  if (name.includes("goal") || name.includes("history")) return "\u25C9";
  return "\u25CB";
}

type GroupedEntry =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tools"; tools: Array<{ tool: ToolCall; result?: ToolResult }> };

function groupLog(log: LogEntry[]): GroupedEntry[] {
  const groups: GroupedEntry[] = [];
  for (const entry of log) {
    if (entry.type === "tool_call" && entry.tool) {
      const last = groups[groups.length - 1];
      if (last?.kind === "tools") {
        last.tools.push({ tool: entry.tool, result: entry.result });
      } else {
        groups.push({ kind: "tools", tools: [{ tool: entry.tool, result: entry.result }] });
      }
    } else if (entry.type === "thinking" && entry.text) {
      groups.push({ kind: "thinking", text: entry.text });
    } else if (entry.type === "text" && entry.text) {
      groups.push({ kind: "text", text: entry.text });
    }
  }
  return groups;
}

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button onClick={() => setOpen(!open)} className="group flex items-start gap-2 w-full text-left py-1">
      <span className="shrink-0 mt-0.5 text-[10px] text-accent-purple/50 transition-transform group-hover:text-accent-purple/80" style={{ transform: open ? "rotate(90deg)" : "" }}>&#9654;</span>
      {open ? (
        <p className="text-xs text-text-muted/70 whitespace-pre-wrap leading-relaxed">{text}</p>
      ) : (
        <span className="text-[11px] text-text-muted/50 italic">Reasoning...</span>
      )}
    </button>
  );
}

function ToolCluster({ tools }: { tools: Array<{ tool: ToolCall; result?: ToolResult }> }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const allDone = tools.every((t) => t.result);
  const runningCount = tools.filter((t) => !t.result).length;

  return (
    <div className="my-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {!allDone && <span className="h-1.5 w-1.5 rounded-full bg-accent-blue animate-pulse shrink-0" />}
        {tools.map(({ tool, result }) => {
          const isExpanded = expandedId === tool.id;
          return (
            <button key={tool.id} onClick={() => setExpandedId(isExpanded ? null : tool.id)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-all ${
                isExpanded ? "bg-accent-blue/15 text-accent-blue ring-1 ring-accent-blue/25"
                : result ? "bg-bg-secondary text-text-secondary hover:bg-bg-card-hover hover:text-text-primary"
                : "bg-accent-blue/10 text-accent-blue/80 animate-pulse"
              }`}>
              <span className="opacity-50">{toolIcon(tool.name)}</span>
              {prettyToolName(tool.name)}
            </button>
          );
        })}
        {!allDone && <span className="text-[10px] text-text-muted">{runningCount} running...</span>}
      </div>
      {expandedId && (() => {
        const item = tools.find((t) => t.tool.id === expandedId);
        if (!item) return null;
        return (
          <div className="mt-2 ml-1 rounded-lg border border-border/60 bg-bg-secondary/50 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40">
              <span className="text-[11px] font-mono text-accent-blue">{item.tool.name}</span>
              <span className={`text-[9px] font-semibold uppercase ${item.result ? "text-accent-green" : "text-accent-orange animate-pulse"}`}>
                {item.result ? "done" : "running"}
              </span>
            </div>
            <div className="px-3 py-2 space-y-1.5">
              <div>
                <span className="text-[9px] font-semibold text-text-muted uppercase">Input</span>
                <pre className="mt-0.5 text-[11px] text-text-secondary bg-bg-primary/50 rounded p-1.5 overflow-x-auto max-h-28 overflow-y-auto leading-relaxed">
                  {JSON.stringify(item.tool.input, null, 2)}
                </pre>
              </div>
              {item.result && (
                <div>
                  <span className="text-[9px] font-semibold text-text-muted uppercase">Result</span>
                  <pre className="mt-0.5 text-[11px] text-text-secondary bg-bg-primary/50 rounded p-1.5 overflow-x-auto max-h-40 overflow-y-auto leading-relaxed">
                    {typeof item.result.result === "string" ? item.result.result : JSON.stringify(item.result.result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function TextBlock({ text }: { text: string }) {
  return <div className="py-1.5 text-[13px] text-text-primary whitespace-pre-wrap leading-relaxed">{text}</div>;
}

function formatTime(dateStr: string | null) {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function timeAgo(dateStr: string | number) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ---- GM Response in chat ----
function GMResponse({ log, session, isStreaming }: { log: LogEntry[]; session?: SessionInfo; isStreaming: boolean }) {
  const grouped = useMemo(() => groupLog(log), [log]);
  const toolCallCount = log.filter((e) => e.type === "tool_call").length;

  return (
    <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
      {/* Status header */}
      <div className={`flex items-center gap-2.5 px-4 py-2 border-b border-border/50 ${
        isStreaming ? "bg-accent-blue/5"
        : session?.status === "complete" ? "bg-accent-green/5"
        : session?.status === "error" ? "bg-accent-red/5" : ""
      }`}>
        {isStreaming ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-accent-blue animate-pulse" />
            <span className="text-xs font-medium text-accent-blue">Running</span>
            <span className="text-[11px] text-text-muted">{toolCallCount} tools called</span>
          </>
        ) : session?.status === "complete" ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
            <span className="text-xs font-medium text-accent-green">Complete</span>
            <span className="text-[11px] text-text-muted">{toolCallCount} tools called</span>
          </>
        ) : session?.status === "error" ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-accent-red" />
            <span className="text-xs font-medium text-accent-red">Error</span>
            <span className="text-[11px] text-text-muted truncate">{session.error}</span>
          </>
        ) : null}
      </div>
      <div className="max-h-[500px] overflow-y-auto px-4 py-3">
        {grouped.map((group, i) => {
          if (group.kind === "thinking") return <ThinkingBlock key={i} text={group.text} />;
          if (group.kind === "tools") return <ToolCluster key={i} tools={group.tools} />;
          if (group.kind === "text") return <TextBlock key={i} text={group.text} />;
          return null;
        })}
      </div>
    </div>
  );
}

// ---- Schedule Panel ----
function SchedulePanel() {
  const [schedule, setSchedule] = useState<ScheduleConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch("/api/gm/schedule");
      setSchedule(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  const toggleEnabled = async () => {
    if (!schedule) return;
    const res = await fetch("/api/gm/schedule", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !schedule.enabled, intervalHours: schedule.intervalHours }) });
    setSchedule(await res.json());
  };

  const updateInterval = async (hours: number) => {
    const res = await fetch("/api/gm/schedule", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intervalHours: hours, enabled: schedule?.enabled }) });
    setSchedule(await res.json());
  };

  const updateModel = async (model: string) => {
    const res = await fetch("/api/gm/schedule", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) });
    setSchedule(await res.json());
  };

  if (loading || !schedule) return null;

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Auto-Tuning</h3>
          <p className="text-xs text-text-muted mt-0.5">{schedule.enabled ? `Every ${schedule.intervalHours}h` : "Off"}</p>
        </div>
        <button onClick={toggleEnabled}
          className={`relative h-6 w-11 rounded-full transition-colors ${schedule.enabled ? "bg-accent-green" : "bg-bg-secondary"}`}>
          <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${schedule.enabled ? "translate-x-5" : ""}`} />
        </button>
      </div>
      <div className="mt-3">
        <label className="text-[11px] font-medium text-text-muted block mb-1">AI Model (OpenRouter)</label>
        <input type="text" value={schedule.model}
          onChange={(e) => setSchedule({ ...schedule, model: e.target.value })}
          onBlur={() => updateModel(schedule.model)}
          onKeyDown={(e) => { if (e.key === "Enter") updateModel(schedule.model); }}
          placeholder="e.g. anthropic/claude-sonnet-4"
          className="w-full rounded-lg border border-border bg-bg-primary px-3 py-1.5 text-xs text-text-primary font-mono" />
      </div>
      {schedule.enabled && (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex gap-0.5">
            {[1, 2, 4, 8, 12, 24].map((h) => (
              <button key={h} onClick={() => updateInterval(h)}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  schedule.intervalHours === h ? "bg-accent-blue text-white" : "text-text-muted hover:text-text-secondary"
                }`}>{h}h</button>
            ))}
          </div>
          <div className="ml-auto text-[11px] text-text-muted">
            {schedule.nextRun && <>Next: {formatTime(schedule.nextRun)}</>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Goals Panel ----
function GoalsPanel() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gm/goals").then((r) => r.json()).then(setGoals).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading || goals.length === 0) return null;
  const active = goals.filter((g) => g.status === "active");
  const achieved = goals.filter((g) => g.status === "achieved");

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-2.5">Goals</h3>
      <div className="space-y-1.5">
        {active.map((g) => (
          <div key={g.id} className="flex items-start gap-2 text-xs">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent-blue shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-text-primary">{g.goal}</span>
              <span className="ml-2 text-text-muted">{g.currentValue ?? "?"}/{g.targetValue}</span>
            </div>
          </div>
        ))}
        {achieved.slice(0, 2).map((g) => (
          <div key={g.id} className="flex items-start gap-2 text-xs opacity-50">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent-green shrink-0" />
            <span className="text-text-secondary line-through">{g.goal}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Main Page ----
export default function GameMasterPage() {
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [currentLog, setCurrentLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [currentSession, setCurrentSession] = useState<SessionInfo | null>(null);
  const [prompt, setPrompt] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, currentLog]);

  const runGM = useCallback(async (userPrompt: string) => {
    if (running || !userPrompt.trim()) return;

    // Add user message to chat
    setChat((prev) => [...prev, { role: "user", text: userPrompt, timestamp: Date.now() }]);
    setRunning(true);
    setCurrentLog([]);
    setCurrentSession(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/gm/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userPrompt }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error("Failed to start GM session");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalSession: SessionInfo | null = null;
      const accumulatedLog: LogEntry[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "log") {
              if (data.entry.type === "tool_call" && data.entry.result) {
                const idx = accumulatedLog.findIndex(
                  (e) => e.type === "tool_call" && e.tool?.id === data.entry.tool?.id
                );
                if (idx >= 0) {
                  accumulatedLog[idx] = { ...accumulatedLog[idx], result: data.entry.result };
                } else {
                  accumulatedLog.push(data.entry);
                }
              } else {
                accumulatedLog.push(data.entry);
              }
              setCurrentLog([...accumulatedLog]);
            } else if (data.type === "done") {
              finalSession = data.session;
              setCurrentSession(data.session);
            } else if (data.type === "error") {
              finalSession = { id: "", status: "error", error: data.message };
              setCurrentSession(finalSession);
            }
          } catch {}
        }
      }

      // Move streaming response into chat history
      setChat((prev) => [
        ...prev,
        { role: "gm", log: [...accumulatedLog], session: finalSession || undefined, timestamp: Date.now() },
      ]);
      setCurrentLog([]);
      setCurrentSession(null);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        const errSession: SessionInfo = { id: "", status: "error", error: err.message };
        setChat((prev) => [...prev, { role: "gm", log: [], session: errSession, timestamp: Date.now() }]);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [running]);

  const handleSubmit = useCallback(() => {
    if (!prompt.trim()) return;
    const p = prompt;
    setPrompt("");
    runGM(p);
  }, [prompt, runGM]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Game Master</h1>
        <p className="mt-1 text-sm text-text-muted">Chat with the AI Game Master</p>
      </div>

      {/* Schedule + Goals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SchedulePanel />
        <GoalsPanel />
      </div>

      {/* Chat area */}
      <div className="rounded-xl border border-border bg-bg-primary/50 overflow-hidden flex flex-col" style={{ height: "calc(100vh - 320px)", minHeight: "400px" }}>
        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {chat.length === 0 && !running && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <span className="text-4xl mb-3 opacity-30">&#x2726;</span>
              <p className="text-sm text-text-muted">Send a message to the Game Master</p>
              <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                {PRESET_PROMPTS.map((p) => (
                  <button key={p.label} onClick={() => { setPrompt(p.prompt); }}
                    className="rounded-full px-3 py-1.5 text-[11px] font-medium text-text-muted border border-border hover:text-text-primary hover:border-border-light transition-all">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {chat.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "user" ? (
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-accent-blue/10 border border-accent-blue/20 px-4 py-2.5">
                  <p className="text-[13px] text-text-primary whitespace-pre-wrap">{msg.text}</p>
                  <p className="text-[10px] text-text-muted mt-1">{timeAgo(msg.timestamp)}</p>
                </div>
              ) : (
                <div className="max-w-[95%] w-full">
                  {msg.log && msg.log.length > 0 && (
                    <GMResponse log={msg.log} session={msg.session} isStreaming={false} />
                  )}
                  {msg.session?.status === "error" && (!msg.log || msg.log.length === 0) && (
                    <div className="rounded-xl border border-accent-red/20 bg-accent-red/5 px-4 py-3">
                      <p className="text-xs text-accent-red">{msg.session.error}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Currently streaming response */}
          {running && currentLog.length > 0 && (
            <div className="flex justify-start">
              <div className="max-w-[95%] w-full">
                <GMResponse log={currentLog} session={currentSession || undefined} isStreaming={true} />
              </div>
            </div>
          )}

          {running && currentLog.length === 0 && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-card px-4 py-3">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-blue animate-pulse" />
                <span className="text-xs text-text-muted">Thinking...</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-border bg-bg-card px-4 py-3">
          <div className="flex gap-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Tell the Game Master what to do..."
              rows={1}
              className="flex-1 rounded-lg border border-border/60 bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent-blue/50 resize-none"
            />
            {running ? (
              <button onClick={handleStop}
                className="shrink-0 rounded-lg bg-accent-red/90 px-5 py-2 text-xs font-semibold text-white hover:bg-accent-red transition-colors">
                Stop
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={!prompt.trim()}
                className="shrink-0 rounded-lg bg-accent-blue px-5 py-2 text-xs font-semibold text-white hover:bg-accent-blue/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
