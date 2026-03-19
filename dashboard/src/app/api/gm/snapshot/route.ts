import { NextResponse } from "next/server";
import { query, execute } from "@/lib/db";
import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import { PATHS } from "@/lib/cosmic";
import type { GMSnapshot } from "@/lib/gamemaster/types";

export const dynamic = "force-dynamic";

// POST — Take a new snapshot of current game state
export async function POST() {
  try {
    // Gather all metrics (mirrors analytics route logic)
    const [mesoStats] = await query<{ totalMeso: number; avgMeso: number; playerCount: number }>(
      "SELECT COALESCE(SUM(meso),0) as totalMeso, COALESCE(AVG(meso),0) as avgMeso, COUNT(*) as playerCount FROM characters"
    );

    const storageMeso = await query<{ total: number }>(
      "SELECT COALESCE(SUM(meso),0) as total FROM storages"
    ).catch(() => [{ total: 0 }]);

    const [itemCount] = await query<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM inventoryitems WHERE characterid IS NOT NULL"
    );

    const [charCount] = await query<{ cnt: number }>("SELECT COUNT(*) as cnt FROM characters");
    const [accountCount] = await query<{ cnt: number }>("SELECT COUNT(*) as cnt FROM accounts");

    const [avgLevel] = await query<{ avg: number }>("SELECT COALESCE(AVG(level),0) as avg FROM characters");
    const [maxLevel] = await query<{ max: number }>("SELECT COALESCE(MAX(level),0) as max FROM characters");

    const levelDist = await query<{ bucket: string; count: number }>(
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

    const newAccounts = await query<{ count: number }>(
      "SELECT COUNT(*) as count FROM accounts WHERE createdat > DATE_SUB(NOW(), INTERVAL 7 DAY)"
    ).catch(() => [{ count: 0 }]);

    const bossKillsDaily = await query<{ kills: number }>(
      "SELECT COUNT(*) as kills FROM bosslog_daily WHERE DATE(attempttime) = CURDATE()"
    ).catch(() => [{ kills: 0 }]);

    // Read rates from live game server (falls back to config.yaml)
    let expRate = 1, mesoRate = 1, dropRate = 1;
    try {
      const GAME_API = process.env.GAME_API_URL || "http://augur-ms-game.internal:8585";
      const ratesRes = await fetch(`${GAME_API}/rates`, { signal: AbortSignal.timeout(3000) });
      if (ratesRes.ok) {
        const rates = await ratesRes.json();
        expRate = rates.exp_rate || 1;
        mesoRate = rates.meso_rate || 1;
        dropRate = rates.drop_rate || 1;
      }
    } catch {
      try {
        const configContent = readFileSync(PATHS.config, "utf-8");
        const config = parseYaml(configContent);
        const world0 = config.worlds?.[0] || {};
        expRate = world0.exp_rate || 1;
        mesoRate = world0.meso_rate || 1;
        dropRate = world0.drop_rate || 1;
      } catch { /* ignore */ }
    }

    const snapshot: GMSnapshot = {
      totalMeso: mesoStats.totalMeso,
      avgMesoPerPlayer: Math.round(mesoStats.avgMeso),
      storageMeso: storageMeso[0]?.total || 0,
      totalItems: itemCount.cnt,
      totalCharacters: charCount.cnt,
      avgLevel: Math.round(avgLevel.avg * 10) / 10,
      maxLevel: maxLevel.max,
      levelDistribution: Object.fromEntries(levelDist.map(r => [r.bucket, r.count])),
      jobDistribution: Object.fromEntries(jobDist.map(r => [String(r.job), r.count])),
      totalAccounts: accountCount.cnt,
      newAccounts7d: newAccounts[0]?.count || 0,
      bossKillsToday: bossKillsDaily[0]?.kills || 0,
      expRate,
      mesoRate,
      dropRate,
    };

    // Insert into DB
    const result = await execute(
      `INSERT INTO gm_snapshots
        (total_meso, avg_meso_per_player, storage_meso, total_items,
         total_characters, avg_level, max_level, level_distribution,
         job_distribution, total_accounts, new_accounts_7d, boss_kills_today,
         exp_rate, meso_rate, drop_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        snapshot.totalMeso, snapshot.avgMesoPerPlayer, snapshot.storageMeso,
        snapshot.totalItems, snapshot.totalCharacters, snapshot.avgLevel,
        snapshot.maxLevel, JSON.stringify(snapshot.levelDistribution),
        JSON.stringify(snapshot.jobDistribution), snapshot.totalAccounts,
        snapshot.newAccounts7d, snapshot.bossKillsToday,
        snapshot.expRate, snapshot.mesoRate, snapshot.dropRate,
      ]
    );

    return NextResponse.json({ id: result.insertId, ...snapshot });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — List recent snapshots
export async function GET() {
  try {
    const snapshots = await query(
      "SELECT * FROM gm_snapshots ORDER BY taken_at DESC LIMIT 20"
    );

    return NextResponse.json(
      snapshots.map((s: any) => ({
        id: s.id,
        takenAt: s.taken_at,
        totalMeso: s.total_meso,
        avgMesoPerPlayer: s.avg_meso_per_player,
        storageMeso: s.storage_meso,
        totalItems: s.total_items,
        totalCharacters: s.total_characters,
        avgLevel: s.avg_level,
        maxLevel: s.max_level,
        levelDistribution: typeof s.level_distribution === "string" ? JSON.parse(s.level_distribution) : s.level_distribution,
        jobDistribution: typeof s.job_distribution === "string" ? JSON.parse(s.job_distribution) : s.job_distribution,
        totalAccounts: s.total_accounts,
        newAccounts7d: s.new_accounts_7d,
        bossKillsToday: s.boss_kills_today || 0,
        expRate: s.exp_rate,
        mesoRate: s.meso_rate,
        dropRate: s.drop_rate,
      }))
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
