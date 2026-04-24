import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { execute, query } from "@/lib/db";
import { uploadToR2, isR2Configured } from "@/lib/r2";
import { ASSET_RANGES, type AssetType } from "@/lib/assets/ranges";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB safety cap; hair/face .img are usually 10–500 KB

interface AssetRow {
  id: number;
  asset_type: AssetType;
  in_game_id: number;
  name: string | null;
  source_version: string | null;
  file_key: string;
  file_hash: string | null;
  file_size: number | null;
  preview_url: string | null;
  status: "ready" | "published" | "rejected";
  notes: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  published_at: string | null;
}

export async function GET(request: NextRequest) {
  const typeParam = request.nextUrl.searchParams.get("type");
  const statusParam = request.nextUrl.searchParams.get("status");

  const conditions: string[] = [];
  const params: any[] = [];
  if (typeParam) {
    if (!(typeParam in ASSET_RANGES)) {
      return NextResponse.json({ error: `Unknown type: ${typeParam}` }, { status: 400 });
    }
    conditions.push("asset_type = ?");
    params.push(typeParam);
  }
  if (statusParam) {
    conditions.push("status = ?");
    params.push(statusParam);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await query<AssetRow>(
    `SELECT * FROM custom_assets ${where} ORDER BY asset_type, in_game_id`,
    params
  );

  return NextResponse.json({ assets: rows });
}

export async function POST(request: NextRequest) {
  if (!isR2Configured()) {
    return NextResponse.json({ error: "R2 not configured" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Body must be multipart/form-data" }, { status: 400 });
  }

  const type = String(form.get("type") || "");
  const inGameIdRaw = String(form.get("in_game_id") || "");
  const name = String(form.get("name") || "").trim() || null;
  const sourceVersion = String(form.get("source_version") || "").trim() || null;
  const notes = String(form.get("notes") || "").trim() || null;
  const uploadedBy = String(form.get("uploaded_by") || "").trim() || null;
  const file = form.get("file");

  if (!(type in ASSET_RANGES)) {
    return NextResponse.json(
      { error: `type must be one of: ${Object.keys(ASSET_RANGES).join(", ")}` },
      { status: 400 }
    );
  }
  const assetType = type as AssetType;
  const range = ASSET_RANGES[assetType];

  const inGameId = parseInt(inGameIdRaw, 10);
  if (!Number.isFinite(inGameId) || inGameId < range.start || inGameId > range.end) {
    return NextResponse.json(
      {
        error: `in_game_id must be an integer in [${range.start}, ${range.end}] for ${assetType}`,
      },
      { status: 400 }
    );
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required (binary .img)" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "file is empty" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `file too large (${file.size} bytes, max ${MAX_FILE_BYTES})` },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buf).digest("hex");

  // Reject duplicate uploads with the same content hash to a different ID — likely a mistake.
  const existing = await query<{ in_game_id: number; status: string }>(
    "SELECT in_game_id, status FROM custom_assets WHERE asset_type = ? AND in_game_id = ? LIMIT 1",
    [assetType, inGameId]
  );
  if (existing.length > 0) {
    return NextResponse.json(
      {
        error: `${assetType} ${inGameId} already exists (status=${existing[0].status}). Reject the existing entry first or pick a different id.`,
      },
      { status: 409 }
    );
  }

  const fileKey = `assets/${assetType}/${String(inGameId).padStart(8, "0")}.img`;
  const upload = await uploadToR2(fileKey, buf);
  if (!upload.success) {
    return NextResponse.json({ error: `R2 upload failed: ${upload.error}` }, { status: 502 });
  }

  await execute(
    `INSERT INTO custom_assets
       (asset_type, in_game_id, name, source_version, file_key, file_hash, file_size, notes, uploaded_by, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready')`,
    [assetType, inGameId, name, sourceVersion, fileKey, fileHash, buf.length, notes, uploadedBy]
  );

  const [row] = await query<AssetRow>(
    "SELECT * FROM custom_assets WHERE asset_type = ? AND in_game_id = ?",
    [assetType, inGameId]
  );

  return NextResponse.json({ ok: true, asset: row });
}
