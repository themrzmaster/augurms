import { query, execute } from "@/lib/db";

export type GeneratedItemStatus =
  | "pending"
  | "rendering"
  | "ready"
  | "published"
  | "failed"
  | "rejected";

export interface GeneratedItem {
  id: number;
  item_id: number | null;
  session_id: string | null;
  description: string;
  name: string | null;
  item_type: string;
  weapon_type: string | null;
  concept_image_url: string | null;
  glb_url: string | null;
  tripo_task_id: string | null;
  cost_usd: number;
  stats: Record<string, unknown> | null;
  requirements: Record<string, unknown> | null;
  status: GeneratedItemStatus;
  error: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateGeneratedItem {
  item_id?: number | null;
  session_id?: string | null;
  description: string;
  name?: string | null;
  item_type?: string;
  weapon_type?: string | null;
  stats?: Record<string, unknown> | null;
  requirements?: Record<string, unknown> | null;
}

export async function recordGeneration(input: CreateGeneratedItem): Promise<number> {
  const res = await execute(
    `INSERT INTO gm_generated_items
       (item_id, session_id, description, name, item_type, weapon_type, stats, requirements, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      input.item_id ?? null,
      input.session_id ?? null,
      input.description,
      input.name ?? null,
      input.item_type ?? "weapon",
      input.weapon_type ?? null,
      input.stats ? JSON.stringify(input.stats) : null,
      input.requirements ? JSON.stringify(input.requirements) : null,
    ]
  );
  return res.insertId;
}

export interface UpdateGeneratedItem {
  status?: GeneratedItemStatus;
  item_id?: number;
  concept_image_url?: string;
  glb_url?: string;
  tripo_task_id?: string;
  cost_usd?: number;
  error?: string | null;
}

export async function updateGeneration(id: number, patch: UpdateGeneratedItem): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.status !== undefined) {
    fields.push("status = ?");
    values.push(patch.status);
    if (patch.status === "published") fields.push("published_at = NOW()");
  }
  if (patch.item_id !== undefined) { fields.push("item_id = ?"); values.push(patch.item_id); }
  if (patch.concept_image_url !== undefined) { fields.push("concept_image_url = ?"); values.push(patch.concept_image_url); }
  if (patch.glb_url !== undefined) { fields.push("glb_url = ?"); values.push(patch.glb_url); }
  if (patch.tripo_task_id !== undefined) { fields.push("tripo_task_id = ?"); values.push(patch.tripo_task_id); }
  if (patch.cost_usd !== undefined) { fields.push("cost_usd = cost_usd + ?"); values.push(patch.cost_usd); }
  if (patch.error !== undefined) { fields.push("error = ?"); values.push(patch.error); }
  if (!fields.length) return;
  values.push(id);
  await execute(`UPDATE gm_generated_items SET ${fields.join(", ")} WHERE id = ?`, values);
}

export async function getGeneratedItem(id: number): Promise<GeneratedItem | null> {
  const rows = await query<GeneratedItem>(
    "SELECT * FROM gm_generated_items WHERE id = ?",
    [id]
  );
  return rows[0] ?? null;
}

export interface ListFilters {
  status?: GeneratedItemStatus | GeneratedItemStatus[];
  sessionId?: string;
  sinceDays?: number;
  limit?: number;
}

export async function listGenerated(filters: ListFilters = {}): Promise<GeneratedItem[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    where.push(`status IN (${statuses.map(() => "?").join(",")})`);
    params.push(...statuses);
  }
  if (filters.sessionId) {
    where.push("session_id = ?");
    params.push(filters.sessionId);
  }
  if (filters.sinceDays) {
    where.push("created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)");
    params.push(filters.sinceDays);
  }
  const limit = Math.min(filters.limit ?? 50, 200);
  const sql = `SELECT * FROM gm_generated_items ${
    where.length ? "WHERE " + where.join(" AND ") : ""
  } ORDER BY created_at DESC LIMIT ${limit}`;
  return query<GeneratedItem>(sql, params);
}

/** Count rows created today — for per-day budget enforcement. */
export async function countGeneratedToday(): Promise<number> {
  const rows = await query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM gm_generated_items WHERE created_at >= CURDATE()"
  );
  return rows[0]?.n ?? 0;
}
