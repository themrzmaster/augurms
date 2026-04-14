import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

export const dynamic = "force-dynamic";

// PUT /api/ban-judge/verdicts/[id] — apply | dismiss | overturn a verdict.
// Actions:
//   apply    — enforce the agent's verdict (if ban → banned=1). Verdict="warn"|"innocent" just marks applied.
//   dismiss  — reject the AI's verdict without action (noise / false positive).
//   overturn — undo a previously applied verdict (unban).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { action, admin, note } = await request.json();

    const [v] = await query<any>("SELECT * FROM ban_verdicts WHERE id = ?", [Number(id)]);
    if (!v) return NextResponse.json({ error: "verdict not found" }, { status: 404 });

    const actor = admin || "admin";

    if (action === "apply") {
      if (v.applied) return NextResponse.json({ error: "already applied" }, { status: 400 });
      if (v.verdict === "ban") {
        await execute(
          "UPDATE accounts SET banned = 1, banreason = ? WHERE id = ?",
          [`Ban Judge: ${String(v.reasoning || "").slice(0, 200)}`, v.account_id]
        );
      }
      await execute(
        "UPDATE ban_verdicts SET applied = 1, applied_at = NOW(), applied_by = ? WHERE id = ?",
        [actor, Number(id)]
      );
      return NextResponse.json({ success: true, action: "applied" });
    }

    if (action === "dismiss") {
      await execute(
        "UPDATE ban_verdicts SET dismissed_at = NOW(), dismissed_by = ?, overturned_reason = ? WHERE id = ?",
        [actor, note || null, Number(id)]
      );
      return NextResponse.json({ success: true, action: "dismissed" });
    }

    if (action === "overturn") {
      if (v.applied && v.verdict === "ban") {
        await execute(
          "UPDATE accounts SET banned = 0, banreason = NULL WHERE id = ?",
          [v.account_id]
        );
      }
      await execute(
        "UPDATE ban_verdicts SET overturned_at = NOW(), overturned_by = ?, overturned_reason = ? WHERE id = ?",
        [actor, note || "overturned by admin", Number(id)]
      );
      return NextResponse.json({ success: true, action: "overturned" });
    }

    return NextResponse.json({ error: "invalid action — use apply|dismiss|overturn" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
