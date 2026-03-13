"use client";

import { useState, useEffect, useCallback } from "react";
import ScriptEditor from "@/components/ScriptEditor";

/* ── types ──────────────────────────────────────────────────────── */

type ScriptType = "npc" | "event" | "portal" | "quest" | "map" | "reactor";

const SCRIPT_TYPES: { key: ScriptType; label: string; icon: string }[] = [
  { key: "npc", label: "NPC", icon: "💬" },
  { key: "event", label: "Event", icon: "📅" },
  { key: "portal", label: "Portal", icon: "🌀" },
  { key: "quest", label: "Quest", icon: "📋" },
  { key: "map", label: "Map", icon: "🗺️" },
  { key: "reactor", label: "Reactor", icon: "⚡" },
];

/* ── main page ──────────────────────────────────────────────────── */

export default function ScriptsPage() {
  const [activeType, setActiveType] = useState<ScriptType>("npc");
  const [scripts, setScripts] = useState<string[]>([]);
  const [filteredScripts, setFilteredScripts] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [loadingList, setLoadingList] = useState(false);

  const [selectedScript, setSelectedScript] = useState<string | null>(null);
  const [scriptContent, setScriptContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newScriptName, setNewScriptName] = useState("");
  const [creatingScript, setCreatingScript] = useState(false);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  function showFeedback(type: "success" | "error", message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  }

  /* ── fetch script list ───────────────────────────────────────── */

  const fetchScripts = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams({ type: activeType });
      if (filter) params.set("filter", filter);
      const res = await fetch(`/api/scripts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setScripts(Array.isArray(data) ? data : data.files ?? []);
      } else {
        setScripts([]);
      }
    } catch {
      setScripts([]);
    } finally {
      setLoadingList(false);
    }
  }, [activeType, filter]);

  useEffect(() => {
    fetchScripts();
    setSelectedScript(null);
    setScriptContent("");
    setOriginalContent("");
  }, [activeType]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const term = filter.toLowerCase();
    if (!term) {
      setFilteredScripts(scripts);
    } else {
      setFilteredScripts(
        scripts.filter((s) => s.toLowerCase().includes(term))
      );
    }
  }, [scripts, filter]);

  /* ── fetch script content ────────────────────────────────────── */

  async function loadScript(name: string) {
    setSelectedScript(name);
    setLoadingContent(true);
    setShowDeleteConfirm(false);
    try {
      const res = await fetch(`/api/scripts/${activeType}/${encodeURIComponent(name)}`);
      if (res.ok) {
        const data = await res.json();
        setScriptContent(data.content || "");
        setOriginalContent(data.content || "");
      } else {
        setScriptContent("// Failed to load script");
        setOriginalContent("");
      }
    } catch {
      setScriptContent("// Error loading script");
      setOriginalContent("");
    } finally {
      setLoadingContent(false);
    }
  }

  /* ── save ────────────────────────────────────────────────────── */

  async function handleSave() {
    if (!selectedScript) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/scripts/${activeType}/${encodeURIComponent(selectedScript)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: scriptContent }),
        }
      );
      if (res.ok) {
        setOriginalContent(scriptContent);
        showFeedback("success", "Script saved successfully");
      } else {
        showFeedback("error", "Failed to save script");
      }
    } catch {
      showFeedback("error", "Failed to save script");
    } finally {
      setSaving(false);
    }
  }

  /* ── delete ──────────────────────────────────────────────────── */

  async function handleDelete() {
    if (!selectedScript) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/scripts/${activeType}/${encodeURIComponent(selectedScript)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        showFeedback("success", `Deleted ${selectedScript}`);
        setSelectedScript(null);
        setScriptContent("");
        setOriginalContent("");
        setShowDeleteConfirm(false);
        fetchScripts();
      } else {
        showFeedback("error", "Failed to delete script");
      }
    } catch {
      showFeedback("error", "Failed to delete script");
    } finally {
      setDeleting(false);
    }
  }

  /* ── create new ──────────────────────────────────────────────── */

  async function handleCreate() {
    if (!newScriptName.trim()) return;
    const name = newScriptName.trim().endsWith(".js")
      ? newScriptName.trim()
      : `${newScriptName.trim()}.js`;

    setCreatingScript(true);
    try {
      const template = `/*\n * ${name}\n * Script type: ${activeType}\n */\n\n`;
      const res = await fetch(
        `/api/scripts/${activeType}/${encodeURIComponent(name)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: template }),
        }
      );
      if (res.ok) {
        showFeedback("success", `Created ${name}`);
        setShowNewDialog(false);
        setNewScriptName("");
        await fetchScripts();
        loadScript(name);
      } else {
        showFeedback("error", "Failed to create script");
      }
    } catch {
      showFeedback("error", "Failed to create script");
    } finally {
      setCreatingScript(false);
    }
  }

  const hasChanges = scriptContent !== originalContent;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-0">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            Script Editor
          </h1>
          <p className="mt-1 text-text-secondary">
            Browse, edit, and manage server scripts
          </p>
        </div>
        {feedback && (
          <div
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${
              feedback.type === "success"
                ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
                : "border-accent-red/30 bg-accent-red/10 text-accent-red"
            }`}
          >
            {feedback.message}
          </div>
        )}
      </div>

      {/* Main layout */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* ── Left: Script Browser ─────────────────────────────── */}
        <div className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-bg-card overflow-hidden">
          {/* Type tabs */}
          <div className="flex flex-wrap gap-1 border-b border-border p-2">
            {SCRIPT_TYPES.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => {
                  setActiveType(key);
                  setFilter("");
                }}
                className={`rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200 ${
                  activeType === key
                    ? "bg-accent-gold/15 text-accent-gold"
                    : "text-text-secondary hover:bg-bg-card-hover hover:text-text-primary"
                }`}
              >
                <span className="mr-1">{icon}</span>
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="border-b border-border p-2">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Filter ${activeType} scripts...`}
              className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent-blue"
            />
          </div>

          {/* New script button */}
          <div className="border-b border-border p-2">
            <button
              onClick={() => setShowNewDialog(true)}
              className="w-full rounded-lg border border-dashed border-accent-green/30 bg-accent-green/5 px-3 py-2 text-xs font-medium text-accent-green transition-colors hover:bg-accent-green/10"
            >
              + New Script
            </button>
          </div>

          {/* Script list */}
          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="flex h-32 items-center justify-center">
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-accent-gold border-t-transparent" />
              </div>
            ) : filteredScripts.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-text-muted">
                No scripts found
              </div>
            ) : (
              <div className="flex flex-col">
                {filteredScripts.map((name) => (
                  <button
                    key={name}
                    onClick={() => loadScript(name)}
                    className={`group flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                      selectedScript === name
                        ? "bg-accent-blue/10 text-accent-blue"
                        : "text-text-secondary hover:bg-bg-card-hover hover:text-text-primary"
                    }`}
                  >
                    <span className="text-text-muted group-hover:text-accent-gold">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                        <polyline points="13 2 13 9 20 9" />
                      </svg>
                    </span>
                    <span className="truncate">{name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Script count */}
          <div className="border-t border-border px-3 py-2">
            <span className="text-[10px] text-text-muted">
              {filteredScripts.length} / {scripts.length} scripts
            </span>
          </div>
        </div>

        {/* ── Right: Editor ────────────────────────────────────── */}
        <div className="flex flex-1 flex-col rounded-xl border border-border bg-bg-card overflow-hidden">
          {/* Editor toolbar */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-3">
              {selectedScript ? (
                <>
                  <span className="rounded-md bg-bg-secondary px-2.5 py-1 text-xs font-mono text-accent-gold">
                    {activeType}/
                  </span>
                  <span className="text-sm font-medium text-text-primary">
                    {selectedScript}
                  </span>
                  {hasChanges && (
                    <span className="h-2 w-2 rounded-full bg-accent-gold shadow-[0_0_6px_rgba(245,197,66,0.4)]" />
                  )}
                </>
              ) : (
                <span className="text-sm text-text-muted">
                  Select a script to edit
                </span>
              )}
            </div>

            {selectedScript && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  className="rounded-lg border border-accent-green/30 bg-accent-green/10 px-4 py-1.5 text-xs font-semibold text-accent-green transition-all hover:bg-accent-green/20 disabled:opacity-40"
                >
                  {saving ? (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent-green border-t-transparent" />
                      Saving...
                    </span>
                  ) : (
                    "Save"
                  )}
                </button>

                {showDeleteConfirm ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded-lg border border-accent-red/30 bg-accent-red/15 px-3 py-1.5 text-xs font-semibold text-accent-red hover:bg-accent-red/25"
                    >
                      {deleting ? "Deleting..." : "Confirm"}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="rounded-lg border border-accent-red/30 bg-accent-red/10 px-3 py-1.5 text-xs font-semibold text-accent-red transition-all hover:bg-accent-red/20"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Editor area */}
          <div className="flex-1 overflow-hidden">
            {loadingContent ? (
              <div className="flex h-full items-center justify-center">
                <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-accent-gold border-t-transparent" />
              </div>
            ) : selectedScript ? (
              <ScriptEditor
                value={scriptContent}
                onChange={setScriptContent}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-text-muted">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  className="opacity-30"
                >
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <polyline points="13 2 13 9 20 9" />
                </svg>
                <p className="text-sm">
                  Select a script from the browser to begin editing
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── New Script Dialog ──────────────────────────────────── */}
      {showNewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-bg-card p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-semibold text-text-primary">
              Create New Script
            </h3>
            <div className="mb-2 text-xs text-text-secondary">
              Type:{" "}
              <span className="font-semibold text-accent-gold">
                {activeType}
              </span>
            </div>
            <input
              type="text"
              value={newScriptName}
              onChange={(e) => setNewScriptName(e.target.value)}
              placeholder="script_name.js"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setShowNewDialog(false);
              }}
              className="mb-4 w-full rounded-lg border border-border bg-bg-secondary px-4 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent-blue"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowNewDialog(false);
                  setNewScriptName("");
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newScriptName.trim() || creatingScript}
                className="rounded-lg border border-accent-green/30 bg-accent-green/15 px-4 py-2 text-sm font-semibold text-accent-green hover:bg-accent-green/25 disabled:opacity-50"
              >
                {creatingScript ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
