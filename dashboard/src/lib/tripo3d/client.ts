/**
 * Tripo3D API client — image-to-3D generation.
 *
 * Verified API shape (probed 2026-04-12):
 *   Upload:  POST /v2/openapi/upload    (multipart file) → { code, data: { image_token } }
 *   Create:  POST /v2/openapi/task      { type: "image_to_model", file: { type, file_token } }
 *   Status:  GET  /v2/openapi/task/{id} → { code, data: { status, progress, output, result } }
 * Final GLB URL lives in data.result.pbr_model.url (preferred) or data.output.pbr_model.
 */

const BASE_URL = "https://api.tripo3d.ai/v2/openapi";

export type TripoTaskStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "cancelled"
  | "unknown";

export interface TripoTask {
  taskId: string;
  status: TripoTaskStatus;
  progress: number;
  modelUrl: string | null;
  error: string | null;
  raw: unknown;
}

function getApiKey(): string {
  const key = process.env.TRIPO3D_API_KEY;
  if (!key) throw new Error("TRIPO3D_API_KEY not configured");
  return key;
}

async function tripoJson(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Tripo3D ${path} failed: ${res.status} ${body}`);
  return JSON.parse(body);
}

/** Upload a PNG/JPEG buffer to Tripo's own storage, receive an image_token. */
export async function uploadImage(
  buffer: Buffer,
  filename: string,
  mimeType: string = "image/png"
): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: mimeType }),
    filename
  );

  const res = await fetch(`${BASE_URL}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getApiKey()}` },
    body: form,
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Tripo3D upload failed: ${res.status} ${body}`);
  const json = JSON.parse(body);
  const token = json?.data?.image_token;
  if (!token) throw new Error(`Tripo3D upload returned no image_token: ${body}`);
  return token;
}

export interface CreateTaskParams {
  imageToken?: string;
  imageUrl?: string;
  imageType?: "png" | "jpg" | "jpeg" | "webp";
  modelVersion?: string;
  faceLimit?: number;
  texture?: boolean;
  pbr?: boolean;
  // Lock GLB facing to the input image — the headless renderer rotates the
  // model around Y for swing frames; without this, "front" can land anywhere.
  orientation?: "default" | "align_image";
  // "original_image" keeps the concept's colors faithful instead of re-baking
  // them from the reconstructed mesh (which smears flat regions).
  textureAlignment?: "original_image" | "geometry";
  // Style hints disambiguate thin/flat objects (weapons) so Tripo doesn't
  // back-project the front texture onto a slab.
  style?: string;
  // Quad topology renders cleaner under arbitrary rotations than triangulated
  // remeshes — relevant because we sample the model at ±45° / 80° for sprites.
  quad?: boolean;
}

export async function createImageToModelTask(params: CreateTaskParams): Promise<string> {
  const {
    imageToken,
    imageUrl,
    imageType = "png",
    modelVersion = "v3.0-20250812",
    faceLimit,
    texture = true,
    pbr = true,
    orientation = "align_image",
    textureAlignment = "original_image",
    style,
    quad = true,
  } = params;

  if (!imageToken && !imageUrl) {
    throw new Error("createImageToModelTask requires imageToken or imageUrl");
  }

  const file = imageToken
    ? { type: imageType, file_token: imageToken }
    : { type: "url", url: imageUrl };

  const body = {
    type: "image_to_model",
    model_version: modelVersion,
    file,
    texture,
    pbr,
    orientation,
    texture_alignment: textureAlignment,
    quad,
    ...(style ? { style } : {}),
    ...(faceLimit !== undefined ? { face_limit: faceLimit } : {}),
  };

  const data = await tripoJson("/task", { method: "POST", body: JSON.stringify(body) });
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error(`Tripo3D returned no task_id: ${JSON.stringify(data)}`);
  return taskId;
}

export async function getTask(taskId: string): Promise<TripoTask> {
  const data = await tripoJson(`/task/${encodeURIComponent(taskId)}`, { method: "GET" });
  const d = data?.data ?? {};
  const statusMap: Record<string, TripoTaskStatus> = {
    queued: "queued",
    waiting: "queued",
    pending: "queued",
    running: "running",
    processing: "running",
    success: "success",
    succeeded: "success",
    completed: "success",
    failed: "failed",
    error: "failed",
    cancelled: "cancelled",
    canceled: "cancelled",
  };

  const modelUrl: string | null =
    d?.result?.pbr_model?.url ??
    d?.result?.model?.url ??
    d?.output?.pbr_model ??
    d?.output?.model ??
    null;

  return {
    taskId,
    status: statusMap[d.status] ?? "unknown",
    progress: typeof d.progress === "number" ? d.progress : 0,
    modelUrl,
    error: d.error_msg ?? d.error ?? null,
    raw: data,
  };
}

export interface PollOptions {
  timeoutMs?: number;
  intervalMs?: number;
  onProgress?: (task: TripoTask) => void;
}

export async function pollTask(taskId: string, opts: PollOptions = {}): Promise<TripoTask> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const intervalMs = opts.intervalMs ?? 5000;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const task = await getTask(taskId);
    opts.onProgress?.(task);
    if (task.status === "success" || task.status === "failed" || task.status === "cancelled") {
      return task;
    }
    if (Date.now() > deadline) {
      throw new Error(`Tripo3D task ${taskId} timed out after ${timeoutMs}ms (last status: ${task.status})`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export async function downloadGlb(modelUrl: string): Promise<Buffer> {
  const res = await fetch(modelUrl);
  if (!res.ok) throw new Error(`GLB download failed: ${res.status} ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Full flow: image buffer → GLB buffer. Handles upload + task + polling + download. */
export async function imageBufferToGlb(params: {
  imageBuffer: Buffer;
  imageType?: "png" | "jpg" | "jpeg" | "webp";
  timeoutMs?: number;
  onProgress?: (task: TripoTask) => void;
}): Promise<{ task: TripoTask; glb: Buffer; imageToken: string }> {
  const mimeMap: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
  const imageType = params.imageType ?? "png";
  const imageToken = await uploadImage(params.imageBuffer, `concept.${imageType}`, mimeMap[imageType]);
  const taskId = await createImageToModelTask({ imageToken, imageType });
  const task = await pollTask(taskId, { timeoutMs: params.timeoutMs, onProgress: params.onProgress });
  if (task.status !== "success" || !task.modelUrl) {
    throw new Error(`Tripo3D task did not produce a model (status=${task.status}, error=${task.error})`);
  }
  const glb = await downloadGlb(task.modelUrl);
  return { task, glb, imageToken };
}
