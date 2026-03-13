import OpenAI from "openai";
import { query as dbQuery, execute } from "@/lib/db";
import type { GMSession, GMLogEntry } from "./types";

const BASE = process.env.COSMIC_DASHBOARD_URL || "http://localhost:3000";
const DEFAULT_MODEL = "moonshotai/kimi-k2.5";

async function getModel(): Promise<string> {
  try {
    const [row] = await dbQuery("SELECT model FROM gm_schedule WHERE id = 1");
    return (row as any)?.model || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  return res.json();
}

// ---- Tool category inference ----

function inferCategory(toolName: string): "rates" | "mobs" | "drops" | "spawns" | "shops" | "events" | "config" | "other" {
  if (toolName.includes("rate")) return "rates";
  if (toolName.includes("mob") || toolName.includes("batch_update_mobs")) return "mobs";
  if (toolName.includes("drop")) return "drops";
  if (toolName.includes("spawn") || toolName.includes("map")) return "spawns";
  if (toolName.includes("shop")) return "shops";
  if (toolName.includes("event")) return "events";
  if (toolName.includes("config")) return "config";
  return "other";
}

const WRITE_TOOLS = new Set([
  "update_character", "give_item_to_character",
  "update_mob", "batch_update_mobs",
  "add_mob_drop", "remove_mob_drop", "batch_update_drops",
  "add_map_spawn", "remove_map_spawn",
  "add_shop_item", "update_shop_price", "remove_shop_item",
  "update_rates", "update_config",
  "create_event", "cleanup_event",
  "set_server_message",
  "create_goal", "update_goal",
  "publish_client_update",
]);

// ---- Tool handlers (name → async function) ----

const toolHandlers: Record<string, (args: any) => Promise<string>> = {
  get_game_analytics: async ({ section }) =>
    JSON.stringify(await api(`/api/analytics?section=${section}`)),

  search_characters: async ({ query }) =>
    JSON.stringify(await api(`/api/characters${query ? `?q=${encodeURIComponent(query)}` : ""}`)),

  get_character: async ({ characterId }) =>
    JSON.stringify(await api(`/api/characters/${characterId}`)),

  update_character: async ({ characterId, changes }) =>
    JSON.stringify(await api(`/api/characters/${characterId}`, { method: "PUT", body: JSON.stringify(changes) })),

  give_item_to_character: async ({ characterId, itemId, quantity }) =>
    JSON.stringify(await api(`/api/characters/${characterId}/inventory`, { method: "POST", body: JSON.stringify({ itemId, quantity: quantity || 1 }) })),

  search_mobs: async ({ query }) => {
    const data = await api(`/api/mobs${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    return JSON.stringify(Array.isArray(data) ? data.slice(0, 50) : data);
  },

  get_mob: async ({ mobId }) =>
    JSON.stringify(await api(`/api/mobs/${mobId}`)),

  update_mob: async ({ mobId, changes }) =>
    JSON.stringify(await api(`/api/mobs/${mobId}`, { method: "PUT", body: JSON.stringify(changes) })),

  batch_update_mobs: async ({ mobs }) =>
    JSON.stringify(await api("/api/gm/mob-batch", { method: "PUT", body: JSON.stringify({ mobs }) })),

  search_items: async ({ query, category }) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (category && category !== "all") params.set("category", category);
    const data = await api(`/api/items?${params}`);
    return JSON.stringify(Array.isArray(data) ? data.slice(0, 50) : data);
  },

  get_item: async ({ itemId }) =>
    JSON.stringify(await api(`/api/items/${itemId}`)),

  get_mob_drops: async ({ mobId }) =>
    JSON.stringify(await api(`/api/drops/${mobId}`)),

  add_mob_drop: async ({ mobId, ...rest }) =>
    JSON.stringify(await api(`/api/drops/${mobId}`, { method: "POST", body: JSON.stringify(rest) })),

  remove_mob_drop: async ({ mobId, itemId }) =>
    JSON.stringify(await api(`/api/drops/${mobId}`, { method: "DELETE", body: JSON.stringify({ itemId }) })),

  batch_update_drops: async ({ changes }) =>
    JSON.stringify(await api("/api/gm/drops-batch", { method: "PUT", body: JSON.stringify({ changes }) })),

  search_maps: async ({ query }) =>
    JSON.stringify(await api(`/api/maps?q=${encodeURIComponent(query)}`)),

  get_map: async ({ mapId }) => {
    const data = await api(`/api/maps/${mapId}`);
    if (data.footholds) delete data.footholds;
    return JSON.stringify(data);
  },

  add_map_spawn: async ({ mapId, type, lifeId, x, y }) =>
    JSON.stringify(await api(`/api/maps/${mapId}/spawns`, { method: "POST", body: JSON.stringify({ type, id: lifeId, x, y }) })),

  remove_map_spawn: async ({ mapId, type, lifeId }) =>
    JSON.stringify(await api(`/api/maps/${mapId}/spawns`, { method: "DELETE", body: JSON.stringify({ type, id: lifeId }) })),

  get_shop_items: async ({ shopId }) =>
    JSON.stringify(await api(`/api/gm/shops/${shopId}/items`)),

  add_shop_item: async ({ shopId, itemId, price }) =>
    JSON.stringify(await api(`/api/gm/shops/${shopId}/items`, { method: "POST", body: JSON.stringify({ itemId, price }) })),

  update_shop_price: async ({ shopId, itemId, price }) =>
    JSON.stringify(await api(`/api/gm/shops/${shopId}/items`, { method: "PUT", body: JSON.stringify({ itemId, price }) })),

  remove_shop_item: async ({ shopId, itemId }) =>
    JSON.stringify(await api(`/api/gm/shops/${shopId}/items`, { method: "DELETE", body: JSON.stringify({ itemId }) })),

  get_rates: async () =>
    JSON.stringify(await api("/api/gm/rates")),

  update_rates: async ({ rates }) =>
    JSON.stringify(await api("/api/gm/rates", { method: "PUT", body: JSON.stringify(rates) })),

  get_config: async () =>
    JSON.stringify(await api("/api/config")),

  update_config: async ({ path, value }) =>
    JSON.stringify(await api("/api/config", { method: "PUT", body: JSON.stringify({ path, value }) })),

  create_event: async (input) =>
    JSON.stringify(await api("/api/gm/event", { method: "POST", body: JSON.stringify(input) })),

  get_active_events: async () =>
    JSON.stringify(await api("/api/gm/event")),

  cleanup_event: async (input) =>
    JSON.stringify(await api("/api/gm/event", { method: "DELETE", body: JSON.stringify(input) })),

  get_server_status: async () =>
    JSON.stringify(await api("/api/server")),

  get_server_logs: async ({ lines }) =>
    JSON.stringify(await api(`/api/server/logs?lines=${lines || 100}&service=maplestory`)),

  set_server_message: async ({ message }) =>
    JSON.stringify(await api("/api/gm/announce", { method: "POST", body: JSON.stringify({ message }) })),

  get_my_history: async ({ limit, type }) =>
    JSON.stringify(await api(`/api/gm/history?type=${type || "all"}&limit=${limit || 10}`)),

  get_snapshots: async ({ limit }) => {
    const snapshots = await dbQuery(`SELECT * FROM gm_snapshots ORDER BY taken_at DESC LIMIT ${limit || 10}`);
    const withDeltas = snapshots.map((s: any, i: number) => {
      const prev = snapshots[i + 1] as any;
      const snap: any = {
        id: s.id, takenAt: s.taken_at,
        totalMeso: s.total_meso, avgMesoPerPlayer: s.avg_meso_per_player, storageMeso: s.storage_meso,
        totalItems: s.total_items, totalCharacters: s.total_characters,
        avgLevel: s.avg_level, maxLevel: s.max_level,
        expRate: s.exp_rate, mesoRate: s.meso_rate, dropRate: s.drop_rate,
      };
      if (prev) {
        snap.deltas = {
          mesoChange: s.total_meso - prev.total_meso,
          mesoChangePercent: prev.total_meso ? Math.round(((s.total_meso - prev.total_meso) / prev.total_meso) * 1000) / 10 : 0,
          avgLevelChange: Math.round((s.avg_level - prev.avg_level) * 10) / 10,
          itemChange: s.total_items - prev.total_items,
          characterChange: s.total_characters - prev.total_characters,
        };
      }
      return snap;
    });
    return JSON.stringify(withDeltas);
  },

  get_goals: async ({ status }) =>
    JSON.stringify(await api(`/api/gm/goals${status && status !== "all" ? `?status=${status}` : ""}`)),

  create_goal: async (input) =>
    JSON.stringify(await api("/api/gm/goals", { method: "POST", body: JSON.stringify(input) })),

  update_goal: async (input) =>
    JSON.stringify(await api("/api/gm/goals", { method: "PUT", body: JSON.stringify(input) })),

  get_trends: async ({ hours }) =>
    JSON.stringify(await api(`/api/gm/trends?hours=${hours || 48}`)),

  take_snapshot: async () =>
    JSON.stringify(await api("/api/gm/snapshot", { method: "POST" })),

  publish_client_update: async ({ version, message, files }) => {
    // Read current manifest, bump version, optionally update file entries
    const current = await api("/api/launcher/manifest");
    const manifest = { ...current };
    manifest.version = version || manifest.version;
    manifest.updatedAt = new Date().toISOString();

    // If specific files changed, update their hashes/sizes
    if (files && Array.isArray(files)) {
      for (const update of files) {
        const entry = manifest.files?.find((f: any) => f.name === update.name);
        if (entry) {
          if (update.hash) entry.hash = update.hash;
          if (update.size) entry.size = update.size;
        }
      }
    }

    // Upload changed files to R2 if available
    if (files && Array.isArray(files)) {
      const uploadResult = await api("/api/launcher/upload", {
        method: "POST",
        body: JSON.stringify({ files: files.filter((f: any) => f.path) }),
      });
      if (uploadResult.error) return JSON.stringify({ error: uploadResult.error });
    }

    // Save manifest to volume for immediate serving
    const result = await api("/api/launcher/manifest", {
      method: "POST",
      body: JSON.stringify({ manifest }),
    });
    return JSON.stringify({ ...result, message: message || "Client update published" });
  },
};

// ---- OpenAI-format tool schemas ----

const toolSchemas: OpenAI.ChatCompletionTool[] = [
  { type: "function", function: { name: "get_game_analytics", description: "Get game analytics: economy, progression, activity, health. Always call with section='all' first.", parameters: { type: "object", properties: { section: { type: "string", enum: ["all", "economy", "progression", "activity", "health"] } }, required: ["section"] } } },
  { type: "function", function: { name: "search_characters", description: "Search characters by name.", parameters: { type: "object", properties: { query: { type: "string" } } } } },
  { type: "function", function: { name: "get_character", description: "Get full character details by ID.", parameters: { type: "object", properties: { characterId: { type: "number" } }, required: ["characterId"] } } },
  { type: "function", function: { name: "update_character", description: "Update character stats. Takes effect on relog.", parameters: { type: "object", properties: { characterId: { type: "number" }, changes: { type: "object" } }, required: ["characterId", "changes"] } } },
  { type: "function", function: { name: "give_item_to_character", description: "Give an item to a character.", parameters: { type: "object", properties: { characterId: { type: "number" }, itemId: { type: "number" }, quantity: { type: "number" } }, required: ["characterId", "itemId"] } } },
  { type: "function", function: { name: "search_mobs", description: "Search monsters by name or ID.", parameters: { type: "object", properties: { query: { type: "string" } } } } },
  { type: "function", function: { name: "get_mob", description: "Get mob stats.", parameters: { type: "object", properties: { mobId: { type: "number" } }, required: ["mobId"] } } },
  { type: "function", function: { name: "update_mob", description: "Update mob stats.", parameters: { type: "object", properties: { mobId: { type: "number" }, changes: { type: "object" } }, required: ["mobId", "changes"] } } },
  { type: "function", function: { name: "batch_update_mobs", description: "Update multiple mobs at once (max 50).", parameters: { type: "object", properties: { mobs: { type: "array", items: { type: "object", properties: { id: { type: "number" }, changes: { type: "object" } }, required: ["id", "changes"] } } }, required: ["mobs"] } } },
  { type: "function", function: { name: "search_items", description: "Search items by name. Filter by category.", parameters: { type: "object", properties: { query: { type: "string" }, category: { type: "string", enum: ["all", "equip", "consume", "etc", "cash"] } } } } },
  { type: "function", function: { name: "get_item", description: "Get item details.", parameters: { type: "object", properties: { itemId: { type: "number" } }, required: ["itemId"] } } },
  { type: "function", function: { name: "get_mob_drops", description: "Get drop table for a mob.", parameters: { type: "object", properties: { mobId: { type: "number" } }, required: ["mobId"] } } },
  { type: "function", function: { name: "add_mob_drop", description: "Add an item to a mob's drop table.", parameters: { type: "object", properties: { mobId: { type: "number" }, itemId: { type: "number" }, chance: { type: "number" }, minQuantity: { type: "number" }, maxQuantity: { type: "number" } }, required: ["mobId", "itemId", "chance"] } } },
  { type: "function", function: { name: "remove_mob_drop", description: "Remove an item from a mob's drop table.", parameters: { type: "object", properties: { mobId: { type: "number" }, itemId: { type: "number" } }, required: ["mobId", "itemId"] } } },
  { type: "function", function: { name: "batch_update_drops", description: "Bulk update drop tables.", parameters: { type: "object", properties: { changes: { type: "array", items: { type: "object" } } }, required: ["changes"] } } },
  { type: "function", function: { name: "search_maps", description: "Search maps by name or ID.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "get_map", description: "Get map data: spawns, portals.", parameters: { type: "object", properties: { mapId: { type: "number" } }, required: ["mapId"] } } },
  { type: "function", function: { name: "add_map_spawn", description: "Add a mob or NPC spawn to a map.", parameters: { type: "object", properties: { mapId: { type: "number" }, type: { type: "string", enum: ["m", "n"] }, lifeId: { type: "number" }, x: { type: "number" }, y: { type: "number" } }, required: ["mapId", "type", "lifeId", "x", "y"] } } },
  { type: "function", function: { name: "remove_map_spawn", description: "Remove a spawn from a map.", parameters: { type: "object", properties: { mapId: { type: "number" }, type: { type: "string", enum: ["m", "n"] }, lifeId: { type: "number" } }, required: ["mapId", "type", "lifeId"] } } },
  { type: "function", function: { name: "get_shop_items", description: "Get items sold by a shop.", parameters: { type: "object", properties: { shopId: { type: "number" } }, required: ["shopId"] } } },
  { type: "function", function: { name: "add_shop_item", description: "Add an item to a shop.", parameters: { type: "object", properties: { shopId: { type: "number" }, itemId: { type: "number" }, price: { type: "number" } }, required: ["shopId", "itemId", "price"] } } },
  { type: "function", function: { name: "update_shop_price", description: "Change the price of a shop item.", parameters: { type: "object", properties: { shopId: { type: "number" }, itemId: { type: "number" }, price: { type: "number" } }, required: ["shopId", "itemId", "price"] } } },
  { type: "function", function: { name: "remove_shop_item", description: "Remove an item from a shop.", parameters: { type: "object", properties: { shopId: { type: "number" }, itemId: { type: "number" } }, required: ["shopId", "itemId"] } } },
  { type: "function", function: { name: "get_rates", description: "Get current server rates.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "update_rates", description: "Update server rates (1-50). Keys: exp_rate, meso_rate, drop_rate, boss_drop_rate, quest_rate.", parameters: { type: "object", properties: { rates: { type: "object" } }, required: ["rates"] } } },
  { type: "function", function: { name: "get_config", description: "Get the full server config.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "update_config", description: "Update a config value by dot-path.", parameters: { type: "object", properties: { path: { type: "string" }, value: {} }, required: ["path", "value"] } } },
  { type: "function", function: { name: "create_event", description: "Create a dynamic event: spawn mobs, add bonus drops, set announcement.", parameters: { type: "object", properties: { name: { type: "string" }, mapId: { type: "number" }, mobs: { type: "array", items: { type: "object" } }, bonusDrops: { type: "array", items: { type: "object" } }, announcement: { type: "string" } }, required: ["name"] } } },
  { type: "function", function: { name: "get_active_events", description: "List active custom events.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "cleanup_event", description: "Remove custom event spawns/drops.", parameters: { type: "object", properties: { mapId: { type: "number" }, mobId: { type: "number" }, clearGlobalDrops: { type: "boolean" } } } } },
  { type: "function", function: { name: "get_server_status", description: "Check if the game server is running.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_server_logs", description: "Read recent server logs.", parameters: { type: "object", properties: { lines: { type: "number" } } } } },
  { type: "function", function: { name: "set_server_message", description: "Set the server announcement message.", parameters: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } } },
  { type: "function", function: { name: "get_my_history", description: "View your past sessions and actions.", parameters: { type: "object", properties: { limit: { type: "number" }, type: { type: "string", enum: ["sessions", "actions", "all"] } } } } },
  { type: "function", function: { name: "get_snapshots", description: "Get recent game state snapshots with trends.", parameters: { type: "object", properties: { limit: { type: "number" } } } } },
  { type: "function", function: { name: "get_goals", description: "View your goals and their progress.", parameters: { type: "object", properties: { status: { type: "string", enum: ["active", "achieved", "abandoned", "all"] } } } } },
  { type: "function", function: { name: "create_goal", description: "Create a new persistent goal.", parameters: { type: "object", properties: { goal: { type: "string" }, targetMetric: { type: "string" }, targetValue: { type: "number" }, currentValue: { type: "number" } }, required: ["goal", "targetMetric", "targetValue"] } } },
  { type: "function", function: { name: "update_goal", description: "Update a goal's status or current value.", parameters: { type: "object", properties: { id: { type: "number" }, status: { type: "string", enum: ["active", "achieved", "abandoned"] }, currentValue: { type: "number" }, targetValue: { type: "number" } }, required: ["id"] } } },
  { type: "function", function: { name: "get_trends", description: "Get computed trend analysis over a time period.", parameters: { type: "object", properties: { hours: { type: "number" } } } } },
  { type: "function", function: { name: "take_snapshot", description: "Take a snapshot of the current game state.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "publish_client_update", description: "Publish a client update. Bumps manifest version so launchers detect changes. Most GM changes (drops, shops, spawns, rates) are DB-only and do NOT need this. Only use for WZ-level changes (new items/mobs) or client patches.", parameters: { type: "object", properties: { version: { type: "string", description: "New version string (e.g. 1.1.0)" }, message: { type: "string", description: "What changed for players" }, files: { type: "array", description: "Files that changed. Include name and new hash/size.", items: { type: "object", properties: { name: { type: "string" }, hash: { type: "string" }, size: { type: "number" } } } } }, required: ["version", "message"] } } },
];

// ---- Build historical context for system prompt ----

async function buildHistoricalContext(): Promise<string> {
  let context = "";

  try {
    const snapshots = await dbQuery("SELECT * FROM gm_snapshots ORDER BY taken_at DESC LIMIT 5");
    if (snapshots.length > 0) {
      context += "\n\n## Recent Snapshots (newest first)\n";
      for (let i = 0; i < snapshots.length; i++) {
        const s = snapshots[i] as any;
        const prev = snapshots[i + 1] as any;
        context += `\n### Snapshot ${i + 1} — ${s.taken_at}\n`;
        context += `- Meso: ${Number(s.total_meso).toLocaleString()}`;
        if (prev) {
          const delta = Number(s.total_meso) - Number(prev.total_meso);
          const pct = prev.total_meso ? Math.round((delta / Number(prev.total_meso)) * 1000) / 10 : 0;
          context += ` (${delta >= 0 ? "+" : ""}${delta.toLocaleString()}, ${pct >= 0 ? "+" : ""}${pct}%)`;
        }
        context += `\n- Avg Level: ${s.avg_level} | Max Level: ${s.max_level}`;
        if (prev) {
          const lvlDelta = Math.round((s.avg_level - prev.avg_level) * 10) / 10;
          context += ` (${lvlDelta >= 0 ? "+" : ""}${lvlDelta})`;
        }
        context += `\n- Characters: ${s.total_characters} | Items: ${s.total_items}`;
        context += `\n- Rates: EXP ${s.exp_rate}x | Meso ${s.meso_rate}x | Drop ${s.drop_rate}x`;
      }
    }
  } catch { /* no snapshots yet */ }

  try {
    const actions = await dbQuery(
      "SELECT a.tool_name, a.reasoning, a.category, a.executed_at, s.prompt FROM gm_actions a LEFT JOIN gm_sessions s ON a.session_id = s.id ORDER BY a.executed_at DESC LIMIT 10"
    );
    if (actions.length > 0) {
      context += "\n\n## Your Recent Actions\n";
      for (const a of actions as any[]) {
        context += `- [${a.executed_at}] **${a.tool_name}** (${a.category}): ${a.reasoning || "no reasoning recorded"}\n`;
      }
    }
  } catch { /* no actions yet */ }

  try {
    const goals = await dbQuery("SELECT * FROM gm_goals WHERE status = 'active' ORDER BY created_at DESC");
    if (goals.length > 0) {
      context += "\n\n## Active Goals\n";
      for (const g of goals as any[]) {
        context += `- [#${g.id}] ${g.goal} — target: ${g.target_value} on \`${g.target_metric}\``;
        if (g.current_value !== null) context += ` (current: ${g.current_value})`;
        context += `\n`;
      }
    }
    const achieved = await dbQuery("SELECT * FROM gm_goals WHERE status = 'achieved' ORDER BY last_checked DESC LIMIT 5");
    if (achieved.length > 0) {
      context += "\n## Recently Achieved Goals\n";
      for (const g of achieved as any[]) {
        context += `- [#${g.id}] ${g.goal}\n`;
      }
    }
  } catch { /* no goals yet */ }

  try {
    const sessions = await dbQuery(
      "SELECT id, started_at, trigger_type, summary, status, changes_made FROM gm_sessions ORDER BY started_at DESC LIMIT 5"
    );
    if (sessions.length > 0) {
      context += "\n\n## Recent Sessions\n";
      for (const s of sessions as any[]) {
        context += `- [${s.started_at}] ${s.trigger_type} | ${s.status} | ${s.changes_made} changes`;
        if (s.summary) context += ` — ${s.summary.slice(0, 120)}`;
        context += `\n`;
      }
    }
  } catch { /* no sessions yet */ }

  return context;
}

// ---- System prompt ----

const BASE_SYSTEM_PROMPT = `You are the Augur — the AI Game Master of a MapleStory v83 private server called AugurMS.

## Your Role — Game Director, Not a Knob Turner
Your primary job is to create a **smooth, enjoyable game experience**. You are NOT an optimizer that tweaks numbers every cycle. Think of yourself as a game director who:

1. **Creates content** — Design events, place limited-time mobs, add seasonal drops, set up treasure hunts, spawn rare NPCs. Make the world feel alive and surprising.
2. **Monitors health** — Watch for problems (inflation, broken drops, dead zones), but only intervene when something is clearly wrong.
3. **Curates the world** — Adjust spawns to make maps more interesting, ensure progression paths feel natural, keep the world populated with diverse content.

## What You Should Do Often
- Create fun events (holiday events, boss rush, treasure hunts, invasion events)
- Place interesting mobs in underused maps to make exploration rewarding
- Add temporary bonus drops or special spawns for variety
- Set server announcements for events and community engagement
- Set goals to track long-term health without rushing to fix everything

## What You Should Do Rarely (only when clearly needed)
- Change EXP/meso/drop rates — these affect the core feel of the game
- Modify mob stats — players adapt to difficulty, don't keep moving the goalpost
- Alter shop prices — these are part of the economy's foundation

## Philosophy
- **Stability over optimization.** Players hate when the game feels different every day.
- **Content over numbers.** Creating a cool event is worth more than a 5% rate adjustment.
- **Observe before acting.** Trends over days/weeks matter more than a single snapshot.
- **Don't fix what isn't broken.** If the economy is roughly stable, leave the rates alone.

## Decision Framework
1. OBSERVE: Read analytics and trends
2. COMPARE: Check against your previous sessions
3. CONTENT FIRST: Can you improve the experience by adding content instead of changing numbers?
4. INTERVENE ONLY IF NEEDED: Only touch rates/stats if there's a clear, sustained problem
5. RECORD: Update goals to track long-term objectives

## Memory & Continuity
You have persistent memory via snapshots, action logs, and goals.
- Use \`take_snapshot\` at the start of each session
- Use \`get_snapshots\` to see metric trends over time
- Use \`get_my_history\` to recall previous sessions
- Use goals to maintain persistent objectives
- It's perfectly fine to observe and do nothing if the game is healthy

## Balance Targets (soft guidelines)
- Average time to level 30: ~2 hours
- Average time to level 70: ~8 hours
- Meso inflation rate: <5% per day
- No item should have >80% saturation
- Boss content accessible to 50%+ of eligible players

## Guardrails
- Never set rates below 1x or above 50x
- Never delete a player's items or reduce their level without being asked
- Never change more than 1 major lever per session
- Always explain your reasoning before making changes
- Rate changes should be rare — at most once per week
- Prefer creating events over adjusting numbers

## Communication
- Be direct and concise
- Use game terminology naturally
- Highlight what's notable when reporting analytics`;

// ---- Persistence helpers ----

async function persistSessionStart(session: GMSession, prompt: string): Promise<void> {
  try {
    await execute(
      "INSERT INTO gm_sessions (id, started_at, trigger_type, prompt, status) VALUES (?, NOW(), ?, ?, 'running')",
      [session.id, session.trigger, prompt]
    );
  } catch (err) {
    console.error("Failed to persist session start:", err);
  }
}

async function persistSessionEnd(session: GMSession): Promise<void> {
  try {
    const changesMade = session.log.filter(
      (e): e is Extract<GMLogEntry, { type: "tool_call" }> =>
        e.type === "tool_call" && WRITE_TOOLS.has(e.tool.name)
    ).length;
    await execute(
      "UPDATE gm_sessions SET completed_at = NOW(), summary = ?, status = ?, changes_made = ?, full_log = ? WHERE id = ?",
      [session.summary || null, session.status, changesMade, JSON.stringify(session.log), session.id]
    );
  } catch (err) {
    console.error("Failed to persist session end:", err);
  }
}

async function persistAction(
  sessionId: string, toolName: string, toolInput: Record<string, any>, toolResult: any, reasoning?: string
): Promise<void> {
  try {
    await execute(
      "INSERT INTO gm_actions (session_id, tool_name, tool_input, tool_result, reasoning, category) VALUES (?, ?, ?, ?, ?, ?)",
      [sessionId, toolName, JSON.stringify(toolInput), JSON.stringify(toolResult), reasoning || null, inferCategory(toolName)]
    );
  } catch (err) {
    console.error("Failed to persist action:", err);
  }
}

// ---- Agent loop ----

export async function runGameMaster(
  userPrompt: string,
  onUpdate: (entry: GMLogEntry) => void,
  trigger: "manual" | "scheduled" | "alert" = "manual"
): Promise<GMSession> {
  const session: GMSession = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    status: "running",
    trigger,
    prompt: userPrompt,
    log: [],
  };

  const addLog = (entry: GMLogEntry) => {
    session.log.push(entry);
    onUpdate(entry);
  };

  await persistSessionStart(session, userPrompt);

  const historicalContext = await buildHistoricalContext();
  const systemPrompt = historicalContext
    ? BASE_SYSTEM_PROMPT + "\n\n---\n\n# Historical Context (from your memory)" + historicalContext
    : BASE_SYSTEM_PROMPT;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  let lastTextBeforeToolCall = "";
  const MAX_TURNS = 25;

  const model = await getModel();

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await openrouter.chat.completions.create({
        model,
        messages,
        tools: toolSchemas,
        temperature: 0.7,
        max_tokens: 4096,
      });

      const choice = response.choices[0];
      if (!choice) break;

      const msg = choice.message;

      // Emit text content
      if (msg.content) {
        lastTextBeforeToolCall = msg.content;
        addLog({ type: "text", text: msg.content });
      }

      // No tool calls → done
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        // Add assistant message to history
        messages.push({ role: "assistant", content: msg.content || "" });
        session.summary = msg.content || undefined;
        break;
      }

      // Add assistant message with tool calls to history
      messages.push({
        role: "assistant",
        content: msg.content || null,
        tool_calls: msg.tool_calls,
      });

      // Execute each tool call
      for (const tc of msg.tool_calls) {
        const fn = (tc as any).function as { name: string; arguments: string };
        const toolName = fn.name;
        let args: any;
        try {
          args = JSON.parse(fn.arguments || "{}");
        } catch {
          args = {};
        }

        addLog({
          type: "tool_call",
          tool: { id: tc.id, name: toolName, input: args },
        });

        let resultStr: string;
        try {
          const handler = toolHandlers[toolName];
          if (!handler) throw new Error(`Unknown tool: ${toolName}`);
          resultStr = await handler(args);
        } catch (err: any) {
          resultStr = JSON.stringify({ error: err.message });
        }

        // Parse result for logging
        let parsed: any;
        try { parsed = JSON.parse(resultStr); } catch { parsed = resultStr; }

        // Update the tool_call log entry with the result
        const logEntry = session.log.findLast(
          (e): e is Extract<GMLogEntry, { type: "tool_call" }> =>
            e.type === "tool_call" && e.tool.id === tc.id
        );
        if (logEntry) {
          logEntry.result = { toolCallId: tc.id, name: toolName, result: parsed };
          onUpdate(logEntry);
        }

        // Persist write actions
        if (WRITE_TOOLS.has(toolName)) {
          await persistAction(session.id, toolName, args, parsed, lastTextBeforeToolCall || undefined);
        }

        // Add tool result to message history
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: resultStr,
        });
      }

      // If the model said stop, we're done
      if (choice.finish_reason === "stop") break;
    }

    session.status = "complete";
  } catch (err: any) {
    session.status = "error";
    session.error = err.message;
    addLog({ type: "text", text: `Error: ${err.message}` });
  }

  session.completedAt = new Date().toISOString();
  await persistSessionEnd(session);
  return session;
}
