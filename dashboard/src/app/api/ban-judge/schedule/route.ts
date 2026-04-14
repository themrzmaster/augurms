import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [s] = await query<any>("SELECT * FROM ban_judge_schedule WHERE id = 1");
    if (!s) return NextResponse.json({ enabled: false });
    return NextResponse.json({
      enabled: !!s.enabled,
      model: s.model,
      dailyHourUtc: s.daily_hour_utc,
      autoApplyThreshold: s.auto_apply_threshold,
      lookbackDays: s.lookback_days,
      lastRun: s.last_run,
      nextRun: s.next_run,
      updatedAt: s.updated_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { enabled, model, dailyHourUtc, autoApplyThreshold, lookbackDays } = body;

    const updates: string[] = [];
    const params: any[] = [];

    if (enabled !== undefined) { updates.push("enabled = ?"); params.push(enabled ? 1 : 0); }
    if (model !== undefined) { updates.push("model = ?"); params.push(String(model)); }
    if (dailyHourUtc !== undefined) {
      const h = Math.max(0, Math.min(23, Number(dailyHourUtc)));
      updates.push("daily_hour_utc = ?"); params.push(h);
    }
    if (autoApplyThreshold !== undefined) {
      const t = Math.max(0, Math.min(101, Number(autoApplyThreshold)));
      updates.push("auto_apply_threshold = ?"); params.push(t);
    }
    if (lookbackDays !== undefined) {
      const d = Math.max(1, Math.min(90, Number(lookbackDays)));
      updates.push("lookback_days = ?"); params.push(d);
    }

    if (!updates.length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    // If enabling, compute next_run for today (or tomorrow if already past)
    if (enabled) {
      const [current] = await query<any>("SELECT daily_hour_utc FROM ban_judge_schedule WHERE id = 1");
      const hour = dailyHourUtc !== undefined
        ? Math.max(0, Math.min(23, Number(dailyHourUtc)))
        : (current?.daily_hour_utc ?? 3);
      const now = new Date();
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
      updates.push("next_run = ?"); params.push(next);
    }

    await execute(`UPDATE ban_judge_schedule SET ${updates.join(", ")} WHERE id = 1`, params);

    const [s] = await query<any>("SELECT * FROM ban_judge_schedule WHERE id = 1");
    return NextResponse.json({
      enabled: !!s.enabled,
      model: s.model,
      dailyHourUtc: s.daily_hour_utc,
      autoApplyThreshold: s.auto_apply_threshold,
      lookbackDays: s.lookback_days,
      lastRun: s.last_run,
      nextRun: s.next_run,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
