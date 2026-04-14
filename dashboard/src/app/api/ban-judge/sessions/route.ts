import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessions = await query<any>(
      `SELECT id, started_at, completed_at, status, model, summary,
              accounts_reviewed, verdicts_count, error
       FROM ban_judge_sessions
       ORDER BY started_at DESC LIMIT 50`
    );
    return NextResponse.json({ sessions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
