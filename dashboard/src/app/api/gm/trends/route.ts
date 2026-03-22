import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Snapshot {
  id: number;
  taken_at: string;
  total_meso: number;
  avg_meso_per_player: number;
  storage_meso: number;
  total_items: number;
  total_characters: number;
  avg_level: number;
  max_level: number;
  total_accounts: number;
  new_accounts_7d: number;
  total_online: number;
  active_characters_24h: number;
  active_characters_7d: number;
  active_accounts_24h: number;
  active_accounts_7d: number;
  exp_rate: number;
  meso_rate: number;
  drop_rate: number;
}

// GET /api/gm/trends?hours=48
export async function GET(request: NextRequest) {
  const hours = Math.min(parseInt(request.nextUrl.searchParams.get("hours") || "48"), 168);

  try {
    const snapshots = await query<Snapshot>(
      `SELECT * FROM gm_snapshots WHERE taken_at > DATE_SUB(NOW(), INTERVAL ${hours} HOUR) ORDER BY taken_at ASC`
    );

    if (snapshots.length < 2) {
      return NextResponse.json({
        message: "Not enough snapshots for trend analysis. Need at least 2.",
        snapshotCount: snapshots.length,
        trends: null,
      });
    }

    const oldest = snapshots[0];
    const newest = snapshots[snapshots.length - 1];
    const hoursElapsed = (new Date(newest.taken_at).getTime() - new Date(oldest.taken_at).getTime()) / (1000 * 60 * 60);

    // Economy trends
    const mesoChange = Number(newest.total_meso) - Number(oldest.total_meso);
    const mesoChangePct = Number(oldest.total_meso) ? (mesoChange / Number(oldest.total_meso)) * 100 : 0;
    const mesoPerDay = hoursElapsed > 0 ? (mesoChangePct / hoursElapsed) * 24 : 0;

    const storageMesoChange = Number(newest.storage_meso) - Number(oldest.storage_meso);

    // Progression trends
    const avgLevelChange = newest.avg_level - oldest.avg_level;
    const levelVelocityPerDay = hoursElapsed > 0 ? (avgLevelChange / hoursElapsed) * 24 : 0;

    // Item trends
    const itemChange = newest.total_items - oldest.total_items;
    const itemChangePct = oldest.total_items ? (itemChange / oldest.total_items) * 100 : 0;

    // Player trends
    const characterChange = newest.total_characters - oldest.total_characters;
    const accountChange = newest.total_accounts - oldest.total_accounts;

    // Active player trends
    const activeChars24hChange = (newest.active_characters_24h || 0) - (oldest.active_characters_24h || 0);
    const activeChars7dChange = (newest.active_characters_7d || 0) - (oldest.active_characters_7d || 0);
    const activeAccounts24hChange = (newest.active_accounts_24h || 0) - (oldest.active_accounts_24h || 0);
    const activeAccounts7dChange = (newest.active_accounts_7d || 0) - (oldest.active_accounts_7d || 0);

    // Per-interval breakdown (for sparkline data)
    const intervals = snapshots.map((s, i) => {
      const prev = snapshots[i - 1];
      return {
        time: s.taken_at,
        meso: Number(s.total_meso),
        avgLevel: s.avg_level,
        items: s.total_items,
        characters: s.total_characters,
        mesoDelta: prev ? Number(s.total_meso) - Number(prev.total_meso) : 0,
        levelDelta: prev ? Math.round((s.avg_level - prev.avg_level) * 10) / 10 : 0,
      };
    });

    // Rate change detection
    const rateChanges: { time: string; from: any; to: any }[] = [];
    for (let i = 1; i < snapshots.length; i++) {
      const prev = snapshots[i - 1];
      const curr = snapshots[i];
      if (prev.exp_rate !== curr.exp_rate || prev.meso_rate !== curr.meso_rate || prev.drop_rate !== curr.drop_rate) {
        rateChanges.push({
          time: curr.taken_at,
          from: { exp: prev.exp_rate, meso: prev.meso_rate, drop: prev.drop_rate },
          to: { exp: curr.exp_rate, meso: curr.meso_rate, drop: curr.drop_rate },
        });
      }
    }

    // Alerts
    const alerts: string[] = [];
    if (Math.abs(mesoPerDay) > 10) alerts.push(`Meso ${mesoPerDay > 0 ? "inflation" : "deflation"} at ${Math.abs(Math.round(mesoPerDay))}%/day`);
    if (levelVelocityPerDay > 5) alerts.push(`Rapid leveling: +${levelVelocityPerDay.toFixed(1)} avg levels/day`);
    if (Math.abs(itemChangePct) > 20) alerts.push(`Item count ${itemChangePct > 0 ? "surge" : "drop"}: ${Math.round(itemChangePct)}% over period`);
    if (activeAccounts7dChange < 0) alerts.push(`Active players declining: ${activeAccounts7dChange} active accounts (7d) lost`);
    if ((newest.total_online || 0) === 0) alerts.push("No players currently online");

    return NextResponse.json({
      period: { hours: hoursElapsed, snapshots: snapshots.length, from: oldest.taken_at, to: newest.taken_at },
      economy: {
        mesoChange,
        mesoChangePct: Math.round(mesoChangePct * 10) / 10,
        mesoInflationPerDay: Math.round(mesoPerDay * 10) / 10,
        storageMesoChange,
        currentTotal: Number(newest.total_meso),
        avgPerPlayer: newest.avg_meso_per_player,
      },
      progression: {
        avgLevelChange: Math.round(avgLevelChange * 10) / 10,
        levelVelocityPerDay: Math.round(levelVelocityPerDay * 10) / 10,
        currentAvgLevel: newest.avg_level,
        currentMaxLevel: newest.max_level,
      },
      items: {
        itemChange,
        itemChangePct: Math.round(itemChangePct * 10) / 10,
        currentTotal: newest.total_items,
      },
      players: {
        characterChange,
        accountChange,
        currentCharacters: newest.total_characters,
        currentAccounts: newest.total_accounts,
        onlineNow: newest.total_online || 0,
        activeCharacters24h: newest.active_characters_24h || 0,
        activeCharacters7d: newest.active_characters_7d || 0,
        activeAccounts24h: newest.active_accounts_24h || 0,
        activeAccounts7d: newest.active_accounts_7d || 0,
        activeChars24hChange,
        activeChars7dChange,
        activeAccounts24hChange,
        activeAccounts7dChange,
      },
      rates: {
        current: { exp: newest.exp_rate, meso: newest.meso_rate, drop: newest.drop_rate },
        changes: rateChanges,
      },
      intervals,
      alerts,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
