import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const accountId = request.nextUrl.searchParams.get("account_id");
    const rows = accountId
      ? await query<any>(
          `SELECT id, session_id, account_id, content, tags, created_at, expires_at
           FROM ban_judge_memory WHERE account_id = ? ORDER BY created_at DESC LIMIT 200`,
          [Number(accountId)]
        )
      : await query<any>(
          `SELECT id, session_id, account_id, content, tags, created_at, expires_at
           FROM ban_judge_memory ORDER BY created_at DESC LIMIT 200`
        );
    return NextResponse.json({ memories: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { content, tags, account_id, expires_days } = await request.json();
    if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });
    const expiresAt = expires_days ? new Date(Date.now() + Number(expires_days) * 86400 * 1000) : null;
    const r = await execute(
      `INSERT INTO ban_judge_memory (session_id, account_id, content, tags, expires_at)
       VALUES (NULL, ?, ?, ?, ?)`,
      [
        account_id ? Number(account_id) : null,
        String(content).slice(0, 2000),
        tags?.length ? JSON.stringify(tags.map((t: any) => String(t))) : null,
        expiresAt,
      ]
    );
    return NextResponse.json({ success: true, id: r.insertId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await execute("DELETE FROM ban_judge_memory WHERE id = ?", [Number(id)]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
