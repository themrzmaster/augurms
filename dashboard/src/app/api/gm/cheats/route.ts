import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET — Fetch cheat flags, optionally filtered
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reviewed = searchParams.get("reviewed"); // "0" for unreviewed, "1" for reviewed
    const accountId = searchParams.get("account_id");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

    let sql = "SELECT * FROM cheat_flags WHERE 1=1";
    const params: (string | number)[] = [];

    if (reviewed !== null) {
      sql += " AND reviewed = ?";
      params.push(parseInt(reviewed));
    }
    if (accountId) {
      sql += " AND account_id = ?";
      params.push(parseInt(accountId));
    }

    sql += " ORDER BY flagged_at DESC LIMIT ?";
    params.push(limit);

    const flags = await query(sql, params);

    // Also get a summary per account for unreviewed flags
    const summary = await query(
      `SELECT account_id, character_name, COUNT(*) as flag_count,
              GROUP_CONCAT(DISTINCT violation_type) as violation_types,
              MAX(flagged_at) as last_flagged
       FROM cheat_flags WHERE reviewed = 0
       GROUP BY account_id, character_name
       ORDER BY flag_count DESC
       LIMIT 20`
    );

    return NextResponse.json({ flags, summary });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch cheat flags", details: err.message },
      { status: 500 }
    );
  }
}

// PUT — Mark flags as reviewed (by AI GM or admin)
export async function PUT(request: NextRequest) {
  try {
    const { flag_ids, result, notes } = await request.json();

    if (!flag_ids?.length || !result) {
      return NextResponse.json(
        { error: "flag_ids (array) and result are required" },
        { status: 400 }
      );
    }

    const placeholders = flag_ids.map(() => "?").join(",");
    await execute(
      `UPDATE cheat_flags SET reviewed = 1, reviewed_at = NOW(), review_result = ?, review_notes = ?
       WHERE id IN (${placeholders})`,
      [result, notes || null, ...flag_ids]
    );

    return NextResponse.json({ success: true, updated: flag_ids.length });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to update cheat flags", details: err.message },
      { status: 500 }
    );
  }
}
