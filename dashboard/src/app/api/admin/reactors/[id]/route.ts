import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

// GET: Fetch a single reactor with its drops
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const reactorId = parseInt(id);
  if (isNaN(reactorId))
    return NextResponse.json({ error: "Invalid reactor ID" }, { status: 400 });

  try {
    const [reactor] = await query<any>(
      `SELECT * FROM custom_reactors WHERE reactor_id = ?`,
      [reactorId]
    );
    if (!reactor)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const drops = await query<any>(
      `SELECT reactordropid, itemid, chance, questid FROM reactordrops WHERE reactorid = ?`,
      [reactorId]
    );

    return NextResponse.json({ ...reactor, drops });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT: Update a reactor's settings and drops
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const reactorId = parseInt(id);
  if (isNaN(reactorId))
    return NextResponse.json({ error: "Invalid reactor ID" }, { status: 400 });

  try {
    const body = await request.json();
    const {
      name,
      event_type,
      hits_to_break,
      animation_style,
      script_template,
      hit_delay,
      break_delay,
      trigger_item_id,
      trigger_item_qty,
      timeout_ms,
      drops,
    } = body;

    // Update reactor row
    await execute(
      `UPDATE custom_reactors SET
        name = ?, event_type = ?, hits_to_break = ?, animation_style = ?,
        script_template = ?, hit_delay = ?, break_delay = ?,
        trigger_item_id = ?, trigger_item_qty = ?, timeout_ms = ?
       WHERE reactor_id = ?`,
      [
        name,
        event_type ?? 0,
        hits_to_break ?? 3,
        animation_style ?? "breakable",
        script_template ?? "drop_items",
        hit_delay ?? 120,
        break_delay ?? 150,
        trigger_item_id ?? null,
        trigger_item_qty ?? 1,
        timeout_ms ?? null,
        reactorId,
      ]
    );

    // Update drops: delete all existing, re-insert
    if (Array.isArray(drops)) {
      await execute("DELETE FROM reactordrops WHERE reactorid = ?", [reactorId]);
      for (const drop of drops) {
        if (!drop.itemid) continue;
        const pct = Math.max(1, Math.min(drop.chance ?? 100, 100));
        const chance = Math.max(1, Math.round(100 / pct));
        const questId = drop.questid ?? -1;
        await execute(
          "INSERT INTO reactordrops (reactorid, itemid, chance, questid) VALUES (?, ?, ?, ?)",
          [reactorId, drop.itemid, chance, questId]
        );
      }
    }

    // Re-generate server XML and script
    const { generateReactorXml, generateReactorScript } = await import(
      "@/lib/wz/reactor-builder"
    );
    const { generateReactorFrames } = await import(
      "@/lib/wz/reactor-animator"
    );
    const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import("fs");
    const { join } = await import("path");

    // Rebuild server files
    const serverRoot = getServerRoot();
    const scriptsRoot = getScriptsRoot();

    // Server XML — need idle PNG for dimensions
    const outputDir = join(process.cwd(), "..", "dashboard", "test-output");
    const localPngPath = join(outputDir, `reactor-${reactorId}-idle.png`);
    if (existsSync(localPngPath)) {
      const idlePngBuf = readFileSync(localPngPath);
      const frames = generateReactorFrames(
        idlePngBuf,
        (animation_style ?? "breakable") as any
      );
      const def = {
        reactorId,
        name,
        eventType: event_type ?? 0,
        hitsToBreak: hits_to_break ?? 3,
        idlePng: frames.idle,
        hitFrames: frames.hit,
        breakFrames: frames.break,
        hitDelay: hit_delay ?? 120,
        breakDelay: break_delay ?? 150,
        triggerItemId: trigger_item_id ?? undefined,
        triggerItemQty: trigger_item_qty ?? 1,
        timeout: timeout_ms ?? undefined,
      };
      const xml = generateReactorXml(def);
      const xmlDir = join(serverRoot, "Reactor.wz");
      mkdirSync(xmlDir, { recursive: true });
      writeFileSync(
        join(xmlDir, `${String(reactorId).padStart(7, "0")}.img.xml`),
        xml,
        "utf-8"
      );
    }

    // Script
    const script = generateReactorScript(
      (script_template ?? "drop_items") as any
    );
    const scriptDir = join(scriptsRoot, "reactor");
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(join(scriptDir, `${reactorId}.js`), script, "utf-8");

    return NextResponse.json({ success: true, reactorId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function getServerRoot(): string {
  const { existsSync } = require("fs");
  const { join } = require("path");
  if (process.env.WZ_ROOT) return process.env.WZ_ROOT;
  const localServer = join(process.cwd(), "..", "server");
  if (existsSync(join(localServer, "wz"))) return join(localServer, "wz");
  return "/app/wz";
}

function getScriptsRoot(): string {
  const { existsSync } = require("fs");
  const { join } = require("path");
  if (process.env.WZ_ROOT)
    return process.env.WZ_ROOT.replace("/wz", "/scripts");
  const localServer = join(process.cwd(), "..", "server");
  if (existsSync(join(localServer, "scripts")))
    return join(localServer, "scripts");
  return "/app/scripts";
}
