import { NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/ban-judge/cron/check — polled by external cron every ~15 min.
// Triggers the daily run once per day at the configured UTC hour.
export async function GET() {
  try {
    const [schedule] = await query<any>("SELECT * FROM ban_judge_schedule WHERE id = 1");
    if (!schedule) return NextResponse.json({ action: "skip", reason: "no schedule config" });
    if (!schedule.enabled) return NextResponse.json({ action: "skip", reason: "ban judge disabled" });

    if (schedule.next_run && new Date(schedule.next_run) > new Date()) {
      return NextResponse.json({ action: "skip", reason: "not yet time", nextRun: schedule.next_run });
    }

    // Expire stuck sessions
    await execute(
      "UPDATE ban_judge_sessions SET status = 'error', completed_at = NOW(), error = 'Auto-expired' WHERE status = 'running' AND started_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)"
    );

    const BASE = process.env.COSMIC_DASHBOARD_URL || "http://localhost:3000";
    const gmSecret = process.env.GM_API_SECRET || "";
    const res = await fetch(`${BASE}/api/ban-judge/cron`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(gmSecret ? { "x-gm-secret": gmSecret } : {}),
      },
    });
    const result = await res.json();

    // Schedule next run for the configured daily hour UTC (tomorrow if already passed today)
    const now = new Date();
    const hour = Math.max(0, Math.min(23, schedule.daily_hour_utc ?? 3));
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);

    await execute(
      "UPDATE ban_judge_schedule SET last_run = NOW(), next_run = ? WHERE id = 1",
      [next]
    );

    return NextResponse.json({ action: "ran", result, nextRun: next.toISOString() });
  } catch (err: any) {
    return NextResponse.json({ action: "error", error: err.message }, { status: 500 });
  }
}
