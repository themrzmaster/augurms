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

    // Self-healing gate: if any session started within the last
    // interval_hours/2, treat as already-handled regardless of next_run. This
    // protects against fetch-timeout races where a long-running session causes
    // the inner POST to look failed (so next_run gets bumped to +15min) even
    // though the session ran to completion in the background.
    const intervalHours = Number(s.interval_hours) || 12;
    const halfInterval = Math.max(1, Math.floor(intervalHours / 2));
    const recentSession = await query<{ id: string; started_at: string }>(
      `SELECT id, started_at FROM gm_sessions WHERE started_at > DATE_SUB(NOW(), INTERVAL ? HOUR) ORDER BY started_at DESC LIMIT 1`,
      [halfInterval]
    );
    if (recentSession.length > 0) {
      const startedAt = recentSession[0].started_at;
      await execute(
        "UPDATE gm_schedule SET last_run = ?, next_run = DATE_ADD(?, INTERVAL interval_hours HOUR) WHERE id = 1",
        [startedAt, startedAt]
      );
      return NextResponse.json({
        action: "skip",
        reason: `recent session within ${halfInterval}h — schedule resynced`,
        sessionId: recentSession[0].id,
        startedAt,
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
    let innerOk = false;
    try {
      const res = await fetch(`${BASE}/api/gm/cron`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gm-secret": process.env.GM_API_SECRET || "",
        },
        body: JSON.stringify({ trigger: "scheduled" }),
      });
      innerOk = res.ok;
      result = await res.json();
      if (!res.ok) fetchError = `inner cron returned ${res.status}`;
    } catch (e: any) {
      fetchError = `fetch failed: ${e.message}`;
    }

    // Only advance the full schedule interval when a session actually started.
    // 409 "already running" also returns a sessionId (of the existing run), so
    // require res.ok — otherwise a single 409 would silently skip 12h.
    const sessionStarted = innerOk && Boolean(result?.sessionId);
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
