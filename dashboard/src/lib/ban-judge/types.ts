export type BanVerdict = "innocent" | "watch" | "warn" | "ban" | "escalate";

export interface BanJudgeToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface BanJudgeToolResult {
  toolCallId: string;
  name: string;
  result: any;
  error?: string;
}

export interface BanJudgeLogText { type: "text"; text: string }
export interface BanJudgeLogAction { type: "tool_call"; tool: BanJudgeToolCall; result?: BanJudgeToolResult }
export type BanJudgeLogEntry = BanJudgeLogText | BanJudgeLogAction;

export interface BanJudgeSession {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "complete" | "error";
  model: string;
  log: BanJudgeLogEntry[];
  summary?: string;
  error?: string;
  accountsReviewed: number;
  verdictsCount: number;
}
