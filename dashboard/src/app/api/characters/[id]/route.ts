import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const charId = parseInt(idStr);

  if (isNaN(charId)) {
    return NextResponse.json({ error: "Invalid character ID" }, { status: 400 });
  }

  try {
    const rows = await query(
      "SELECT id, accountid, `name`, level, exp, job, str, dex, `int`, luk, hp, mp, maxhp, maxmp, meso, fame, ap, sp, map, gm, skincolor, gender, hair, face FROM characters WHERE id = ?",
      [charId],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to query character. Is the database running?", details: err.message },
      { status: 500 },
    );
  }
}

const ALLOWED_FIELDS = [
  "level", "str", "dex", "int", "luk", "maxhp", "maxmp", "meso",
  "fame", "ap", "sp", "job", "map", "exp", "hp", "mp", "gm",
];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const charId = parseInt(idStr);

  if (isNaN(charId)) {
    return NextResponse.json({ error: "Invalid character ID" }, { status: 400 });
  }

  try {
    const body = await request.json() as Record<string, any>;

    const setClauses: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(body)) {
      // Map "int" field name to backtick-quoted version
      const fieldName = key === "int" ? "`int`" : key;
      const rawKey = key === "int" ? "int" : key;

      if (!ALLOWED_FIELDS.includes(rawKey)) {
        return NextResponse.json(
          { error: `Field '${key}' is not allowed. Allowed: ${ALLOWED_FIELDS.join(", ")}` },
          { status: 400 },
        );
      }

      setClauses.push(`${fieldName} = ?`);
      values.push(value);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(charId);
    const result = await execute(
      `UPDATE characters SET ${setClauses.join(", ")} WHERE id = ?`,
      values,
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Character updated", affectedRows: result.affectedRows });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to update character. Is the database running?", details: err.message },
      { status: 500 },
    );
  }
}
