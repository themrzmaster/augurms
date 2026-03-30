"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────

interface WorldMapSpot {
  title?: string;
  description?: string;
  spot: { x: number; y: number };
  type: number;
  mapNumbers: number[];
}

interface WorldMapLink {
  toolTip: string;
  linksTo: string;
}

interface WorldMapData {
  baseImage: Array<{
    canvas?: string;
    data?: string;
    origin?: { x: number; y: number };
    width?: number;
    height?: number;
  }>;
  maps: WorldMapSpot[];
  links: WorldMapLink[];
}

interface ActionCount {
  mapId: number;
  category: string;
  count: number;
  lastAction: string;
}

interface GMAction {
  id: number;
  toolName: string;
  toolInput: any;
  toolResult?: any;
  reasoning: string;
  category: string;
  executedAt: string;
}

interface MapName {
  name: string;
  streetName: string;
}

interface BreadcrumbEntry {
  id: string;
  name: string;
}

// ─── Constants ───────────────────────────────────────────

const MAPLESTORY_API = "https://maplestory.io/api/GMS/83";

const CATEGORY_COLORS: Record<string, string> = {
  npcs: "#f5c542",
  spawns: "#ff5c5c",
  drops: "#4a9eff",
  events: "#a78bfa",
  mobs: "#ff5c5c",
  shops: "#42d392",
  reactors: "#fb923c",
  rates: "#06b6d4",
  config: "#8888a8",
  other: "#8888a8",
};

const CATEGORY_LABELS: Record<string, string> = {
  npcs: "NPCs",
  spawns: "Spawns",
  drops: "Drops",
  events: "Events",
  mobs: "Mobs",
  shops: "Shops",
  reactors: "Reactors",
  rates: "Rates",
  config: "Config",
  other: "Other",
};

const TOOL_LABELS: Record<string, string> = {
  create_custom_npc: "Created NPC",
  update_custom_npc: "Updated NPC",
  delete_custom_npc: "Deleted NPC",
  add_map_spawn: "Added spawn",
  remove_map_spawn: "Removed spawn",
  add_map_reactor: "Placed reactor",
  remove_map_reactor: "Removed reactor",
  add_mob_drop: "Added drop",
  remove_mob_drop: "Removed drop",
  spawn_drop: "Spawned item",
  create_event: "Created event",
  cleanup_event: "Ended event",
  update_rates: "Changed rates",
  add_shop_item: "Added shop item",
  remove_shop_item: "Removed shop item",
  update_shop_price: "Changed shop price",
  update_mob: "Modified mob",
  batch_update_mobs: "Modified mobs",
  batch_update_drops: "Modified drops",
  add_reactor_drop: "Added reactor drop",
  remove_reactor_drop: "Removed reactor drop",
  update_config: "Updated config",
  set_server_message: "Broadcast message",
  give_item_to_character: "Gave item",
  grant_nx: "Granted NX",
  update_character: "Modified character",
};

// ─── Helpers ─────────────────────────────────────────────

function spotToPosition(
  spot: { x: number; y: number },
  origin: { x: number; y: number },
  width: number,
  height: number
) {
  return {
    left: `${((origin.x + spot.x) / width) * 100}%`,
    top: `${((origin.y + spot.y) / height) * 100}%`,
  };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getToolLabel(toolName: string): string {
  return (
    TOOL_LABELS[toolName] ||
    toolName
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase())
  );
}

function getActivityForMaps(
  mapIds: number[],
  counts: ActionCount[]
): {
  total: number;
  byCategory: Record<string, number>;
  lastAction: string | null;
} {
  const mapSet = new Set(mapIds);
  const byCategory: Record<string, number> = {};
  let total = 0;
  let lastAction: string | null = null;

  for (const c of counts) {
    if (mapSet.has(c.mapId)) {
      total += c.count;
      byCategory[c.category] = (byCategory[c.category] || 0) + c.count;
      if (!lastAction || c.lastAction > lastAction) lastAction = c.lastAction;
    }
  }

  return { total, byCategory, lastAction };
}

function getDominantCategory(byCategory: Record<string, number>): string {
  let max = 0;
  let dominant = "other";
  for (const [cat, count] of Object.entries(byCategory)) {
    if (count > max) {
      max = count;
      dominant = cat;
    }
  }
  return dominant;
}

function getBaseImage(
  data: WorldMapData
): { src: string; origin: { x: number; y: number }; w: number; h: number } | null {
  if (!data.baseImage?.length) return null;
  const img = data.baseImage[0];
  const raw = img.canvas || img.data || (img as any).image;
  if (!raw) return null;
  return {
    src: raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`,
    origin: img.origin || { x: 320, y: 235 },
    w: img.width || 640,
    h: img.height || 470,
  };
}

function getMapName(
  mapId: number,
  mapNames: Record<string, MapName>
): string {
  const entry = mapNames[String(mapId)];
  return entry?.name || `Map ${mapId}`;
}

// ─── Sub-Components ──────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex h-[calc(100vh-2rem)] animate-pulse gap-4">
      <div className="flex-1 rounded-2xl bg-bg-card" />
      <div className="flex w-80 flex-col gap-4">
        <div className="h-48 rounded-2xl bg-bg-card" />
        <div className="flex-1 rounded-2xl bg-bg-card" />
      </div>
    </div>
  );
}

function Legend() {
  const cats = Object.entries(CATEGORY_COLORS).filter(
    ([k]) => !["other", "config"].includes(k) && k !== "mobs"
  );
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-bg-card/50 px-4 py-2.5">
      {cats.map(([cat, color]) => (
        <div key={cat} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}50` }}
          />
          <span className="text-xs text-text-secondary">
            {CATEGORY_LABELS[cat] || cat}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatsPanel({
  counts,
  globalCounts,
  mapNames,
}: {
  counts: ActionCount[];
  globalCounts?: Array<{ category: string; count: number; lastAction: string }>;
  mapNames: Record<string, MapName>;
}) {
  const stats = useMemo(() => {
    const mapActions = counts.reduce((s, c) => s + c.count, 0);
    const globalActions = (globalCounts || []).reduce((s, c) => s + c.count, 0);
    const totalActions = mapActions + globalActions;
    const uniqueMaps = new Set(counts.map((c) => c.mapId)).size;
    const byCategory: Record<string, number> = {};
    for (const c of counts) {
      byCategory[c.category] = (byCategory[c.category] || 0) + c.count;
    }
    for (const c of globalCounts || []) {
      byCategory[c.category] = (byCategory[c.category] || 0) + c.count;
    }

    // Most active map
    const mapTotals: Record<number, number> = {};
    for (const c of counts) {
      mapTotals[c.mapId] = (mapTotals[c.mapId] || 0) + c.count;
    }
    let topMapId = 0;
    let topCount = 0;
    for (const [id, count] of Object.entries(mapTotals)) {
      if (count > topCount) {
        topCount = count;
        topMapId = parseInt(id);
      }
    }

    return { totalActions, uniqueMaps, byCategory, topMapId, topCount };
  }, [counts]);

  return (
    <div className="rounded-xl border border-border bg-bg-card/80 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
        Statistics
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-2xl font-bold text-accent-gold">
            {stats.totalActions}
          </div>
          <div className="text-xs text-text-muted">Total Actions</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-accent-blue">
            {stats.uniqueMaps}
          </div>
          <div className="text-xs text-text-muted">Maps Touched</div>
        </div>
      </div>
      {stats.topMapId > 0 && (
        <div className="mt-3 rounded-lg bg-bg-secondary/50 p-2">
          <div className="text-xs text-text-muted">Most Active</div>
          <div className="truncate text-sm font-medium text-text-primary">
            {getMapName(stats.topMapId, mapNames)}
          </div>
          <div className="text-xs text-text-secondary">
            {stats.topCount} actions
          </div>
        </div>
      )}
      {Object.keys(stats.byCategory).length > 0 && (
        <div className="mt-3 space-y-1.5">
          {Object.entries(stats.byCategory)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: CATEGORY_COLORS[cat] || "#8888a8",
                  }}
                />
                <span className="flex-1 text-xs text-text-secondary">
                  {CATEGORY_LABELS[cat] || cat}
                </span>
                <span className="text-xs font-medium text-text-primary">
                  {count}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function ActionCard({
  action,
  mapNames,
  onClick,
}: {
  action: GMAction;
  mapNames: Record<string, MapName>;
  onClick?: () => void;
}) {
  const mapId = action.toolInput?.mapId;
  const color = CATEGORY_COLORS[action.category] || "#8888a8";
  const lifeId = action.toolInput?.lifeId || action.toolInput?.npcId;
  const isNpc =
    action.toolInput?.type === "n" || action.category === "npcs";

  return (
    <button
      onClick={onClick}
      className="group flex w-full gap-3 rounded-lg border border-transparent p-2.5 text-left transition-all hover:border-border hover:bg-bg-card-hover"
    >
      <div
        className="mt-0.5 h-full w-1 flex-shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">
            {getToolLabel(action.toolName)}
          </span>
          <span className="text-xs text-text-muted">
            {timeAgo(action.executedAt)}
          </span>
        </div>
        <div className="mt-0.5 truncate text-xs text-text-secondary">
          {mapId ? getMapName(mapId, mapNames) : "Server-wide"}
        </div>
        {action.reasoning && (
          <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-muted">
            {action.reasoning}
          </div>
        )}
      </div>
      {lifeId && (
        <img
          src={`${MAPLESTORY_API}/${isNpc ? "npc" : "mob"}/${lifeId}/icon`}
          alt=""
          className="sprite-render h-10 w-10 flex-shrink-0 object-contain opacity-70 transition-opacity group-hover:opacity-100"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
    </button>
  );
}

function ActivityFeed({
  actions,
  mapNames,
  title,
  onActionClick,
}: {
  actions: GMAction[];
  mapNames: Record<string, MapName>;
  title: string;
  onActionClick?: (mapId: number) => void;
}) {
  if (actions.length === 0) {
    return (
      <div className="flex flex-1 flex-col rounded-xl border border-border bg-bg-card/80 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
          {title}
        </h3>
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <div className="text-3xl opacity-30">
            <img
              src={`${MAPLESTORY_API}/npc/2007/icon`}
              alt=""
              className="sprite-render mx-auto mb-2 h-16 w-16 opacity-30"
            />
          </div>
          <p className="text-sm text-text-muted">No actions recorded yet</p>
          <p className="mt-1 text-xs text-text-muted">
            The Augur hasn&apos;t modified any maps
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col rounded-xl border border-border bg-bg-card/80">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {title}
        </h3>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {actions.map((a) => (
          <ActionCard
            key={a.id}
            action={a}
            mapNames={mapNames}
            onClick={
              a.toolInput?.mapId && onActionClick
                ? () => onActionClick(a.toolInput.mapId)
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

function MapMarker({
  spot,
  activity,
  origin,
  mapWidth,
  mapHeight,
  isHovered,
  onHover,
  onClick,
  label,
  isLink,
}: {
  spot: { x: number; y: number };
  activity: {
    total: number;
    byCategory: Record<string, number>;
    lastAction: string | null;
  };
  origin: { x: number; y: number };
  mapWidth: number;
  mapHeight: number;
  isHovered: boolean;
  onHover: (hovered: boolean) => void;
  onClick: () => void;
  label?: string;
  isLink?: boolean;
}) {
  const pos = spotToPosition(spot, origin, mapWidth, mapHeight);
  const hasActivity = activity.total > 0;
  const dominant = getDominantCategory(activity.byCategory);
  const color = hasActivity
    ? CATEGORY_COLORS[dominant] || "#f5c542"
    : isLink
      ? "#4a9eff"
      : "#555570";
  const size = hasActivity ? Math.min(12 + activity.total * 2, 28) : isLink ? 10 : 6;
  const isRecent =
    activity.lastAction &&
    Date.now() - new Date(activity.lastAction).getTime() < 86400000;

  return (
    <div
      className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer"
      style={{ left: pos.left, top: pos.top }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onClick}
    >
      {/* Pulse ring for recent activity */}
      {hasActivity && isRecent && (
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: size + 16,
            height: size + 16,
            backgroundColor: color,
            opacity: 0.2,
            animation: "pulse-ring 2s ease-out infinite",
          }}
        />
      )}

      {/* Glow */}
      {hasActivity && (
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-sm"
          style={{
            width: size + 8,
            height: size + 8,
            backgroundColor: color,
            opacity: 0.3,
          }}
        />
      )}

      {/* Main dot */}
      <span
        className="relative block rounded-full border transition-transform group-hover:scale-125"
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          borderColor: `${color}80`,
          boxShadow: `0 0 ${hasActivity ? 12 : 4}px ${color}60`,
        }}
      />

      {/* Activity count badge */}
      {hasActivity && activity.total > 1 && (
        <span
          className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
          style={{
            backgroundColor: color,
            color: "#0a0a12",
          }}
        >
          {activity.total}
        </span>
      )}

      {/* Tooltip */}
      {isHovered && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap">
          <div className="rounded-lg border border-border bg-bg-secondary px-3 py-2 shadow-xl">
            {label && (
              <div className="text-sm font-medium text-text-primary">
                {label}
              </div>
            )}
            {hasActivity ? (
              <div className="mt-1 space-y-0.5">
                {Object.entries(activity.byCategory)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, count]) => (
                    <div
                      key={cat}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          backgroundColor:
                            CATEGORY_COLORS[cat] || "#8888a8",
                        }}
                      />
                      <span className="text-text-secondary">
                        {count} {CATEGORY_LABELS[cat] || cat}
                      </span>
                    </div>
                  ))}
                {activity.lastAction && (
                  <div className="mt-1 text-[10px] text-text-muted">
                    Last: {timeAgo(activity.lastAction)}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-text-muted">
                {isLink ? "Click to explore" : "No GM activity"}
              </div>
            )}
          </div>
          <div className="mx-auto h-2 w-2 -translate-y-0.5 rotate-45 border-b border-r border-border bg-bg-secondary" />
        </div>
      )}
    </div>
  );
}

function MapDetailView({
  mapId,
  actions,
  mapNames,
  onBack,
}: {
  mapId: number;
  actions: GMAction[];
  mapNames: Record<string, MapName>;
  onBack: () => void;
}) {
  const [mapActions, setMapActions] = useState<GMAction[]>(actions);
  const [loadingActions, setLoadingActions] = useState(actions.length === 0);

  useEffect(() => {
    if (actions.length > 0) return;
    setLoadingActions(true);
    fetch(`/api/gm/actions/map?mapId=${mapId}`)
      .then((r) => r.json())
      .then((data) => {
        setMapActions(data.actions || []);
        setLoadingActions(false);
      })
      .catch(() => setLoadingActions(false));
  }, [mapId, actions.length]);

  const name = getMapName(mapId, mapNames);
  const streetName = mapNames[String(mapId)]?.streetName;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Map render */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-bg-card">
        <div className="relative h-[350px] overflow-auto">
          <img
            src={`${MAPLESTORY_API}/map/${mapId}/render?resize=0.6`}
            alt={name}
            className="sprite-render min-h-full min-w-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `${MAPLESTORY_API}/map/${mapId}/minimap`;
            }}
          />
          {/* Overlay with map info */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-bg-primary/90 to-transparent p-4 pt-12">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-xl font-bold text-text-primary">
                  {name}
                </h2>
                {streetName && (
                  <p className="text-sm text-text-secondary">
                    {streetName}
                  </p>
                )}
              </div>
              <span className="rounded-lg bg-bg-card/80 px-2 py-1 font-mono text-xs text-text-muted">
                ID: {mapId}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions timeline */}
      <div className="flex-1 overflow-hidden rounded-xl border border-border bg-bg-card/80">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Action History
            {mapActions.length > 0 && (
              <span className="ml-2 text-text-secondary">
                ({mapActions.length})
              </span>
            )}
          </h3>
        </div>
        <div className="overflow-y-auto p-4" style={{ maxHeight: "calc(100vh - 600px)" }}>
          {loadingActions ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-gold border-t-transparent" />
            </div>
          ) : mapActions.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-muted">
              No GM actions recorded for this map
            </div>
          ) : (
            <div className="relative space-y-4 pl-6">
              {/* Timeline line */}
              <div className="absolute bottom-0 left-2 top-0 w-px bg-border" />

              {mapActions.map((action) => {
                const color =
                  CATEGORY_COLORS[action.category] || "#8888a8";
                return (
                  <div key={action.id} className="relative">
                    {/* Timeline dot */}
                    <span
                      className="absolute -left-[18px] top-1 h-3 w-3 rounded-full border-2 border-bg-card"
                      style={{ backgroundColor: color }}
                    />
                    <div className="rounded-lg border border-border/50 bg-bg-secondary/30 p-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                          style={{
                            backgroundColor: `${color}20`,
                            color: color,
                          }}
                        >
                          {CATEGORY_LABELS[action.category] ||
                            action.category}
                        </span>
                        <span className="text-sm font-medium text-text-primary">
                          {getToolLabel(action.toolName)}
                        </span>
                        <span className="ml-auto text-xs text-text-muted">
                          {formatDate(action.executedAt)}
                        </span>
                      </div>
                      {action.reasoning && (
                        <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
                          &ldquo;{action.reasoning}&rdquo;
                        </p>
                      )}
                      {(action.toolInput?.x !== undefined ||
                        action.toolInput?.lifeId) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {action.toolInput.lifeId && (
                            <span className="inline-flex items-center gap-1 rounded bg-bg-card px-2 py-0.5 text-[10px] text-text-muted">
                              <img
                                src={`${MAPLESTORY_API}/${action.toolInput.type === "n" || action.category === "npcs" ? "npc" : "mob"}/${action.toolInput.lifeId || action.toolInput.npcId}/icon`}
                                alt=""
                                className="sprite-render h-4 w-4"
                                onError={(e) => {
                                  (
                                    e.target as HTMLImageElement
                                  ).style.display = "none";
                                }}
                              />
                              ID: {action.toolInput.lifeId || action.toolInput.npcId}
                            </span>
                          )}
                          {action.toolInput.x !== undefined && (
                            <span className="rounded bg-bg-card px-2 py-0.5 text-[10px] text-text-muted">
                              Position: ({action.toolInput.x},{" "}
                              {action.toolInput.y})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Component ─────────────────────────────────

export default function WorldMapPage() {
  const [view, setView] = useState<"world" | "region" | "map">("world");
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([
    { id: "WorldMap", name: "World" },
  ]);
  const [currentMapId, setCurrentMapId] = useState<number | null>(null);
  const [mapData, setMapData] = useState<WorldMapData | null>(null);
  const [actionCounts, setActionCounts] = useState<ActionCount[]>([]);
  const [globalCounts, setGlobalCounts] = useState<Array<{ category: string; count: number; lastAction: string }>>([]);
  const [recentActions, setRecentActions] = useState<GMAction[]>([]);
  const [mapNames, setMapNames] = useState<Record<string, MapName>>({});
  const [loading, setLoading] = useState(true);
  const [hoveredSpot, setHoveredSpot] = useState<number | null>(null);
  const [timeFilter, setTimeFilter] = useState<string>("all"); // "7", "30", "90", "all"

  // Get the current region ID from breadcrumbs
  const currentRegion = breadcrumbs[breadcrumbs.length - 1].id;

  // Fetch action data (re-runs when time filter changes)
  const fetchActions = useCallback((days: string) => {
    const param = days === "all" ? "" : `?days=${days}`;
    return fetch(`/api/gm/actions/map${param}`).then((r) => r.json());
  }, []);

  // Initial data load
  useEffect(() => {
    Promise.all([
      fetch("/api/worldmap/WorldMap").then((r) => r.json()),
      fetchActions(timeFilter),
      fetch("/api/worldmap/mapnames").then((r) => r.json()),
    ])
      .then(([world, actions, names]) => {
        setMapData(world);
        if (actions.counts) setActionCounts(actions.counts);
        if (actions.globalCounts) setGlobalCounts(actions.globalCounts);
        if (actions.recent) setRecentActions(actions.recent);
        setMapNames(names);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load world map data:", err);
        setLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch actions when time filter changes
  const handleTimeFilterChange = useCallback(
    (newFilter: string) => {
      setTimeFilter(newFilter);
      fetchActions(newFilter).then((actions) => {
        if (actions.counts) setActionCounts(actions.counts);
        if (actions.globalCounts) setGlobalCounts(actions.globalCounts);
        if (actions.recent) setRecentActions(actions.recent);
      });
    },
    [fetchActions]
  );

  // Navigate to a region
  const navigateToRegion = useCallback(
    (regionId: string, regionName: string) => {
      setLoading(true);
      setHoveredSpot(null);
      fetch(`/api/worldmap/${regionId}`)
        .then((r) => r.json())
        .then((data) => {
          setMapData(data);
          setBreadcrumbs((prev) => [
            ...prev,
            { id: regionId, name: regionName },
          ]);
          setView("region");
          setLoading(false);
        })
        .catch(() => setLoading(false));
    },
    []
  );

  // Navigate to a specific map
  const navigateToMap = useCallback((mapId: number) => {
    setCurrentMapId(mapId);
    setView("map");
    setHoveredSpot(null);
  }, []);

  // Navigate back
  const navigateBack = useCallback(
    (targetIndex: number) => {
      if (targetIndex < 0) return;
      const targetEntry = breadcrumbs[targetIndex];
      setLoading(true);
      setHoveredSpot(null);
      setCurrentMapId(null);
      fetch(`/api/worldmap/${targetEntry.id}`)
        .then((r) => r.json())
        .then((data) => {
          setMapData(data);
          setBreadcrumbs(breadcrumbs.slice(0, targetIndex + 1));
          setView(targetIndex === 0 ? "world" : "region");
          setLoading(false);
        })
        .catch(() => setLoading(false));
    },
    [breadcrumbs]
  );

  // Determine what image and coordinates to use
  const baseImage = useMemo(
    () => (mapData ? getBaseImage(mapData) : null),
    [mapData]
  );
  const origin = baseImage?.origin || { x: 320, y: 235 };
  const mapWidth = baseImage?.w || 640;
  const mapHeight = baseImage?.h || 470;

  // Filter actions based on current view
  const filteredActions = useMemo(() => {
    if (view === "map" && currentMapId) {
      return recentActions.filter(
        (a) => a.toolInput?.mapId === currentMapId
      );
    }
    if (view === "region" && mapData) {
      const regionMapIds = new Set(
        mapData.maps.flatMap((s) => s.mapNumbers)
      );
      return recentActions.filter((a) =>
        regionMapIds.has(a.toolInput?.mapId)
      );
    }
    return recentActions;
  }, [view, currentMapId, mapData, recentActions]);

  // Filtered action counts for stats
  const filteredCounts = useMemo(() => {
    if (view === "region" && mapData) {
      const regionMapIds = new Set(
        mapData.maps.flatMap((s) => s.mapNumbers)
      );
      return actionCounts.filter((c) => regionMapIds.has(c.mapId));
    }
    return actionCounts;
  }, [view, mapData, actionCounts]);

  // Handle spot click - either drill into region or show map
  const handleSpotClick = useCallback(
    (spot: WorldMapSpot, spotIndex: number) => {
      // Check if there's a link for this spot (drill into sub-region)
      if (mapData?.links) {
        // Try to find a matching link by checking if spot maps overlap with link regions
        const link = mapData.links.find((l) => {
          // Some links correspond to spots - match by index or name
          return (
            l.toolTip?.toLowerCase() === (spot.description || spot.title || "")?.toLowerCase() ||
            l.linksTo?.includes(
              (spot.description || spot.title || "")?.replace(/\s/g, "") || "__nomatch"
            )
          );
        });
        if (link) {
          navigateToRegion(link.linksTo, link.toolTip);
          return;
        }
      }

      // If spot has a single map, go to map detail
      if (spot.mapNumbers.length === 1) {
        navigateToMap(spot.mapNumbers[0]);
        return;
      }

      // If spot type is a town (0), navigate to the first/main map
      if (spot.type === 0 && spot.mapNumbers.length > 0) {
        navigateToMap(spot.mapNumbers[0]);
        return;
      }

      // For spots with multiple maps, navigate to the first map
      if (spot.mapNumbers.length > 0) {
        navigateToMap(spot.mapNumbers[0]);
      }
    },
    [mapData, navigateToRegion, navigateToMap]
  );

  // For the world view, we want to show links as the main navigation
  const handleLinkClick = useCallback(
    (link: WorldMapLink) => {
      navigateToRegion(link.linksTo, link.toolTip);
    },
    [navigateToRegion]
  );

  return (
    <div className="mx-auto flex h-screen max-w-[1600px] flex-col gap-3 px-4 py-3">
      {/* Custom pulse animation */}
      <style jsx global>{`
        @keyframes pulse-ring {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.3;
          }
          100% {
            transform: translate(-50%, -50%) scale(2.5);
            opacity: 0;
          }
        }
      `}</style>

      {/* Site Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <Image src="/logo.png" alt="AugurMS" width={28} height={28} className="drop-shadow-[0_0_8px_rgba(245,197,66,0.3)]" />
            <span className="text-sm font-bold tracking-wide text-text-primary">
              AugurMS
            </span>
          </Link>
          <div className="h-4 w-px bg-border" />
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1.5">
            {breadcrumbs.map((entry, i) => (
              <div key={entry.id} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span className="text-text-muted">/</span>
                )}
                <button
                  onClick={() => {
                    if (view === "map" && i === breadcrumbs.length - 1) {
                      // Go back to region/world from map detail
                      setView(i === 0 ? "world" : "region");
                      setCurrentMapId(null);
                    } else if (i < breadcrumbs.length - 1) {
                      navigateBack(i);
                    }
                  }}
                  className={`text-sm transition-colors ${
                    i === breadcrumbs.length - 1 && view !== "map"
                      ? "font-semibold text-text-primary"
                      : "text-text-secondary hover:text-accent-gold"
                  }`}
                >
                  {entry.name}
                </button>
              </div>
            ))}
            {view === "map" && currentMapId && (
              <>
                <span className="text-text-muted">/</span>
                <span className="text-sm font-semibold text-text-primary">
                  {getMapName(currentMapId, mapNames)}
                </span>
              </>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {/* Time Filter */}
          <div className="flex items-center rounded-lg border border-border bg-bg-card/50">
            {[
              { value: "7", label: "7d" },
              { value: "30", label: "30d" },
              { value: "90", label: "90d" },
              { value: "all", label: "All" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleTimeFilterChange(opt.value)}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  timeFilter === opt.value
                    ? "bg-accent-gold/15 text-accent-gold"
                    : "text-text-muted hover:text-text-secondary"
                } ${opt.value === "7" ? "rounded-l-lg" : ""} ${opt.value === "all" ? "rounded-r-lg" : ""}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-border" />
          <Link
            href="/rankings"
            className="rounded-lg border border-border/50 px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-accent-gold/30 hover:text-accent-gold"
          >
            Rankings
          </Link>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : view === "map" && currentMapId ? (
        /* ─── Map Detail View ─── */
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex min-h-0 flex-1 flex-col">
            <MapDetailView
              mapId={currentMapId}
              actions={filteredActions}
              mapNames={mapNames}
              onBack={() => {
                setView(
                  breadcrumbs.length > 1 ? "region" : "world"
                );
                setCurrentMapId(null);
              }}
            />
          </div>
          <div className="flex w-72 flex-col gap-3">
            <StatsPanel
              counts={actionCounts.filter(
                (c) => c.mapId === currentMapId
              )}
              mapNames={mapNames}
            />
          </div>
        </div>
      ) : (
        /* ─── World / Region View ─── */
        <div className="flex min-h-0 flex-1 gap-4">
          {/* Map Canvas */}
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="relative flex-1 overflow-hidden rounded-2xl border border-border bg-bg-card">
              {/* Background atmosphere */}
              <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a18] to-[#0f0f1a]" />

              {/* Base image */}
              {baseImage ? (
                <img
                  src={baseImage.src}
                  alt="World Map"
                  className="sprite-render absolute inset-0 h-full w-full object-contain opacity-90"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-bg-secondary" />
                    <p className="text-sm text-text-muted">
                      World map image loading...
                    </p>
                  </div>
                </div>
              )}

              {/* Map spots / markers */}
              {mapData?.maps.map((spot, i) => {
                const activity = getActivityForMaps(
                  spot.mapNumbers,
                  actionCounts
                );
                const spotLabel =
                  spot.description || spot.title ||
                  (spot.mapNumbers.length > 0
                    ? getMapName(spot.mapNumbers[0], mapNames)
                    : undefined);

                return (
                  <MapMarker
                    key={i}
                    spot={spot.spot}
                    activity={activity}
                    origin={origin}
                    mapWidth={mapWidth}
                    mapHeight={mapHeight}
                    isHovered={hoveredSpot === i}
                    onHover={(h) => setHoveredSpot(h ? i : null)}
                    onClick={() => handleSpotClick(spot, i)}
                    label={spotLabel}
                  />
                );
              })}

              {/* Region links (on world view) */}
              {view === "world" &&
                mapData?.links.map((link, i) => {
                  // Find the spots that belong to this link
                  const linkedSpots = mapData.maps.filter(
                    (s) => s.type === 3
                  );
                  // Approximate: position link labels near the center of their spots
                  return null; // Links are handled through spot clicks
                })}

              {/* Floating region labels for links */}
              {view === "world" && mapData?.links && (
                <div className="absolute bottom-4 left-4 right-4 flex flex-wrap justify-center gap-2">
                  {mapData.links.map((link) => {
                    // Check if any maps in this link's region have activity
                    const hasActivity = actionCounts.some((ac) => {
                      return mapData.maps.some(
                        (spot) =>
                          spot.mapNumbers.includes(ac.mapId)
                      );
                    });

                    return (
                      <button
                        key={link.linksTo}
                        onClick={() => handleLinkClick(link)}
                        className="rounded-lg border border-border/50 bg-bg-secondary/80 px-3 py-1.5 text-xs font-medium text-text-secondary backdrop-blur-sm transition-all hover:border-accent-gold/30 hover:bg-bg-card hover:text-accent-gold"
                      >
                        {link.toolTip}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Legend */}
            <Legend />
          </div>

          {/* Right Sidebar */}
          <div className="flex w-72 flex-col gap-3">
            <StatsPanel
              counts={filteredCounts}
              globalCounts={view === "world" ? globalCounts : undefined}
              mapNames={mapNames}
            />
            <ActivityFeed
              actions={filteredActions}
              mapNames={mapNames}
              title={
                view === "region"
                  ? `${breadcrumbs[breadcrumbs.length - 1].name} Log`
                  : "Augur's Log"
              }
              onActionClick={navigateToMap}
            />
          </div>
        </div>
      )}
    </div>
  );
}
