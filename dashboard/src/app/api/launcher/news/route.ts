import { NextResponse } from "next/server";
import { query } from "@/lib/db";

interface GMAction {
  tool_name: string;
  tool_input: string;
  reasoning: string | null;
  executed_at: string;
  session_id: string;
}

interface GMSession {
  id: string;
  summary: string | null;
  started_at: string;
  changes_made: number;
}

// Map GM tool names to news categories
function categorize(toolName: string): string {
  if (toolName.includes("rate") || toolName.includes("config")) return "rates";
  if (toolName.includes("drop") || toolName.includes("reactor_drop")) return "drops";
  if (toolName.includes("event") || toolName.includes("spawn") || toolName.includes("reactor")) return "event";
  return "update";
}

// Generate a readable description from tool name + input (mirrors Discord summarizeToolCall)
function describeAction(name: string, rawInput: string): string {
  let input: Record<string, any> = {};
  try { input = typeof rawInput === "string" ? JSON.parse(rawInput) : rawInput; } catch { /* ignore */ }

  switch (name) {
    case "create_event":
      return `New event: "${input.name || "unnamed"}"${input.mobs?.length ? ` with ${input.mobs.length} mob spawns` : ""}${input.bonusDrops?.length ? ` and ${input.bonusDrops.length} bonus drops` : ""}`;
    case "update_rates":
      return "Rates adjusted: " + Object.entries(input.rates || {}).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}x`).join(", ");
    case "add_mob_drop":
      return `New drop added to mob ${input.mobId}: item ${input.itemId} (${((input.chance || 0) / 10000).toFixed(1)}% chance)`;
    case "remove_mob_drop":
      return `Drop removed from mob ${input.mobId}: item ${input.itemId}`;
    case "batch_update_drops":
      return `${input.changes?.length || 0} drop table changes applied`;
    case "batch_update_mobs":
      return `${input.mobs?.length || 0} monsters updated`;
    case "update_mob":
      return `Monster ${input.mobId} stats updated: ${Object.keys(input.changes || {}).join(", ")}`;
    case "add_map_spawn":
      return `New ${input.type === "m" ? "monster" : "NPC"} spawn added to map ${input.mapId}`;
    case "remove_map_spawn":
      return `${input.type === "m" ? "Monster" : "NPC"} spawn removed from map ${input.mapId}`;
    case "add_map_reactor":
      return `Breakable object placed on map ${input.mapId}`;
    case "add_reactor_drop":
      return `Loot added to breakable reactor ${input.reactorId}`;
    case "remove_map_reactor":
      return `Reactor removed from map ${input.mapId}`;
    case "add_shop_item":
      return `New item added to shop ${input.shopId} for ${input.price?.toLocaleString()} meso`;
    case "update_shop_price":
      return `Shop price updated for item in shop ${input.shopId}`;
    case "remove_shop_item":
      return `Item removed from shop ${input.shopId}`;
    case "set_server_message":
      return `Server message: "${(input.message || "").slice(0, 80)}"`;
    case "cleanup_event":
      return `Event cleaned up${input.mapId ? ` on map ${input.mapId}` : ""}${input.clearGlobalDrops ? " (global drops cleared)" : ""}`;
    case "create_goal":
      return `New goal set: "${(input.goal || "").slice(0, 80)}"`;
    case "update_goal":
      return `Goal #${input.id} updated${input.status ? ` to ${input.status}` : ""}`;
    case "spawn_drop":
      return `Surprise drop: item ${input.itemId}${input.characterName ? ` for ${input.characterName}` : ""}`;
    case "give_item_to_character":
      return `Item ${input.itemId} given to character ${input.characterId}`;
    case "update_character":
      return `Character ${input.characterId} updated: ${Object.keys(input.changes || {}).join(", ")}`;
    case "publish_client_update":
      return `Client update published: ${input.message || "new version"}`;
    default:
      return `GM action: ${name.replace(/_/g, " ")}`;
  }
}

// Strip markdown formatting to plain text
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "")           // headings
    .replace(/\*\*([^*]+)\*\*/g, "$1")   // bold
    .replace(/\*([^*]+)\*/g, "$1")        // italic
    .replace(/`([^`]+)`/g, "$1")          // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/^\s*[-*]\s+/gm, "- ")      // normalize list markers
    .replace(/\|[^\n]+\|/g, "")          // table rows
    .replace(/[-|]{3,}/g, "")            // table dividers
    .replace(/---+/g, "")                // horizontal rules
    .replace(/\\n/g, " ")                // literal \n
    .replace(/\n{2,}/g, "\n")            // collapse multiple newlines
    .replace(/[?�]/g, "")               // broken emoji/unicode
    .trim();
}

// Check if text has real content (not just whitespace/formatting)
function hasContent(text: string): boolean {
  return text.replace(/\s+/g, "").length > 3;
}

export async function GET() {
  try {
    // Get recent write actions with session context
    const actions = await query<GMAction>(
      `SELECT a.tool_name, a.tool_input, a.reasoning, a.executed_at, a.session_id
       FROM gm_actions a
       ORDER BY a.executed_at DESC
       LIMIT 30`
    ).catch(() => [] as GMAction[]);

    // Get recent sessions for summaries
    const sessions = await query<GMSession>(
      `SELECT id, summary, started_at, changes_made
       FROM gm_sessions
       WHERE status = 'complete'
       ORDER BY started_at DESC
       LIMIT 10`
    ).catch(() => [] as GMSession[]);

    const news: Array<{ type: string; text: string; date: string }> = [];
    const seenSessions = new Set<string>();

    // Group actions by session to create session-level news items
    const actionsBySession: Record<string, GMAction[]> = {};
    for (const a of actions) {
      if (!actionsBySession[a.session_id]) actionsBySession[a.session_id] = [];
      actionsBySession[a.session_id].push(a);
    }

    // For each session, try to create a meaningful news entry
    for (const s of sessions) {
      if (s.changes_made === 0) continue;
      seenSessions.add(s.id);

      // Prefer structured action descriptions (always clean, no boilerplate)
      const sessionActions = actionsBySession[s.id] || [];
      if (sessionActions.length > 0) {
        const descriptions = sessionActions.slice(0, 3).map(a => describeAction(a.tool_name, a.tool_input));
        news.push({
          type: categorize(sessionActions[0].tool_name),
          text: descriptions.join(". "),
          date: s.started_at,
        });
        continue;
      }

      // Fallback to summary only if no actions found
      if (s.summary) {
        const cleaned = stripMarkdown(s.summary);
        const firstLine = cleaned.split("\n").find(l => hasContent(l))?.trim();
        if (firstLine && hasContent(firstLine)) {
          news.push({
            type: "update",
            text: firstLine.length > 200 ? firstLine.slice(0, 200) + "..." : firstLine,
            date: s.started_at,
          });
        }
      }
    }

    // Add individual notable actions not covered by sessions
    for (const a of actions) {
      if (seenSessions.has(a.session_id)) continue;
      if (news.length >= 15) break;

      const text = describeAction(a.tool_name, a.tool_input);
      if (hasContent(text)) {
        news.push({
          type: categorize(a.tool_name),
          text,
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
