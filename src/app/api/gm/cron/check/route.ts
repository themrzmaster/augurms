import { NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/gm/cron/check — Called by external cron (every 5-10 min)
// Checks if auto-tuning is enabled and it's time to run
export async function GET() {
  try {
    const [schedule] = await query("SELECT * FROM gm_schedule WHERE id = 1");
    if (!schedule) return NextResponse.json({ action: "skip", reason: "no schedule config" });

    const s = schedule as any;

    if (!s.enabled) {
      return NextResponse.json({ action: "skip", reason: "auto-tuning disabled" });
    }

    if (s.next_run && new Date(s.next_run) > new Date()) {
      return NextResponse.json({
        action: "skip",
        reason: "not yet time",
        nextRun: s.next_run,
      });
    }

    // It's time to run — trigger the cron endpoint
    const BASE = process.env.COSMIC_DASHBOARD_URL || "http://localhost:3000";
    const res = await fetch(`${BASE}/api/gm/cron`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "scheduled" }),
    });

    const result = await res.json();

    // Update schedule: set last_run and next_run
    await execute(
      "UPDATE gm_schedule SET last_run = NOW(), next_run = DATE_ADD(NOW(), INTERVAL interval_hours HOUR) WHERE id = 1"
    );

    return NextResponse.json({ action: "ran", result });
  } catch (err: any) {
    return NextResponse.json({ action: "error", error: err.message }, { status: 500 });
  }
}
