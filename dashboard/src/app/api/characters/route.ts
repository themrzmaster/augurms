import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const accountId = searchParams.get("accountId");
  const q = searchParams.get("q");

  try {
    let sql = "SELECT id, `name`, level, job, str, dex, `int`, luk, maxhp, maxmp, meso, fame, map, gm FROM characters";
    const params: any[] = [];
    const conditions: string[] = [];

    if (accountId) {
      conditions.push("accountid = ?");
      params.push(parseInt(accountId));
    }

    if (q) {
      conditions.push("`name` LIKE ?");
      params.push(`%${q}%`);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY level DESC LIMIT 100";

    const rows = await query(sql, params);
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to query characters. Is the database running?", details: err.message },
      { status: 500 },
    );
  }
}
