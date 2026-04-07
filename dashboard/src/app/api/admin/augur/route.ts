import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

// GET: config + stats
export async function GET() {
  try {
    const [config] = await query("SELECT * FROM augur_config WHERE id = 1");

    const [{ total }] = await query<{ total: number }>(
      "SELECT COUNT(*) as total FROM augur_chat_logs WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)",
    );
    const [{ users }] = await query<{ users: number }>(
      "SELECT COUNT(DISTINCT character_id) as users FROM augur_chat_logs WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)",
    );
    const [{ allTime }] = await query<{ allTime: number }>(
      "SELECT COUNT(*) as allTime FROM augur_chat_logs",
    );

    return NextResponse.json({ config, stats: { messagesToday: total, uniquePlayersToday: users, allTimeMessages: allTime } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT: update config
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const allowed = ["enabled", "model", "system_prompt", "greeting", "max_messages_per_day", "max_tokens_per_response", "tools_enabled"];

    const updates: string[] = [];
    const values: any[] = [];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(body[key]);
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await execute(`UPDATE augur_config SET ${updates.join(", ")} WHERE id = 1`, values);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
