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
4. **React to game state**: Check the "Reactive Events" section in your instructions. Compare snapshot data against the trigger table — if a signal matches, respond with the appropriate event type. The world should feel alive because it IS reacting to real data.
5. **Only if needed**: If a metric has been consistently off across multiple snapshots (not just one), consider a small adjustment.

## Reactive Checklist (check these signals against your snapshot)
- Meso inflation trending up? → Consider a meso sink event
- Active accounts declining? → Consider a hype/comeback event
- Players all grinding the same maps? → Place content in underused areas
- Lots of new low-level accounts? → Beginner-friendly content
- No boss kills recently? → Boss incentive event
- Player feedback repeating the same request? → Act on it

## Important
- If the game looks healthy and no reactive triggers fire, just observe, update goals, and move on. Doing nothing is a valid and often correct choice.
- Prefer creating events and updating existing NPC shops over adjusting rates or stats.
- Don't change rates/mob stats unless there's been a sustained problem over multiple snapshots.
- Consider the current player base: what level are they, what content would be fun for them right now?
- Always clean up events that have served their purpose — don't let stale spawns, reactors, or global drops accumulate forever.
- **Before creating any NPC, check list_custom_npcs first.** Update an existing NPC rather than creating a new one. Only create a new NPC if there's a genuinely unmet need.
- Consider the day and time: weekends are great for bigger events, weekday nights are peak hours.

If this is one of your first runs, focus on observation, goal-setting, and maybe creating a welcome event rather than changing any numbers.`;
}

// Auto-expire events that have passed their expires_at
async function autoExpireEvents(): Promise<string[]> {
  const expired: string[] = [];
  try {
    const events = await query<{ id: number; event_name: string; metadata: string }>(
      "SELECT id, event_name, metadata FROM gm_events WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < NOW()"
    );
    for (const event of events) {
      const meta = typeof event.metadata === "string" ? JSON.parse(event.metadata) : event.metadata;
      if (meta?.plifeIds?.length) {
        await execute(`DELETE FROM plife WHERE id IN (${meta.plifeIds.join(",")})`);
      }
      if (meta?.globalDropIds?.length) {
        await execute(`DELETE FROM drop_data_global WHERE id IN (${meta.globalDropIds.join(",")})`);
      }
      if (meta?.mobDropIds?.length) {
        await execute(`DELETE FROM drop_data WHERE id IN (${meta.mobDropIds.join(",")})`);
      }
      if (meta?.reactorIds?.length) {
        await execute(`DELETE FROM preactor WHERE id IN (${meta.reactorIds.join(",")})`);
      }
      if (meta?.reactorDropIds?.length) {
        for (const rd of meta.reactorDropIds) {
          await execute("DELETE FROM reactordrops WHERE reactorid = ? AND itemid = ?", [rd.reactorId, rd.itemId]);
        }
      }
      await execute("UPDATE gm_events SET status = 'expired' WHERE id = ?", [event.id]);
      expired.push(event.event_name);
    }
  } catch { /* gm_events table may not exist */ }
  return expired;
}

// POST /api/gm/cron — Run the autonomous cycle
// Optional body: { prompt?: string } to override the default prompt
export async function POST(request: NextRequest) {
  // Auto-expire events that have passed their deadline
  const expiredEvents = await autoExpireEvents();

  // Check if another session is already running
  // Auto-expire sessions stuck for more than 10 minutes
  await execute(
    "UPDATE gm_sessions SET status = 'error', completed_at = NOW(), summary = 'Auto-expired: session timed out after 10 minutes' WHERE status = 'running' AND started_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)"
  );

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

  let prompt = body.prompt || buildCronPrompt();
  if (expiredEvents.length > 0) {
    prompt += `\n\n## Auto-Expired Events\nThe following events were automatically cleaned up because they passed their expiry time:\n${expiredEvents.map(e => `- ${e}`).join("\n")}\nTheir spawns, drops, and reactors have been removed.`;
  }
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
