import OpenAI from "openai";
import { query, execute } from "@/lib/db";
import { toolSchemas, toolHandlers, setSessionContext, clearSessionContext, resetCounters, getCounters } from "./tools";
import { BAN_JUDGE_SYSTEM_PROMPT, buildDailyPrompt } from "./prompt";
import type { BanJudgeSession, BanJudgeLogEntry } from "./types";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

async function getConfig(): Promise<{ model: string; lookbackDays: number }> {
  try {
    const [row] = await query<any>("SELECT model, lookback_days FROM ban_judge_schedule WHERE id = 1");
    return {
      model: row?.model || DEFAULT_MODEL,
      lookbackDays: row?.lookback_days || 7,
    };
  } catch {
    return { model: DEFAULT_MODEL, lookbackDays: 7 };
  }
}

async function persistSessionStart(session: BanJudgeSession): Promise<void> {
  await execute(
    `INSERT INTO ban_judge_sessions (id, started_at, status, model)
     VALUES (?, ?, 'running', ?)`,
    [session.id, new Date(session.startedAt), session.model]
  );
}

async function persistSessionEnd(session: BanJudgeSession): Promise<void> {
  const { accountsReviewed, verdictsCount } = getCounters();
  session.accountsReviewed = accountsReviewed;
  session.verdictsCount = verdictsCount;
  await execute(
    `UPDATE ban_judge_sessions
     SET completed_at = ?, status = ?, summary = ?, accounts_reviewed = ?,
         verdicts_count = ?, full_log = ?, error = ?
     WHERE id = ?`,
    [
      session.completedAt ? new Date(session.completedAt) : new Date(),
      session.status,
      session.summary || null,
      accountsReviewed,
      verdictsCount,
      JSON.stringify(session.log),
      session.error || null,
      session.id,
    ]
  );
}

async function persistAction(
  sessionId: string, toolName: string, toolInput: Record<string, any>, toolResult: any, reasoning?: string
): Promise<void> {
  try {
    // Truncate large results so the audit log doesn't bloat
    const resultStr = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
    await execute(
      `INSERT INTO ban_judge_actions (session_id, tool_name, tool_input, tool_result, reasoning)
       VALUES (?, ?, ?, ?, ?)`,
      [sessionId, toolName, JSON.stringify(toolInput), resultStr.slice(0, 65000), reasoning || null]
    );
  } catch (err) {
    console.error("Failed to persist ban-judge action:", err);
  }
}

export async function runBanJudge(
  onUpdate: (entry: BanJudgeLogEntry) => void = () => {},
): Promise<BanJudgeSession> {
  const { model, lookbackDays } = await getConfig();

  const session: BanJudgeSession = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    status: "running",
    model,
    log: [],
    accountsReviewed: 0,
    verdictsCount: 0,
  };

  const addLog = (entry: BanJudgeLogEntry) => {
    session.log.push(entry);
    onUpdate(entry);
  };

  await persistSessionStart(session);
  setSessionContext(session.id);
  resetCounters();

  const userPrompt = buildDailyPrompt(lookbackDays);
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: BAN_JUDGE_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  let lastTextBeforeTool = "";
  const MAX_TURNS = 40;

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await openrouter.chat.completions.create({
        model,
        messages,
        tools: toolSchemas,
        temperature: 0.2,
        max_tokens: 8192,
      });

      const choice = response.choices[0];
      if (!choice) break;
      const msg = choice.message;

      if (msg.content) {
        lastTextBeforeTool = msg.content;
        addLog({ type: "text", text: msg.content });
      }

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        messages.push({ role: "assistant", content: msg.content || "" });
        session.summary = msg.content || undefined;
        break;
      }

      messages.push({
        role: "assistant",
        content: msg.content || null,
        tool_calls: msg.tool_calls,
      });

      for (const tc of msg.tool_calls) {
        const fn = (tc as any).function as { name: string; arguments: string };
        const toolName = fn.name;
        let args: any;
        try { args = JSON.parse(fn.arguments || "{}"); } catch { args = {}; }

        addLog({ type: "tool_call", tool: { id: tc.id, name: toolName, input: args } });

        let resultStr: string;
        try {
          const handler = toolHandlers[toolName];
          if (!handler) throw new Error(`Unknown tool: ${toolName}`);
          resultStr = await handler(args);
        } catch (err: any) {
          resultStr = JSON.stringify({ error: err.message });
        }

        let parsed: any;
        try { parsed = JSON.parse(resultStr); } catch { parsed = resultStr; }

        const logEntry = session.log.findLast(
          (e): e is Extract<BanJudgeLogEntry, { type: "tool_call" }> =>
            e.type === "tool_call" && e.tool.id === tc.id
        );
        if (logEntry) {
          logEntry.result = { toolCallId: tc.id, name: toolName, result: parsed };
          onUpdate(logEntry);
        }

        await persistAction(session.id, toolName, args, parsed, lastTextBeforeTool || undefined);

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: resultStr,
        });
      }

      if (choice.finish_reason === "stop") break;
    }

    session.status = "complete";
  } catch (err: any) {
    session.status = "error";
    session.error = err.message;
    addLog({ type: "text", text: `Error: ${err.message}` });
  } finally {
    clearSessionContext();
  }

  session.completedAt = new Date().toISOString();
  await persistSessionEnd(session);

  return session;
}
