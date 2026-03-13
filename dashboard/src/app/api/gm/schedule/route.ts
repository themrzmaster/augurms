import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET — Current schedule config
export async function GET() {
  try {
    const [schedule] = await query(
      "SELECT * FROM gm_schedule WHERE id = 1"
    );
    if (!schedule) {
      return NextResponse.json({ enabled: false, intervalHours: 4, lastRun: null, nextRun: null });
    }
    const s = schedule as any;
    return NextResponse.json({
      enabled: !!s.enabled,
      intervalHours: s.interval_hours,
      model: s.model || "moonshotai/kimi-k2.5",
      lastRun: s.last_run,
      nextRun: s.next_run,
      updatedAt: s.updated_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT — Update schedule config
export async function PUT(request: NextRequest) {
  try {
    const { enabled, intervalHours, model } = await request.json();

    const updates: string[] = [];
    const params: any[] = [];

    if (enabled !== undefined) {
      updates.push("enabled = ?");
      params.push(enabled ? 1 : 0);
    }
    if (intervalHours !== undefined) {
      const hours = Math.max(1, Math.min(24, intervalHours));
      updates.push("interval_hours = ?");
      params.push(hours);
    }
    if (model !== undefined) {
      updates.push("model = ?");
      params.push(model);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    // If enabling, set next_run
    if (enabled) {
      const interval = intervalHours || 4;
      updates.push("next_run = DATE_ADD(NOW(), INTERVAL ? HOUR)");
      params.push(interval);
    }

    updates.push("updated_at = NOW()");

    await execute(
      `UPDATE gm_schedule SET ${updates.join(", ")} WHERE id = 1`,
      params
    );

    // Return updated config
    const [schedule] = await query("SELECT * FROM gm_schedule WHERE id = 1");
    const s = schedule as any;
    return NextResponse.json({
      enabled: !!s.enabled,
      intervalHours: s.interval_hours,
      model: s.model || "moonshotai/kimi-k2.5",
      lastRun: s.last_run,
      nextRun: s.next_run,
      updatedAt: s.updated_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
