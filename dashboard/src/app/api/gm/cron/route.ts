import { NextRequest, NextResponse } from "next/server";
import { runGameMaster } from "@/lib/gamemaster/engine";
import { query, execute } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min max for autonomous runs

function buildCronPrompt(): string {
  const now = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = days[now.getUTCDay()];
  const hour = now.getUTCHours();
  const isWeekend = now.getUTCDay() === 0 || now.getUTCDay() === 6;

  return `SCHEDULED CHECK — ${now.toISOString()} (${dayName}, ${hour}:00 UTC)

You are performing a scheduled game check.${isWeekend ? " It's the weekend — great time for bigger events if players are active." : ""}

## Priority Order
1. **Snapshot & observe**: Take a snapshot, check trends, review your history and goals
2. **Review active events**: Check what events are currently running (your historical context shows them). Clean up anything that has run its course — stale events clutter the world.
3. **Check game health**: Is anything clearly broken? (runaway inflation, dead servers, progression stuck)
4. **Content opportunity**: Is there something fun you can add? Think events, special spawns, announcements, treasure hunts, boss invasions. The world should feel alive and surprising.
5. **Only if needed**: If a metric has been consistently off across multiple snapshots (not just one), consider a small adjustment.

## Important
- If the game looks healthy, just observe, update goals, and move on. Doing nothing is a valid and often correct choice.
- Prefer creating events and content over adjusting rates or stats.
- Don't change rates/mob stats unless there's been a sustained problem over multiple snapshots.
- Consider the current player base: what level are they, what content would be fun for them right now?
- Always clean up events that have served their purpose — don't let stale spawns, reactors, or global drops accumulate forever.
- Consider the day and time: weekends are great for bigger events, weekday nights are peak hours.

If this is one of your first runs, focus on observation, goal-setting, and maybe creating a welcome event rather than changing any numbers.`;
}

// POST /api/gm/cron — Run the autonomous cycle
// Optional body: { prompt?: string } to override the default prompt
export async function POST(request: NextRequest) {
  // Check if another session is already running
  const running = await query(
    "SELECT id FROM gm_sessions WHERE status = 'running' LIMIT 1"
  );
  if (running.length > 0) {
    return NextResponse.json(
      { error: "A GM session is already running", sessionId: (running[0] as any).id },
      { status: 409 }
    );
  }

  // Check circuit breaker: 3 consecutive errors = stop
  const recentSessions = await query(
    "SELECT status FROM gm_sessions ORDER BY started_at DESC LIMIT 3"
  );
  const allErrors = recentSessions.length === 3 && recentSessions.every((s: any) => s.status === "error");
  if (allErrors) {
    return NextResponse.json(
      { error: "Circuit breaker tripped: 3 consecutive errors. Fix the issue and run manually first." },
      { status: 503 }
    );
  }

  let body: any = {};
  try { body = await request.json(); } catch { /* no body is fine */ }

  const prompt = body.prompt || buildCronPrompt();
  const trigger = body.trigger || "scheduled";

  // Collect results (non-streaming for cron)
  const log: any[] = [];

  try {
    const session = await runGameMaster(
      prompt,
      (entry) => { log.push(entry); },
      trigger as "manual" | "scheduled" | "alert"
    );

    return NextResponse.json({
      sessionId: session.id,
      status: session.status,
      summary: session.summary,
      changesMade: session.log.filter(
        (e) => e.type === "tool_call" && e.result
      ).length,
      toolCalls: session.log
        .filter((e): e is Extract<typeof e, { type: "tool_call" }> => e.type === "tool_call")
        .map((e) => ({ name: e.tool.name, input: e.tool.input })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
