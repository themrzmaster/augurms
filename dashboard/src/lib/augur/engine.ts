import OpenAI from "openai";
import { query as dbQuery } from "@/lib/db";

const BASE = process.env.COSMIC_DASHBOARD_URL || "http://localhost:3000";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

async function api(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

// ---- Read-only tool handlers ----

const toolHandlers: Record<string, (args: any) => Promise<string>> = {
  search_items: async ({ query, category }) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (category && category !== "all") params.set("category", category);
    const data = await api(`/api/items?${params}`);
    return JSON.stringify(Array.isArray(data) ? data.slice(0, 30) : data);
  },

  get_item: async ({ itemId }) =>
    JSON.stringify(await api(`/api/items/${itemId}`)),

  search_mobs: async ({ query }) => {
    const data = await api(`/api/mobs${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    return JSON.stringify(Array.isArray(data) ? data.slice(0, 30) : data);
  },

  get_mob: async ({ mobId }) =>
    JSON.stringify(await api(`/api/mobs/${mobId}`)),

  get_mob_drops: async ({ mobId }) =>
    JSON.stringify(await api(`/api/drops/${mobId}`)),

  search_maps: async ({ query }) =>
    JSON.stringify(await api(`/api/maps?q=${encodeURIComponent(query)}`)),

  get_map: async ({ mapId }) => {
    const data = await api(`/api/maps/${mapId}`);
    if (data.footholds) delete data.footholds;
    return JSON.stringify(data);
  },

  search_characters: async ({ query }) =>
    JSON.stringify(await api(`/api/characters${query ? `?q=${encodeURIComponent(query)}` : ""}`)),

  get_server_status: async () =>
    JSON.stringify(await api("/api/server")),

  get_rates: async () =>
    JSON.stringify(await api("/api/gm/rates")),

  get_game_analytics: async ({ section }) =>
    JSON.stringify(await api(`/api/analytics?section=${section}`)),

  get_active_events: async () => {
    const data = await api("/api/gm/event");
    return JSON.stringify({
      trackedEvents: data.trackedEvents || [],
      customSpawns: (data.customSpawns || []).slice(0, 20),
      globalDrops: (data.globalDrops || []).slice(0, 20),
    });
  },

  search_reactors: async ({ query }) => {
    const params = query ? `?q=${encodeURIComponent(query)}` : "";
    const data = await api(`/api/reactors${params}`);
    const visible = (Array.isArray(data) ? data : []).filter((r: any) => r.visible);
    return JSON.stringify(visible.slice(0, 20));
  },

  get_map_reactors: async ({ mapId }) =>
    JSON.stringify(await api(`/api/maps/${mapId}/reactors`)),

  get_reactor_drops: async ({ reactorId }) =>
    JSON.stringify(await api(`/api/gm/reactordrops/${reactorId}`)),
};

// ---- Read-only tool schemas ----

const toolSchemas: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_items",
      description: "Search items by name. Returns id, name, category.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Item name to search" },
          category: { type: "string", enum: ["all", "equip", "consume", "etc", "cash"], description: "Filter by category" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_item",
      description: "Get full item details: name, description, stats, category.",
      parameters: { type: "object", properties: { itemId: { type: "number" } }, required: ["itemId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_mobs",
      description: "Search monsters by name or ID.",
      parameters: { type: "object", properties: { query: { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_mob",
      description: "Get full mob stats: level, HP, exp, damage.",
      parameters: { type: "object", properties: { mobId: { type: "number" } }, required: ["mobId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_mob_drops",
      description: "Get a mob's drop table.",
      parameters: { type: "object", properties: { mobId: { type: "number" } }, required: ["mobId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_maps",
      description: "Search maps by name or ID.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_map",
      description: "Get map details: name, mob/NPC spawns, portals.",
      parameters: { type: "object", properties: { mapId: { type: "number" } }, required: ["mapId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_characters",
      description: "Search characters by name.",
      parameters: { type: "object", properties: { query: { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_server_status",
      description: "Get server status: online players, uptime.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_rates",
      description: "Get current server rates (EXP, meso, drop).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_game_analytics",
      description: "Get game analytics: economy, progression, activity.",
      parameters: {
        type: "object",
        properties: { section: { type: "string", enum: ["all", "economy", "progression", "activity", "health"] } },
        required: ["section"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_active_events",
      description: "Get currently active server events: custom mob/NPC spawns, global bonus drops, treasure hunts, and tracked events with expiry times.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "search_reactors",
      description: "Search for reactors (breakable objects) by name or ID. Returns visible reactors only.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Reactor name to search" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_map_reactors",
      description: "Get reactors placed on a specific map.",
      parameters: { type: "object", properties: { mapId: { type: "number" } }, required: ["mapId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_reactor_drops",
      description: "Get what items drop from a specific reactor when broken.",
      parameters: { type: "object", properties: { reactorId: { type: "number" } }, required: ["reactorId"] },
    },
  },
];

// ---- Config ----

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

async function getConfig(): Promise<AugurConfig> {
  const rows = await dbQuery<AugurConfig>("SELECT * FROM augur_config WHERE id = 1");
  if (rows.length === 0) throw new Error("Augur config not found. Run migration 008.");
  return rows[0];
}

// ---- Main Chat Function ----

export async function runAugurChat(
  characterId: number,
  characterName: string,
  characterLevel: number,
  message: string,
): Promise<{ text: string; toolCalls?: any[] }> {
  const config = await getConfig();

  if (!config.enabled) {
    return { text: "The Augur's crystal has gone dark... Come back another time." };
  }

  // Rate limit check
  const [{ cnt }] = await dbQuery<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM augur_chat_logs
     WHERE character_id = ? AND role = 'user'
     AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)`,
    [characterId],
  );

  if (cnt >= config.max_messages_per_day) {
    return {
      text: `The stars grow dim... I have shared all the wisdom I can for today. Return tomorrow, ${characterName}.`,
    };
  }

  // Load recent conversation history (last 10 messages from today)
  const history = await dbQuery<{ role: string; content: string }>(
    `SELECT role, content FROM augur_chat_logs
     WHERE character_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
     ORDER BY created_at DESC LIMIT 10`,
    [characterId],
  );
  history.reverse();

  // Build messages
  const systemPrompt = config.system_prompt +
    `\n\nThe player talking to you is: ${characterName} (Level ${characterLevel}).` +
    `\nThey have ${config.max_messages_per_day - cnt - 1} questions remaining today.`;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((h) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    })),
    { role: "user", content: message },
  ];

  const tools = config.tools_enabled ? toolSchemas : undefined;
  const allToolCalls: any[] = [];

  // Tool loop (max 5 iterations)
  for (let i = 0; i < 5; i++) {
    const completion = await openrouter.chat.completions.create({
      model: config.model,
      messages,
      tools,
      max_tokens: config.max_tokens_per_response,
      temperature: 0.7,
    });

    const choice = completion.choices[0];
    if (!choice) break;

    const msg = choice.message;

    // If no tool calls, return the text
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const text = msg.content || "The stars are unclear...";
      // Strip any markdown/emoji that slipped through
      const clean = text.replace(/[*#`_~]/g, "").replace(/\p{Emoji_Presentation}/gu, "").trim();
      return { text: clean, toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined };
    }

    // Process tool calls
    messages.push(msg as any);
    for (const tc of msg.tool_calls) {
      const fn = (tc as any).function;
      if (!fn) continue;
      const handler = toolHandlers[fn.name];
      let result: string;
      try {
        const args = JSON.parse(fn.arguments);
        result = handler ? await handler(args) : JSON.stringify({ error: "Unknown tool" });
      } catch (e: any) {
        result = JSON.stringify({ error: e.message });
      }

      allToolCalls.push({
        tool: fn.name,
        args: fn.arguments,
        result: result.substring(0, 500),
      });

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result,
      } as any);
    }
  }

  return { text: "The visions have faded... Try asking again.", toolCalls: allToolCalls };
}
