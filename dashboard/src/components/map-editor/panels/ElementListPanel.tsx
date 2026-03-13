"use client";

import { useState, useMemo } from "react";
import { useMapEditorStore } from "../state/useMapEditorStore";
import { getLayerColor, PORTAL_TYPE_NAMES } from "../state/types";
import type { ElementType } from "../state/types";

type FilterType = "all" | "foothold" | "mob" | "npc" | "portal" | "ladderRope" | "seat";

const FILTER_OPTIONS: { key: FilterType; label: string; color?: string }[] = [
  { key: "all", label: "All" },
  { key: "foothold", label: "FH", color: "#c8c8dc" },
  { key: "mob", label: "Mob", color: "#ff5c5c" },
  { key: "npc", label: "NPC", color: "#4a9eff" },
  { key: "portal", label: "Portal", color: "#f5c542" },
  { key: "ladderRope", label: "L/R", color: "#fb923c" },
  { key: "seat", label: "Seat", color: "#a78bfa" },
];

export default function ElementListPanel() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  const footholds = useMapEditorStore((s) => s.footholds);
  const life = useMapEditorStore((s) => s.life);
  const portals = useMapEditorStore((s) => s.portals);
  const ladderRopes = useMapEditorStore((s) => s.ladderRopes);
  const seats = useMapEditorStore((s) => s.seats);
  const selection = useMapEditorStore((s) => s.selection);
  const setSelection = useMapEditorStore((s) => s.setSelection);

  const items = useMemo(() => {
    const result: Array<{
      editorId: string;
      label: string;
      sublabel: string;
      type: FilterType;
      color: string;
    }> = [];

    if (filter === "all" || filter === "foothold") {
      for (const fh of footholds) {
        result.push({
          editorId: fh.editorId,
          label: `FH ${fh.id}`,
          sublabel: `L${fh.layer} G${fh.group} (${fh.x1},${fh.y1})→(${fh.x2},${fh.y2})`,
          type: "foothold",
          color: getLayerColor(fh.layer),
        });
      }
    }

    if (filter === "all" || filter === "mob") {
      for (const l of life.filter((l) => l.type === "m")) {
        result.push({
          editorId: l.editorId,
          label: l.name || `Mob ${l.id}`,
          sublabel: `(${l.x}, ${l.y})`,
          type: "mob",
          color: "#ff5c5c",
        });
      }
    }

    if (filter === "all" || filter === "npc") {
      for (const l of life.filter((l) => l.type === "n")) {
        result.push({
          editorId: l.editorId,
          label: l.name || `NPC ${l.id}`,
          sublabel: `(${l.x}, ${l.y})`,
          type: "npc",
          color: "#4a9eff",
        });
      }
    }

    if (filter === "all" || filter === "portal") {
      for (const p of portals) {
        result.push({
          editorId: p.editorId,
          label: p.pn || "unnamed",
          sublabel: `${PORTAL_TYPE_NAMES[p.pt] || `type ${p.pt}`} (${p.x}, ${p.y})`,
          type: "portal",
          color: "#f5c542",
        });
      }
    }

    if (filter === "all" || filter === "ladderRope") {
      for (const lr of ladderRopes) {
        result.push({
          editorId: lr.editorId,
          label: lr.l === 1 ? `Ladder ${lr.id}` : `Rope ${lr.id}`,
          sublabel: `x=${lr.x} y=${lr.y1}→${lr.y2}`,
          type: "ladderRope",
          color: lr.l === 1 ? "#fb923c" : "#42d392",
        });
      }
    }

    if (filter === "all" || filter === "seat") {
      for (const s of seats) {
        result.push({
          editorId: s.editorId,
          label: `Seat ${s.id}`,
          sublabel: `(${s.x}, ${s.y})`,
          type: "seat",
          color: "#a78bfa",
        });
      }
    }

    // Apply search filter
    if (search) {
      const q = search.toLowerCase();
      return result.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.sublabel.toLowerCase().includes(q),
      );
    }

    return result;
  }, [filter, search, footholds, life, portals, ladderRopes, seats]);

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="border-b border-border p-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search elements..."
          className="w-full rounded border border-border bg-bg-secondary px-2 py-1.5 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent-blue"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border p-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
              filter === opt.key
                ? "bg-accent-blue/20 text-accent-blue"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {opt.color && (
              <span
                className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: opt.color }}
              />
            )}
            {opt.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && (
          <div className="py-8 text-center text-xs text-text-muted">
            No elements found
          </div>
        )}
        {items.map((item) => {
          const isSelected = selection.editorIds.includes(item.editorId);
          return (
            <button
              key={item.editorId}
              onClick={() =>
                setSelection({ editorIds: [item.editorId] })
              }
              className={`flex w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-left transition-colors ${
                isSelected
                  ? "bg-accent-blue/10"
                  : "hover:bg-bg-card-hover"
              }`}
            >
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-text-primary">
                  {item.label}
                </p>
                <p className="truncate font-mono text-[10px] text-text-muted">
                  {item.sublabel}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Count */}
      <div className="border-t border-border px-3 py-1.5 text-[10px] text-text-muted">
        {items.length} element{items.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
