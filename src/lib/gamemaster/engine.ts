import { query as queryAI, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import { query as dbQuery, execute } from "@/lib/db";
import type { GMSession, GMLogEntry, GMSnapshot, GMGoal } from "./types";

const BASE = process.env.COSMIC_DASHBOARD_URL || "http://localhost:3000";

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

// Tool names that represent write operations (we log these as actions)
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
]);

// ---- Tool definitions ----

const getGameAnalytics = tool(
  "get_game_analytics",
  "Get game analytics: economy (meso, items), progression (levels, jobs), activity (maps, bosses), health (rates, warnings). Always call with section='all' first.",
  { section: z.enum(["all", "economy", "progression", "activity", "health"]) },
  async ({ section }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/analytics?section=${section}`)) }],
  })
);

const searchCharacters = tool(
  "search_characters",
  "Search characters by name. Returns id, name, level, job, stats, meso, fame, map.",
  { query: z.string().optional() },
  async ({ query: q }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/characters${q ? `?q=${encodeURIComponent(q)}` : ""}`)) }],
  })
);

const getCharacter = tool(
  "get_character",
  "Get full character details by ID.",
  { characterId: z.number() },
  async ({ characterId }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/characters/${characterId}`)) }],
  })
);

const updateCharacter = tool(
  "update_character",
  "Update character stats (level, str, dex, luk, maxhp, maxmp, meso, fame, ap, sp, job, map, exp, hp, mp). Takes effect on relog.",
  { characterId: z.number(), changes: z.record(z.string(), z.number()) },
  async ({ characterId, changes }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/characters/${characterId}`, { method: "PUT", body: JSON.stringify(changes) })) }],
  })
);

const giveItem = tool(
  "give_item_to_character",
  "Give an item to a character's inventory. Takes effect on relog.",
  { characterId: z.number(), itemId: z.number(), quantity: z.number().default(1) },
  async ({ characterId, itemId, quantity }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/characters/${characterId}/inventory`, { method: "POST", body: JSON.stringify({ itemId, quantity }) })) }],
  })
);

const searchMobs = tool(
  "search_mobs",
  "Search monsters by name or ID.",
  { query: z.string().optional() },
  async ({ query: q }) => {
    const data = await api(`/api/mobs${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(Array.isArray(data) ? data.slice(0, 50) : data) }] };
  }
);

const getMob = tool(
  "get_mob",
  "Get mob stats: level, HP, MP, EXP, damage, defense, speed, boss/undead flags.",
  { mobId: z.number() },
  async ({ mobId }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/mobs/${mobId}`)) }],
  })
);

const updateMob = tool(
  "update_mob",
  "Update mob stats: level, maxHP, maxMP, exp, PADamage, MADamage, PDDamage, MDDamage, acc, eva, speed, boss, undead.",
  { mobId: z.number(), changes: z.record(z.string(), z.number()) },
  async ({ mobId, changes }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/mobs/${mobId}`, { method: "PUT", body: JSON.stringify(changes) })) }],
  })
);

const batchUpdateMobs = tool(
  "batch_update_mobs",
  "Update multiple mobs at once (max 50). For zone-wide rebalancing.",
  { mobs: z.array(z.object({ id: z.number(), changes: z.record(z.string(), z.number()) })) },
  async ({ mobs }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api("/api/gm/mob-batch", { method: "PUT", body: JSON.stringify({ mobs }) })) }],
  })
);

const searchItems = tool(
  "search_items",
  "Search items by name or ID. Filter by category: equip, consume, etc, cash.",
  { query: z.string().optional(), category: z.enum(["all", "equip", "consume", "etc", "cash"]).default("all") },
  async ({ query: q, category }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category !== "all") params.set("category", category);
    const data = await api(`/api/items?${params}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(Array.isArray(data) ? data.slice(0, 50) : data) }] };
  }
);

const getItem = tool(
  "get_item",
  "Get item details: name, description, category, stats.",
  { itemId: z.number() },
  async ({ itemId }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/items/${itemId}`)) }],
  })
);

const getMobDrops = tool(
  "get_mob_drops",
  "Get drop table for a mob. Shows items, chances (out of 1,000,000), quantities.",
  { mobId: z.number() },
  async ({ mobId }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/drops/${mobId}`)) }],
  })
);

const addMobDrop = tool(
  "add_mob_drop",
  "Add an item to a mob's drop table.",
  { mobId: z.number(), itemId: z.number(), chance: z.number(), minQuantity: z.number().default(1), maxQuantity: z.number().default(1) },
  async ({ mobId, ...rest }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/drops/${mobId}`, { method: "POST", body: JSON.stringify(rest) })) }],
  })
);

const removeMobDrop = tool(
  "remove_mob_drop",
  "Remove an item from a mob's drop table.",
  { mobId: z.number(), itemId: z.number() },
  async ({ mobId, itemId }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/drops/${mobId}`, { method: "DELETE", body: JSON.stringify({ itemId }) })) }],
  })
);

const batchUpdateDrops = tool(
  "batch_update_drops",
  "Bulk update drop tables for multiple mobs.",
  { changes: z.array(z.object({ mobId: z.number(), add: z.array(z.any()).optional(), remove: z.array(z.any()).optional(), update: z.array(z.any()).optional() })) },
  async ({ changes }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api("/api/gm/drops-batch", { method: "PUT", body: JSON.stringify({ changes }) })) }],
  })
);

const searchMaps = tool(
  "search_maps",
  "Search maps by name or ID.",
  { query: z.string() },
  async ({ query: q }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/maps?q=${encodeURIComponent(q)}`)) }],
  })
);

const getMap = tool(
  "get_map",
  "Get map data: spawns, portals, info.",
  { mapId: z.number() },
  async ({ mapId }) => {
    const data = await api(`/api/maps/${mapId}`);
    if (data.footholds) delete data.footholds;
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
  }
);

const addMapSpawn = tool(
  "add_map_spawn",
  "Add a mob or NPC spawn to a map.",
  { mapId: z.number(), type: z.enum(["m", "n"]), lifeId: z.number(), x: z.number(), y: z.number() },
  async ({ mapId, type, lifeId, x, y }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/maps/${mapId}/spawns`, { method: "POST", body: JSON.stringify({ type, id: lifeId, x, y }) })) }],
  })
);

const removeMapSpawn = tool(
  "remove_map_spawn",
  "Remove a mob or NPC spawn from a map.",
  { mapId: z.number(), type: z.enum(["m", "n"]), lifeId: z.number() },
  async ({ mapId, type, lifeId }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/maps/${mapId}/spawns`, { method: "DELETE", body: JSON.stringify({ type, id: lifeId }) })) }],
  })
);

const getShopItems = tool(
  "get_shop_items",
  "Get items sold by a shop.",
  { shopId: z.number() },
  async ({ shopId }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/gm/shops/${shopId}/items`)) }],
  })
);

const addShopItem = tool(
  "add_shop_item",
  "Add an item to a shop.",
  { shopId: z.number(), itemId: z.number(), price: z.number() },
  async ({ shopId, itemId, price }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/gm/shops/${shopId}/items`, { method: "POST", body: JSON.stringify({ itemId, price }) })) }],
  })
);

const updateShopPrice = tool(
  "update_shop_price",
  "Change the price of an item in a shop.",
  { shopId: z.number(), itemId: z.number(), price: z.number() },
  async ({ shopId, itemId, price }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/gm/shops/${shopId}/items`, { method: "PUT", body: JSON.stringify({ itemId, price }) })) }],
  })
);

const removeShopItem = tool(
  "remove_shop_item",
  "Remove an item from a shop.",
  { shopId: z.number(), itemId: z.number() },
  async ({ shopId, itemId }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/gm/shops/${shopId}/items`, { method: "DELETE", body: JSON.stringify({ itemId }) })) }],
  })
);

const getRates = tool(
  "get_rates",
  "Get current server rates.",
  {},
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api("/api/gm/rates")) }],
  })
);

const updateRates = tool(
  "update_rates",
  "Update server rates (1-50). Requires restart. Keys: exp_rate, meso_rate, drop_rate, boss_drop_rate, quest_rate, fishing_rate, travel_rate.",
  { rates: z.record(z.string(), z.number()) },
  async ({ rates }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api("/api/gm/rates", { method: "PUT", body: JSON.stringify(rates) })) }],
  })
);

const getConfig = tool(
  "get_config",
  "Get the full server config (450+ settings).",
  {},
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api("/api/config")) }],
  })
);

const updateConfig = tool(
  "update_config",
  "Update a config value by dot-path.",
  { path: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) },
  async ({ path, value }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api("/api/config", { method: "PUT", body: JSON.stringify({ path, value }) })) }],
  })
);

const createEvent = tool(
  "create_event",
  "Create a dynamic event: spawn mobs, add bonus drops, set announcement.",
  {
    name: z.string(),
    mapId: z.number().optional(),
    mobs: z.array(z.object({ id: z.number(), count: z.number().default(1), x: z.number().default(0), y: z.number().default(0) })).optional(),
    bonusDrops: z.array(z.object({ mobId: z.number().optional(), itemId: z.number(), chance: z.number().default(100000) })).optional(),
    announcement: z.string().optional(),
  },
  async (input) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api("/api/gm/event", { method: "POST", body: JSON.stringify(input) })) }],
  })
);

const getActiveEvents = tool(
  "get_active_events",
  "List custom spawns and global event drops.",
  {},
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api("/api/gm/event")) }],
  })
);

const cleanupEvent = tool(
  "cleanup_event",
  "Remove custom event spawns and/or global event drops.",
  { mapId: z.number().optional(), mobId: z.number().optional(), clearGlobalDrops: z.boolean().default(false) },
  async (input) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api("/api/gm/event", { method: "DELETE", body: JSON.stringify(input) })) }],
  })
);

const getServerStatus = tool(
  "get_server_status",
  "Check if the game server is running.",
  {},
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api("/api/server")) }],
  })
);

const getServerLogs = tool(
  "get_server_logs",
  "Read recent server logs.",
  { lines: z.number().default(100) },
  async ({ lines }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api(`/api/server/logs?lines=${lines}&service=maplestory`)) }],
  })
);

const setServerMessage = tool(
  "set_server_message",
  "Set the server announcement message.",
  { message: z.string() },
  async ({ message }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await api("/api/gm/announce", { method: "POST", body: JSON.stringify({ message }) })) }],
  })
);

// ---- Phase 1: Self-awareness tools ----

const getMyHistory = tool(
  "get_my_history",
  "View your past sessions and actions. Use this to recall what you've done before and whether changes had the intended effect.",
  { limit: z.number().default(10), type: z.enum(["sessions", "actions", "all"]).default("all") },
  async ({ limit, type }) => {
    const data = await api(`/api/gm/history?type=${type}&limit=${limit}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
  }
);

const getSnapshots = tool(
  "get_snapshots",
  "Get recent game state snapshots with trends. Shows how metrics changed over time (meso, levels, items, players).",
  { limit: z.number().default(10) },
  async ({ limit }) => {
    const snapshots = await dbQuery(
      `SELECT * FROM gm_snapshots ORDER BY taken_at DESC LIMIT ${limit}`
    );

    // Compute deltas between consecutive snapshots
    const withDeltas = snapshots.map((s: any, i: number) => {
      const prev = snapshots[i + 1]; // older snapshot
      const snap: any = {
        id: s.id,
        takenAt: s.taken_at,
        totalMeso: s.total_meso,
        avgMesoPerPlayer: s.avg_meso_per_player,
        storageMeso: s.storage_meso,
        totalItems: s.total_items,
        totalCharacters: s.total_characters,
        avgLevel: s.avg_level,
        maxLevel: s.max_level,
        expRate: s.exp_rate,
        mesoRate: s.meso_rate,
        dropRate: s.drop_rate,
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

    return { content: [{ type: "text" as const, text: JSON.stringify(withDeltas) }] };
  }
);

const getGoals = tool(
  "get_goals",
  "View your active goals and their progress.",
  { status: z.enum(["active", "achieved", "abandoned", "all"]).default("all") },
  async ({ status }) => {
    const data = await api(`/api/gm/goals${status !== "all" ? `?status=${status}` : ""}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
  }
);

const createGoal = tool(
  "create_goal",
  "Create a new persistent goal to track across sessions. Example: 'Reduce meso inflation to <5%/day'",
  { goal: z.string(), targetMetric: z.string(), targetValue: z.number(), currentValue: z.number().optional() },
  async (input) => {
    const data = await api("/api/gm/goals", { method: "POST", body: JSON.stringify(input) });
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
  }
);

const updateGoal = tool(
  "update_goal",
  "Update a goal's status or current value. Mark as 'achieved' when done, 'abandoned' if no longer relevant.",
  { id: z.number(), status: z.enum(["active", "achieved", "abandoned"]).optional(), currentValue: z.number().optional(), targetValue: z.number().optional() },
  async (input) => {
    const data = await api("/api/gm/goals", { method: "PUT", body: JSON.stringify(input) });
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
  }
);

const getTrends = tool(
  "get_trends",
  "Get computed trend analysis over a time period. Shows meso inflation rate, level velocity, item saturation changes, player count trends, and auto-generated alerts. Much richer than raw snapshots.",
  { hours: z.number().default(48) },
  async ({ hours }) => {
    const data = await api(`/api/gm/trends?hours=${hours}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
  }
);

const takeSnapshot = tool(
  "take_snapshot",
  "Take a snapshot of the current game state and save it for trend tracking. Do this at the start of each session.",
  {},
  async () => {
    const data = await api("/api/gm/snapshot", { method: "POST" });
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
  }
);

// ---- Create the in-process MCP server ----

const cosmicMcp = createSdkMcpServer({
  name: "cosmic-gamemaster",
  tools: [
    getGameAnalytics, searchCharacters, getCharacter, updateCharacter, giveItem,
    searchMobs, getMob, updateMob, batchUpdateMobs,
    searchItems, getItem,
    getMobDrops, addMobDrop, removeMobDrop, batchUpdateDrops,
    searchMaps, getMap, addMapSpawn, removeMapSpawn,
    getShopItems, addShopItem, updateShopPrice, removeShopItem,
    getRates, updateRates, getConfig, updateConfig,
    createEvent, getActiveEvents, cleanupEvent,
    getServerStatus, getServerLogs, setServerMessage,
    // Phase 1: Self-awareness tools
    getMyHistory, getSnapshots, getTrends, getGoals, createGoal, updateGoal, takeSnapshot,
  ],
});

// ---- Build historical context for system prompt ----

async function buildHistoricalContext(): Promise<string> {
  let context = "";

  // Last 5 snapshots with deltas
  try {
    const snapshots = await dbQuery(
      "SELECT * FROM gm_snapshots ORDER BY taken_at DESC LIMIT 5"
    );
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

  // Recent actions (last 10)
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

  // Active goals
  try {
    const goals = await dbQuery(
      "SELECT * FROM gm_goals WHERE status = 'active' ORDER BY created_at DESC"
    );
    if (goals.length > 0) {
      context += "\n\n## Active Goals\n";
      for (const g of goals as any[]) {
        context += `- [#${g.id}] ${g.goal} — target: ${g.target_value} on \`${g.target_metric}\``;
        if (g.current_value !== null) context += ` (current: ${g.current_value})`;
        context += `\n`;
      }
    }

    const achieved = await dbQuery(
      "SELECT * FROM gm_goals WHERE status = 'achieved' ORDER BY last_checked DESC LIMIT 5"
    );
    if (achieved.length > 0) {
      context += "\n## Recently Achieved Goals\n";
      for (const g of achieved as any[]) {
        context += `- [#${g.id}] ${g.goal} ✓\n`;
      }
    }
  } catch { /* no goals yet */ }

  // Recent sessions summary
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

const BASE_SYSTEM_PROMPT = `You are the Game Master of a MapleStory private server called Cosmic.

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
- **Stability over optimization.** Players hate when the game feels different every day. A slightly imperfect but consistent game is better than a perfectly tuned one that changes constantly.
- **Content over numbers.** Creating a cool event is worth more than a 5% rate adjustment.
- **Observe before acting.** If metrics look slightly off, wait. Trends over days/weeks matter more than a single snapshot.
- **Don't fix what isn't broken.** If the economy is roughly stable and players are progressing, leave the rates alone.

## Decision Framework
1. OBSERVE: Read analytics and trends to understand current game state
2. COMPARE: Check against your previous sessions — did your last changes help?
3. CONTENT FIRST: Can you improve the experience by adding content instead of changing numbers?
4. INTERVENE ONLY IF NEEDED: Only touch rates/stats if there's a clear, sustained problem
5. RECORD: Update goals to track long-term objectives

## Memory & Continuity
You have persistent memory across sessions via snapshots, action logs, and goals.
- Use \`take_snapshot\` at the start of each session to record the current state
- Use \`get_snapshots\` to see how metrics have trended over time
- Use \`get_my_history\` to recall what you did in previous sessions
- Use \`get_goals\`/\`create_goal\`/\`update_goal\` to maintain persistent objectives
- Check if your previous changes had the intended effect before making new ones
- It's perfectly fine to observe and do nothing if the game is healthy

## Balance Targets (soft guidelines, not hard triggers)
- Average time to level 30: ~2 hours of gameplay
- Average time to level 70: ~8 hours
- Meso inflation rate: <5% per day
- No item should have >80% saturation across players
- Boss content should be accessible to 50%+ of eligible players

## Guardrails
- Never set rates below 1x or above 50x
- Never delete a player's items or reduce their level without being asked
- Never change more than 1 major lever (rates, base mob stats) per session
- Always explain your reasoning before making changes
- Rate/stat changes should be rare — at most once per week unless something is urgently broken
- Prefer creating events and content over adjusting numbers

## Communication
- Be direct and concise
- Use game terminology naturally
- When reporting analytics, highlight what's notable and what needs attention
- When making changes, state what you're doing and the expected impact`;

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
    // Count write actions
    const changesMade = session.log.filter(
      (e): e is Extract<GMLogEntry, { type: "tool_call" }> =>
        e.type === "tool_call" && WRITE_TOOLS.has(e.tool.name)
    ).length;

    await execute(
      "UPDATE gm_sessions SET completed_at = NOW(), summary = ?, status = ?, changes_made = ?, full_log = ? WHERE id = ?",
      [
        session.summary || null,
        session.status,
        changesMade,
        JSON.stringify(session.log),
        session.id,
      ]
    );
  } catch (err) {
    console.error("Failed to persist session end:", err);
  }
}

async function persistAction(
  sessionId: string,
  toolName: string,
  toolInput: Record<string, any>,
  toolResult: any,
  reasoning?: string
): Promise<void> {
  try {
    await execute(
      "INSERT INTO gm_actions (session_id, tool_name, tool_input, tool_result, reasoning, category) VALUES (?, ?, ?, ?, ?, ?)",
      [
        sessionId,
        toolName,
        JSON.stringify(toolInput),
        JSON.stringify(toolResult),
        reasoning || null,
        inferCategory(toolName),
      ]
    );
  } catch (err) {
    console.error("Failed to persist action:", err);
  }
}

// ---- Run a GM session ----

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

  // Persist session start
  await persistSessionStart(session, userPrompt);

  // Build historical context
  const historicalContext = await buildHistoricalContext();

  const systemPrompt = historicalContext
    ? BASE_SYSTEM_PROMPT + "\n\n---\n\n# Historical Context (from your memory)" + historicalContext
    : BASE_SYSTEM_PROMPT;

  // Track the last text block before each tool call for reasoning extraction
  let lastTextBeforeToolCall = "";

  try {
    const q = queryAI({
      prompt: userPrompt,
      options: {
        systemPrompt,
        mcpServers: { cosmic: cosmicMcp },
        maxTurns: 25,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        model: "sonnet",
        env: { ...process.env, CLAUDECODE: "" },
      },
    });

    for await (const message of q) {
      if (message.type === "assistant") {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "thinking" && "thinking" in block) {
              addLog({ type: "thinking", text: block.thinking as string });
            } else if (block.type === "text" && "text" in block) {
              lastTextBeforeToolCall = block.text as string;
              addLog({ type: "text", text: block.text as string });
            } else if (block.type === "tool_use") {
              addLog({
                type: "tool_call",
                tool: {
                  id: block.id,
                  name: block.name,
                  input: block.input as Record<string, any>,
                },
              });
            }
          }
        }
      } else if (message.type === "user") {
        // Tool results
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "tool_result" && "tool_use_id" in block) {
              const existingAction = session.log.find(
                (e): e is Extract<GMLogEntry, { type: "tool_call" }> =>
                  e.type === "tool_call" && e.tool.id === (block as any).tool_use_id
              );
              if (existingAction) {
                const resultText = Array.isArray((block as any).content)
                  ? (block as any).content.map((c: any) => c.text || "").join("")
                  : String((block as any).content || "");
                let parsed: any;
                try { parsed = JSON.parse(resultText); } catch { parsed = resultText; }
                existingAction.result = {
                  toolCallId: (block as any).tool_use_id,
                  name: existingAction.tool.name,
                  result: parsed,
                };
                onUpdate(existingAction);

                // Persist write actions to DB
                if (WRITE_TOOLS.has(existingAction.tool.name)) {
                  await persistAction(
                    session.id,
                    existingAction.tool.name,
                    existingAction.tool.input,
                    parsed,
                    lastTextBeforeToolCall || undefined
                  );
                }
              }
            }
          }
        }
      } else if (message.type === "result") {
        if (message.subtype === "success") {
          session.summary = message.result;
        } else {
          session.error = (message as any).result || message.subtype;
        }
      }
    }

    session.status = "complete";
  } catch (err: any) {
    session.status = "error";
    session.error = err.message;
    addLog({ type: "text", text: `Error: ${err.message}` });
  }

  // Persist session end
  session.completedAt = new Date().toISOString();
  await persistSessionEnd(session);

  return session;
}
