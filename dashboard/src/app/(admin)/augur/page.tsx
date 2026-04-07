"use client";

import { useState, useEffect } from "react";

interface AugurConfig {
  enabled: number;
  npc_id: number;
  model: string;
  system_prompt: string;
  greeting: string;
  max_messages_per_day: number;
  max_tokens_per_response: number;
  tools_enabled: number;
}

interface ChatLog {
  id: number;
  character_id: number;
  character_name: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  tool_calls: any;
  created_at: string;
}

interface Stats {
  messagesToday: number;
  uniquePlayersToday: number;
  allTimeMessages: number;
}

export default function AugurPage() {
  const [config, setConfig] = useState<AugurConfig | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/augur")
      .then((r) => r.json())
      .then((data) => {
        setConfig(data.config);
        setStats(data.stats);
      });
    fetch("/api/admin/augur/logs?limit=30")
      .then((r) => r.json())
      .then((data) => setLogs(data.logs || []));
  }, []);

  async function saveConfig() {
    if (!config) return;
    setSaving(true);
    await fetch("/api/admin/augur", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
  }

  async function handlePublish() {
    setPublishing(true);
    setPublishResult("Publishing...");
    try {
      const res = await fetch("/api/admin/augur/publish", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setPublishResult(`Done! ${data.actions?.join(" | ")}`);
      } else {
        setPublishResult(`Error: ${data.error}. Actions: ${data.actions?.join(" | ")}`);
      }
    } catch (e: any) {
      setPublishResult(`Failed: ${e.message}`);
    }
    setPublishing(false);
  }

  async function handleUploadSprite(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    await fetch("/api/admin/augur/sprite", { method: "POST", body: formData });
    setUploading(false);
  }

  if (!config) return <div className="p-8 text-text-secondary">Loading...</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Augur NPC</h1>
          <p className="text-sm text-text-secondary">AI Oracle Chatbot — NPC ID {config.npc_id}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={saveConfig}
            disabled={saving}
            className="rounded-lg bg-accent-gold px-4 py-2 text-sm font-bold text-bg-primary transition hover:bg-accent-gold/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Config"}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="rounded-lg bg-accent-blue px-4 py-2 text-sm font-bold text-white transition hover:bg-accent-blue/90 disabled:opacity-50"
          >
            {publishing ? "Publishing..." : "Publish to R2"}
          </button>
        </div>
      </div>

      {publishResult && (
        <div className="rounded-lg border border-border bg-bg-card p-4 text-sm">
          {publishResult}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Messages Today", value: stats.messagesToday },
            { label: "Unique Players Today", value: stats.uniquePlayersToday },
            { label: "All Time Messages", value: stats.allTimeMessages },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-bg-card p-4">
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs text-text-secondary">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Config */}
      <div className="space-y-4 rounded-lg border border-border bg-bg-card p-6">
        <h2 className="text-lg font-semibold">Configuration</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm text-text-secondary">Model</label>
            <input
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              className="w-full rounded border border-border bg-bg-primary px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">Max Messages/Day</label>
            <input
              type="number"
              value={config.max_messages_per_day}
              onChange={(e) => setConfig({ ...config, max_messages_per_day: parseInt(e.target.value) || 10 })}
              className="w-full rounded border border-border bg-bg-primary px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">Max Tokens/Response</label>
            <input
              type="number"
              value={config.max_tokens_per_response}
              onChange={(e) => setConfig({ ...config, max_tokens_per_response: parseInt(e.target.value) || 500 })}
              className="w-full rounded border border-border bg-bg-primary px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked ? 1 : 0 })}
              />
              Enabled
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!config.tools_enabled}
                onChange={(e) => setConfig({ ...config, tools_enabled: e.target.checked ? 1 : 0 })}
              />
              Tools Enabled
            </label>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-text-secondary">Greeting</label>
          <textarea
            value={config.greeting}
            onChange={(e) => setConfig({ ...config, greeting: e.target.value })}
            rows={2}
            className="w-full rounded border border-border bg-bg-primary px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-text-secondary">System Prompt</label>
          <textarea
            value={config.system_prompt}
            onChange={(e) => setConfig({ ...config, system_prompt: e.target.value })}
            rows={10}
            className="w-full rounded border border-border bg-bg-primary px-3 py-2 font-mono text-xs"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-text-secondary">Sprite PNG</label>
          <input type="file" accept="image/png" onChange={handleUploadSprite} className="text-sm" />
          {uploading && <span className="ml-2 text-xs text-text-secondary">Uploading...</span>}
        </div>
      </div>

      {/* Chat Logs */}
      <div className="space-y-4 rounded-lg border border-border bg-bg-card p-6">
        <h2 className="text-lg font-semibold">Recent Conversations</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-text-secondary">No conversations yet.</p>
        ) : (
          <div className="max-h-[500px] space-y-2 overflow-y-auto">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`rounded-lg border border-border p-3 text-sm ${
                  log.role === "user" ? "bg-bg-primary" : "bg-bg-secondary"
                }`}
              >
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>
                    {log.role === "user" ? `${log.character_name}` : "Augur"}{" "}
                  </span>
                  <span>{new Date(log.created_at).toLocaleString()}</span>
                </div>
                <div className="mt-1">{log.content}</div>
                {log.tool_calls && (
                  <div className="mt-1 text-xs text-text-muted">
                    Tools: {JSON.parse(log.tool_calls).map((t: any) => t.tool).join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
