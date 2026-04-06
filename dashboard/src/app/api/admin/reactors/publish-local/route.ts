import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { parseWzFile, saveWzFile } from "@/lib/wz";
import { generateReactorFrames } from "@/lib/wz/reactor-animator";
import { addReactorToWz, generateReactorXml, generateReactorScript } from "@/lib/wz/reactor-builder";
import type { AnimationStyle } from "@/lib/wz/reactor-animator";
import type { ScriptTemplate } from "@/lib/wz/reactor-builder";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
} from "fs";
import { join } from "path";

/**
 * POST /api/admin/reactors/publish-local
 *
 * Local-only publish: patches client Reactor.wz on disk + generates server XML + scripts.
 * Reads from client/cosmic-wz/Reactor.wz, writes patched to dashboard/test-output/Reactor.wz.
 * Also writes server XML to server/wz/Reactor.wz/ and scripts to server/scripts/reactor/.
 */
export async function POST() {
  const projectRoot = join(process.cwd(), "..");
  const clientWzDir = join(projectRoot, "client", "cosmic-wz");
  const outputDir = join(projectRoot, "dashboard", "test-output");
  const serverWzDir = join(projectRoot, "server", "wz");
  const serverScriptsDir = join(projectRoot, "server", "scripts");
  const actions: string[] = [];

  try {
    // Check client WZ exists
    const reactorWzPath = join(clientWzDir, "Reactor.wz");
    if (!existsSync(reactorWzPath)) {
      return NextResponse.json(
        { error: `Client WZ not found: ${reactorWzPath}. Place Reactor.wz in client/cosmic-wz/` },
        { status: 400 }
      );
    }

    // Fetch custom reactors from DB
    const rows = await query<any>(
      "SELECT * FROM custom_reactors ORDER BY reactor_id"
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "No custom reactors in DB" }, { status: 400 });
    }
    actions.push(`Found ${rows.length} custom reactor(s)`);

    mkdirSync(outputDir, { recursive: true });

    // Parse client Reactor.wz
    const reactorWz = parseWzFile(reactorWzPath);
    actions.push(`Parsed Reactor.wz (${reactorWz.root.length} entries)`);

    // Process each reactor
    for (const row of rows) {
      const reactorId = row.reactor_id;

      // Load idle PNG — from local file (written during creation) or R2 URL
      let idlePng: Buffer | undefined;

      // Try local server XML to find if idle was saved alongside
      const localPngPath = join(outputDir, `reactor-${reactorId}-idle.png`);
      if (existsSync(localPngPath)) {
        idlePng = readFileSync(localPngPath);
      } else if (row.idle_png_url) {
        // Download from R2
        try {
          const res = await fetch(row.idle_png_url);
          if (res.ok) idlePng = Buffer.from(await res.arrayBuffer());
        } catch {}
      }

      if (!idlePng) {
        actions.push(`SKIP reactor ${reactorId} (${row.name}): no idle PNG found. Re-create it or place PNG at ${localPngPath}`);
        continue;
      }

      // Generate animation frames
      const frames = generateReactorFrames(idlePng, row.animation_style as AnimationStyle);

      // Build reactor definition
      const def = {
        reactorId,
        name: row.name,
        eventType: row.event_type,
        hitsToBreak: row.hits_to_break,
        idlePng: frames.idle, // use downscaled idle from animator
        hitFrames: frames.hit,
        breakFrames: frames.break,
        hitDelay: row.hit_delay ?? 120,
        breakDelay: row.break_delay ?? 150,
        triggerItemId: row.trigger_item_id ?? undefined,
        triggerItemQty: row.trigger_item_qty ?? 1,
        timeout: row.timeout_ms ?? undefined,
      };

      // Add to client WZ binary
      addReactorToWz(reactorWz, def);
      actions.push(`+ Reactor ${reactorId}: ${row.name} (${frames.width}x${frames.height}px, ${frames.hit.length} hit + ${frames.break.length} break frames)`);

      // Write server XML
      const xml = generateReactorXml(def);
      const xmlDir = join(serverWzDir, "Reactor.wz");
      mkdirSync(xmlDir, { recursive: true });
      writeFileSync(join(xmlDir, `${String(reactorId).padStart(7, "0")}.img.xml`), xml, "utf-8");

      // Write reactor script
      const script = generateReactorScript(row.script_template as ScriptTemplate);
      const scriptDir = join(serverScriptsDir, "reactor");
      mkdirSync(scriptDir, { recursive: true });
      writeFileSync(join(scriptDir, `${reactorId}.js`), script, "utf-8");
    }

    // Save patched Reactor.wz
    const outPath = join(outputDir, "Reactor.wz");
    saveWzFile(reactorWz, outPath);
    const outSize = statSync(outPath).size;
    actions.push(`Saved Reactor.wz (${(outSize / 1024 / 1024).toFixed(1)}MB)`);
    actions.push("Generated server XML + scripts");

    return NextResponse.json({
      success: true,
      actions,
      output: outputDir,
      instructions: [
        `Copy ${outPath} to your game client folder (e.g. C:\\AugurMS\\Reactor.wz)`,
        "Restart local server: docker compose -f docker-compose.local.yml restart server",
        "Place reactor on a map: INSERT INTO preactor (world, map, rid, x, y, f, reactor_time, name) VALUES (0, MAP_ID, REACTOR_ID, X, Y, 0, -1, 'test')",
      ],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, actions }, { status: 500 });
  }
}
