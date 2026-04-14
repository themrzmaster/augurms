import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [session] = await query<any>(
      `SELECT * FROM ban_judge_sessions WHERE id = ?`,
      [id]
    );
    if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });

    const actions = await query<any>(
      `SELECT id, tool_name, tool_input, tool_result, reasoning, executed_at
       FROM ban_judge_actions WHERE session_id = ? ORDER BY id ASC`,
      [id]
    );

    const verdicts = await query<any>(
      `SELECT id, account_id, character_name, verdict, confidence, reasoning,
              evidence_json, flag_ids_considered, applied, applied_at, applied_by,
              overturned_at, dismissed_at, created_at
       FROM ban_verdicts WHERE session_id = ? ORDER BY created_at ASC`,
      [id]
    );

    const memories = await query<any>(
      `SELECT id, account_id, content, tags, created_at, expires_at
       FROM ban_judge_memory WHERE session_id = ? ORDER BY created_at ASC`,
      [id]
    );

    return NextResponse.json({ session, actions, verdicts, memories });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
