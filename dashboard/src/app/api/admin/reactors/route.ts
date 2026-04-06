import { NextRequest, NextResponse } from "next/server";
import { execute, query } from "@/lib/db";
import { uploadToR2, isR2Configured } from "@/lib/r2";
import { generateReactorFrames } from "@/lib/wz/reactor-animator";
import { generateReactorXml, generateReactorScript } from "@/lib/wz/reactor-builder";
import type { AnimationStyle } from "@/lib/wz/reactor-animator";
import type { ScriptTemplate } from "@/lib/wz/reactor-builder";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// Auto-detect: local dev uses ../server, prod uses /app/wz
function getServerRoot(): string {
  if (process.env.WZ_ROOT) return process.env.WZ_ROOT;
  // Check if we're in local dev (sibling server/ dir exists)
  const localServer = join(process.cwd(), "..", "server");
  if (existsSync(join(localServer, "wz"))) return join(localServer, "wz");
  return "/app/wz";
}

function getScriptsRoot(): string {
  if (process.env.WZ_ROOT) return process.env.WZ_ROOT.replace("/wz", "/scripts");
  const localServer = join(process.cwd(), "..", "server");
  if (existsSync(join(localServer, "scripts"))) return join(localServer, "scripts");
  return "/app/scripts";
}

// Custom reactor IDs use 99XXXXX range to avoid ALL vanilla conflicts
const CUSTOM_REACTOR_ID_MIN = 9900000;
const CUSTOM_REACTOR_ID_MAX = 9999999;

// Scan client WZ + DB to find a free reactor ID
function getUsedWzIds(): Set<number> {
  const used = new Set<number>();
  try {
    const wzDir = join(process.cwd(), "..", "client", "cosmic-wz");
    const reactorWzPath = join(wzDir, "Reactor.wz");
    if (existsSync(reactorWzPath)) {
      const { parseWzFile } = require("@/lib/wz/patcher");
      const wz = parseWzFile(reactorWzPath);
      for (const entry of wz.root) {
        const id = parseInt(entry.name.replace(".img", ""));
        if (!isNaN(id)) used.add(id);
      }
    }
  } catch {}
  // Also check server WZ XML files
  try {
    const serverDir = join(getServerRoot(), "Reactor.wz");
    if (existsSync(serverDir)) {
      const { readdirSync } = require("fs");
      for (const f of readdirSync(serverDir)) {
        const id = parseInt(f.replace(".img.xml", ""));
        if (!isNaN(id)) used.add(id);
      }
    }
  } catch {}
  return used;
}

async function getNextReactorId(): Promise<number> {
  // Get IDs already used in DB
  const rows = await query<{ reactor_id: number }>(
    "SELECT reactor_id FROM custom_reactors"
  );
  const dbIds = new Set(rows.map(r => r.reactor_id));

  // Get IDs in WZ files
  const wzIds = getUsedWzIds();

  // Find first free ID in range
  for (let id = CUSTOM_REACTOR_ID_MIN; id <= CUSTOM_REACTOR_ID_MAX; id++) {
    if (!dbIds.has(id) && !wzIds.has(id)) return id;
  }
  throw new Error("No free reactor IDs available");
}

// POST: Create a custom reactor
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const name = formData.get("name") as string;
    const eventType = parseInt(formData.get("eventType") as string) || 0;
    const hitsToBreak = Math.min(Math.max(parseInt(formData.get("hitsToBreak") as string) || 3, 1), 5);
    const animationStyle = (formData.get("animationStyle") as AnimationStyle) || "breakable";
    const scriptTemplate = (formData.get("scriptTemplate") as ScriptTemplate) || "drop_items";
    const hitDelay = parseInt(formData.get("hitDelay") as string) || 120;
    const breakDelay = parseInt(formData.get("breakDelay") as string) || 150;
    const triggerItemId = formData.get("triggerItemId") ? parseInt(formData.get("triggerItemId") as string) : null;
    const triggerItemQty = parseInt(formData.get("triggerItemQty") as string) || 1;
    const timeoutMs = formData.get("timeoutMs") ? parseInt(formData.get("timeoutMs") as string) : null;

    const idleFile = formData.get("idlePng") as File;
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!idleFile) return NextResponse.json({ error: "Idle sprite PNG is required" }, { status: 400 });

    const reactorId = parseInt(formData.get("reactorId") as string) || await getNextReactorId();
    if (reactorId < CUSTOM_REACTOR_ID_MIN || reactorId > CUSTOM_REACTOR_ID_MAX) {
      return NextResponse.json({ error: `Reactor ID must be between ${CUSTOM_REACTOR_ID_MIN}-${CUSTOM_REACTOR_ID_MAX}` }, { status: 400 });
    }

    // Check for conflicts
    const existing = await query("SELECT id FROM custom_reactors WHERE reactor_id = ?", [reactorId]);
    if (existing.length > 0) {
      return NextResponse.json({ error: `Reactor ID ${reactorId} already exists` }, { status: 409 });
    }

    // Read the idle PNG
    const idlePngBuf = Buffer.from(await idleFile.arrayBuffer());

    // Generate animation frames
    const frames = generateReactorFrames(idlePngBuf, animationStyle);

    // Save idle PNG locally for publish-local
    const outputDir = join(process.cwd(), "..", "dashboard", "test-output");
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, `reactor-${reactorId}-idle.png`), idlePngBuf);

    // Upload idle PNG to R2 (skip if not configured — local dev)
    let idlePngUrl: string | null = null;
    if (isR2Configured()) {
      const idleR2 = await uploadToR2(`reactors/${reactorId}/idle.png`, idlePngBuf);
      idlePngUrl = idleR2.url || null;
    }

    // Generate and write server-side XML
    const actions: string[] = [];
    const reactorDef = {
      reactorId,
      name,
      eventType,
      hitsToBreak,
      idlePng: frames.idle, // use downscaled idle from animator, not raw upload
      hitFrames: frames.hit,
      breakFrames: frames.break,
      hitDelay,
      breakDelay,
      triggerItemId: triggerItemId ?? undefined,
      triggerItemQty,
      timeout: timeoutMs ?? undefined,
    };

    // Server XML
    const xml = generateReactorXml(reactorDef);
    const xmlDir = join(getServerRoot(), "Reactor.wz");
    mkdirSync(xmlDir, { recursive: true });
    const xmlPath = join(xmlDir, `${String(reactorId).padStart(7, "0")}.img.xml`);
    writeFileSync(xmlPath, xml, "utf-8");
    actions.push(`Wrote server XML: ${xmlPath}`);

    // Reactor script
    const script = generateReactorScript(scriptTemplate);
    const scriptDir = join(getScriptsRoot(), "reactor");
    mkdirSync(scriptDir, { recursive: true });
    const scriptPath = join(scriptDir, `${reactorId}.js`);
    writeFileSync(scriptPath, script, "utf-8");
    actions.push(`Wrote reactor script: ${scriptPath}`);

    // Save to DB
    await execute(
      `INSERT INTO custom_reactors
       (reactor_id, name, event_type, hits_to_break, animation_style, script_template,
        idle_png_url, trigger_item_id, trigger_item_qty, timeout_ms, hit_delay, break_delay)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [reactorId, name, eventType, hitsToBreak, animationStyle, scriptTemplate,
       idlePngUrl, triggerItemId, triggerItemQty, timeoutMs, hitDelay, breakDelay]
    );
    actions.push(`Saved reactor ${reactorId} to database`);

    // 5. Configure drops in reactordrops table
    const dropsJson = formData.get("drops") as string;
    if (dropsJson) {
      try {
        const drops: { itemId: number; chance: number; questId?: number }[] = JSON.parse(dropsJson);
        for (const drop of drops) {
          if (!drop.itemId) continue;
          // Reactor drops use inverse scale: chance=1 means 100%, chance=2 means 50%, etc.
          // UI sends percentage (100=guaranteed, 50=half), convert: 1 / (pct/100) = 100/pct
          const pct = Math.max(1, Math.min(drop.chance ?? 100, 100));
          const chance = Math.max(1, Math.round(100 / pct));
          const questId = drop.questId ?? -1;
          await execute(
            "INSERT INTO reactordrops (reactorid, itemid, chance, questid) VALUES (?, ?, ?, ?)",
            [reactorId, drop.itemId, chance, questId]
          );
          actions.push(`Added drop: item ${drop.itemId} at ${chance}% chance`);
        }
      } catch {}
    }

    return NextResponse.json({
      success: true,
      reactorId,
      name,
      idleSize: { width: frames.width, height: frames.height },
      hitFrameCount: frames.hit.length,
      breakFrameCount: frames.break.length,
      actions,
      note: "Reactor created with drops configured. Use 'Publish' to build client WZ files, or place directly via preactor table (server XML is already written).",
    });
  } catch (err: any) {
    console.error("Reactor creation error:", err);
    return NextResponse.json({ error: "Failed to create reactor", details: err.message }, { status: 500 });
  }
}

// GET: List custom reactors
export async function GET() {
  try {
    const reactors = await query(
      `SELECT reactor_id, name, event_type, hits_to_break, animation_style,
              script_template, idle_png_url, published, created_at
       FROM custom_reactors ORDER BY created_at DESC`
    );
    return NextResponse.json(reactors);
  } catch (err: any) {
    // Table might not exist yet
    if (err.message?.includes("doesn't exist")) {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Remove a custom reactor
export async function DELETE(request: NextRequest) {
  try {
    const { reactorId } = await request.json();
    if (!reactorId) return NextResponse.json({ error: "reactorId required" }, { status: 400 });

    const actions: string[] = [];

    // Remove server XML
    const xmlPath = join(getServerRoot(), "Reactor.wz", `${String(reactorId).padStart(7, "0")}.img.xml`);
    try {
      const { unlinkSync } = await import("fs");
      unlinkSync(xmlPath);
      actions.push(`Removed server XML`);
    } catch {}

    // Remove script
    const scriptPath = join(getScriptsRoot(), "reactor", `${reactorId}.js`);
    try {
      const { unlinkSync } = await import("fs");
      unlinkSync(scriptPath);
      actions.push(`Removed reactor script`);
    } catch {}

    // Remove from DB
    await execute("DELETE FROM custom_reactors WHERE reactor_id = ?", [reactorId]);
    actions.push(`Removed from database`);

    // Clean up any placements
    const result = await execute("DELETE FROM preactor WHERE rid = ?", [reactorId]);
    if (result.affectedRows > 0) {
      actions.push(`Removed ${result.affectedRows} map placements`);
    }

    // Clean up drops
    const dropResult = await execute("DELETE FROM reactordrops WHERE reactorid = ?", [reactorId]);
    if (dropResult.affectedRows > 0) {
      actions.push(`Removed ${dropResult.affectedRows} drop entries`);
    }

    return NextResponse.json({ success: true, actions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
