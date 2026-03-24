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

function inferCategory(toolName: string): "rates" | "mobs" | "drops" | "spawns" | "shops" | "events" | "config" | "reactors" | "other" {
  if (toolName.includes("rate")) return "rates";
  if (toolName.includes("mob") || toolName.includes("batch_update_mobs")) return "mobs";
  if (toolName.includes("reactor")) return "reactors";
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
  "add_map_reactor", "remove_map_reactor",
  "add_reactor_drop", "remove_reactor_drop",
  "spawn_drop",
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

  search_reactors: async ({ query }) =>
    JSON.stringify(await api(`/api/reactors${query ? `?q=${encodeURIComponent(query)}` : ""}`)),

  get_map_reactors: async ({ mapId }) =>
    JSON.stringify(await api(`/api/maps/${mapId}/reactors`)),

  add_map_reactor: async ({ mapId, reactorId, x, y, f, reactorTime, name }) =>
    JSON.stringify(await api(`/api/maps/${mapId}/reactors`, { method: "POST", body: JSON.stringify({ reactorId, x, y, f, reactorTime, name }) })),

  remove_map_reactor: async ({ mapId, reactorId }) =>
    JSON.stringify(await api(`/api/maps/${mapId}/reactors`, { method: "DELETE", body: JSON.stringify({ reactorId }) })),

  get_reactor_drops: async ({ reactorId }) =>
    JSON.stringify(await api(`/api/gm/reactordrops/${reactorId}`)),

  add_reactor_drop: async ({ reactorId, itemId, chance, questId }) =>
    JSON.stringify(await api(`/api/gm/reactordrops/${reactorId}`, { method: "POST", body: JSON.stringify({ itemId, chance, questId }) })),

  remove_reactor_drop: async ({ reactorId, itemId }) =>
    JSON.stringify(await api(`/api/gm/reactordrops/${reactorId}`, { method: "DELETE", body: JSON.stringify({ itemId }) })),

  spawn_drop: async ({ itemId, quantity, characterName, characterId, mapId, x, y }) =>
    JSON.stringify(await api("/api/gm/drop", { method: "POST", body: JSON.stringify({ itemId, quantity, characterName, characterId, mapId, x, y }) })),

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
        onlineNow: s.total_online || 0,
        activeCharacters24h: s.active_characters_24h || 0,
        activeCharacters7d: s.active_characters_7d || 0,
        activeAccounts24h: s.active_accounts_24h || 0,
        activeAccounts7d: s.active_accounts_7d || 0,
        expRate: s.exp_rate, mesoRate: s.meso_rate, dropRate: s.drop_rate,
      };
      if (prev) {
        snap.deltas = {
          mesoChange: s.total_meso - prev.total_meso,
          mesoChangePercent: prev.total_meso ? Math.round(((s.total_meso - prev.total_meso) / prev.total_meso) * 1000) / 10 : 0,
          avgLevelChange: Math.round((s.avg_level - prev.avg_level) * 10) / 10,
          itemChange: s.total_items - prev.total_items,
          characterChange: s.total_characters - prev.total_characters,
          activeChars24hChange: (s.active_characters_24h || 0) - (prev.active_characters_24h || 0),
          activeAccounts7dChange: (s.active_accounts_7d || 0) - (prev.active_accounts_7d || 0),
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

  get_player_feedback: async ({ rating, unread_only, days, limit }) => {
    const conditions: string[] = [];
    const params: any[] = [];

    if (rating && rating !== "all") {
      conditions.push("rating = ?");
      params.push(rating);
    }
    if (unread_only) {
      conditions.push("read_by_gm = 0");
    }
    if (days) {
      conditions.push("created_at > DATE_SUB(NOW(), INTERVAL ? DAY)");
      params.push(days);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const lim = Math.min(limit || 20, 50);

    // Get summary counts
    const counts = await dbQuery(
      `SELECT rating, COUNT(*) as cnt FROM player_feedback ${where} GROUP BY rating`,
      params
    );

    // Get individual entries
    const entries = await dbQuery(
      `SELECT * FROM player_feedback ${where} ORDER BY created_at DESC LIMIT ${lim}`,
      params
    );

    // Mark retrieved entries as read
    if (entries.length > 0) {
      const ids = (entries as any[]).map((e: any) => e.id);
      await execute(
        `UPDATE player_feedback SET read_by_gm = 1 WHERE id IN (${ids.map(() => "?").join(",")})`,
        ids
      ).catch(() => {});
    }

    return JSON.stringify({
      summary: Object.fromEntries((counts as any[]).map((c: any) => [c.rating, c.cnt])),
      totalEntries: (counts as any[]).reduce((sum: number, c: any) => sum + c.cnt, 0),
      entries: (entries as any[]).map((e: any) => ({
        id: e.id,
        characterName: e.character_name,
        characterLevel: e.character_level,
        rating: e.rating,
        message: e.message,
        createdAt: e.created_at,
        wasUnread: e.read_by_gm === 0,
      })),
    });
  },

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
  // ── Analytics & Observation ──
  {
    type: "function",
    function: {
      name: "get_game_analytics",
      description: "Get comprehensive game analytics. Returns economy (total meso, avg meso/player, meso distribution brackets, top 20 items by count, storage meso), progression (level distribution by bucket, job distribution with names, avg/max level, recent EXP gains), activity (map popularity, boss kills today/weekly, GM distribution, new accounts last 7d), and health (current rates, server config, DB stats, automated warnings). Call with section='all' for a full picture, or a specific section to reduce noise.",
      parameters: { type: "object", properties: { section: { type: "string", enum: ["all", "economy", "progression", "activity", "health"], description: "Which analytics section to fetch. Use 'all' for first check of a session." } }, required: ["section"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_snapshots",
      description: "Get recent game state snapshots with computed deltas between consecutive snapshots. Each snapshot includes: totalMeso, avgMesoPerPlayer, storageMeso, totalItems, totalCharacters (all-time cumulative), onlineNow, activeCharacters24h, activeCharacters7d, activeAccounts24h, activeAccounts7d, avgLevel, maxLevel, expRate, mesoRate, dropRate. Deltas show: mesoChange (absolute + %), avgLevelChange, itemChange, characterChange, activeChars24hChange, activeAccounts7dChange.",
      parameters: { type: "object", properties: { limit: { type: "number", description: "Number of snapshots to return (default 10, newest first)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_trends",
      description: "Get computed trend analysis over a time period. Returns: economy trends (meso change %, inflation/day, storage meso, avg meso/player), progression (avg level change, level velocity/day), item trends (count change %), player trends (character/account changes), rate change history, and auto-generated alerts (inflation >10%/day, rapid leveling >5lvl/day, item surge/drop >20%, declining players).",
      parameters: { type: "object", properties: { hours: { type: "number", description: "Time window in hours (default 48, max 168 = 1 week)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "take_snapshot",
      description: "Capture a point-in-time snapshot of the game state and save it to the database. Captures: total meso (characters + storage), item count, character count (all-time), active player counts (online now, active characters 24h/7d, active accounts 24h/7d), avg/max level, level/job distributions, account stats, boss kills today, current rates. Use at the start of each session to establish a baseline.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_player_feedback",
      description: "Read player feedback submitted via the in-game @feedback command. Players rate their experience as positive, negative, or suggestion with a message. Returns summary counts + individual entries. Retrieved feedback is marked as read. Use this to understand player sentiment about your changes.",
      parameters: {
        type: "object",
        properties: {
          rating: { type: "string", enum: ["all", "positive", "negative", "suggestion"], description: "Filter by rating type (default: all)" },
          unread_only: { type: "boolean", description: "Only return feedback not yet read by GM (default: false)" },
          days: { type: "number", description: "Only return feedback from the last N days" },
          limit: { type: "number", description: "Max entries to return (default 20, max 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_server_status",
      description: "Check if the game server process is running. Returns: {status: 'running'|'stopped', players: number}.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_server_logs",
      description: "Read recent game server logs. Only works in local dev (uses Docker). Will return an error in production — do not rely on this tool for routine checks.",
      parameters: { type: "object", properties: { lines: { type: "number", description: "Number of log lines to return (default 100)" } } },
    },
  },

  // ── Character Management ──
  {
    type: "function",
    function: {
      name: "search_characters",
      description: "Search characters by name. Returns list of characters with basic info (id, name, level, job, map, meso). Omit query to list all characters.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Character name to search for (partial match)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_character",
      description: "Get full character details by ID including: name, level, job, str/dex/int/luk, hp/mp, meso, fame, map, exp, ap, sp, gm level, and inventory.",
      parameters: { type: "object", properties: { characterId: { type: "number", description: "Character database ID" } }, required: ["characterId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "update_character",
      description: "Update character stats (takes effect when player relogs). Allowed fields: level, str, dex, int, luk, maxhp, maxmp, meso, fame, ap, sp, job, map, exp, hp, mp, gm.",
      parameters: {
        type: "object",
        properties: {
          characterId: { type: "number", description: "Character database ID" },
          changes: {
            type: "object",
            description: "Fields to update. Example: {level: 50, meso: 100000, str: 50}",
            properties: {
              level: { type: "number" }, str: { type: "number" }, dex: { type: "number" },
              int: { type: "number" }, luk: { type: "number" }, maxhp: { type: "number" },
              maxmp: { type: "number" }, meso: { type: "number" }, fame: { type: "number" },
              ap: { type: "number" }, sp: { type: "number" }, job: { type: "number" },
              map: { type: "number" }, exp: { type: "number" }, hp: { type: "number" },
              mp: { type: "number" }, gm: { type: "number" },
            },
          },
        },
        required: ["characterId", "changes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "give_item_to_character",
      description: "Add an item to a character's inventory. The inventory type (equip/use/etc/cash) is determined automatically from the item ID range.",
      parameters: {
        type: "object",
        properties: {
          characterId: { type: "number", description: "Character database ID" },
          itemId: { type: "number", description: "Item ID (use search_items to find IDs)" },
          quantity: { type: "number", description: "Stack quantity (default 1). Equips are always 1." },
        },
        required: ["characterId", "itemId"],
      },
    },
  },

  // ── Mob Management ──
  {
    type: "function",
    function: {
      name: "search_mobs",
      description: "Search monsters by name or ID. Returns up to 50 results with: id, name, level, maxHP, exp, and basic stats. Omit query to browse.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Mob name or numeric ID to search" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_mob",
      description: "Get full mob stats: level, maxHP, maxMP, exp, PADamage, MADamage, PDDamage, MDDamage, acc, eva, speed, boss, undead, bodyAttack, pushed.",
      parameters: { type: "object", properties: { mobId: { type: "number", description: "Mob ID" } }, required: ["mobId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "update_mob",
      description: "Update a mob's stats. Changes modify the server WZ XML files. Allowed stats: level, maxHP, maxMP, exp, PADamage, MADamage, PDDamage, MDDamage, acc, eva, speed, boss, undead, bodyAttack, pushed.",
      parameters: {
        type: "object",
        properties: {
          mobId: { type: "number", description: "Mob ID" },
          changes: {
            type: "object",
            description: "Stats to change. Example: {maxHP: 5000, exp: 200, PADamage: 100}",
            properties: {
              level: { type: "number" }, maxHP: { type: "number" }, maxMP: { type: "number" },
              exp: { type: "number" }, PADamage: { type: "number" }, MADamage: { type: "number" },
              PDDamage: { type: "number" }, MDDamage: { type: "number" }, acc: { type: "number" },
              eva: { type: "number" }, speed: { type: "number" }, boss: { type: "number" },
              undead: { type: "number" }, bodyAttack: { type: "number" }, pushed: { type: "number" },
            },
          },
        },
        required: ["mobId", "changes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "batch_update_mobs",
      description: "Update multiple mobs at once (max 50). Each entry specifies a mob ID and the stat changes to apply. Same allowed stats as update_mob.",
      parameters: {
        type: "object",
        properties: {
          mobs: {
            type: "array",
            description: "Array of mob updates",
            items: {
              type: "object",
              properties: {
                id: { type: "number", description: "Mob ID" },
                changes: { type: "object", description: "Stats to change (same keys as update_mob)" },
              },
              required: ["id", "changes"],
            },
          },
        },
        required: ["mobs"],
      },
    },
  },

  // ── Item Lookup ──
  {
    type: "function",
    function: {
      name: "search_items",
      description: "Search items by name, with optional category filter. Returns up to 50 results with: itemId, name, description, category. Item ID ranges: 1000000-1999999=equip, 2000000-2999999=consume, 4000000-4999999=etc, 5000000-5999999=cash.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Item name to search (partial match)" },
          category: { type: "string", enum: ["all", "equip", "consume", "etc", "cash"], description: "Filter by category (default: all)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_item",
      description: "Get full item details by ID: name, description, category, stats (for equips), price, and other properties.",
      parameters: { type: "object", properties: { itemId: { type: "number", description: "Item ID" } }, required: ["itemId"] },
    },
  },

  // ── Drop Tables ──
  {
    type: "function",
    function: {
      name: "get_mob_drops",
      description: "Get the full drop table for a mob. Returns array of drops with: itemId, chance (out of 1,000,000 — so 100000 = 10%), minQuantity, maxQuantity, questId.",
      parameters: { type: "object", properties: { mobId: { type: "number", description: "Mob ID" } }, required: ["mobId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "add_mob_drop",
      description: "Add an item to a mob's drop table. Chance is out of 1,000,000 (e.g. 100000 = 10%, 10000 = 1%, 1000 = 0.1%). Changes are live immediately.",
      parameters: {
        type: "object",
        properties: {
          mobId: { type: "number", description: "Mob ID" },
          itemId: { type: "number", description: "Item ID to drop" },
          chance: { type: "number", description: "Drop chance out of 1,000,000 (100000 = 10%)" },
          minQuantity: { type: "number", description: "Minimum drop quantity (default 1)" },
          maxQuantity: { type: "number", description: "Maximum drop quantity (default 1)" },
        },
        required: ["mobId", "itemId", "chance"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_mob_drop",
      description: "Remove an item from a mob's drop table. Takes effect immediately.",
      parameters: {
        type: "object",
        properties: {
          mobId: { type: "number", description: "Mob ID" },
          itemId: { type: "number", description: "Item ID to remove from drops" },
        },
        required: ["mobId", "itemId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "batch_update_drops",
      description: "Bulk update drop tables for multiple mobs (max 100 operations). Each entry targets one mob and can add, remove, or update drops in a single call.",
      parameters: {
        type: "object",
        properties: {
          changes: {
            type: "array",
            description: "Array of per-mob drop changes",
            items: {
              type: "object",
              properties: {
                mobId: { type: "number", description: "Mob ID" },
                add: {
                  type: "array",
                  description: "Drops to add",
                  items: {
                    type: "object",
                    properties: {
                      itemId: { type: "number" },
                      chance: { type: "number", description: "Out of 1,000,000" },
                      minQuantity: { type: "number" },
                      maxQuantity: { type: "number" },
                      questId: { type: "number" },
                    },
                    required: ["itemId"],
                  },
                },
                remove: {
                  type: "array",
                  description: "Drops to remove",
                  items: { type: "object", properties: { itemId: { type: "number" } }, required: ["itemId"] },
                },
                update: {
                  type: "array",
                  description: "Existing drops to modify (change chance/quantities)",
                  items: {
                    type: "object",
                    properties: {
                      itemId: { type: "number" },
                      chance: { type: "number" },
                      minQuantity: { type: "number" },
                      maxQuantity: { type: "number" },
                    },
                    required: ["itemId"],
                  },
                },
              },
              required: ["mobId"],
            },
          },
        },
        required: ["changes"],
      },
    },
  },

  // ── Maps & Spawns ──
  {
    type: "function",
    function: {
      name: "search_maps",
      description: "Search maps by name or numeric ID. Returns matching maps with: mapId, name, streetName, and mob/NPC spawn counts.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Map name or ID to search" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_map",
      description: "Get full map data including: name, streetName, all mob and NPC spawns (with coordinates), and portals. Footholds are excluded to save tokens. Use this to find valid spawn coordinates before adding spawns.",
      parameters: { type: "object", properties: { mapId: { type: "number", description: "Map ID" } }, required: ["mapId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "add_map_spawn",
      description: "Add a mob or NPC spawn to a map. The spawn is written to the plife table and takes effect on server restart. Use get_map first to find valid x,y coordinates from existing spawns.",
      parameters: {
        type: "object",
        properties: {
          mapId: { type: "number", description: "Map ID" },
          type: { type: "string", enum: ["m", "n"], description: "'m' for mob, 'n' for NPC" },
          lifeId: { type: "number", description: "Mob or NPC ID to spawn" },
          x: { type: "number", description: "X coordinate (use coords from existing spawns via get_map)" },
          y: { type: "number", description: "Y coordinate" },
        },
        required: ["mapId", "type", "lifeId", "x", "y"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_map_spawn",
      description: "Remove a mob or NPC spawn from a map. Removes from plife table. Takes effect on server restart.",
      parameters: {
        type: "object",
        properties: {
          mapId: { type: "number", description: "Map ID" },
          type: { type: "string", enum: ["m", "n"], description: "'m' for mob, 'n' for NPC" },
          lifeId: { type: "number", description: "Mob or NPC ID to remove" },
        },
        required: ["mapId", "type", "lifeId"],
      },
    },
  },

  // ── Reactors ──
  {
    type: "function",
    function: {
      name: "search_reactors",
      description: "Search available reactor templates (breakable objects, boxes, eggs, plants, crystals). Returns: id, name, state count, whether a script exists. There are 421 reactor visuals in the game — use existing ones to place on maps.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Reactor name or ID to search" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_map_reactors",
      description: "List reactor spawns currently placed on a map (from preactor DB table). These are GM-placed reactors, not WZ-default ones.",
      parameters: { type: "object", properties: { mapId: { type: "number", description: "Map ID" } }, required: ["mapId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "add_map_reactor",
      description: "Place a reactor (breakable object) on a map. Stored in preactor DB table, loaded by server on map init. Use search_reactors to find reactor IDs, and get_map to find valid x,y coordinates. Takes effect on server restart.",
      parameters: {
        type: "object",
        properties: {
          mapId: { type: "number", description: "Map ID to place reactor on" },
          reactorId: { type: "number", description: "Reactor template ID (from search_reactors)" },
          x: { type: "number", description: "X coordinate" },
          y: { type: "number", description: "Y coordinate" },
          f: { type: "number", description: "Facing direction: 0=left, 1=right (default 0)" },
          reactorTime: { type: "number", description: "Respawn delay in seconds after broken (-1 = no respawn, 0 = instant, default -1)" },
          name: { type: "string", description: "Optional reactor name/tag for identification" },
        },
        required: ["mapId", "reactorId", "x", "y"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_map_reactor",
      description: "Remove a GM-placed reactor from a map. Removes from preactor DB table.",
      parameters: {
        type: "object",
        properties: {
          mapId: { type: "number", description: "Map ID" },
          reactorId: { type: "number", description: "Reactor template ID to remove" },
        },
        required: ["mapId", "reactorId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_reactor_drops",
      description: "Get the drop table for a reactor. Returns items that drop when the reactor is broken. Chance values: higher = more common (unlike mob drops, reactor chances are simpler — typically 1-100 where lower = rarer).",
      parameters: { type: "object", properties: { reactorId: { type: "number", description: "Reactor template ID" } }, required: ["reactorId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "add_reactor_drop",
      description: "Add an item drop to a reactor. When players break this reactor, it can drop this item. Great for treasure hunt events — place reactors on maps and configure their drops.",
      parameters: {
        type: "object",
        properties: {
          reactorId: { type: "number", description: "Reactor template ID" },
          itemId: { type: "number", description: "Item ID to drop" },
          chance: { type: "number", description: "Drop chance (higher = more common, typically 1-100)" },
          questId: { type: "number", description: "Quest ID requirement (-1 for no requirement, default -1)" },
        },
        required: ["reactorId", "itemId", "chance"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_reactor_drop",
      description: "Remove an item from a reactor's drop table.",
      parameters: {
        type: "object",
        properties: {
          reactorId: { type: "number", description: "Reactor template ID" },
          itemId: { type: "number", description: "Item ID to remove from drops" },
        },
        required: ["reactorId", "itemId"],
      },
    },
  },

  // ── Live Drops ──
  {
    type: "function",
    function: {
      name: "spawn_drop",
      description: "Spawn a visible item drop on the ground that players can pick up. Requires the game server to be running. Provide characterName to drop in front of an ONLINE player, or mapId+x+y to drop at specific coordinates. The item appears on the ground with the normal drop animation.",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "number", description: "Item ID to drop (use search_items to find IDs)" },
          quantity: { type: "number", description: "Stack quantity (default 1, max 999)" },
          characterName: { type: "string", description: "Drop in front of this online player (by character name)" },
          characterId: { type: "number", description: "Drop in front of this online player (by character ID)" },
          mapId: { type: "number", description: "Map ID to drop on (use with x,y instead of characterName)" },
          x: { type: "number", description: "X coordinate on map" },
          y: { type: "number", description: "Y coordinate on map" },
        },
        required: ["itemId"],
      },
    },
  },

  // ── Shops ──
  {
    type: "function",
    function: {
      name: "get_shop_items",
      description: "Get all items sold by a shop, including: itemId, price, and position. Use search_maps or NPC data to find shop IDs.",
      parameters: { type: "object", properties: { shopId: { type: "number", description: "Shop ID (from shops table, linked to NPC ID)" } }, required: ["shopId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "add_shop_item",
      description: "Add an item for sale in a shop. Price is in meso.",
      parameters: {
        type: "object",
        properties: {
          shopId: { type: "number", description: "Shop ID" },
          itemId: { type: "number", description: "Item ID to sell" },
          price: { type: "number", description: "Price in meso" },
        },
        required: ["shopId", "itemId", "price"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_shop_price",
      description: "Change the price of an item already in a shop.",
      parameters: {
        type: "object",
        properties: {
          shopId: { type: "number", description: "Shop ID" },
          itemId: { type: "number", description: "Item ID" },
          price: { type: "number", description: "New price in meso" },
        },
        required: ["shopId", "itemId", "price"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_shop_item",
      description: "Remove an item from a shop so it's no longer for sale.",
      parameters: {
        type: "object",
        properties: {
          shopId: { type: "number", description: "Shop ID" },
          itemId: { type: "number", description: "Item ID to remove" },
        },
        required: ["shopId", "itemId"],
      },
    },
  },

  // ── Server Rates ──
  {
    type: "function",
    function: {
      name: "get_rates",
      description: "Get current server rates. Returns both world rates (exp_rate, meso_rate, drop_rate, boss_drop_rate, quest_rate, fishing_rate, travel_rate) and server rates (EQUIP_EXP_RATE, PQ_BONUS_EXP_RATE, PARTY_BONUS_EXP_RATE, RESPAWN_INTERVAL, etc).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "update_rates",
      description: "Update server rates. Values must be between 1 and 50. Changes are pushed live to the game server immediately (no restart needed). Rate changes are a major lever — prefer events/content over rate adjustments.",
      parameters: {
        type: "object",
        properties: {
          rates: {
            type: "object",
            description: "Rates to update. Example: {exp_rate: 5, drop_rate: 3}",
            properties: {
              exp_rate: { type: "number" }, meso_rate: { type: "number" },
              drop_rate: { type: "number" }, boss_drop_rate: { type: "number" },
              quest_rate: { type: "number" },
            },
          },
        },
        required: ["rates"],
      },
    },
  },

  // ── Config ──
  {
    type: "function",
    function: {
      name: "get_config",
      description: "Get the full server config.yaml as JSON. Includes worlds array (rates, channels, messages), server settings (respawn, autoban, autosave), and all other configuration.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "update_config",
      description: "Update a single config value by dot-notation path. Rate-related keys (exp_rate, meso_rate, drop_rate, boss_drop_rate) are auto-pushed live to the game server. Use update_rates instead for rate changes.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Dot-path to config key. Example: 'worlds.0.exp_rate' or 'server.RESPAWN_INTERVAL'" },
          value: { description: "New value (string, number, or boolean)" },
        },
        required: ["path", "value"],
      },
    },
  },

  // ── Events ──
  {
    type: "function",
    function: {
      name: "create_event",
      description: "Create a dynamic event combining mob spawns, bonus drops, and a server announcement. Mob spawns are added to the plife table (take effect on restart). Drop changes are live. Global drops (bonusDrops without mobId) drop from ALL mobs server-wide.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Event name (stored in global drop comments for cleanup)" },
          mapId: { type: "number", description: "Map ID to spawn mobs on" },
          mobs: {
            type: "array",
            description: "Mobs to spawn on the map",
            items: {
              type: "object",
              properties: {
                id: { type: "number", description: "Mob ID" },
                count: { type: "number", description: "Number of spawns (default 1, max 20)" },
                x: { type: "number", description: "X coordinate" },
                y: { type: "number", description: "Y coordinate" },
                mobtime: { type: "number", description: "Respawn time in seconds (0 = instant)" },
              },
              required: ["id"],
            },
          },
          bonusDrops: {
            type: "array",
            description: "Bonus item drops. Include mobId for mob-specific drops, or omit mobId for global drops (all mobs).",
            items: {
              type: "object",
              properties: {
                mobId: { type: "number", description: "Mob ID (omit for global drop from all mobs)" },
                itemId: { type: "number", description: "Item ID to drop" },
                chance: { type: "number", description: "Out of 1,000,000 (default: 100000 = 10% for mob drops, 50000 = 5% for global)" },
                minQuantity: { type: "number", description: "Min quantity (default 1)" },
                maxQuantity: { type: "number", description: "Max quantity (default 1)" },
              },
              required: ["itemId"],
            },
          },
          announcement: { type: "string", description: "Server announcement message shown to players on channel select" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_active_events",
      description: "List all active custom events: custom mob/NPC spawns from plife table, and global drops from drop_data_global. Use to check what events are currently running before creating new ones or cleaning up.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "cleanup_event",
      description: "Remove custom event content. Provide mapId to remove spawns from a specific map, mobId to remove a specific mob's spawns, and/or clearGlobalDrops to remove all event-tagged global drops.",
      parameters: {
        type: "object",
        properties: {
          mapId: { type: "number", description: "Remove all custom spawns from this map" },
          mobId: { type: "number", description: "Remove spawns of this specific mob (combine with mapId for precision)" },
          clearGlobalDrops: { type: "boolean", description: "Remove all global drops tagged as 'Event:*' (default false)" },
        },
      },
    },
  },

  // ── Communication ──
  {
    type: "function",
    function: {
      name: "set_server_message",
      description: "Set the server announcement shown to players on the channel select screen. Updates both server_message and event_message in config. Note: requires server restart to appear in-game. Must be pure ASCII (no emoji/unicode — the server YAML parser crashes on non-ASCII).",
      parameters: {
        type: "object",
        properties: { message: { type: "string", description: "Announcement text (ASCII only, no emoji)" } },
        required: ["message"],
      },
    },
  },

  // ── History & Memory ──
  {
    type: "function",
    function: {
      name: "get_my_history",
      description: "View your past GM sessions and individual tool actions. Sessions show: trigger type, prompt, summary, status, changes count. Actions show: tool name, input params, result, reasoning, category.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results to return (default 10)" },
          type: { type: "string", enum: ["sessions", "actions", "all"], description: "What to return (default 'all')" },
        },
      },
    },
  },

  // ── Goals ──
  {
    type: "function",
    function: {
      name: "get_goals",
      description: "View your persistent goals. Goals track long-term objectives (e.g. 'reduce inflation to <5%/day', 'get avg level above 50'). Each has a target metric and value, and a current value you update over time.",
      parameters: {
        type: "object",
        properties: { status: { type: "string", enum: ["active", "achieved", "abandoned", "all"], description: "Filter by status (default: all)" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_goal",
      description: "Create a new persistent goal to track across sessions. Goals persist until you mark them achieved or abandoned. Use meaningful metric names you can measure from analytics.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "Human-readable goal description. Example: 'Reduce daily meso inflation below 5%'" },
          targetMetric: { type: "string", description: "Metric name to track. Example: 'meso_inflation_pct_day', 'avg_level', 'active_players_7d'" },
          targetValue: { type: "number", description: "Target value to achieve" },
          currentValue: { type: "number", description: "Current value of the metric (optional, set from analytics)" },
        },
        required: ["goal", "targetMetric", "targetValue"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_goal",
      description: "Update a goal's progress or status. Use to record current metric values from analytics, or mark a goal as achieved/abandoned.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Goal ID" },
          status: { type: "string", enum: ["active", "achieved", "abandoned"], description: "New status" },
          currentValue: { type: "number", description: "Updated current value from analytics" },
          targetValue: { type: "number", description: "Revised target (if needed)" },
        },
        required: ["id"],
      },
    },
  },

  // ── Client Update ──
  {
    type: "function",
    function: {
      name: "publish_client_update",
      description: "Publish a client update by bumping the launcher manifest version. IMPORTANT: Most GM changes (drops, shops, spawns, rates, mob stats) are DB-only or config-only and do NOT need this. Only use for WZ-level changes (new items/mobs that need client-side data) or client exe patches. Players must re-launch to get updates.",
      parameters: {
        type: "object",
        properties: {
          version: { type: "string", description: "New version string (e.g. '1.1.0')" },
          message: { type: "string", description: "What changed for players" },
          files: {
            type: "array",
            description: "Files that changed (only if you know the new hash/size)",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Filename (e.g. 'Item.wz')" },
                hash: { type: "string", description: "New SHA256 hash" },
                size: { type: "number", description: "New file size in bytes" },
              },
            },
          },
        },
        required: ["version", "message"],
      },
    },
  },
];

// ---- Build historical context for system prompt ----

async function buildHistoricalContext(): Promise<string> {
  let context = "";

  try {
    const snapshots = await dbQuery("SELECT * FROM gm_snapshots ORDER BY taken_at DESC LIMIT 5");
    if (snapshots.length > 0) {
      const latest = snapshots[0] as any;
      context += "\n\n## Current State at a Glance\n";
      context += `- **Rates**: EXP ${latest.exp_rate}x | Meso ${latest.meso_rate}x | Drop ${latest.drop_rate}x\n`;
      context += `- **Players**: ${latest.total_online || 0} online now | ${latest.active_characters_24h || 0} active chars (24h) | ${latest.active_accounts_7d || 0} active accounts (7d)\n`;
      context += `- **Economy**: ${Number(latest.total_meso).toLocaleString()} total meso | Avg ${Number(latest.avg_meso_per_player).toLocaleString()} per player\n`;
      context += `- **Progression**: Avg level ${latest.avg_level} | Max level ${latest.max_level}\n`;
      context += `- *(Latest snapshot: ${latest.taken_at})*\n`;

      context += "\n## Recent Snapshots (newest first)\n";
      for (let i = 0; i < snapshots.length; i++) {
        const s = snapshots[i] as any;
        const prev = snapshots[i + 1] as any;
        context += `\n### Snapshot ${i + 1} — ${s.taken_at}\n`;
        context += `- **Online Now: ${s.total_online || 0}** | Active Chars 24h: ${s.active_characters_24h || 0} | Active Chars 7d: ${s.active_characters_7d || 0}`;
        if (prev) {
          const acctDelta = (s.active_accounts_7d || 0) - (prev.active_accounts_7d || 0);
          context += ` | Active Accounts 7d: ${s.active_accounts_7d || 0} (${acctDelta >= 0 ? "+" : ""}${acctDelta})`;
        } else {
          context += ` | Active Accounts 7d: ${s.active_accounts_7d || 0}`;
        }
        context += `\n- Meso: ${Number(s.total_meso).toLocaleString()}`;
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
        context += `\n- Total Characters (all-time): ${s.total_characters} | Items: ${s.total_items}`;
        context += `\n- Rates: EXP ${s.exp_rate}x | Meso ${s.meso_rate}x | Drop ${s.drop_rate}x`;
      }
    }
  } catch { /* no snapshots yet */ }

  // Active events — what's currently running in the game
  try {
    const customSpawns = await dbQuery(
      "SELECT map, life, type, COUNT(*) as cnt FROM plife GROUP BY map, life, type ORDER BY map"
    );
    const globalDrops = await dbQuery(
      "SELECT itemid, chance, minimum_quantity, maximum_quantity, comments FROM drop_data_global"
    );
    const customReactors = await dbQuery(
      "SELECT map, rid, name, reactor_time FROM preactor ORDER BY map"
    ).catch(() => []);

    const hasSpawns = (customSpawns as any[]).length > 0;
    const hasDrops = (globalDrops as any[]).length > 0;
    const hasReactors = (customReactors as any[]).length > 0;

    if (hasSpawns || hasDrops || hasReactors) {
      // Collect all map IDs for name resolution
      const allMapIds = new Set<number>();
      if (hasSpawns) for (const s of customSpawns as any[]) allMapIds.add(Number(s.map));
      if (hasReactors) for (const r of customReactors as any[]) allMapIds.add(Number(r.map));

      const mapNames: Record<number, string> = {};
      try {
        const results = await Promise.allSettled(
          [...allMapIds].slice(0, 10).map(async (id) => {
            const data = await api(`/api/maps/${id}`);
            return { id, name: data?.name || `Map ${id}` };
          })
        );
        for (const r of results) {
          if (r.status === "fulfilled") mapNames[r.value.id] = r.value.name;
        }
      } catch {}

      context += "\n\n## Currently Active Events\n";
      context += "These are LIVE right now. Clean up anything that has run its course.\n";

      if (hasSpawns) {
        context += "\n### Custom Spawns\n";
        const spawnsByMap: Record<number, any[]> = {};
        for (const s of customSpawns as any[]) {
          if (!spawnsByMap[s.map]) spawnsByMap[s.map] = [];
          spawnsByMap[s.map].push(s);
        }
        for (const [mapId, spawns] of Object.entries(spawnsByMap)) {
          const mapName = mapNames[Number(mapId)] || `Map ${mapId}`;
          const list = spawns.map((s: any) => `${s.type === "m" ? "mob" : "NPC"} ${s.life} (x${s.cnt})`).join(", ");
          context += `- **${mapName}** (${mapId}): ${list}\n`;
        }
      }

      if (hasReactors) {
        context += "\n### Custom Reactors\n";
        const reactorsByMap: Record<number, any[]> = {};
        for (const r of customReactors as any[]) {
          if (!reactorsByMap[r.map]) reactorsByMap[r.map] = [];
          reactorsByMap[r.map].push(r);
        }
        for (const [mapId, reactors] of Object.entries(reactorsByMap)) {
          const mapName = mapNames[Number(mapId)] || `Map ${mapId}`;
          const list = reactors.map((r: any) => `reactor ${r.rid}${r.name ? ` "${r.name}"` : ""}`).join(", ");
          context += `- **${mapName}** (${mapId}): ${list}\n`;
        }
      }

      if (hasDrops) {
        const uniqueItemIds = [...new Set((globalDrops as any[]).map((d: any) => Number(d.itemid)))];
        const dropItemNames: Record<number, string> = {};
        try {
          const results = await Promise.allSettled(
            uniqueItemIds.slice(0, 15).map(async (id) => {
              const data = await api(`/api/items/${id}`);
              return { id, name: data?.name || null };
            })
          );
          for (const r of results) {
            if (r.status === "fulfilled" && r.value.name) dropItemNames[r.value.id] = r.value.name;
          }
        } catch {}

        context += "\n### Global Drops (all mobs drop these)\n";
        for (const d of globalDrops as any[]) {
          const name = dropItemNames[d.itemid] || `Item ${d.itemid}`;
          const pct = (d.chance / 10000).toFixed(1);
          context += `- ${name} (${d.itemid}) at ${pct}% chance${d.comments ? ` [${d.comments}]` : ""}\n`;
        }
      }

      context += "\nIf any of these are from past events that should have ended, clean them up with cleanup_event.\n";
    }
  } catch { /* no active events */ }

  try {
    const actions = await dbQuery(
      "SELECT a.tool_name, a.tool_input, a.reasoning, a.category, a.executed_at, s.prompt FROM gm_actions a LEFT JOIN gm_sessions s ON a.session_id = s.id ORDER BY a.executed_at DESC LIMIT 10"
    );
    if (actions.length > 0) {
      context += "\n\n## Your Recent Actions\n";
      for (const a of actions as any[]) {
        context += `- [${a.executed_at}] **${a.tool_name}** (${a.category}): ${a.reasoning || "no reasoning recorded"}`;
        if (a.tool_input) context += ` | Input: ${String(a.tool_input).substring(0, 300)}`;
        context += `\n`;
      }
    }
  } catch { /* no actions yet */ }

  // Past event items that players may still hold — enables continuity
  try {
    const pastEventDrops = await dbQuery(
      "SELECT DISTINCT a.tool_input FROM gm_actions a WHERE a.tool_name IN ('create_event', 'batch_update_drops', 'add_mob_drop', 'add_reactor_drop') AND a.tool_result LIKE '%success%' ORDER BY a.executed_at DESC LIMIT 20"
    );
    if (pastEventDrops.length > 0) {
      const itemIds = new Set<string>();
      for (const row of pastEventDrops as any[]) {
        const input = String(row.tool_input);
        for (const m of input.matchAll(/"itemId"\s*:\s*(\d+)/gi)) itemIds.add(m[1]);
        for (const m of input.matchAll(/"itemid"\s*:\s*(\d+)/gi)) itemIds.add(m[1]);
      }
      if (itemIds.size > 0) {
        // Resolve item names
        const pastItemNames: Record<string, string> = {};
        try {
          const results = await Promise.allSettled(
            [...itemIds].slice(0, 15).map(async (id) => {
              const data = await api(`/api/items/${id}`);
              return { id, name: data?.name || null };
            })
          );
          for (const r of results) {
            if (r.status === "fulfilled" && r.value.name) pastItemNames[r.value.id] = r.value.name;
          }
        } catch {}

        context += `\n\n## Past Event Items (players may still hold these)\n`;
        const itemList = [...itemIds].map(id => {
          const name = pastItemNames[id];
          return name ? `${name} (${id})` : `Item ${id}`;
        }).join(", ");
        context += `Items from your past events: ${itemList}\n`;
        context += `Consider reusing these for trade-ins, exchanges, or follow-up events.\n`;
      }
    }
  } catch { /* ignore */ }

  try {
    const goals = await dbQuery("SELECT * FROM gm_goals WHERE status = 'active' ORDER BY created_at DESC");
    if (goals.length > 0) {
      // Auto-compute current values from latest snapshot
      const [latestSnap] = await dbQuery("SELECT * FROM gm_snapshots ORDER BY taken_at DESC LIMIT 1").catch(() => [null]);
      const metricLookup: Record<string, number | null> = {};
      if (latestSnap) {
        const ls = latestSnap as any;
        metricLookup["active_accounts_7d"] = ls.active_accounts_7d || 0;
        metricLookup["active_accounts_24h"] = ls.active_accounts_24h || 0;
        metricLookup["active_players_7d"] = ls.active_accounts_7d || 0;
        metricLookup["active_characters_7d"] = ls.active_characters_7d || 0;
        metricLookup["active_characters_24h"] = ls.active_characters_24h || 0;
        metricLookup["online_players"] = ls.total_online || 0;
        metricLookup["avg_level"] = ls.avg_level;
        metricLookup["max_level"] = ls.max_level;
        metricLookup["total_meso"] = Number(ls.total_meso);
        metricLookup["avg_meso_per_player"] = ls.avg_meso_per_player;
        metricLookup["total_accounts"] = ls.total_accounts;
        metricLookup["exp_rate"] = ls.exp_rate;
        metricLookup["meso_rate"] = ls.meso_rate;
        metricLookup["drop_rate"] = ls.drop_rate;
        // Try to compute inflation from trends
        try {
          const trends = await api("/api/gm/trends?hours=24");
          if (trends?.economy?.mesoInflationPerDay != null) {
            metricLookup["meso_inflation_pct_day"] = trends.economy.mesoInflationPerDay;
          }
        } catch {}
      }

      context += "\n\n## Active Goals\n";
      for (const g of goals as any[]) {
        const metric = g.target_metric;
        const autoValue = metricLookup[metric];
        const currentValue = autoValue ?? g.current_value;

        // Auto-update the DB if we computed a fresh value
        if (autoValue != null && autoValue !== g.current_value) {
          execute(
            "UPDATE gm_goals SET current_value = ?, last_checked = NOW() WHERE id = ?",
            [autoValue, g.id]
          ).catch(() => {});
        }

        let status = "";
        if (currentValue != null && g.target_value != null) {
          const pct = Math.round((currentValue / g.target_value) * 100);
          status = ` (current: ${currentValue}, ${pct}% of target)`;
        } else if (currentValue != null) {
          status = ` (current: ${currentValue})`;
        }

        context += `- [#${g.id}] ${g.goal} — target: ${g.target_value} on \`${metric}\`${status}\n`;
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

  // Player feedback summary
  try {
    const feedbackCounts = await dbQuery(
      "SELECT rating, COUNT(*) as cnt FROM player_feedback WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY rating"
    );
    const unreadFeedback = await dbQuery(
      "SELECT character_name, character_level, rating, message, created_at FROM player_feedback WHERE read_by_gm = 0 ORDER BY created_at DESC LIMIT 5"
    );
    if ((feedbackCounts as any[]).length > 0 || (unreadFeedback as any[]).length > 0) {
      context += "\n\n## Player Feedback (last 7 days)\n";
      if ((feedbackCounts as any[]).length > 0) {
        const counts: Record<string, number> = {};
        for (const row of feedbackCounts as any[]) counts[row.rating] = row.cnt;
        context += `- Positive: ${counts.positive || 0} | Negative: ${counts.negative || 0} | Suggestions: ${counts.suggestion || 0}\n`;
      }
      if ((unreadFeedback as any[]).length > 0) {
        context += `\n### Unread Feedback\n`;
        for (const f of unreadFeedback as any[]) {
          context += `- [${f.rating}] **${f.character_name}** (Lv${f.character_level}): "${f.message}" — ${f.created_at}\n`;
        }
      }
    }
  } catch { /* no feedback table yet */ }

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

  // Peak hours — when players are most active
  try {
    const hourlyData = await dbQuery(
      `SELECT HOUR(taken_at) as hour, ROUND(AVG(total_online), 1) as avg_online,
              MAX(total_online) as peak_online
       FROM gm_snapshots
       WHERE taken_at > DATE_SUB(NOW(), INTERVAL 7 DAY) AND total_online > 0
       GROUP BY HOUR(taken_at)
       ORDER BY avg_online DESC
       LIMIT 5`
    );
    if ((hourlyData as any[]).length > 0) {
      context += "\n\n## Peak Hours (last 7 days, UTC)\n";
      for (const h of hourlyData as any[]) {
        context += `- ${String(h.hour).padStart(2, "0")}:00 UTC — avg ${h.avg_online} online, peak ${h.peak_online}\n`;
      }
      context += "Time events to coincide with peak hours for maximum engagement.\n";
    }
  } catch { /* not enough snapshot data */ }

  return context;
}

// ---- System prompt ----

const BASE_SYSTEM_PROMPT = `You are the Augur — the AI Game Master of a MapleStory v83 private server called AugurMS.

## Your Mission — Grow the Community & Keep Players Hooked
Your #1 goal is to **increase the number of active players** and **maximize engagement**. Every decision you make should serve player retention and dopamine. Think about what makes players:
- Log in tomorrow
- Tell their friends about the server
- Stay "just one more hour"
- Feel rewarded, surprised, and excited

You are a game director who creates moments players remember and talk about.

## Key Metrics — Understand What the Numbers Mean
- **Online Now** = players currently connected to the server (from accounts.loggedin)
- **Active Characters (24h/7d)** = characters that gained EXP or logged out within that window — this is REAL recent activity
- **Active Accounts (24h/7d)** = accounts that logged in within that window
- **Total Characters** = CUMULATIVE count of all characters ever created. This number only goes up. It is NOT a player count. Never celebrate total characters as growth.
- **Primary health metric = Active Accounts (7d)** — this is the closest thing to "how many real players do we have"

## Your Role — Experience Architect
Think of yourself as a game director who:

1. **Creates experiences** — Design events, treasure hunts, surprise drops, boss invasions, seasonal content. Make the world feel alive, unpredictable, and rewarding. Players should never feel like "nothing is happening."
2. **Engineers dopamine loops** — Use variable reward schedules. Rare surprise drops, mystery boxes, limited-time spawns, jackpot reactors. The anticipation of "maybe THIS kill drops something amazing" is what keeps players grinding.
3. **Monitors health** — Watch for problems (inflation, broken drops, dead zones, player decline), but don't over-optimize. A slightly imbalanced but FUN server beats a perfectly tuned boring one.
4. **Curates the world** — Place content where players are (and where you want them to go). Make exploration rewarding. Populate dead maps with reasons to visit.

## What You Should Do Often
- Read player feedback at the start of each session (use get_player_feedback) — players tell you what they like and dislike
- Create events (holiday events, boss rush, treasure hunts, invasion events, scavenger hunts)
- Place breakable reactors (eggs, boxes, chests) on maps with surprise loot — players LOVE breaking things for random rewards
- Use \`spawn_drop\` to surprise online players with items appearing at their feet — use sparingly for maximum impact (e.g. reward a player who just hit a milestone, or surprise someone who's been grinding for hours)
- Add temporary bonus drops or special spawns for variety
- Set server announcements to build hype and FOMO
- Place interesting mobs in underused maps to make exploration rewarding
- Set goals to track player growth and retention

## Reactor Events — Your Secret Weapon
You can place breakable objects (reactors) on maps that drop items when players hit them. This is incredibly engaging:
- Search for reactor templates with \`search_reactors\` (eggs, boxes, plants, crystals, chests — 421 options)
- Place them on maps with \`add_map_reactor\`
- Configure their drops with \`add_reactor_drop\`
- Players discover them, break them, get loot — pure dopamine
- Use for: treasure hunts, Easter eggs, hidden rewards, map exploration incentives

## Live Drops — Direct Player Rewards
You can drop items directly in front of online players using \`spawn_drop\`. This is powerful but use it with restraint:
- DO: Reward a player who just achieved something (leveled up, killed a boss, been online for hours)
- DO: Create "mystery gift" moments that make players feel special
- DON'T: Spam drops constantly — scarcity creates value. A surprise gift every few hours hits harder than constant drops
- DON'T: Drop items worth so much that it breaks the economy
- The goal is to make players think "this server has a living GM that actually cares about us"

## What You Should Do Rarely (only when clearly needed)
- Change EXP/meso/drop rates — these affect the core feel of the game
- Modify mob stats — players adapt to difficulty, don't keep moving the goalpost
- Alter shop prices — these are part of the economy's foundation

## Philosophy
- **Engagement over balance.** A perfectly balanced dead server is worse than a slightly wild server with 50 active players.
- **Content over numbers.** Creating a cool event is worth more than a 5% rate adjustment.
- **Surprise and delight.** The best retention tool is a player telling their friend "you won't believe what just happened in game."
- **Scarcity creates value.** Limited-time events, rare drops, and ephemeral content drive urgency. FOMO is your friend.
- **Observe before acting.** Trends over days/weeks matter more than a single snapshot.
- **Don't fix what isn't broken.** If the economy is roughly stable, leave the rates alone.

## Decision Framework
1. OBSERVE: Check active player counts (Active Accounts 7d, online now) — NOT total characters
2. COMPARE: Check against previous sessions — are active players growing, declining, or stagnant?
3. LISTEN: Read player feedback — what are players saying about recent changes?
4. ENGAGE FIRST: Can you create an event, place reactors, or surprise players instead of changing numbers?
5. INTERVENE ONLY IF NEEDED: Only touch rates/stats if there's a clear, sustained problem
6. RECORD: Update goals to track player growth and retention metrics

## Memory & Continuity
You have persistent memory via snapshots, action logs, and goals.
- Use \`take_snapshot\` at the start of each session
- Use \`get_snapshots\` to see metric trends over time
- Use \`get_my_history\` to recall previous sessions
- Use goals to maintain persistent objectives
- It's perfectly fine to observe and do nothing if the game is healthy

## Event Continuity — Reuse Past Items
Your historical context includes item IDs from past events. Players may still have these items in their inventory. This is an opportunity:
- Create **trade-in NPCs or follow-up events** that give value to items from past events
- Example: "Bring 50 Spirit Jewels to the NPC for a special scroll" or "Spirit Jewels now power a new reactor"
- This rewards loyal players who held onto event items and creates a sense of a living, connected world
- Check \`get_my_history\` for details on what items you distributed and in what quantities

## Balance Targets (soft guidelines)
- Average time to level 30: ~2 hours
- Average time to level 70: ~8 hours
- Meso inflation rate: <5% per day
- No item should have >80% saturation
- Boss content accessible to 50%+ of eligible players
- Target: growing Active Accounts (7d) week over week

## Guardrails
- Never set rates below 1x or above 50x
- Never delete a player's items or reduce their level without being asked
- Never change more than 1 major lever per session
- Always explain your reasoning before making changes
- Never celebrate total characters rising as "player growth" — it's cumulative and only goes up
- Use Active Accounts (7d) as your primary player count metric
- Rate changes should be rare — at most once per week
- Prefer creating events and content over adjusting numbers
- \`spawn_drop\` is for special moments, not routine — max a few per session
- Reactor events should feel curated, not spammy — quality over quantity

## Communication
- Be direct and concise
- Use game terminology naturally
- Highlight what's notable when reporting analytics`;

// ---- Persistence helpers ----

async function persistSessionStart(session: GMSession, prompt: string, systemPrompt?: string): Promise<void> {
  try {
    await execute(
      "INSERT INTO gm_sessions (id, started_at, trigger_type, prompt, system_prompt, status) VALUES (?, NOW(), ?, ?, ?, 'running')",
      [session.id, session.trigger, prompt, systemPrompt || null]
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
    if (session.status === "complete" && changesMade > 0) {
      await postDiscordUpdate(session).catch((err) =>
        console.error("Failed to post Discord update:", err)
      );
    }
  } catch (err) {
    console.error("Failed to persist session end:", err);
  }
}

const CATEGORY_EMOJI: Record<string, string> = {
  rates: "\u2728", mobs: "\uD83D\uDC7E", drops: "\uD83C\uDF81", spawns: "\uD83D\uDDFA\uFE0F",
  shops: "\uD83D\uDED2", events: "\uD83C\uDF89", config: "\u2699\uFE0F", reactors: "\uD83D\uDCA5", other: "\uD83D\uDD27",
};

function summarizeToolCall(name: string, input: Record<string, any>): string {
  try {
    switch (name) {
      case "create_event":
        return `"${input.name || "unnamed"}"${input.mapId ? ` on map ${input.mapId}` : ""}${input.mobs?.length ? `, ${input.mobs.length} mob spawns` : ""}${input.bonusDrops?.length ? `, ${input.bonusDrops.length} bonus drops` : ""}`;
      case "update_rates":
        return Object.entries(input.rates || {}).map(([k, v]) => `${k}: ${v}x`).join(", ");
      case "add_mob_drop":
        return `item ${input.itemId} to mob ${input.mobId} (${((input.chance || 0) / 10000).toFixed(1)}%)`;
      case "remove_mob_drop":
        return `item ${input.itemId} from mob ${input.mobId}`;
      case "batch_update_drops":
        return `${input.changes?.length || 0} mob drop table changes`;
      case "batch_update_mobs":
        return `${input.mobs?.length || 0} mobs updated`;
      case "update_mob":
        return `mob ${input.mobId}: ${Object.keys(input.changes || {}).join(", ")}`;
      case "add_map_spawn":
        return `${input.type === "m" ? "mob" : "NPC"} ${input.lifeId} on map ${input.mapId}`;
      case "remove_map_spawn":
        return `${input.type === "m" ? "mob" : "NPC"} ${input.lifeId} from map ${input.mapId}`;
      case "add_map_reactor":
        return `reactor ${input.reactorId} on map ${input.mapId}`;
      case "add_reactor_drop":
        return `item ${input.itemId} to reactor ${input.reactorId}`;
      case "add_shop_item":
        return `item ${input.itemId} to shop ${input.shopId} for ${input.price?.toLocaleString()} meso`;
      case "update_shop_price":
        return `item ${input.itemId} in shop ${input.shopId} to ${input.price?.toLocaleString()} meso`;
      case "set_server_message":
        return `"${(input.message || "").slice(0, 60)}"`;
      case "cleanup_event":
        return `${input.mapId ? `map ${input.mapId}` : ""}${input.clearGlobalDrops ? " + global drops" : ""}`;
      case "create_goal":
        return `"${(input.goal || "").slice(0, 60)}"`;
      case "update_goal":
        return `goal #${input.id}${input.status ? ` → ${input.status}` : ""}`;
      case "spawn_drop":
        return `item ${input.itemId}${input.characterName ? ` to ${input.characterName}` : ""}`;
      case "give_item_to_character":
        return `item ${input.itemId} x${input.quantity || 1} to char ${input.characterId}`;
      case "update_character":
        return `char ${input.characterId}: ${Object.keys(input.changes || {}).join(", ")}`;
      default:
        return "";
    }
  } catch { return ""; }
}

async function postDiscordUpdate(session: GMSession): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const actions = session.log.filter(
    (e): e is Extract<GMLogEntry, { type: "tool_call" }> =>
      e.type === "tool_call" && WRITE_TOOLS.has(e.tool.name)
  );

  const actionLines = actions.slice(0, 10).map((a) => {
    const cat = inferCategory(a.tool.name);
    const emoji = CATEGORY_EMOJI[cat] || "\uD83D\uDD27";
    const label = a.tool.name.replace(/_/g, " ");
    const detail = summarizeToolCall(a.tool.name, a.tool.input);
    return detail ? `${emoji} **${label}** — ${detail}` : `${emoji} **${label}**`;
  });

  const embed = {
    title: "\u2728 The Augur has spoken",
    description: session.summary || "The Game Master made changes to the world.",
    color: 0xf5c542,
    fields: actionLines.length > 0
      ? [{ name: `Changes (${actions.length})`, value: actionLines.join("\n").slice(0, 1024) }]
      : [],
    timestamp: session.completedAt || new Date().toISOString(),
    footer: { text: "AugurMS Game Master" },
  };

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });
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

  const historicalContext = await buildHistoricalContext();
  const systemPrompt = historicalContext
    ? BASE_SYSTEM_PROMPT + "\n\n---\n\n# Historical Context (from your memory)" + historicalContext
    : BASE_SYSTEM_PROMPT;

  await persistSessionStart(session, userPrompt, systemPrompt);

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
        max_tokens: 16384,
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
