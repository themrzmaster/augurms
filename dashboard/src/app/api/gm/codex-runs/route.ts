import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

function parseJson(v: any) {
  if (v == null) return null;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
}

// GET /api/gm/codex-runs?limit=10
// Returns the last N delegate_code_change actions with their parsed result + session info.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10"), 1), 50);

  try {
    const rows = await query(
      `SELECT a.id, a.session_id, a.executed_at, a.tool_input, a.tool_result, s.summary as session_summary, s.status as session_status
       FROM gm_actions a
       LEFT JOIN gm_sessions s ON a.session_id = s.id
       WHERE a.tool_name = 'delegate_code_change'
       ORDER BY a.executed_at DESC
       LIMIT ${limit}`
    );

    const runs = rows.map((r: any) => {
      const input = parseJson(r.tool_input) || {};
      const result = parseJson(r.tool_result) || {};
      return {
        id: r.id,
        executedAt: r.executed_at,
        sessionId: r.session_id,
        sessionStatus: r.session_status,
        sessionSummary: r.session_summary,
        title: input.title || "(untitled)",
        area: input.area || null,
        task: input.task || null,
        status: result.status || "unknown",
        prUrl: result.prUrl || null,
        prNumber: result.prNumber || null,
        issueUrl: result.issueUrl || null,
        runUrl: result.runUrl || null,
        branchSlug: result.branchSlug || null,
        trackingId: result.trackingId || null,
        reason: result.reason || result.error || null,
      };
    });

    return NextResponse.json({ runs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
