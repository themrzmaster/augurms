import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Valid map IDs are > 0 (mapId=0 comes from cleanup_event with no real map)
const MAP_FILTER = `JSON_EXTRACT(tool_input, '$.mapId') IS NOT NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(tool_input, '$.mapId')) != 'null'
  AND CAST(JSON_UNQUOTE(JSON_EXTRACT(tool_input, '$.mapId')) AS UNSIGNED) > 0`;

const GLOBAL_FILTER = `(JSON_EXTRACT(tool_input, '$.mapId') IS NULL
  OR JSON_UNQUOTE(JSON_EXTRACT(tool_input, '$.mapId')) = 'null'
  OR CAST(JSON_UNQUOTE(JSON_EXTRACT(tool_input, '$.mapId')) AS UNSIGNED) = 0)`;

function formatAction(a: any) {
  return {
    id: a.id,
    toolName: a.tool_name,
    toolInput:
      typeof a.tool_input === "string"
        ? JSON.parse(a.tool_input)
        : a.tool_input,
    toolResult:
      typeof a.tool_result === "string"
        ? JSON.parse(a.tool_result)
        : a.tool_result,
    reasoning: a.reasoning,
    category: a.category,
    executedAt: a.executed_at,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mapId = searchParams.get("mapId");
  const days = searchParams.get("days"); // time filter: 7, 30, 90, or null for all

  const timeClause = days
    ? `AND executed_at >= DATE_SUB(NOW(), INTERVAL ${parseInt(days)} DAY)`
    : "";

  try {
    if (mapId) {
      const actions = await query(
        `SELECT id, session_id, tool_name, tool_input, tool_result, reasoning, category, executed_at
         FROM gm_actions
         WHERE JSON_UNQUOTE(JSON_EXTRACT(tool_input, '$.mapId')) = ?
           ${timeClause}
         ORDER BY executed_at DESC
         LIMIT 100`,
        [mapId]
      );
      return NextResponse.json({ actions: actions.map(formatAction) });
    }

    // Action counts grouped by mapId and category (exclude removes/cleanups for global view)
    const counts = await query(
      `SELECT
         JSON_UNQUOTE(JSON_EXTRACT(tool_input, '$.mapId')) as map_id,
         category,
         COUNT(*) as count,
         MAX(executed_at) as last_action
       FROM gm_actions
       WHERE ${MAP_FILTER} ${timeClause}
         AND tool_name NOT LIKE 'remove_%'
         AND tool_name NOT LIKE 'cleanup_%'
       GROUP BY map_id, category
       ORDER BY last_action DESC`
    );

    // ALL recent actions for the feed
    const recent = await query(
      `SELECT id, tool_name, tool_input, tool_result, reasoning, category, executed_at
       FROM gm_actions
       WHERE 1=1 ${timeClause}
       ORDER BY executed_at DESC
       LIMIT 50`
    );

    // Global action counts (no mapId) by category
    const globalCounts = await query(
      `SELECT category, COUNT(*) as count, MAX(executed_at) as last_action
       FROM gm_actions
       WHERE ${GLOBAL_FILTER} ${timeClause}
       GROUP BY category
       ORDER BY last_action DESC`
    );

    return NextResponse.json(
      {
        counts: counts.map((c: any) => ({
          mapId: parseInt(c.map_id),
          category: c.category,
          count: c.count,
          lastAction: c.last_action,
        })),
        globalCounts: globalCounts.map((c: any) => ({
          category: c.category,
          count: c.count,
          lastAction: c.last_action,
        })),
        recent: recent.map(formatAction),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch GM actions", details: err.message },
      { status: 500 }
    );
  }
}
