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
      description: "Get recent game state snapshots with computed deltas between consecutive snapshots. Each snapshot includes: totalMeso, avgMesoPerPlayer, storageMeso, totalItems, totalCharacters, avgLevel, maxLevel, expRate, mesoRate, dropRate. Deltas show: mesoChange (absolute + %), avgLevelChange, itemChange, characterChange.",
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
      description: "Capture a point-in-time snapshot of the game state and save it to the database. Captures: total meso (characters + storage), item count, character count, avg/max level, level/job distributions, account stats, boss kills today, current rates. Use at the start of each session to establish a baseline.",
      parameters: { type: "object", properties: {} },
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
