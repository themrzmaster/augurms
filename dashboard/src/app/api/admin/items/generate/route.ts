import { NextRequest, NextResponse } from "next/server";
import { generateImage } from "@/lib/openrouter/image";
import { renderWeaponFromConcept } from "@/lib/wz/sprite-2d";
import { uploadToR2, isR2Configured } from "@/lib/r2";
import { WEAPON_TYPES } from "@/lib/wz";
import {
  recordGeneration,
  updateGeneration,
  countGeneratedToday,
} from "@/lib/gm/generated-items";
import { query } from "@/lib/db";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL ||
  "https://pub-34b8b332208f464a9e74fa14104be3e2.r2.dev";

const DAILY_GENERATION_CAP = parseInt(process.env.GM_ITEM_GEN_DAILY_CAP || "8");
const DEFAULT_ATTACK_SPEED = 6;

// Mirrors STAT_FIELDS in src/app/api/admin/items/route.ts plus 'slots' (tuc).
// Silently-dropped keys confuse the GM — reject unknowns explicitly.
const VALID_STAT_KEYS = new Set([
  "str", "dex", "int", "luk", "hp", "mp",
  "watk", "matk", "wdef", "mdef",
  "acc", "avoid", "speed", "jump", "slots",
]);
const STAT_CAPS: Record<string, number> = {
  watk: 250, matk: 250, wdef: 200, mdef: 200,
  str: 60, dex: 60, int: 60, luk: 60, acc: 60, avoid: 60,
  hp: 2000, mp: 2000,
  speed: 25, jump: 25, slots: 10,
};
const VALID_REQ_KEYS = new Set(["level", "str", "dex", "int", "luk", "job"]);
const REQ_CAPS: Record<string, number> = {
  level: 200, str: 999, dex: 999, int: 999, luk: 999, job: 31,
};

function validateBag(
  obj: unknown,
  valid: Set<string>,
  caps: Record<string, number>,
  label: string
): string | null {
  if (obj == null) return null;
  if (typeof obj !== "object" || Array.isArray(obj)) {
    return `${label} must be an object keyed by stat code.`;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (!valid.has(k)) {
      return `Unknown ${label} key "${k}". Valid keys: ${[...valid].join(", ")}.`;
    }
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
      return `${label}.${k} must be an integer (got ${JSON.stringify(v)}).`;
    }
    if (v < 0) return `${label}.${k} must be >= 0 (got ${v}).`;
    if (v > caps[k]) return `${label}.${k} exceeds cap of ${caps[k]} (got ${v}).`;
  }
  return null;
}

function buildConceptPrompt(description: string, weaponType: string): string {
  const label = WEAPON_TYPES[weaponType]?.label ?? weaponType;
  // Pure black background: flood-fill bg-removal in the 2D sprite pipeline is
  // reliable against pure black, including when the weapon has white/silver
  // highlights that would otherwise blend into a white background.
  return `Generate a single ${label} weapon concept sprite: ${description}.
Style: flat orthographic front elevation, dead-on side view of the weapon,
no perspective, no foreshortening, no rotation. Weapon fills the frame
vertically, pointing straight up, perfectly centered, mirror-symmetric
across the vertical axis, on a plain pure black (#000000) background.
No shadows, no props, no characters, no text or UI, no ground plane.
Vivid colors, crisp edges, high detail on the head of the weapon.
The weapon is the ONLY subject. No scene. No duplicates. No background gradient.`;
}

interface GenerateBody {
  description: string;
  weapon_type?: string;
  name?: string;
  stats?: Record<string, number>;
  requirements?: Record<string, number>;
  session_id?: string;
  autoPublish?: boolean;
}

async function fetchInternal(
  request: NextRequest,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  // Forward both auth mechanisms — the incoming request may be a browser
  // admin (cookie) OR a GM tool call (x-gm-secret). Whichever is present
  // must carry through to nested self-calls, otherwise middleware 401s.
  const cookie = request.headers.get("cookie") ?? "";
  const gmSecret = request.headers.get("x-gm-secret") ?? "";
  return fetch(new URL(path, request.url).toString(), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(gmSecret ? { "x-gm-secret": gmSecret } : {}),
      ...(init.headers || {}),
    },
  });
}

export async function POST(request: NextRequest) {
  let body: GenerateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    description,
    weapon_type = "staff",
    name,
    stats = {},
    requirements = {},
    session_id,
    autoPublish = false,
  } = body;

  if (!description || description.trim().length < 4) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }
  if (!WEAPON_TYPES[weapon_type]) {
    return NextResponse.json(
      { error: `Unknown weapon_type. Valid: ${Object.keys(WEAPON_TYPES).join(", ")}` },
      { status: 400 }
    );
  }

  const statErr = validateBag(stats, VALID_STAT_KEYS, STAT_CAPS, "stats");
  if (statErr) return NextResponse.json({ error: statErr }, { status: 400 });
  const reqErr = validateBag(requirements, VALID_REQ_KEYS, REQ_CAPS, "requirements");
  if (reqErr) return NextResponse.json({ error: reqErr }, { status: 400 });

  const usedToday = await countGeneratedToday();
  if (usedToday >= DAILY_GENERATION_CAP) {
    return NextResponse.json(
      { error: `Daily item generation cap reached (${usedToday}/${DAILY_GENERATION_CAP}). Try again tomorrow.` },
      { status: 429 }
    );
  }

  if (name?.trim()) {
    const existing = await query<{ item_id: number; name: string }>(
      "SELECT item_id, name FROM custom_items WHERE LOWER(name) = LOWER(?) LIMIT 1",
      [name.trim()]
    );
    if (existing.length > 0) {
      return NextResponse.json(
        {
          error: `An item named "${existing[0].name}" already exists (item_id ${existing[0].item_id}). Pick a different name, or use the existing item — do not regenerate the same name.`,
        },
        { status: 409 }
      );
    }
  }

  const generationId = await recordGeneration({
    description,
    name: name ?? null,
    item_type: "weapon",
    weapon_type,
    stats,
    requirements,
    session_id: session_id ?? null,
  });

  const fail = async (err: unknown, stage: string) => {
    const msg = err instanceof Error ? err.message : String(err);
    await updateGeneration(generationId, { status: "failed", error: `${stage}: ${msg}` });
    return NextResponse.json(
      { generationId, status: "failed", stage, error: msg },
      { status: 500 }
    );
  };

  try {
    // 1. Concept image via OpenRouter
    const conceptPng = await generateImage({
      prompt: buildConceptPrompt(description, weapon_type),
    });

    let conceptUrl: string | null = null;
    if (isR2Configured()) {
      const up = await uploadToR2(`custom-items/generated/${generationId}/concept.png`, conceptPng);
      if (!up.success) throw new Error(`concept upload failed: ${up.error}`);
      conceptUrl = up.url;
    } else {
      const dir = join("/tmp", "generated-items", String(generationId));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "concept.png"), conceptPng);
    }
    await updateGeneration(generationId, {
      ...(conceptUrl ? { concept_image_url: conceptUrl } : {}),
      status: "rendering",
    });

    // 2. Allocate next item ID
    const nextIdRes = await fetchInternal(
      request,
      `/api/admin/items/next-id?subCategory=Weapon&weaponType=${encodeURIComponent(weapon_type)}&count=1`
    );
    if (!nextIdRes.ok) throw new Error(`next-id failed: ${await nextIdRes.text()}`);
    const nextIdData = await nextIdRes.json();
    const itemId = nextIdData.suggested?.[0];
    if (!itemId) throw new Error("No free item ID available for this weapon type");

    // 3. 2D sprite rendering: rotate bg-removed concept for each animation angle
    const rendered = await renderWeaponFromConcept({ conceptPng });

    // 5. Upload frames + icon to R2
    const renderRes = await fetchInternal(request, "/api/admin/items/render-weapon", {
      method: "POST",
      body: JSON.stringify({
        itemId,
        icon: rendered.iconDataUrl,
        origins: rendered.origins,
        frames: rendered.frames,
      }),
    });
    if (!renderRes.ok) throw new Error(`render-weapon failed: ${await renderRes.text()}`);
    const renderData = await renderRes.json();

    // 6. DB insert + WZ XML generation
    const finalName = name?.trim() || `Generated ${WEAPON_TYPES[weapon_type].label}`;
    const itemsRes = await fetchInternal(request, "/api/admin/items", {
      method: "POST",
      body: JSON.stringify({
        item_id: itemId,
        name: finalName,
        description,
        category: "equip",
        sub_category: "Weapon",
        icon_url: renderData.iconUrl,
        stats,
        requirements,
        flags: {},
        weapon_type,
        attack_speed: DEFAULT_ATTACK_SPEED,
        weapon_frames: {
          origins: rendered.origins,
          frames: renderData.frames,
        },
      }),
    });
    if (!itemsRes.ok) throw new Error(`items insert failed: ${await itemsRes.text()}`);

    await updateGeneration(generationId, { status: "ready", item_id: itemId });

    // 7. Optional publish
    let published = false;
    let publishMessage = "Item is ready. Call publish_generated_item to push it live.";
    if (autoPublish) {
      const pub = await fetchInternal(request, "/api/admin/items/publish", { method: "POST" });
      if (pub.ok) {
        await updateGeneration(generationId, { status: "published" });
        published = true;
        publishMessage = "Published — server is restarting.";
      } else {
        publishMessage = `Publish failed (still in ready state): ${await pub.text()}`;
      }
    }

    return NextResponse.json({
      generationId,
      itemId,
      status: published ? "published" : "ready",
      name: finalName,
      weaponType: weapon_type,
      conceptImageUrl: conceptUrl,
      glbUrl: null,
      iconUrl: renderData.iconUrl,
      frameCount: Object.values(rendered.frames).flat().length,
      message: publishMessage,
    });
  } catch (err) {
    return fail(err, "orchestrate");
  }
}
