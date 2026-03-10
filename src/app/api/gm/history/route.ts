import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/gm/history?type=sessions|actions|all&limit=10
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type") || "all";
  const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);

  try {
    const result: Record<string, any> = {};

    if (type === "all" || type === "sessions") {
      const sessions = await query(
        `SELECT id, started_at, completed_at, trigger_type, prompt, summary, status, changes_made FROM gm_sessions ORDER BY started_at DESC LIMIT ${limit}`
      );
      result.sessions = sessions.map((s: any) => ({
        id: s.id,
        startedAt: s.started_at,
        completedAt: s.completed_at,
        trigger: s.trigger_type,
        prompt: s.prompt,
        summary: s.summary,
        status: s.status,
        changesMade: s.changes_made,
      }));
    }

    if (type === "all" || type === "actions") {
      const actions = await query(
        `SELECT a.*, s.prompt as session_prompt
         FROM gm_actions a
         LEFT JOIN gm_sessions s ON a.session_id = s.id
         ORDER BY a.executed_at DESC LIMIT ${limit}`
      );
      result.actions = actions.map((a: any) => ({
        id: a.id,
        sessionId: a.session_id,
        executedAt: a.executed_at,
        toolName: a.tool_name,
        toolInput: typeof a.tool_input === "string" ? JSON.parse(a.tool_input) : a.tool_input,
        toolResult: typeof a.tool_result === "string" ? JSON.parse(a.tool_result) : a.tool_result,
        reasoning: a.reasoning,
        category: a.category,
        sessionPrompt: a.session_prompt,
      }));
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
