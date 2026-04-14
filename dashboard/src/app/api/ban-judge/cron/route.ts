import { NextRequest, NextResponse } from "next/server";
import { runBanJudge } from "@/lib/ban-judge/engine";
import { query, execute } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/ban-judge/cron — Run the ban judge once
export async function POST(_request: NextRequest) {
  // Auto-expire sessions stuck > 15 minutes
  await execute(
    "UPDATE ban_judge_sessions SET status = 'error', completed_at = NOW(), error = 'Auto-expired: session timed out' WHERE status = 'running' AND started_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)"
  );

  const running = await query<any>(
    "SELECT id FROM ban_judge_sessions WHERE status = 'running' LIMIT 1"
  );
  if (running.length > 0) {
    return NextResponse.json(
      { error: "A ban judge session is already running", sessionId: running[0].id },
      { status: 409 }
    );
  }

  // Circuit breaker: 3 consecutive errors = stop
  const recent = await query<any>(
    "SELECT status FROM ban_judge_sessions ORDER BY started_at DESC LIMIT 3"
  );
  if (recent.length === 3 && recent.every((s: any) => s.status === "error")) {
    return NextResponse.json(
      { error: "Circuit breaker tripped: 3 consecutive errors." },
      { status: 503 }
    );
  }

  try {
    const session = await runBanJudge();
    return NextResponse.json({
      sessionId: session.id,
      status: session.status,
      summary: session.summary,
      accountsReviewed: session.accountsReviewed,
      verdictsCount: session.verdictsCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
