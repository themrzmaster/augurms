export interface GMToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface GMToolResult {
  toolCallId: string;
  name: string;
  result: any;
  error?: string;
}

export interface GMThought {
  type: "thinking";
  text: string;
}

export interface GMAction {
  type: "tool_call";
  tool: GMToolCall;
  result?: GMToolResult;
}

export interface GMMessage {
  type: "text";
  text: string;
}

export type GMLogEntry = GMThought | GMAction | GMMessage;

export interface GMSession {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "complete" | "error";
  trigger: "manual" | "scheduled" | "alert";
  prompt?: string;
  log: GMLogEntry[];
  summary?: string;
  error?: string;
  changesMade?: number;
}

// --- Phase 1: Persistent Memory types ---

export interface GMSnapshot {
  id?: number;
  takenAt?: string;
  totalMeso: number;
  avgMesoPerPlayer: number;
  storageMeso: number;
  totalItems: number;
  totalCharacters: number;
  avgLevel: number;
  maxLevel: number;
  levelDistribution: Record<string, number>;
  jobDistribution: Record<string, number>;
  totalAccounts: number;
  newAccounts7d: number;
  bossKillsToday: Record<string, number>;
  expRate: number;
  mesoRate: number;
  dropRate: number;
}

export interface GMActionRecord {
  id?: number;
  sessionId: string;
  executedAt?: string;
  toolName: string;
  toolInput: Record<string, any>;
  toolResult: any;
  reasoning?: string;
  category: "rates" | "mobs" | "drops" | "spawns" | "shops" | "events" | "config" | "other";
}

export interface GMGoal {
  id?: number;
  createdAt?: string;
  goal: string;
  targetMetric: string;
  targetValue: number;
  currentValue?: number;
  status: "active" | "achieved" | "abandoned";
  lastChecked?: string;
}
