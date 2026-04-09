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

  // ---- Dynamic server knowledge tools ----

  get_server_config: async () => {
    const config = await api("/api/config");
    if (config.error) return JSON.stringify({ error: "Could not read server config: " + config.error });
    const world0 = config.worlds?.[0] || {};
    const s = config.server || {};
    return JSON.stringify({
      rates: {
        exp: world0.exp_rate, meso: world0.meso_rate, drop: world0.drop_rate,
        bossDrop: world0.boss_drop_rate, quest: world0.quest_rate,
        pqBonus: s.PQ_BONUS_EXP_RATE, partyBonus: s.PARTY_BONUS_EXP_RATE,
        equipExp: s.EQUIP_EXP_RATE,
      },
      hpMpSystem: {
        bonusHpPerLevel: s.BONUS_HP_PER_LEVEL,
        randomizeHpMpGain: s.USE_RANDOMIZE_HPMP_GAIN,
        fixedRatioHpMpUpdate: s.USE_FIXED_RATIO_HPMP_UPDATE,
        enforceHpMpSwap: s.USE_ENFORCE_HPMP_SWAP,
      },
      scrolling: {
        scrollChanceRolls: s.SCROLL_CHANCE_ROLLS,
        chaosScrollStatRange: s.CHSCROLL_STAT_RANGE,
        chaosScrollStatRate: s.CHSCROLL_STAT_RATE,
        perfectGmScroll: s.USE_PERFECT_GM_SCROLL,
        perfectScrolling: s.USE_PERFECT_SCROLLING,
        enhancedChaosScroll: s.USE_ENHANCED_CHSCROLL,
      },
      gameplay: {
        autoRegister: s.AUTOMATIC_REGISTER,
        picEnabled: s.ENABLE_PIC,
        pinEnabled: s.ENABLE_PIN,
        familySystem: s.USE_FAMILY_SYSTEM,
        cpq: s.USE_CPQ,
        mts: s.USE_MTS,
        duey: s.USE_DUEY,
        autoAssignStarterAP: s.USE_AUTOASSIGN_STARTERS_AP,
        maxAP: s.MAX_AP,
        serverMessage: world0.server_message,
      },
      economy: {
        createGuildCost: s.CREATE_GUILD_COST,
        changeEmblemCost: s.CHANGE_EMBLEM_COST,
        respawnInterval: s.RESPAWN_INTERVAL,
        itemExpireTime: s.ITEM_EXPIRE_TIME,
      },
    });
  },

  get_gm_activity: async () => {
    const data = await api("/api/gm/history?type=all&limit=5");
    if (data.error) return JSON.stringify({ error: "Could not read GM activity: " + data.error });
    const sessions = ((data.sessions || []) as any[]).map((s: any) => ({
      date: s.startedAt, trigger: s.trigger, summary: s.summary,
      status: s.status, changes: s.changesMade,
    }));
    const actions = ((data.actions || []) as any[]).slice(0, 15).map((a: any) => ({
      date: a.executedAt, tool: a.toolName, category: a.category,
      input: typeof a.toolInput === 'string' ? a.toolInput.substring(0, 200) : JSON.stringify(a.toolInput).substring(0, 200),
    }));
    return JSON.stringify({ recentSessions: sessions, recentActions: actions });
  },

  get_game_guide: async ({ topic }) => {
    const guides: Record<string, string> = {
      hp_washing: [
        "HP WASHING ON AUGURMS:",
        "HP washing is NOT needed on AugurMS. The server has a built-in bonus HP system.",
        "Config: BONUS_HP_PER_LEVEL grants extra HP every level. ALWAYS call get_server_config to check the current value.",
        "Players use the @recalchp command to claim their accumulated bonus HP.",
        "Formula: totalBonusHP = (level - 1) * BONUS_HP_PER_LEVEL. The command calculates what's owed and grants the difference.",
        "",
        "BASE HP GAIN PER LEVEL (when adding AP to HP, with USE_RANDOMIZE_HPMP_GAIN=true):",
        "  Warrior/Dawn Warrior: +18-22 HP (20 if AP reset)",
        "  Aran: +26-30 HP (20 if AP reset)",
        "  Magician/Blaze Wizard: +5-9 HP (6 if AP reset)",
        "  Thief/Night Walker: +14-18 HP (16 if AP reset)",
        "  Bowman/Wind Archer: +14-18 HP (16 if AP reset)",
        "  Pirate/Thunder Breaker: +16-20 HP (18 if AP reset) + Improve Max HP skill bonus",
        "  Beginner: +8-12 HP (8 if AP reset)",
        "",
        "HOW TO REACH 30K HP (example for Warrior):",
        "  1. Base HP from leveling: ~4000 HP at lv200 (20 HP per AP into HP x 199 levels, plus starting HP)",
        "  2. @recalchp bonus: (level-1) * BONUS_HP_PER_LEVEL (call get_server_config for exact value)",
        "  3. Hyper Body skill: +60% max HP (multiplicative with total)",
        "  4. HP equipment: Zakum Helmet, HTP, scrolled gear",
        "  5. Total with HB: (base + bonus + equip HP) * 1.6",
        "  No INT allocation or AP reset washing needed -- just level up, @recalchp, and gear up.",
      ].join("\n"),

      class_stats: [
        "CLASS STAT FORMULAS (per level-up AP into HP/MP):",
        "",
        "HP PER AP (with randomization):",
        "  Warrior/Dawn Warrior: 18-22 (fixed: 20)",
        "  Aran: 26-30 (fixed: 28)",
        "  Magician/Blaze Wizard: 5-9 (fixed: 6)",
        "  Thief/Night Walker: 14-18 (fixed: 16)",
        "  Bowman/Wind Archer: 14-18 (fixed: 16)",
        "  Pirate/Thunder Breaker: 16-20 (fixed: 18) + Improve Max HP skill",
        "  Beginner: 8-12 (fixed: 10)",
        "",
        "MP PER AP (with randomization):",
        "  Warrior/Dawn Warrior/Aran: 2-4 + INT/10 (fixed: 3)",
        "  Magician/Blaze Wizard: 12-16 + INT/20 (fixed: 18) + Improved MP Increase skill",
        "  Thief/Night Walker: 6-8 + INT/10 (fixed: 10)",
        "  Bowman/Wind Archer: 6-8 + INT/10 (fixed: 10)",
        "  Pirate/Thunder Breaker: 7-9 + INT/10 (fixed: 14)",
        "  Beginner: 4-6 + INT/10 (fixed: 6)",
        "",
        "PRIMARY STATS BY JOB:",
        "  Warrior: STR primary, DEX secondary",
        "  Magician: INT primary, LUK secondary (LUK cap: level+3)",
        "  Bowman: DEX primary, STR secondary",
        "  Thief: LUK primary, DEX secondary",
        "  Pirate (Brawler): STR primary, DEX secondary",
        "  Pirate (Gunslinger): DEX primary, STR secondary",
      ].join("\n"),

      commands: [
        "PLAYER COMMANDS (type @ followed by the command in chat):",
        "  @help / @commands - Show all available commands",
        "  @recalchp - Recalculate HP with bonus (no HP washing needed!)",
        "  @rates / @showrates - Show current server rates",
        "  @online - Show all online players",
        "  @time - Show server time",
        "  @uptime - Show server uptime",
        "  @points - Show your vote/NX/reward points",
        "  @str / @dex / @int / @luk <amount> - Assign AP to a stat",
        "  @dispose - Fix NPC chat if stuck",
        "  @gacha - Show gachapon rewards",
        "  @ranks - Show player rankings",
        "  @whatdropsfrom <mob name> - Show drops from a monster",
        "  @whodrops <item name> - Show which mobs drop an item",
        "  @joinevent / @leaveevent - Join or leave active events",
        "  @gm <message> - Send a message to GMs",
        "  @feedback <positive/negative/suggestion> <message> - Send feedback to the AI Game Master",
        "  @w / @world <message> - Send message to all players in the world",
        "  @bosshp / @mobhp - Show boss/mob HP",
        "  @equiplv - Show levels of equipped items",
        "  @toggleexp - Toggle EXP gain on/off",
        "  @reportbug <description> - Report a bug",
        "  @droplimit - Check drop limit on current map",
        "  @enableauth - Reset PIC cooldown",
        "  @changel - Change language settings",
        "  @mylawn - Claim map ownership",
        "  @credits - Show server credits",
      ].join("\n"),

      training: [
        "TRAINING GUIDE (use get_rates to check current multipliers):",
        "  Lv1-10: Maple Island quests, Snails, Blue Snails, Shrooms",
        "  Lv10-20: Henesys Hunting Ground, Kerning City subway, Slime Tree",
        "  Lv20-30: Kerning PQ (21+), Ant Tunnel, Mushroom Kingdom quests",
        "  Lv30-40: Ludibrium PQ (35+), Mushroom Kingdom, Wild Boars",
        "  Lv40-50: Orbis PQ, Ludibrium Toy Factory, Scarecrows",
        "  Lv50-60: Ludi Maze PQ, Monster Carnival (30-50), Jr. Yetis",
        "  Lv60-70: Pirate PQ, Wolf Spiders, Windraiders",
        "  Lv70-85: Magatia quests, Galloperas, Ghost Pirates",
        "  Lv85-100: Haunted Mansion, Spirit Vikings, Petrifighters",
        "  Lv100-120: Leafre (Skelegons, Skelosaurus), Temple of Time quests",
        "  Lv120-140: Skelegons, Nest of a Dead Dragon, Newties",
        "  Lv140-170: Temple of Time mobs (Memory Monks, Oblivion Monks)",
        "  Lv170-200: Showa bosses, Pink Bean prep, Horntail runs",
        "",
        "PARTY QUESTS (great EXP + fun):",
        "  Henesys PQ: Lv10-200 (easy, good for beginners)",
        "  Kerning PQ: Lv21-200",
        "  Ludibrium PQ: Lv35-200",
        "  Orbis PQ: Lv51-200",
        "  Pirate PQ (Herb Town): Lv55-200",
        "  Monster Carnival: Lv30-50 / Lv51-100",
        "  Zakum: Lv50+ (need Eye of Fire quest)",
        "  Horntail: Lv130+ (expedition)",
        "  Pink Bean: Lv170+ (hardest boss)",
      ].join("\n"),

      bosses: [
        "BOSS GUIDE:",
        "  Stumpy: Lv30+ field boss, spawns in Perion",
        "  King Slime: Orbis PQ boss or random spawn",
        "  Mushmom: Lv40+, spawns in Henesys area maps",
        "  Blue Mushmom: Lv50+, spawns in Aqua Road",
        "  Zombie Mushmom: Lv55+, spawns at Haunted Mansion",
        "  Crimson Balrog: Lv70+, appears on boat rides",
        "  Papulatus: Lv80+, Ludibrium Clocktower (party recommended)",
        "  Pianus: Lv90+, Aqua Road deep sea (party recommended)",
        "  Zakum: Lv50+ (realistically 100+), El Nath mines, need Eye of Fire, expedition 6-30 people",
        "  Horntail: Lv130+, Cave of Life expedition, prequest required, 6-30 people",
        "  Pink Bean: Lv170+, Temple of Time, hardest boss, long prequest chain",
        "",
        "Boss drops include rare equips, skill books, chairs, and valuable ETC items.",
        "Use @whatdropsfrom or ask me to look up specific boss drops.",
      ].join("\n"),

      scrolling: [
        "SCROLLING & EQUIPMENT ENHANCEMENT:",
        "  Scrolls come in different success rates: 10%, 30%, 60%, 70%, 100%",
        "  Lower % scrolls give better stats but higher chance of failure",
        "  Failed scrolls can destroy the item (except clean slate scrolls)",
        "  Chaos scrolls add random stats (+/- range from server config, check get_server_config)",
        "  White scrolls protect the slot on failure (does not prevent boom)",
        "  Clean Slate scrolls restore failed slots",
        "  Equipment has limited scroll slots (usually 5-7)",
        "  Scroll chance rolls and chaos scroll range are configurable (use get_server_config)",
        "",
        "EQUIPMENT LEVELS:",
        "  Equips gain EXP when you kill mobs while wearing them",
        "  Every few equipment levels, the item gains bonus stats",
        "  Use @equiplv to check your equipment levels",
      ].join("\n"),

      economy: [
        "ECONOMY & CURRENCY:",
        "  Meso: Main currency, dropped by mobs, used for shops/trading/guild creation",
        "  NX (NX Cash/NX Credit): Premium currency for Cash Shop cosmetics, pets, megaphones",
        "    - NX Card 100 (ID 4031865): drops from mobs, auto-converts to NX on pickup",
        "    - NX Card 250 (ID 4031866): rarer mob drop, also auto-converts",
        "    - Cash Shop button ($) in-game to spend NX",
        "  Vote Points: Earned by voting for the server on ranking sites",
        "    - Check with @points command",
        "    - Spend at vote point shop NPCs (look for custom NPCs in towns)",
        "    - Voting daily helps the server grow AND gets you rewards",
        "",
        "  Guild creation cost, rates, and other economy settings can be checked with get_server_config.",
        "  Check get_active_events for any current bonus drop events or special shops.",
      ].join("\n"),

      job_advancement: [
        "JOB ADVANCEMENT GUIDE:",
        "  1st Job (Lv10): Choose your class path",
        "    - Warrior (Perion), Magician (Ellinia, Lv8), Bowman (Henesys), Thief (Kerning City), Pirate (Nautilus Harbor)",
        "  2nd Job (Lv30): Specialize within your class",
        "    - Warrior: Fighter, Page, or Spearman",
        "    - Magician: Wizard (Fire/Poison) or Wizard (Ice/Lightning) or Cleric",
        "    - Bowman: Hunter or Crossbowman",
        "    - Thief: Assassin or Bandit",
        "    - Pirate: Brawler or Gunslinger",
        "  3rd Job (Lv70): Talk to your job instructor, complete trials in El Nath",
        "  4th Job (Lv120): Talk to your instructor, collect skill books for new skills",
        "",
        "CYGNUS KNIGHTS (Lv10-120 cap):",
        "  Dawn Warrior, Blaze Wizard, Wind Archer, Night Walker, Thunder Breaker",
        "  Start at Ereve, unique skills, cap at Lv120 but get Empress Blessing for all characters",
        "",
        "ARAN: Legend class, uses combo system, starts with unique storyline",
        "EVAN: Dragon Master class, partners with dragon Mir",
      ].join("\n"),

      voting: [
        "VOTING & VOTE POINTS:",
        "  Vote for AugurMS on server ranking sites to earn vote points",
        "  Check your points with @points command in-game",
        "  Vote point shops are placed by the AI Game Master in popular towns",
        "  Voting helps the server grow (higher ranking = more new players)",
        "  You can vote once per day per ranking site",
        "  Look for custom NPCs in Henesys, Kerning City, or other major towns that accept vote points",
        "",
        "  Use get_active_events to check if there are any current vote point promotions.",
      ].join("\n"),
    };

    const result = guides[topic];
    if (!result) {
      return JSON.stringify({
        error: `Unknown topic. Available: ${Object.keys(guides).join(", ")}`,
      });
    }
    return JSON.stringify({ topic, guide: result });
  },
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

  // ---- Dynamic server knowledge tools ----

  {
    type: "function",
    function: {
      name: "get_server_config",
      description: "Get live server configuration: rates (EXP, meso, drop), HP/MP bonus system settings, scrolling mechanics, gameplay toggles, economy settings. Use this to answer questions about server settings, rates, and gameplay mechanics accurately.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_gm_activity",
      description: "Get recent AI Game Master activity: session summaries, recent actions (events created, drops added, NPCs placed, rate changes). Use this to tell players about recent server changes, active content, and what the GM has been doing.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_game_guide",
      description: "Get detailed game mechanics guide for a specific topic. Returns AugurMS-specific information including formulas, commands, and strategies. Always use this when players ask gameplay questions.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            enum: ["hp_washing", "class_stats", "commands", "training", "bosses", "scrolling", "economy", "job_advancement", "voting"],
            description: "Topic to get info about. hp_washing: HP bonus system and why washing is not needed. class_stats: per-class HP/MP formulas and stat builds. commands: all player @ commands. training: leveling guide by level range. bosses: boss requirements and info. scrolling: equipment enhancement. economy: meso/NX/vote points. job_advancement: job paths and requirements. voting: vote point system.",
          },
        },
        required: ["topic"],
      },
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
  const knowledgeGuidance = config.tools_enabled ? `

IMPORTANT TOOL USAGE RULES:
When players ask about game mechanics, HP washing, stats, class builds, training, bosses, commands, rates, scrolling, economy, voting, or job advancement -- ALWAYS use your tools to get accurate info before answering:
- get_game_guide: For gameplay mechanics (hp_washing, class_stats, commands, training, bosses, scrolling, economy, job_advancement, voting)
- get_server_config: For live server settings (rates, HP bonus values, scroll settings, toggles)
- get_gm_activity: For recent server changes, events, and GM actions
- get_active_events: For currently running events and special drops
- get_rates: For quick rate check
- search_items/get_item: For item details
- search_mobs/get_mob/get_mob_drops: For monster info and drops

Do NOT guess or make up numbers. Always call the tool first, then answer based on the data.
If a player asks "how does HP washing work" -- call get_game_guide with topic "hp_washing" AND get_server_config to get the current BONUS_HP_PER_LEVEL value.
If a player asks about rates -- call get_server_config, don't guess "1x".
If a player asks what's new -- call get_gm_activity and get_active_events.` : "";

  const systemPrompt = config.system_prompt + knowledgeGuidance +
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

  // Tool loop (max 8 iterations to allow parallel tool calls for complex questions)
  for (let i = 0; i < 8; i++) {
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
