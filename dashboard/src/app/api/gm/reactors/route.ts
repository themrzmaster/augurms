import { NextRequest, NextResponse } from "next/server";
import { execute, query } from "@/lib/db";
import { generateReactorFrames } from "@/lib/wz/reactor-animator";
import {
  generateReactorXml,
  generateReactorScript,
} from "@/lib/wz/reactor-builder";
import type { AnimationStyle, } from "@/lib/wz/reactor-animator";
import type { ScriptTemplate } from "@/lib/wz/reactor-builder";
import { findItemName, validateItemIds } from "@/lib/item-lookup";
import { generateImage } from "@/lib/openrouter/image";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const CUSTOM_REACTOR_ID_MIN = 9900000;
const CUSTOM_REACTOR_ID_MAX = 9999999;

async function getNextReactorId(): Promise<number> {
  const rows = await query<{ reactor_id: number }>(
    "SELECT reactor_id FROM custom_reactors"
  );
  const used = new Set(rows.map((r) => r.reactor_id));
  for (let id = CUSTOM_REACTOR_ID_MIN; id <= CUSTOM_REACTOR_ID_MAX; id++) {
    if (!used.has(id)) return id;
  }
  throw new Error("No free reactor IDs");
}

function getServerRoot(): string {
  if (process.env.WZ_ROOT) return process.env.WZ_ROOT;
  const local = join(process.cwd(), "..", "server");
  if (existsSync(join(local, "wz"))) return join(local, "wz");
  return "/cosmic/wz";
}

function getScriptsRoot(): string {
  if (process.env.WZ_ROOT)
    return process.env.WZ_ROOT.replace("/wz", "/scripts");
  const local = join(process.cwd(), "..", "server");
  if (existsSync(join(local, "scripts"))) return join(local, "scripts");
  return "/cosmic/scripts";
}

async function generateSprite(description: string, model?: string): Promise<Buffer> {
  const prompt = `Generate a single small pixel-art game sprite of: ${description}.
Style: 16-bit RPG pixel art, MapleStory-style, tiny breakable object sprite (32-80 pixels),
white or solid color background, no text, no UI elements, centered in frame,
clean pixel edges, vibrant colors, suitable for a 2D side-scrolling game.
The object should look like a breakable/interactable map object (chest, box, crystal, ore, egg, plant, etc).
Single object only, no duplicates, no scene, just the object.`;

  return generateImage({ prompt, model });
}

/**
 * POST /api/gm/reactors
 *
 * Create a custom reactor with an AI-generated sprite.
 * Body: { name, description, animationStyle?, hitsToBreak?, scriptTemplate?, drops? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      animationStyle = "breakable",
      hitsToBreak = 3,
      scriptTemplate = "drop_items",
      drops,
      model,
    } = body;

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!description) return NextResponse.json({ error: "description is required" }, { status: 400 });

    // Validate drops item IDs before doing anything expensive
    if (Array.isArray(drops) && drops.length > 0) {
      const itemIds = drops.map((d: any) => d.itemId).filter(Boolean);
      const invalid = validateItemIds(itemIds);
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: `Invalid item IDs: ${invalid.join(", ")}. Use search_items or get_item to find valid IDs.` },
          { status: 400 }
        );
      }
    }

    // 1. Generate sprite via OpenRouter
    const pngBuf = await generateSprite(description, model);

    // 2. Process through reactor animation pipeline (handles white bg removal + downscale)
    const frames = generateReactorFrames(pngBuf, animationStyle as AnimationStyle);

    // 3. Get next free ID
    const reactorId = await getNextReactorId();

    // 4. Save idle PNG for debugging
    const outputDir = join("/tmp", "reactor-sprites");
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, `reactor-${reactorId}-idle.png`), pngBuf);

    // 5. Build reactor definition and write server XML
    const def = {
      reactorId,
      name,
      eventType: 0,
      hitsToBreak: Math.min(Math.max(hitsToBreak, 1), 5),
      idlePng: frames.idle,
      hitFrames: frames.hit,
      breakFrames: frames.break,
      hitDelay: 120,
      breakDelay: 150,
    };

    const xml = generateReactorXml(def);
    const xmlDir = join(getServerRoot(), "Reactor.wz");
    mkdirSync(xmlDir, { recursive: true });
    writeFileSync(
      join(xmlDir, `${String(reactorId).padStart(7, "0")}.img.xml`),
      xml,
      "utf-8"
    );

    // 6. Write reactor script
    const script = generateReactorScript(scriptTemplate as ScriptTemplate);
    const scriptDir = join(getScriptsRoot(), "reactor");
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(join(scriptDir, `${reactorId}.js`), script, "utf-8");

    // 7. Save to DB
    await execute(
      `INSERT INTO custom_reactors
       (reactor_id, name, event_type, hits_to_break, animation_style, script_template,
        idle_png_url, trigger_item_id, trigger_item_qty, timeout_ms, hit_delay, break_delay)
       VALUES (?, ?, 0, ?, ?, ?, NULL, NULL, 1, NULL, 120, 150)`,
      [reactorId, name, def.hitsToBreak, animationStyle, scriptTemplate]
    );

    // 8. Configure drops
    if (Array.isArray(drops)) {
      for (const drop of drops) {
        if (!drop.itemId) continue;
        const pct = Math.max(1, Math.min(drop.chance ?? 100, 100));
        const chance = Math.max(1, Math.round(100 / pct));
        await execute(
          "INSERT INTO reactordrops (reactorid, itemid, chance, questid) VALUES (?, ?, ?, -1)",
          [reactorId, drop.itemId, chance]
        );
      }
    }

    // 9. Trigger full publish (client WZ + R2 + manifest bump + server restart)
    // Forward whichever auth the incoming request carried (browser cookie OR
    // GM x-gm-secret) to the nested publish call — otherwise middleware 401s
    // our own self-fetch and the publish silently never runs.
    let publishNote = "Server files written locally.";
    try {
      const cookie = request.headers.get("cookie") ?? "";
      const gmSecret = request.headers.get("x-gm-secret") ?? "";
      const authHeaders: Record<string, string> = {};
      if (cookie) authHeaders.cookie = cookie;
      if (gmSecret) authHeaders["x-gm-secret"] = gmSecret;

      const publishRes = await fetch(
        new URL("/api/admin/reactors/publish", request.url).toString(),
        { method: "POST", headers: authHeaders }
      );
      const publishData = await publishRes.json();
      if (publishData.status === "started") {
        publishNote = "Full publish started (client WZ → R2 → manifest bump → server restart). Takes ~1-2 minutes.";
      } else {
        publishNote = `Auto-publish failed: ${publishData.error || JSON.stringify(publishData)}. Use 'Publish to R2' from the dashboard Reactors page.`;
      }
    } catch (err: any) {
      publishNote = `Auto-publish failed: ${err.message || err}. Use 'Publish to R2' from the dashboard Reactors page.`;
    }

    return NextResponse.json({
      success: true,
      reactorId,
      name,
      spriteSize: `${frames.width}x${frames.height}`,
      hitFrames: frames.hit.length,
      breakFrames: frames.break.length,
      publishNote,
      message: `Custom reactor ${reactorId} "${name}" created with AI sprite. ${publishNote} Use add_map_reactor to place it on a map.`,
    });
  } catch (err: any) {
    console.error("GM reactor creation error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create reactor" },
      { status: 500 }
    );
  }
}
