import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import { PATHS } from "@/lib/cosmic";

interface LevelBucket {
  bucket: string;
  count: number;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const section = searchParams.get("section") || "all";

  try {
    const result: Record<string, any> = {};

    // --- ECONOMY ---
    if (section === "all" || section === "economy") {
      const [mesoStats] = await query<{ totalMeso: number; avgMeso: number; playerCount: number }>(
        "SELECT COALESCE(SUM(meso),0) as totalMeso, COALESCE(AVG(meso),0) as avgMeso, COUNT(*) as playerCount FROM characters"
      );

      const mesoDist = await query<{ bracket: string; count: number }>(
        `SELECT
          CASE
            WHEN meso < 100000 THEN '0-100k'
            WHEN meso < 1000000 THEN '100k-1M'
            WHEN meso < 10000000 THEN '1M-10M'
            WHEN meso < 100000000 THEN '10M-100M'
            ELSE '100M+'
          END as bracket,
          COUNT(*) as count
        FROM characters GROUP BY bracket ORDER BY MIN(meso)`
      );

      const topItems = await query<{ itemid: number; count: number }>(
        `SELECT itemid, COUNT(*) as count FROM inventoryitems
         WHERE characterid IS NOT NULL
         GROUP BY itemid ORDER BY count DESC LIMIT 20`
      );

      const storageMeso = await query<{ total: number }>(
        "SELECT COALESCE(SUM(meso),0) as total FROM storages"
      ).catch(() => [{ total: 0 }]);

      result.economy = {
        totalMeso: mesoStats.totalMeso,
        avgMesoPerPlayer: Math.round(mesoStats.avgMeso),
        totalPlayers: mesoStats.playerCount,
        storageMeso: storageMeso[0]?.total || 0,
        mesoDistribution: Object.fromEntries(mesoDist.map(r => [r.bracket, r.count])),
        topItems: topItems.map(r => ({ itemId: r.itemid, count: r.count })),
      };
    }

    // --- PROGRESSION ---
    if (section === "all" || section === "progression") {
      const levelDist = await query<LevelBucket>(
        `SELECT
          CASE
            WHEN level BETWEEN 1 AND 10 THEN '1-10'
            WHEN level BETWEEN 11 AND 30 THEN '11-30'
            WHEN level BETWEEN 31 AND 50 THEN '31-50'
            WHEN level BETWEEN 51 AND 70 THEN '51-70'
            WHEN level BETWEEN 71 AND 100 THEN '71-100'
            WHEN level BETWEEN 101 AND 120 THEN '101-120'
            WHEN level BETWEEN 121 AND 150 THEN '121-150'
            WHEN level BETWEEN 151 AND 200 THEN '151-200'
            ELSE '200+'
          END as bucket,
          COUNT(*) as count
        FROM characters GROUP BY bucket ORDER BY MIN(level)`
      );

      const jobDist = await query<{ job: number; count: number }>(
        "SELECT job, COUNT(*) as count FROM characters GROUP BY job ORDER BY count DESC"
      );

      const [avgLevel] = await query<{ avg: number }>(
        "SELECT COALESCE(AVG(level),0) as avg FROM characters"
      );

      const [maxLevel] = await query<{ max: number }>(
        "SELECT COALESCE(MAX(level),0) as max FROM characters"
      );

      const recentExp = await query<{
        charid: number;
        gained_exp: number;
        current_exp: number;
        world_exp_rate: number;
        exp_gain_time: string;
      }>(
        "SELECT charid, gained_exp, current_exp, world_exp_rate, exp_gain_time FROM characterexplogs ORDER BY exp_gain_time DESC LIMIT 50"
      ).catch(() => []);

      result.progression = {
        levelDistribution: Object.fromEntries(levelDist.map(r => [r.bucket, r.count])),
        jobDistribution: jobDist.map(r => ({ jobId: r.job, jobName: getJobName(r.job), count: r.count })),
        avgLevel: Math.round(avgLevel.avg),
        maxLevel: maxLevel.max,
        recentExpGains: recentExp.slice(0, 20),
      };
    }

    // --- ACTIVITY ---
    if (section === "all" || section === "activity") {
      // Map popularity (characters grouped by current map)
      const mapPop = await query<{ map: number; count: number }>(
        "SELECT map, COUNT(*) as count FROM characters GROUP BY map ORDER BY count DESC LIMIT 20"
      );

      // Boss kills today
      const bossKillsDaily = await query<{ bosstype: string; kills: number }>(
        "SELECT bosstype, COUNT(*) as kills FROM bosslog_daily WHERE DATE(attempttime) = CURDATE() GROUP BY bosstype"
      ).catch(() => []);

      const bossKillsWeekly = await query<{ bosstype: string; kills: number }>(
        "SELECT bosstype, COUNT(*) as kills FROM bosslog_weekly WHERE YEARWEEK(attempttime) = YEARWEEK(NOW()) GROUP BY bosstype"
      ).catch(() => []);

      // Character count by GM level
      const gmDist = await query<{ gm: number; count: number }>(
        "SELECT gm, COUNT(*) as count FROM characters GROUP BY gm"
      );

      // Recent account creation
      const recentAccounts = await query<{ count: number }>(
        "SELECT COUNT(*) as count FROM accounts WHERE createdat > DATE_SUB(NOW(), INTERVAL 7 DAY)"
      ).catch(() => [{ count: 0 }]);

      // Online and active player counts
      const [onlinePlayers] = await query<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM accounts WHERE loggedin > 0"
      ).catch(() => [{ cnt: 0 }]);

      const [activeChars24h] = await query<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM characters WHERE lastExpGainTime > DATE_SUB(NOW(), INTERVAL 24 HOUR) OR lastLogoutTime > DATE_SUB(NOW(), INTERVAL 24 HOUR)"
      ).catch(() => [{ cnt: 0 }]);

      const [activeAccounts7d] = await query<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM accounts WHERE lastlogin > DATE_SUB(NOW(), INTERVAL 7 DAY)"
      ).catch(() => [{ cnt: 0 }]);

      const [totalChars] = await query<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM characters"
      );

      result.activity = {
        onlinePlayers: onlinePlayers.cnt,
        activeCharacters24h: activeChars24h.cnt,
        activeAccounts7d: activeAccounts7d.cnt,
        totalCharactersAllTime: totalChars.cnt,
        mapPopularity: mapPop.map(r => ({ mapId: r.map, playerCount: r.count })),
        bossKillsToday: bossKillsDaily,
        bossKillsThisWeek: bossKillsWeekly,
        gmDistribution: Object.fromEntries(gmDist.map(r => [r.gm === 0 ? "player" : `gm${r.gm}`, r.count])),
        newAccountsLast7Days: recentAccounts[0]?.count || 0,
      };
    }

    // --- HEALTH ---
    if (section === "all" || section === "health") {
      // Read config for rates
      let config: any = {};
      try {
        const configContent = readFileSync(PATHS.config, "utf-8");
        config = parseYaml(configContent);
      } catch { /* ignore */ }

      const world0 = config.worlds?.[0] || {};
      const server = config.server || {};

      // DB stats
      const [tableCount] = await query<{ cnt: number }>("SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = 'cosmic'");
      const [charCount] = await query<{ cnt: number }>("SELECT COUNT(*) as cnt FROM characters");
      const [accountCount] = await query<{ cnt: number }>("SELECT COUNT(*) as cnt FROM accounts");
      const [dropCount] = await query<{ cnt: number }>("SELECT COUNT(*) as cnt FROM drop_data");
      const [shopItemCount] = await query<{ cnt: number }>("SELECT COUNT(*) as cnt FROM shopitems");
      const [bannedCount] = await query<{ cnt: number }>("SELECT COUNT(*) as cnt FROM accounts WHERE banned = 1").catch(() => [{ cnt: 0 }]);

      // Generate warnings
      const warnings: string[] = [];
      const [maxLvl] = await query<{ max: number }>("SELECT COALESCE(MAX(level),0) as max FROM characters");
      if (maxLvl.max < 30 && charCount.cnt > 0) warnings.push("No players above level 30 — consider increasing EXP rate or reducing mob difficulty");
      if (world0.exp_rate > 30) warnings.push(`EXP rate is very high (${world0.exp_rate}x) — progression may feel trivial`);
      if (world0.drop_rate > 30) warnings.push(`Drop rate is very high (${world0.drop_rate}x) — economy may inflate`);

      result.health = {
        rates: {
          exp: world0.exp_rate,
          meso: world0.meso_rate,
          drop: world0.drop_rate,
          bossDrop: world0.boss_drop_rate,
          quest: world0.quest_rate,
        },
        serverConfig: {
          worlds: server.WORLDS,
          channelsPerWorld: world0.channels,
          channelLoad: server.CHANNEL_LOAD,
          respawnInterval: server.RESPAWN_INTERVAL,
          autoban: server.USE_AUTOBAN,
          autosave: server.USE_AUTOSAVE,
        },
        database: {
          tables: tableCount.cnt,
          characters: charCount.cnt,
          accounts: accountCount.cnt,
          dropEntries: dropCount.cnt,
          shopItems: shopItemCount.cnt,
          bannedAccounts: bannedCount.cnt,
        },
        warnings,
      };
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch analytics", details: err.message },
      { status: 500 }
    );
  }
}

function getJobName(jobId: number): string {
  const JOB_NAMES: Record<number, string> = {
    0: "Beginner", 100: "Warrior", 110: "Fighter", 111: "Crusader", 112: "Hero",
    120: "Page", 121: "White Knight", 122: "Paladin",
    130: "Spearman", 131: "Dragon Knight", 132: "Dark Knight",
    200: "Magician", 210: "F/P Wizard", 211: "F/P Mage", 212: "F/P Arch Mage",
    220: "I/L Wizard", 221: "I/L Mage", 222: "I/L Arch Mage",
    230: "Cleric", 231: "Priest", 232: "Bishop",
    300: "Bowman", 310: "Hunter", 311: "Ranger", 312: "Bowmaster",
    320: "Crossbowman", 321: "Sniper", 322: "Marksman",
    400: "Thief", 410: "Assassin", 411: "Hermit", 412: "Night Lord",
    420: "Bandit", 421: "Chief Bandit", 422: "Shadower",
    500: "Pirate", 510: "Brawler", 511: "Marauder", 512: "Buccaneer",
    520: "Gunslinger", 521: "Outlaw", 522: "Corsair",
    900: "GM", 910: "Super GM",
    1000: "Noblesse", 1100: "Dawn Warrior 1", 1110: "Dawn Warrior 2", 1111: "Dawn Warrior 3",
    1200: "Blaze Wizard 1", 1210: "Blaze Wizard 2", 1211: "Blaze Wizard 3",
    1300: "Wind Archer 1", 1310: "Wind Archer 2", 1311: "Wind Archer 3",
    1400: "Night Walker 1", 1410: "Night Walker 2", 1411: "Night Walker 3",
    1500: "Thunder Breaker 1", 1510: "Thunder Breaker 2", 1511: "Thunder Breaker 3",
    2000: "Legend", 2100: "Aran 1", 2110: "Aran 2", 2111: "Aran 3", 2112: "Aran 4",
  };
  return JOB_NAMES[jobId] || `Job ${jobId}`;
}
