import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

export async function GET(_request: NextRequest) {
  try {
    const rows = await query(
      `SELECT a.id, a.name, a.loggedin, a.lastlogin, a.createdat, a.banned, a.banreason,
              a.nxCredit, a.maplePoint, a.nxPrepaid, a.characterslots, a.mute,
              COUNT(c.id) as charCount,
              COALESCE(MAX(c.level), 0) as maxLevel
       FROM accounts a
       LEFT JOIN characters c ON c.accountid = a.id
       GROUP BY a.id
       ORDER BY a.id ASC LIMIT 100`,
    );
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to query accounts. Is the database running?", details: err.message },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, banned, banreason, mute } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const updates: string[] = [];
    const params: any[] = [];

    if (banned !== undefined) { updates.push("banned = ?"); params.push(banned ? 1 : 0); }
    if (banreason !== undefined) { updates.push("banreason = ?"); params.push(banreason); }
    if (mute !== undefined) { updates.push("mute = ?"); params.push(mute ? 1 : 0); }

    if (updates.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    params.push(id);
    await execute(`UPDATE accounts SET ${updates.join(", ")} WHERE id = ?`, params);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
