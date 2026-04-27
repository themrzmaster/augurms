import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { execute, query } from "@/lib/db";
import { uploadToR2, isR2Configured } from "@/lib/r2";
import { ASSET_RANGES, type AssetType } from "@/lib/assets/ranges";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB safety cap; hair/face .img are usually 10–500 KB; PNG icons + sprites are KB-range

// hair/face want a raw .img blob extracted from a higher-version Character.wz;
// npc and etc want a PNG (sprite or icon) that we'll convert at publish time.
const FILE_EXT_BY_TYPE: Record<AssetType, "img" | "png"> = {
  hair: "img",
  face: "img",
  npc: "png",
  etc: "png",
};

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
  attrs: any;
  uploaded_by: string | null;
  uploaded_at: string;
  published_at: string | null;
}

interface EtcAttrs {
  desc?: string;
  slotMax?: number;
  price?: number;
  quest?: number;
}
interface NpcAttrs {
  dialogue?: string;
  script?: string;
}

function parseAttrs(
  assetType: AssetType,
  raw: string | null
): { ok: true; attrs: EtcAttrs | NpcAttrs | null } | { ok: false; error: string } {
  if (!raw) return { ok: true, attrs: null };
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "attrs must be valid JSON" };
  }
  if (parsed === null || typeof parsed !== "object") {
    return { ok: false, error: "attrs must be a JSON object" };
  }
  if (assetType === "etc") {
    const a: EtcAttrs = {};
    if (parsed.desc != null) a.desc = String(parsed.desc);
    if (parsed.slotMax != null) {
      const v = parseInt(parsed.slotMax, 10);
      if (!Number.isFinite(v) || v < 1 || v > 32767) {
        return { ok: false, error: "slotMax must be an integer in [1, 32767]" };
      }
      a.slotMax = v;
    }
    if (parsed.price != null) {
      const v = parseInt(parsed.price, 10);
      if (!Number.isFinite(v) || v < 0) {
        return { ok: false, error: "price must be a non-negative integer" };
      }
      a.price = v;
    }
    if (parsed.quest != null) {
      const v = parseInt(parsed.quest, 10);
      if (!Number.isFinite(v) || (v !== 0 && v !== 1)) {
        return { ok: false, error: "quest must be 0 or 1" };
      }
      a.quest = v;
    }
    return { ok: true, attrs: a };
  }
  if (assetType === "npc") {
    const a: NpcAttrs = {};
    if (parsed.dialogue != null) a.dialogue = String(parsed.dialogue);
    if (parsed.script != null) {
      const s = String(parsed.script).trim();
      if (s && !/^[A-Za-z0-9_]+$/.test(s)) {
        return { ok: false, error: "script must contain only letters, digits, and underscores" };
      }
      if (s) a.script = s;
    }
    return { ok: true, attrs: a };
  }
  return { ok: true, attrs: null }; // hair/face ignore attrs
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
  const attrsRaw = String(form.get("attrs") || "").trim() || null;
  const file = form.get("file");

  if (!(type in ASSET_RANGES)) {
    return NextResponse.json(
      { error: `type must be one of: ${Object.keys(ASSET_RANGES).join(", ")}` },
      { status: 400 }
    );
  }
  const assetType = type as AssetType;
  const range = ASSET_RANGES[assetType];

  const parsedAttrs = parseAttrs(assetType, attrsRaw);
  if (!parsedAttrs.ok) {
    return NextResponse.json({ error: parsedAttrs.error }, { status: 400 });
  }

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
    const expected = FILE_EXT_BY_TYPE[assetType] === "img" ? "binary .img" : "PNG image";
    return NextResponse.json(
      { error: `file is required (${expected})` },
      { status: 400 }
    );
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

  const ext = FILE_EXT_BY_TYPE[assetType];
  const fileKey = `assets/${assetType}/${String(inGameId).padStart(8, "0")}.${ext}`;
  const upload = await uploadToR2(fileKey, buf);
  if (!upload.success) {
    return NextResponse.json({ error: `R2 upload failed: ${upload.error}` }, { status: 502 });
  }

  const attrsJson = parsedAttrs.attrs ? JSON.stringify(parsedAttrs.attrs) : null;

  await execute(
    `INSERT INTO custom_assets
       (asset_type, in_game_id, name, source_version, file_key, file_hash, file_size, notes, attrs, uploaded_by, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready')`,
    [
      assetType,
      inGameId,
      name,
      sourceVersion,
      fileKey,
      fileHash,
      buf.length,
      notes,
      attrsJson,
      uploadedBy,
    ]
  );

  const [row] = await query<AssetRow>(
    "SELECT * FROM custom_assets WHERE asset_type = ? AND in_game_id = ?",
    [assetType, inGameId]
  );

  return NextResponse.json({ ok: true, asset: row });
}
