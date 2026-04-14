import OpenAI from "openai";
import { query, execute } from "@/lib/db";
import { wrapUntrusted, sanitize } from "./sanitize";
import type { BanVerdict } from "./types";

// Runtime context — the engine passes the current session id so tools can
// attribute memory/verdicts. Set at the start of each run.
let currentSessionId: string | null = null;
export function setSessionContext(sessionId: string) { currentSessionId = sessionId; }
export function clearSessionContext() { currentSessionId = null; }

// Running counters so the engine can persist them to ban_judge_sessions at end.
let accountsReviewedSet = new Set<number>();
let verdictsCount = 0;
export function resetCounters() { accountsReviewedSet = new Set(); verdictsCount = 0; }
export function getCounters() { return { accountsReviewed: accountsReviewedSet.size, verdictsCount }; }

// ---- Tool schemas (OpenAI function calling format) ----

export const toolSchemas: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "recall_memory",
      description: "Search prior ban-judge memory notes (watchlist, observations, cross-run context). Returns most recent first.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "free-text keyword to match in content" },
          tags: { type: "array", items: { type: "string" }, description: "match any of these tags" },
          account_id: { type: "number", description: "only notes tied to this account" },
          limit: { type: "number", description: "default 30" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_accounts_with_new_flags",
      description: "List accounts with unreviewed cheat flags from the last N days. Aggregated one row per account.",
      parameters: {
        type: "object",
        properties: {
          since_days: { type: "number", description: "default 7" },
          min_flags: { type: "number", description: "only include accounts with at least this many flags, default 1" },
          limit: { type: "number", description: "default 100" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_account_dossier",
      description: "Full forensic profile for one account: character stats, every unreviewed flag, recent kill pattern, hardware/IP siblings with their ban status, reports filed against them, and past ban verdicts. Call this once per suspicious account.",
      parameters: {
        type: "object",
        properties: {
          account_id: { type: "number" },
        },
        required: ["account_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_policy_guide",
      description: "Returns reference notes on each violation type (what it detects, known false-positive causes, ban-weight).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "record_verdict",
      description: "Record your final judgment for an account. Marks the considered cheat_flags as reviewed. In Phase 1 this never auto-bans — admin applies from the dashboard.",
      parameters: {
        type: "object",
        properties: {
          account_id: { type: "number" },
          character_id: { type: "number" },
          character_name: { type: "string" },
          verdict: { type: "string", enum: ["innocent", "watch", "warn", "ban", "escalate"] },
          confidence: { type: "number", description: "0-100" },
          reasoning: { type: "string", description: "concise forensic justification" },
          evidence_flag_ids: { type: "array", items: { type: "number" }, description: "cheat_flags.id values you considered" },
          evidence: { type: "object", description: "structured evidence refs (violation_types, hwid_siblings, level_curve, etc.)" },
        },
        required: ["account_id", "verdict", "confidence", "reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_memory",
      description: "Save a note that future ban-judge runs will see. Use for watchlist entries, policy observations, cross-run context.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          account_id: { type: "number", description: "optional: tie note to an account" },
          expires_days: { type: "number", description: "optional TTL; omit for permanent" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_to_admin",
      description: "Shorthand for record_verdict with verdict=escalate when you cannot judge confidently.",
      parameters: {
        type: "object",
        properties: {
          account_id: { type: "number" },
          reason: { type: "string" },
        },
        required: ["account_id", "reason"],
      },
    },
  },
];

// ---- Handlers ----

export const toolHandlers: Record<string, (args: any) => Promise<string>> = {
  recall_memory: async ({ query: q, tags, account_id, limit }) => {
    const wheres: string[] = ["(expires_at IS NULL OR expires_at > NOW())"];
    const params: any[] = [];
    if (q) { wheres.push("content LIKE ?"); params.push(`%${q}%`); }
    if (account_id) { wheres.push("account_id = ?"); params.push(Number(account_id)); }
    if (tags?.length) {
      // JSON_OVERLAPS on MySQL 8 — fallback to LIKE on serialized array
      wheres.push(`(${tags.map(() => "JSON_CONTAINS(tags, JSON_QUOTE(?))").join(" OR ")})`);
      for (const t of tags) params.push(String(t));
    }
    const lim = Math.min(Math.max(1, Number(limit) || 30), 100);
    const rows = await query(
      `SELECT id, session_id, account_id, content, tags, created_at, expires_at
       FROM ban_judge_memory
       WHERE ${wheres.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ${lim}`,
      params
    );
    return JSON.stringify({ count: rows.length, memories: rows });
  },

  list_accounts_with_new_flags: async ({ since_days, min_flags, limit }) => {
    const days = Math.min(Math.max(1, Number(since_days) || 7), 90);
    const minF = Math.max(1, Number(min_flags) || 1);
    const lim = Math.min(Math.max(1, Number(limit) || 100), 500);
    const rows = await query<any>(
      `SELECT
         agg.account_id,
         agg.character_name,
         agg.flag_count,
         agg.violation_type_count,
         agg.violation_types,
         agg.unique_maps,
         agg.total_points,
         agg.first_flagged,
         agg.last_flagged
       FROM (
         SELECT
           account_id,
           MAX(character_name) as character_name,
           COUNT(*) as flag_count,
           COUNT(DISTINCT violation_type) as violation_type_count,
           GROUP_CONCAT(DISTINCT violation_type ORDER BY violation_type) as violation_types,
           COUNT(DISTINCT map_id) as unique_maps,
           SUM(points) as total_points,
           MIN(flagged_at) as first_flagged,
           MAX(flagged_at) as last_flagged
         FROM cheat_flags
         WHERE reviewed = 0
           AND flagged_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY account_id
         HAVING flag_count >= ?
       ) agg
       JOIN accounts a ON a.id = agg.account_id
       WHERE a.banned = 0
         AND NOT EXISTS (
           SELECT 1 FROM ban_verdicts bv
           WHERE bv.account_id = agg.account_id
             AND bv.verdict = 'ban'
             AND bv.applied = 0
             AND bv.dismissed_at IS NULL
             AND bv.overturned_at IS NULL
         )
       ORDER BY agg.flag_count DESC, agg.violation_type_count DESC
       LIMIT ${lim}`,
      [days, minF]
    );
    // Character name is player-controlled
    const safe = rows.map((r: any) => ({
      ...r,
      character_name: wrapUntrusted(r.character_name, 50),
      banreason: r.banreason ? wrapUntrusted(r.banreason, 200) : null,
    }));
    return JSON.stringify({ count: safe.length, accounts: safe });
  },

  get_account_dossier: async ({ account_id }) => {
    const aid = Number(account_id);
    if (!aid) return JSON.stringify({ error: "account_id required" });
    accountsReviewedSet.add(aid);

    // Account
    const [account] = await query<any>(
      `SELECT id, name, banned, banreason, createdat, lastlogin, loggedin, hwid, ip
       FROM accounts WHERE id = ?`,
      [aid]
    );
    if (!account) return JSON.stringify({ error: `account ${aid} not found` });

    // Characters on this account
    const characters = await query<any>(
      "SELECT id, name, level, job, exp, meso, map, gm, createdate, lastLogoutTime, lastExpGainTime, str, dex, `int` as int_stat, luk, maxhp, maxmp, fame, reborns FROM characters WHERE accountid = ? ORDER BY level DESC",
      [aid]
    ).catch(() => [] as any[]);

    // Unreviewed flags (all of them, plus a sample of reviewed for context)
    const unreviewedFlags = await query<any>(
      `SELECT id, character_id, character_name, violation_type, details, severity, points, map_id, flagged_at
       FROM cheat_flags WHERE account_id = ? AND reviewed = 0
       ORDER BY flagged_at DESC LIMIT 200`,
      [aid]
    );
    const reviewedFlags = await query<any>(
      `SELECT id, violation_type, review_result, review_notes, flagged_at, reviewed_at
       FROM cheat_flags WHERE account_id = ? AND reviewed = 1
       ORDER BY flagged_at DESC LIMIT 30`,
      [aid]
    );

    // Violation type aggregate
    const violationBreakdown = await query<any>(
      `SELECT violation_type, COUNT(*) as cnt, SUM(points) as total_points,
              MIN(flagged_at) as first_seen, MAX(flagged_at) as last_seen,
              COUNT(DISTINCT map_id) as distinct_maps
       FROM cheat_flags WHERE account_id = ? AND reviewed = 0
       GROUP BY violation_type ORDER BY cnt DESC`,
      [aid]
    );

    // Kill pattern — per-map over last 7d
    const killPattern = await query<any>(
      `SELECT mapid as map_id, COUNT(*) as kills,
              COUNT(DISTINCT mobid) as distinct_mobs,
              COUNT(DISTINCT DATE_FORMAT(killedtime, '%Y-%m-%d %H')) as active_hours,
              MIN(killedtime) as first_kill, MAX(killedtime) as last_kill
       FROM killlog
       WHERE characterid IN (SELECT id FROM characters WHERE accountid = ?)
         AND killedtime >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY mapid ORDER BY kills DESC LIMIT 10`,
      [aid]
    ).catch(() => [] as any[]);

    // Hardware/IP siblings — other accounts sharing hwid or direct hwid on accounts.hwid
    const hwidSiblings = await query<any>(
      `SELECT DISTINCT h2.accountid as sibling_account_id, a2.name as sibling_name,
              a2.banned as sibling_banned, a2.banreason as sibling_banreason,
              h2.hwid, 'hwidaccounts' as source
       FROM hwidaccounts h1
       JOIN hwidaccounts h2 ON h2.hwid = h1.hwid AND h2.accountid != h1.accountid
       LEFT JOIN accounts a2 ON a2.id = h2.accountid
       WHERE h1.accountid = ?
       UNION
       SELECT DISTINCT a2.id as sibling_account_id, a2.name as sibling_name,
              a2.banned as sibling_banned, a2.banreason as sibling_banreason,
              a2.hwid, 'accounts.hwid' as source
       FROM accounts a1
       JOIN accounts a2 ON a2.hwid = a1.hwid AND a2.id != a1.id AND a1.hwid != ''
       WHERE a1.id = ?
       LIMIT 30`,
      [aid, aid]
    ).catch(() => [] as any[]);

    // Reports filed against any character on this account (reporterid/victimid are character ids)
    const reports = await query<any>(
      `SELECT r.reporttime, r.reason, r.chatlog, r.description,
              rep.name as reporter_name, vic.name as victim_name
       FROM reports r
       LEFT JOIN characters rep ON rep.id = r.reporterid
       LEFT JOIN characters vic ON vic.id = r.victimid
       WHERE r.victimid IN (SELECT id FROM characters WHERE accountid = ?)
       ORDER BY r.reporttime DESC LIMIT 20`,
      [aid]
    ).catch(() => [] as any[]);

    // Past ban verdicts for this account
    const pastVerdicts = await query<any>(
      `SELECT id, session_id, verdict, confidence, reasoning, applied, overturned_at, created_at
       FROM ban_verdicts WHERE account_id = ?
       ORDER BY created_at DESC LIMIT 20`,
      [aid]
    );

    // Memory notes tied to this account
    const accountMemory = await query<any>(
      `SELECT id, content, tags, created_at
       FROM ban_judge_memory
       WHERE account_id = ? AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC LIMIT 20`,
      [aid]
    );

    // Sanitize all player-controlled strings
    const safeAccount = {
      ...account,
      name: wrapUntrusted(account.name, 50),
      banreason: account.banreason ? wrapUntrusted(account.banreason, 200) : null,
    };
    const safeCharacters = characters.map((c: any) => ({
      ...c,
      name: wrapUntrusted(c.name, 50),
    }));
    const safeUnreviewed = unreviewedFlags.map((f: any) => ({
      ...f,
      character_name: wrapUntrusted(f.character_name, 50),
      details: wrapUntrusted(f.details, 400),
    }));
    const safeReviewed = reviewedFlags.map((f: any) => ({
      ...f,
      review_notes: f.review_notes ? wrapUntrusted(f.review_notes, 300) : null,
    }));
    const safeHwid = hwidSiblings.map((h: any) => ({
      ...h,
      sibling_name: h.sibling_name ? wrapUntrusted(h.sibling_name, 50) : null,
      sibling_banreason: h.sibling_banreason ? wrapUntrusted(h.sibling_banreason, 200) : null,
    }));
    const safeReports = reports.map((r: any) => ({
      ...r,
      description: wrapUntrusted(r.description, 300),
      chatlog: wrapUntrusted(r.chatlog, 800),
      reporter_name: r.reporter_name ? wrapUntrusted(r.reporter_name, 50) : null,
      victim_name: r.victim_name ? wrapUntrusted(r.victim_name, 50) : null,
    }));

    return JSON.stringify({
      account: safeAccount,
      characters: safeCharacters,
      unreviewed_flags: safeUnreviewed,
      unreviewed_flag_count: safeUnreviewed.length,
      reviewed_flags_sample: safeReviewed,
      violation_breakdown: violationBreakdown,
      kill_pattern_7d: killPattern,
      hwid_siblings: safeHwid,
      reports_against: safeReports,
      past_verdicts: pastVerdicts,
      account_memory: accountMemory,
    });
  },

  get_policy_guide: async () => {
    return JSON.stringify({
      violation_types: {
        MISS_GODMODE: { description: "Consecutive miss-counter anomaly — player takes zero damage for N mob hits in a row.", false_positives: "Very rare; legitimate dodge is possible on high-AVOID jobs (NL, Shadower) briefly.", ban_weight: "HIGH — godmode hacks are the classic case. Multiple flags with normal progression = ban candidate." },
        DAMAGE_HACK: { description: "Damage dealt exceeds calculated maximum for player stats.", false_positives: "Stat desync after scroll/equip swap; buffs not yet accounted for.", ban_weight: "HIGH — especially if repeated across maps." },
        DISTANCE_HACK: { description: "Player moved further than possible between packets.", false_positives: "Lag spikes, rubber-banding, teleport skills.", ban_weight: "MEDIUM — need many flags or correlation with other signals." },
        PORTAL_DISTANCE: { description: "Used portal from impossible distance.", false_positives: "Lag.", ban_weight: "LOW alone." },
        FAST_ATTACK: { description: "Attack rate exceeds skill cooldowns.", false_positives: "High-attack-speed jobs (bow master, Corsair) trigger this frequently even legitimately.", ban_weight: "LOW alone — need corroboration." },
        FAST_HP_HEALING: { description: "HP potion cooldown bypass.", false_positives: "Genesis/emergency-heal skills.", ban_weight: "MEDIUM." },
        FAST_MP_HEALING: { description: "MP potion cooldown bypass.", false_positives: "Bishop Genesis, HP-drain skills.", ban_weight: "MEDIUM." },
        MPCON: { description: "MP consumption lower than expected for skill used.", false_positives: "MP cost reduction gear/buffs.", ban_weight: "MEDIUM." },
        FAST_ITEM_PICKUP: { description: "Picked up items faster than pickup cooldown.", false_positives: "Network jitter.", ban_weight: "LOW alone." },
        ITEM_VAC: { description: "Picked up items from impossible distance.", false_positives: "Rare; position desync after knockback.", ban_weight: "HIGH — vac hacks are clear." },
        SHORT_ITEM_VAC: { description: "Minor item-pickup distance violation.", false_positives: "Common from latency.", ban_weight: "LOW." },
        ACC_HACK: { description: "Attack accuracy too high for gear.", false_positives: "Accuracy potions, job buffs.", ban_weight: "MEDIUM." },
        TUBI: { description: "Mob-count / crowd-control hack (Tubi).", false_positives: "Rare.", ban_weight: "HIGH." },
        MOB_COUNT: { description: "Too many mobs hit in one skill.", false_positives: "Legitimate AoE skills if under-tuned in server config.", ban_weight: "MEDIUM." },
        PACKET_EDIT: { description: "Malformed/crafted packet detected.", false_positives: "Very rare.", ban_weight: "HIGH." },
        CREATION_GENERATOR: { description: "Mass-creating characters/accounts.", false_positives: "Rare.", ban_weight: "HIGH for the offending account." },
        GACHA_EXP: { description: "Gachapon exploit.", false_positives: "Rare.", ban_weight: "HIGH." },
        GENERAL: { description: "Generic uncategorized cheat signal.", false_positives: "Varies.", ban_weight: "UNKNOWN — read the details." },
      },
      policy: {
        hard_ban_single_type: ["MISS_GODMODE", "PACKET_EDIT", "ITEM_VAC", "CREATION_GENERATOR", "GACHA_EXP"],
        soft_single_type: ["FAST_ATTACK", "FAST_HP_HEALING", "PORTAL_DISTANCE", "SHORT_ITEM_VAC"],
        ban_tier_examples: [
          "5+ distinct violation types across one session → ban",
          "MISS_GODMODE + any other violation → ban",
          "Hardware-tied to a previously banned account + any sustained flagging → ban",
        ],
        watch_tier_examples: [
          "Single soft-type violation repeated on one map → watch, write memory, re-check next run",
          "New account (< 3 days) with sudden flags → watch",
        ],
        escalate_tier_examples: [
          "High profile account (donator, GM-adjacent, huge meso) with ambiguous flags",
          "Novel violation pattern not covered by the guide",
        ],
      },
    });
  },

  record_verdict: async (args) => {
    const sid = currentSessionId;
    const { account_id, character_id, character_name, verdict, confidence, reasoning, evidence_flag_ids, evidence } = args;
    if (!account_id || !verdict || reasoning === undefined || confidence === undefined) {
      return JSON.stringify({ error: "account_id, verdict, confidence, reasoning are required" });
    }
    const v = verdict as BanVerdict;
    const allowed: BanVerdict[] = ["innocent", "watch", "warn", "ban", "escalate"];
    if (!allowed.includes(v)) return JSON.stringify({ error: `invalid verdict: ${verdict}` });

    const conf = Math.max(0, Math.min(100, Number(confidence) || 0));
    const flagIds: number[] = Array.isArray(evidence_flag_ids) ? evidence_flag_ids.map(Number).filter(Boolean) : [];

    // Check auto-apply threshold (Phase 1 default 101 = never)
    const [sched] = await query<any>("SELECT auto_apply_threshold FROM ban_judge_schedule WHERE id = 1");
    const threshold = sched?.auto_apply_threshold ?? 101;
    const shouldAutoApply = v === "ban" && conf >= threshold;

    const result = await execute(
      `INSERT INTO ban_verdicts
        (session_id, account_id, character_id, character_name, verdict, confidence, reasoning, evidence_json, flag_ids_considered, applied, applied_at, applied_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sid,
        Number(account_id),
        character_id ? Number(character_id) : null,
        character_name ? sanitize(character_name, 50) : null,
        v,
        conf,
        sanitize(reasoning, 4000),
        evidence ? JSON.stringify(evidence) : null,
        flagIds.length ? JSON.stringify(flagIds) : null,
        shouldAutoApply ? 1 : 0,
        shouldAutoApply ? new Date() : null,
        shouldAutoApply ? "ban-judge-auto" : null,
      ]
    );

    // Mark the considered flags as reviewed with the verdict
    if (flagIds.length) {
      const ph = flagIds.map(() => "?").join(",");
      const reviewResult = v === "ban" ? "ban" : v === "warn" ? "warning" : v === "innocent" ? "innocent" : "pending";
      await execute(
        `UPDATE cheat_flags
         SET reviewed = 1, reviewed_at = NOW(), review_result = ?, review_notes = ?
         WHERE id IN (${ph}) AND account_id = ?`,
        [reviewResult, `ban-judge verdict #${result.insertId}: ${sanitize(reasoning, 200)}`, ...flagIds, Number(account_id)]
      );
    }

    // If auto-applied (threshold met), actually ban the account
    if (shouldAutoApply) {
      await execute(
        `UPDATE accounts SET banned = 1, banreason = ? WHERE id = ?`,
        [`Ban Judge auto-apply: ${sanitize(reasoning, 200)}`, Number(account_id)],
      );
    }

    verdictsCount++;
    return JSON.stringify({
      success: true,
      verdict_id: result.insertId,
      auto_applied: shouldAutoApply,
      flags_marked_reviewed: flagIds.length,
    });
  },

  write_memory: async ({ content, tags, account_id, expires_days }) => {
    if (!content) return JSON.stringify({ error: "content required" });
    const expiresAt = expires_days ? new Date(Date.now() + Number(expires_days) * 86400 * 1000) : null;
    const result = await execute(
      `INSERT INTO ban_judge_memory (session_id, account_id, content, tags, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        currentSessionId,
        account_id ? Number(account_id) : null,
        sanitize(content, 2000),
        tags?.length ? JSON.stringify(tags.map((t: any) => String(t))) : null,
        expiresAt,
      ]
    );
    return JSON.stringify({ success: true, memory_id: result.insertId });
  },

  escalate_to_admin: async ({ account_id, reason }) => {
    if (!account_id || !reason) return JSON.stringify({ error: "account_id and reason required" });
    return toolHandlers.record_verdict({
      account_id,
      verdict: "escalate",
      confidence: 50,
      reasoning: `ESCALATION: ${reason}`,
    });
  },
};
