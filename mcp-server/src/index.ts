#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.COSMIC_DASHBOARD_URL || "http://localhost:3000";

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}

const server = new McpServer({
  name: "cosmic-gamemaster",
  version: "1.0.0",
});

// ============================================================
// ANALYTICS TOOLS — Read game state
// ============================================================

server.tool(
  "get_game_analytics",
  "Get comprehensive analytics about the game: economy (meso circulation, item distribution), progression (level/job distribution), activity (map popularity, boss kills), and server health (rates, warnings). Use section parameter to get specific data.",
  { section: z.enum(["all", "economy", "progression", "activity", "health"]).default("all").describe("Which analytics section to fetch") },
  async ({ section }) => {
    const data = await api(`/api/analytics?section=${section}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ============================================================
// CHARACTER TOOLS
// ============================================================

server.tool(
  "search_characters",
  "Search for characters by name. Returns id, name, level, job, stats, meso, fame, map, gm status.",
  {
    query: z.string().optional().describe("Character name to search for"),
    accountId: z.number().optional().describe("Filter by account ID"),
  },
  async ({ query: q, accountId }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (accountId) params.set("accountId", String(accountId));
    const data = await api(`/api/characters?${params}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_character",
  "Get detailed information about a specific character including all stats, equipment, inventory info.",
  { characterId: z.number().describe("Character ID") },
  async ({ characterId }) => {
    const data = await api(`/api/characters/${characterId}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_character",
  "Update a character's stats. Can change: level, str, dex, luk, maxhp, maxmp, meso, fame, ap, sp, job, map, exp, hp, mp. Changes take effect on relog.",
  {
    characterId: z.number().describe("Character ID"),
    changes: z.record(z.string(), z.number()).describe("Object of stat changes, e.g. { level: 50, meso: 1000000 }"),
  },
  async ({ characterId, changes }) => {
    const data = await api(`/api/characters/${characterId}`, {
      method: "PUT",
      body: JSON.stringify(changes),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "give_item_to_character",
  "Give an item to a character's inventory. The item appears after relog.",
  {
    characterId: z.number().describe("Character ID"),
    itemId: z.number().describe("Item ID from the WZ data"),
    quantity: z.number().default(1).describe("How many to give"),
  },
  async ({ characterId, itemId, quantity }) => {
    const data = await api(`/api/characters/${characterId}/inventory`, {
      method: "POST",
      body: JSON.stringify({ itemId, quantity }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ============================================================
// MOB TOOLS
// ============================================================

server.tool(
  "search_mobs",
  "Search for monsters by name or ID. Returns mob name and ID.",
  { query: z.string().optional().describe("Search by mob name or ID") },
  async ({ query: q }) => {
    const params = q ? `?q=${encodeURIComponent(q)}` : "";
    const data = await api(`/api/mobs${params}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data.slice(0, 50), null, 2) }] };
  }
);

server.tool(
  "get_mob",
  "Get detailed stats for a specific mob: level, HP, MP, EXP, damage, defense, accuracy, evasion, speed, boss/undead flags.",
  { mobId: z.number().describe("Mob ID") },
  async ({ mobId }) => {
    const data = await api(`/api/mobs/${mobId}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_mob",
  "Update a single mob's stats. Can change: level, maxHP, maxMP, exp, PADamage, MADamage, PDDamage, MDDamage, acc, eva, speed, boss, undead, bodyAttack, pushed.",
  {
    mobId: z.number().describe("Mob ID"),
    changes: z.record(z.string(), z.number()).describe("Stats to change, e.g. { maxHP: 5000, exp: 200 }"),
  },
  async ({ mobId, changes }) => {
    const data = await api(`/api/mobs/${mobId}`, {
      method: "PUT",
      body: JSON.stringify(changes),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "batch_update_mobs",
  "Update multiple mobs at once (max 50). Use for zone-wide rebalancing. Each entry needs a mob id and a changes object.",
  {
    mobs: z.array(z.object({
      id: z.number().describe("Mob ID"),
      changes: z.record(z.string(), z.number()).describe("Stats to change"),
    })).describe("Array of mob updates"),
  },
  async ({ mobs }) => {
    const data = await api("/api/gm/mob-batch", {
      method: "PUT",
      body: JSON.stringify({ mobs }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ============================================================
// ITEM TOOLS
// ============================================================

server.tool(
  "search_items",
  "Search for items by name or ID. Can filter by category: equip, consume, etc, cash.",
  {
    query: z.string().optional().describe("Search by item name or ID"),
    category: z.enum(["all", "equip", "consume", "etc", "cash"]).default("all").describe("Item category filter"),
  },
  async ({ query: q, category }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category !== "all") params.set("category", category);
    const data = await api(`/api/items?${params}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data.slice(0, 50), null, 2) }] };
  }
);

server.tool(
  "get_item",
  "Get detailed information about a specific item: name, description, category, and all stats (requirements, bonuses, properties).",
  { itemId: z.number().describe("Item ID") },
  async ({ itemId }) => {
    const data = await api(`/api/items/${itemId}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ============================================================
// DROP TABLE TOOLS
// ============================================================

server.tool(
  "get_mob_drops",
  "Get the drop table for a specific mob. Shows all items it can drop with chances (out of 1,000,000), quantities, and quest requirements.",
  { mobId: z.number().describe("Mob ID") },
  async ({ mobId }) => {
    const data = await api(`/api/drops/${mobId}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "add_mob_drop",
  "Add an item to a mob's drop table.",
  {
    mobId: z.number().describe("Mob ID"),
    itemId: z.number().describe("Item ID to drop"),
    chance: z.number().describe("Drop chance out of 1,000,000 (e.g. 100000 = 10%)"),
    minQuantity: z.number().default(1).describe("Minimum drop quantity"),
    maxQuantity: z.number().default(1).describe("Maximum drop quantity"),
    questId: z.number().default(0).describe("Quest ID requirement (0 = no quest required)"),
  },
  async ({ mobId, itemId, chance, minQuantity, maxQuantity, questId }) => {
    const data = await api(`/api/drops/${mobId}`, {
      method: "POST",
      body: JSON.stringify({ itemId, chance, minQuantity, maxQuantity, questId }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "remove_mob_drop",
  "Remove an item from a mob's drop table.",
  {
    mobId: z.number().describe("Mob ID"),
    itemId: z.number().describe("Item ID to remove from drops"),
  },
  async ({ mobId, itemId }) => {
    const data = await api(`/api/drops/${mobId}`, {
      method: "DELETE",
      body: JSON.stringify({ itemId }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "batch_update_drops",
  "Bulk update drop tables for multiple mobs. Each change can add, remove, or update drops. Max 100 operations.",
  {
    changes: z.array(z.object({
      mobId: z.number().describe("Mob ID"),
      add: z.array(z.object({
        itemId: z.number(),
        chance: z.number().optional(),
        minQuantity: z.number().optional(),
        maxQuantity: z.number().optional(),
      })).optional().describe("Items to add to drop table"),
      remove: z.array(z.object({ itemId: z.number() })).optional().describe("Items to remove from drop table"),
      update: z.array(z.object({
        itemId: z.number(),
        chance: z.number().optional(),
        minQuantity: z.number().optional(),
        maxQuantity: z.number().optional(),
      })).optional().describe("Items to update in drop table"),
    })).describe("Array of drop table changes"),
  },
  async ({ changes }) => {
    const data = await api("/api/gm/drops-batch", {
      method: "PUT",
      body: JSON.stringify({ changes }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ============================================================
// MAP TOOLS
// ============================================================

server.tool(
  "search_maps",
  "Search for maps by name, street name, or ID.",
  { query: z.string().describe("Search query for map name or ID") },
  async ({ query: q }) => {
    const data = await api(`/api/maps?q=${encodeURIComponent(q)}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data.slice(0, 30), null, 2) }] };
  }
);

server.tool(
  "get_map",
  "Get detailed map data: info, spawns (life), portals, footholds. Shows which mobs and NPCs are on the map.",
  { mapId: z.number().describe("Map ID") },
  async ({ mapId }) => {
    const data = await api(`/api/maps/${mapId}`);
    // Trim footholds to save context (they're huge)
    if (data.footholds) {
      const fhCount = Object.values(data.footholds).reduce(
        (sum: number, layer: any) => sum + Object.values(layer).reduce(
          (s: number, group: any) => s + (Array.isArray(group) ? group.length : 0), 0
        ), 0
      );
      data._footholdCount = fhCount;
      delete data.footholds;
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "add_map_spawn",
  "Add a mob or NPC spawn to a map.",
  {
    mapId: z.number().describe("Map ID"),
    type: z.enum(["m", "n"]).describe("'m' for mob, 'n' for NPC"),
    lifeId: z.number().describe("Mob or NPC ID"),
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
    fh: z.number().optional().describe("Foothold ID (optional)"),
  },
  async ({ mapId, type, lifeId, x, y, fh }) => {
    const data = await api(`/api/maps/${mapId}/spawns`, {
      method: "POST",
      body: JSON.stringify({ type, id: lifeId, x, y, fh }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "remove_map_spawn",
  "Remove a mob or NPC spawn from a map.",
  {
    mapId: z.number().describe("Map ID"),
    type: z.enum(["m", "n"]).describe("'m' for mob, 'n' for NPC"),
    lifeId: z.number().describe("Mob or NPC ID to remove"),
  },
  async ({ mapId, type, lifeId }) => {
    const data = await api(`/api/maps/${mapId}/spawns`, {
      method: "DELETE",
      body: JSON.stringify({ type, id: lifeId }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ============================================================
// SHOP TOOLS
// ============================================================

server.tool(
  "get_shop_items",
  "Get all items sold by a specific NPC shop, including prices.",
  { shopId: z.number().describe("Shop ID (from shops table)") },
  async ({ shopId }) => {
    const data = await api(`/api/gm/shops/${shopId}/items`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "add_shop_item",
  "Add an item to an NPC shop.",
  {
    shopId: z.number().describe("Shop ID"),
    itemId: z.number().describe("Item ID to sell"),
    price: z.number().describe("Meso price"),
  },
  async ({ shopId, itemId, price }) => {
    const data = await api(`/api/gm/shops/${shopId}/items`, {
      method: "POST",
      body: JSON.stringify({ itemId, price }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_shop_price",
  "Change the price of an item in an NPC shop.",
  {
    shopId: z.number().describe("Shop ID"),
    itemId: z.number().describe("Item ID"),
    price: z.number().describe("New meso price"),
  },
  async ({ shopId, itemId, price }) => {
    const data = await api(`/api/gm/shops/${shopId}/items`, {
      method: "PUT",
      body: JSON.stringify({ itemId, price }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "remove_shop_item",
  "Remove an item from an NPC shop.",
  {
    shopId: z.number().describe("Shop ID"),
    itemId: z.number().describe("Item ID to remove"),
  },
  async ({ shopId, itemId }) => {
    const data = await api(`/api/gm/shops/${shopId}/items`, {
      method: "DELETE",
      body: JSON.stringify({ itemId }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ============================================================
// RATES & CONFIG TOOLS
// ============================================================

server.tool(
  "get_rates",
  "Get current server rates: EXP, meso, drop, boss drop, quest, fishing, travel, and other rate settings.",
  {},
  async () => {
    const data = await api("/api/gm/rates");
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_rates",
  "Update server rates. Rates must be between 1 and 50. Requires server restart to take effect. Available: exp_rate, meso_rate, drop_rate, boss_drop_rate, quest_rate, fishing_rate, travel_rate, EQUIP_EXP_RATE, PQ_BONUS_EXP_RATE, PARTY_BONUS_EXP_RATE, RESPAWN_INTERVAL, SCROLL_CHANCE_ROLLS, CHSCROLL_STAT_RANGE.",
  {
    rates: z.record(z.string(), z.number()).describe("Rate changes, e.g. { exp_rate: 15, drop_rate: 12 }"),
    world: z.number().default(0).describe("World index to update (default: 0)"),
  },
  async ({ rates, world }) => {
    const data = await api("/api/gm/rates", {
      method: "PUT",
      body: JSON.stringify({ ...rates, world }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_config",
  "Get the full server configuration as JSON. Contains all 450+ settings including world properties, server flags, gameplay settings, etc.",
  {},
  async () => {
    const data = await api("/api/config");
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_config",
  "Update a specific server config value using dot-path notation. Example paths: 'worlds.0.channels', 'server.USE_AUTOBAN', 'server.ITEM_EXPIRE_TIME'.",
  {
    path: z.string().describe("Dot-notation path to the config value"),
    value: z.union([z.string(), z.number(), z.boolean()]).describe("New value"),
  },
  async ({ path, value }) => {
    const data = await api("/api/config", {
      method: "PUT",
      body: JSON.stringify({ path, value }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ============================================================
// NPC SCRIPT TOOLS
// ============================================================

server.tool(
  "list_scripts",
  "List available NPC/event/portal scripts. Types: npc, event, portal, quest, map, reactor, item.",
  {
    type: z.enum(["npc", "event", "portal", "quest", "map", "reactor", "item"]).default("npc").describe("Script type"),
    filter: z.string().optional().describe("Filter script names"),
  },
  async ({ type, filter }) => {
    const params = new URLSearchParams({ type });
    if (filter) params.set("filter", filter);
    const data = await api(`/api/scripts?${params}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_script",
  "Read the source code of an NPC or event script.",
  {
    type: z.enum(["npc", "event", "portal", "quest", "map", "reactor", "item"]).describe("Script type"),
    name: z.string().describe("Script name/ID (without .js extension)"),
  },
  async ({ type, name }) => {
    const data = await api(`/api/scripts/${type}/${name}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_script",
  "Update an existing NPC or event script with new JavaScript code. The script runs server-side when players interact with the NPC.",
  {
    type: z.enum(["npc", "event", "portal", "quest", "map", "reactor", "item"]).describe("Script type"),
    name: z.string().describe("Script name/ID"),
    content: z.string().describe("Full JavaScript source code for the script"),
  },
  async ({ type, name, content }) => {
    const data = await api(`/api/scripts/${type}/${name}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "create_script",
  "Create a new NPC or event script. Use for custom NPCs, events, or quest logic.",
  {
    type: z.enum(["npc", "event", "portal", "quest", "map", "reactor", "item"]).describe("Script type"),
    name: z.string().describe("Script name/ID"),
    content: z.string().describe("Full JavaScript source code"),
  },
  async ({ type, name, content }) => {
    const data = await api(`/api/scripts/${type}/${name}`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ============================================================
// EVENT TOOLS
// ============================================================

server.tool(
  "create_event",
  "Create a dynamic in-game event: spawn mobs on maps, add bonus drops, set announcements. Spawns go into the plife table (requires restart). Drop changes are live.",
  {
    name: z.string().describe("Event name"),
    mapId: z.number().optional().describe("Map to spawn mobs on"),
    mobs: z.array(z.object({
      id: z.number().describe("Mob ID"),
      count: z.number().default(1).describe("How many to spawn"),
      x: z.number().default(0).describe("X position"),
      y: z.number().default(0).describe("Y position"),
      mobtime: z.number().default(0).describe("Respawn time in ms (0=default)"),
    })).optional().describe("Mobs to spawn"),
    bonusDrops: z.array(z.object({
      mobId: z.number().optional().describe("Specific mob (omit for global drop from all mobs)"),
      itemId: z.number().describe("Item to drop"),
      chance: z.number().default(100000).describe("Chance out of 1,000,000"),
      minQuantity: z.number().default(1),
      maxQuantity: z.number().default(1),
    })).optional().describe("Bonus drops to add"),
    announcement: z.string().optional().describe("Server announcement message"),
  },
  async ({ name, mapId, mobs, bonusDrops, announcement }) => {
    const data = await api("/api/gm/event", {
      method: "POST",
      body: JSON.stringify({ name, mapId, mobs, bonusDrops, announcement }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_active_events",
  "List active custom spawns and global event drops.",
  {},
  async () => {
    const data = await api("/api/gm/event");
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "cleanup_event",
  "Remove custom event spawns and/or global event drops.",
  {
    mapId: z.number().optional().describe("Map ID to remove spawns from"),
    mobId: z.number().optional().describe("Specific mob ID to remove (with mapId)"),
    clearGlobalDrops: z.boolean().default(false).describe("Remove all event-tagged global drops"),
  },
  async ({ mapId, mobId, clearGlobalDrops }) => {
    const data = await api("/api/gm/event", {
      method: "DELETE",
      body: JSON.stringify({ mapId, mobId, clearGlobalDrops }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ============================================================
// SERVER TOOLS
// ============================================================

server.tool(
  "get_server_status",
  "Check if the game server and database are running.",
  {},
  async () => {
    const data = await api("/api/server");
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_server_logs",
  "Read recent server logs. Useful for monitoring player activity, errors, and game events.",
  {
    lines: z.number().default(100).describe("Number of log lines (1-5000)"),
    service: z.enum(["maplestory", "db", ""]).default("maplestory").describe("Which service logs to read"),
  },
  async ({ lines, service }) => {
    const params = new URLSearchParams({ lines: String(lines) });
    if (service) params.set("service", service);
    const data = await api(`/api/server/logs?${params}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "restart_server",
  "Restart the game server. Required after config/rate changes. Players will be disconnected.",
  {},
  async () => {
    const data = await api("/api/server", {
      method: "POST",
      body: JSON.stringify({ action: "restart" }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ============================================================
// ACCOUNTS TOOLS
// ============================================================

server.tool(
  "list_accounts",
  "List all player accounts with ban status.",
  {},
  async () => {
    const data = await api("/api/accounts");
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ============================================================
// ANNOUNCEMENT TOOL
// ============================================================

server.tool(
  "set_server_message",
  "Set the server announcement message shown on channel select screen.",
  {
    message: z.string().describe("The announcement message"),
    world: z.number().default(0).describe("World index (default: 0)"),
  },
  async ({ message, world }) => {
    const data = await api("/api/gm/announce", {
      method: "POST",
      body: JSON.stringify({ message, world }),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ============================================================
// Start the server
// ============================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Cosmic Game Master MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
