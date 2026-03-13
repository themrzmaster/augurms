import { NextResponse } from "next/server";
import { query } from "@/lib/db";

interface GMSession {
  id: string;
  trigger_type: string;
  status: string;
  summary: string | null;
  started_at: string;
}

interface GMAction {
  tool_name: string;
  tool_input: string;
  reasoning: string | null;
  executed_at: string;
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
      `SELECT id, trigger_type, status, summary, started_at
       FROM gm_sessions
       WHERE status = 'complete' AND summary IS NOT NULL
       ORDER BY started_at DESC
       LIMIT 10`
    ).catch(() => [] as GMSession[]);

    // Get recent GM actions (write actions that changed the game)
    const actions = await query<GMAction>(
      `SELECT tool_name, tool_input, reasoning, executed_at
       FROM gm_actions
       ORDER BY executed_at DESC
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
          date: s.started_at,
        });
      }
    }

    // Convert notable actions to news items
    for (const a of actions) {
      const type = categorize(a.tool_name);
      const text = a.reasoning || `GM used ${a.tool_name.replace(/_/g, " ")}`;
      // Avoid duplicating session summaries
      if (!news.some((n) => n.date === a.executed_at)) {
        news.push({
          type,
          text: text.length > 200 ? text.substring(0, 200) + "..." : text,
          date: a.executed_at,
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
