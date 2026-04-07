import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const character = searchParams.get("character");
  const offset = (page - 1) * limit;

  try {
    let where = "1=1";
    const params: any[] = [];

    if (character) {
      where += " AND character_name LIKE ?";
      params.push(`%${character}%`);
    }

    const rows = await query(
      `SELECT id, character_id, character_name, role, content, model, tool_calls, created_at
       FROM augur_chat_logs WHERE ${where}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const [{ total }] = await query<{ total: number }>(
      `SELECT COUNT(*) as total FROM augur_chat_logs WHERE ${where}`,
      params,
    );

    return NextResponse.json({ logs: rows, total, page, limit });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
