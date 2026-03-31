import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET — Fetch cheat flags
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("account_id");

    // Per-player detail view
    if (accountId) {
      const flags = await query(
        `SELECT * FROM cheat_flags WHERE account_id = ? ORDER BY flagged_at DESC LIMIT 200`,
        [Number(accountId)]
      );
      return NextResponse.json({ flags });
    }

    // Aggregated player view (default)
    const players = await query(
      `SELECT
          account_id,
          character_name,
          COUNT(*) as total_flags,
          SUM(reviewed = 0) as unreviewed_flags,
          GROUP_CONCAT(DISTINCT violation_type) as violation_types,
          MIN(flagged_at) as first_flagged,
          MAX(flagged_at) as last_flagged,
          COUNT(DISTINCT map_id) as unique_maps,
          MAX(review_result) as latest_verdict
       FROM cheat_flags
       GROUP BY account_id, character_name
       ORDER BY SUM(reviewed = 0) DESC, total_flags DESC
       LIMIT 50`
    );

    // Top violation types with counts
    const violations = await query(
      `SELECT violation_type, COUNT(*) as cnt, COUNT(DISTINCT account_id) as players
       FROM cheat_flags WHERE reviewed = 0
       GROUP BY violation_type ORDER BY cnt DESC`
    );

    return NextResponse.json({ players, violations });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch cheat flags", details: err.message },
      { status: 500 }
    );
  }
}

// PUT — Mark flags as reviewed
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { flag_ids, account_id, result, notes } = body;

    if (!result) {
      return NextResponse.json({ error: "result is required" }, { status: 400 });
    }

    // Bulk by account — mark all unreviewed flags for this account
    if (account_id && !flag_ids) {
      const res = await execute(
        `UPDATE cheat_flags SET reviewed = 1, reviewed_at = NOW(), review_result = ?, review_notes = ?
         WHERE account_id = ? AND reviewed = 0`,
        [result, notes || null, Number(account_id)]
      );
      return NextResponse.json({ success: true, updated: res.affectedRows });
    }

    // By specific flag IDs
    if (!flag_ids?.length) {
      return NextResponse.json({ error: "flag_ids or account_id required" }, { status: 400 });
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
