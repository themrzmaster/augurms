"use client";

import { useMapEditorStore } from "../state/useMapEditorStore";
import type { Tool } from "../state/types";
import { TOOL_LABELS, TOOL_SHORTCUTS } from "../state/types";

const TOOL_ICONS: Record<Tool, string> = {
  select: "↖",
  foothold: "╱",
  placeMob: "👾",
  placeNPC: "🧑",
  placePortal: "◇",
  placeSeat: "◻",
  placeLadder: "┃",
  eraser: "✕",
};

const TOOLS: Tool[] = [
  "select",
  "foothold",
  "placeMob",
  "placeNPC",
  "placePortal",
  "placeSeat",
  "placeLadder",
  "eraser",
];

export default function EditorToolbar() {
  const tool = useMapEditorStore((s) => s.tool);
  const setTool = useMapEditorStore((s) => s.setTool);
  const undo = useMapEditorStore((s) => s.undo);
  const redo = useMapEditorStore((s) => s.redo);
  const undoStack = useMapEditorStore((s) => s.undoStack);
  const redoStack = useMapEditorStore((s) => s.redoStack);
  const snapEnabled = useMapEditorStore((s) => s.snapEnabled);
  const setSnapEnabled = useMapEditorStore((s) => s.setSnapEnabled);
  const showGrid = useMapEditorStore((s) => s.showGrid);
  const setShowGrid = useMapEditorStore((s) => s.setShowGrid);
  const isDirty = useMapEditorStore((s) => s.isDirty);
  const saving = useMapEditorStore((s) => s.saving);

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-bg-card px-2 py-1.5">
      {/* Tools */}
      <div className="flex items-center gap-0.5">
        {TOOLS.map((t) => (
          <button
            key={t}
            onClick={() => setTool(t)}
            title={`${TOOL_LABELS[t]} (${TOOL_SHORTCUTS[t]})`}
            className={`flex h-8 w-8 items-center justify-center rounded text-sm transition-colors ${
              tool === t
                ? "bg-accent-blue/20 text-accent-blue"
                : "text-text-secondary hover:bg-bg-card-hover hover:text-text-primary"
            }`}
          >
            {TOOL_ICONS[t]}
          </button>
        ))}
      </div>

      <div className="mx-1.5 h-5 w-px bg-border" />

      {/* Undo/Redo */}
      <button
        onClick={undo}
        disabled={undoStack.length === 0}
        title="Undo (Ctrl+Z)"
        className="flex h-8 w-8 items-center justify-center rounded text-sm text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
      >
        ↩
      </button>
      <button
        onClick={redo}
        disabled={redoStack.length === 0}
        title="Redo (Ctrl+Shift+Z)"
        className="flex h-8 w-8 items-center justify-center rounded text-sm text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
      >
        ↪
      </button>

      <div className="mx-1.5 h-5 w-px bg-border" />

      {/* Snap toggle */}
      <button
        onClick={() => setSnapEnabled(!snapEnabled)}
        title={`Snap ${snapEnabled ? "ON" : "OFF"}`}
        className={`flex h-8 items-center gap-1 rounded px-2 text-xs font-medium transition-colors ${
          snapEnabled
            ? "bg-accent-green/15 text-accent-green"
            : "text-text-muted hover:bg-bg-card-hover hover:text-text-secondary"
        }`}
      >
        <span className="text-sm">⊞</span>
        Snap
      </button>

      {/* Grid toggle */}
      <button
        onClick={() => setShowGrid(!showGrid)}
        title={`Grid ${showGrid ? "ON" : "OFF"}`}
        className={`flex h-8 items-center gap-1 rounded px-2 text-xs font-medium transition-colors ${
          showGrid
            ? "bg-accent-purple/15 text-accent-purple"
            : "text-text-muted hover:bg-bg-card-hover hover:text-text-secondary"
        }`}
      >
        <span className="text-sm">#</span>
        Grid
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Dirty indicator */}
      {isDirty && !saving && (
        <span className="mr-2 text-[10px] text-accent-orange">Unsaved</span>
      )}
      {saving && (
        <span className="mr-2 text-[10px] text-accent-blue">Saving...</span>
      )}
    </div>
  );
}
