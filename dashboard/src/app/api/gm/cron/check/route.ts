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

    // Auto-expire stuck sessions before triggering a new run
    await execute(
      "UPDATE gm_sessions SET status = 'error', completed_at = NOW(), summary = 'Auto-expired: session timed out after 10 minutes' WHERE status = 'running' AND started_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)"
    );

    // It's time to run — trigger the cron endpoint
    const BASE = process.env.COSMIC_DASHBOARD_URL || "http://localhost:3000";
    let result: any = null;
    let fetchError: string | null = null;
    try {
      const res = await fetch(`${BASE}/api/gm/cron`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "scheduled" }),
      });
      result = await res.json();
      if (!res.ok) fetchError = `inner cron returned ${res.status}`;
    } catch (e: any) {
      fetchError = `fetch failed: ${e.message}`;
    }

    // Only advance the full schedule interval when a session actually started.
    // Otherwise back off 15 min so the next cron tick retries — a single timeout
    // or 409/503 shouldn't silently skip 12h of scheduled runs.
    const sessionStarted = Boolean(result?.sessionId);
    if (sessionStarted) {
      await execute(
        "UPDATE gm_schedule SET last_run = NOW(), next_run = DATE_ADD(NOW(), INTERVAL interval_hours HOUR) WHERE id = 1"
      );
      return NextResponse.json({ action: "ran", result });
    }

    await execute(
      "UPDATE gm_schedule SET next_run = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id = 1"
    );
    return NextResponse.json({
      action: "retry",
      reason: fetchError || result?.error || "no session started",
      result,
    });
  } catch (err: any) {
    return NextResponse.json({ action: "error", error: err.message }, { status: 500 });
  }
}
