import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/ban-judge/verdicts?status=pending|applied|dismissed|overturned|all
export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get("status") || "pending";
    let where = "1=1";
    if (status === "pending") where = "applied = 0 AND dismissed_at IS NULL AND overturned_at IS NULL";
    else if (status === "applied") where = "applied = 1 AND overturned_at IS NULL";
    else if (status === "dismissed") where = "dismissed_at IS NOT NULL";
    else if (status === "overturned") where = "overturned_at IS NOT NULL";

    const rows = await query<any>(
      `SELECT v.*, a.banned as account_banned, a.banreason as account_banreason
       FROM ban_verdicts v
       LEFT JOIN accounts a ON a.id = v.account_id
       WHERE ${where}
       ORDER BY
         CASE v.verdict
           WHEN 'ban' THEN 0
           WHEN 'escalate' THEN 1
           WHEN 'warn' THEN 2
           WHEN 'watch' THEN 3
           WHEN 'innocent' THEN 4
         END ASC,
         v.confidence DESC,
         v.created_at DESC
       LIMIT 300`
    );
    return NextResponse.json({ verdicts: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
