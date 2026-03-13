import { NextResponse } from "next/server";
import { query } from "@/lib/db";

interface GMSession {
  id: string;
  trigger: string;
  status: string;
  summary: string | null;
  created_at: string;
}

interface GMAction {
  tool_name: string;
  input: string;
  reasoning: string | null;
  created_at: string;
}

// Map GM tool names to news categories
function categorize(toolName: string): string {
  if (toolName.includes("rate") || toolName.includes("config")) return "rates";
  if (toolName.includes("drop")) return "drops";
  if (toolName.includes("event") || toolName.includes("spawn")) return "event";
  return "update";
}

export async function GET() {
  try {
    // Get recent GM AI sessions with summaries
    const sessions = await query<GMSession>(
      `SELECT id, \`trigger\`, status, summary, created_at
       FROM gm_sessions
       WHERE status = 'complete' AND summary IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 10`
    ).catch(() => [] as GMSession[]);

    // Get recent GM actions (write actions that changed the game)
    const actions = await query<GMAction>(
      `SELECT tool_name, input, reasoning, created_at
       FROM gm_actions
       ORDER BY created_at DESC
       LIMIT 20`
    ).catch(() => [] as GMAction[]);

    const news: Array<{ type: string; text: string; date: string }> = [];

    // Convert sessions to news items
    for (const s of sessions) {
      if (s.summary) {
        // Truncate long summaries
        const text = s.summary.length > 200
          ? s.summary.substring(0, 200) + "..."
          : s.summary;
        news.push({
          type: "update",
          text,
          date: s.created_at,
        });
      }
    }

    // Convert notable actions to news items
    for (const a of actions) {
      const type = categorize(a.tool_name);
      const text = a.reasoning || `GM used ${a.tool_name.replace(/_/g, " ")}`;
      // Avoid duplicating session summaries
      if (!news.some((n) => n.date === a.created_at)) {
        news.push({
          type,
          text: text.length > 200 ? text.substring(0, 200) + "..." : text,
          date: a.created_at,
        });
      }
    }

    // Sort by date, most recent first
    news.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json(
      { news: news.slice(0, 15) },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { news: [], error: err.message },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
