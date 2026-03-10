import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET — List goals, optionally filtered by status
export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status");
  try {
    const goals = status
      ? await query("SELECT * FROM gm_goals WHERE status = ? ORDER BY created_at DESC", [status])
      : await query("SELECT * FROM gm_goals ORDER BY created_at DESC");

    return NextResponse.json(
      goals.map((g: any) => ({
        id: g.id,
        createdAt: g.created_at,
        goal: g.goal,
        targetMetric: g.target_metric,
        targetValue: g.target_value,
        currentValue: g.current_value,
        status: g.status,
        lastChecked: g.last_checked,
      }))
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — Create a new goal
export async function POST(request: NextRequest) {
  try {
    const { goal, targetMetric, targetValue, currentValue } = await request.json();
    if (!goal || !targetMetric || targetValue === undefined) {
      return NextResponse.json({ error: "goal, targetMetric, and targetValue are required" }, { status: 400 });
    }

    const result = await execute(
      "INSERT INTO gm_goals (goal, target_metric, target_value, current_value, status, last_checked) VALUES (?, ?, ?, ?, 'active', NOW())",
      [goal, targetMetric, targetValue, currentValue ?? null]
    );

    return NextResponse.json({ id: result.insertId, goal, targetMetric, targetValue, status: "active" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT — Update a goal (status, currentValue, etc.)
export async function PUT(request: NextRequest) {
  try {
    const { id, status, currentValue, targetValue } = await request.json();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const updates: string[] = [];
    const params: any[] = [];

    if (status) { updates.push("status = ?"); params.push(status); }
    if (currentValue !== undefined) { updates.push("current_value = ?"); params.push(currentValue); }
    if (targetValue !== undefined) { updates.push("target_value = ?"); params.push(targetValue); }
    updates.push("last_checked = NOW()");

    if (updates.length === 1) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

    params.push(id);
    await execute(`UPDATE gm_goals SET ${updates.join(", ")} WHERE id = ?`, params);

    return NextResponse.json({ ok: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
