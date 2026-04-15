import { NextResponse } from "next/server";
import { query, execute } from "@/lib/db";
import { uploadToR2, uploadFileToR2, isR2Configured } from "@/lib/r2";
import { dispatchWzToNx } from "@/lib/wz-to-nx";
import { parseWzFile, saveWzFile, addReactorToWz } from "@/lib/wz";
import { generateReactorFrames } from "@/lib/wz/reactor-animator";
import { generateReactorXml, generateReactorScript } from "@/lib/wz/reactor-builder";
import type { AnimationStyle } from "@/lib/wz/reactor-animator";
import type { ScriptTemplate } from "@/lib/wz/reactor-builder";
import { restartGameServer } from "@/lib/fly-restart";
import { execSync } from "child_process";
import { Readable } from "stream";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  statSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

async function streamDownload(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${url} (${res.status})`);
  const body = res.body;
  if (!body) throw new Error(`No response body: ${url}`);
  const readable = Readable.fromWeb(body as any);
  await pipeline(readable, createWriteStream(outputPath));
}

const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL ||
  "https://pub-34b8b332208f464a9e74fa14104be3e2.r2.dev";

const STATUS_DIR = process.env.COSMIC_ROOT || "/cosmic";
const STATUS_FILE = join(STATUS_DIR, "reactor-publish-status.json");

interface PublishStatus {
  status: "running" | "done" | "error";
  step: string;
  actions: string[];
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

function writeStatus(s: PublishStatus) {
  try { writeFileSync(STATUS_FILE, JSON.stringify(s), "utf-8"); } catch {}
}

function readStatus(): PublishStatus | null {
  try {
    if (!existsSync(STATUS_FILE)) return null;
    return JSON.parse(readFileSync(STATUS_FILE, "utf-8"));
  } catch { return null; }
}

async function downloadPng(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function runPublishJob() {
  const workDir = join(tmpdir(), `reactor-publish-${Date.now()}`);
  const status: PublishStatus = {
    status: "running",
    step: "Starting...",
    actions: [],
    startedAt: new Date().toISOString(),
  };

  function update(step: string, action?: string) {
    status.step = step;
    if (action) status.actions.push(action);
    writeStatus(status);
  }

  try {
    // 1. Fetch custom reactors
    update("Fetching custom reactors...");
    const rows = await query<any>(
      "SELECT * FROM custom_reactors ORDER BY reactor_id"
    );
    if (rows.length === 0) {
      status.status = "error";
      status.error = "No custom reactors to publish";
      status.finishedAt = new Date().toISOString();
      writeStatus(status);
      return;
    }
    update("Fetched reactors", `Found ${rows.length} custom reactor(s)`);

    // 2. Download server-wz.tar.gz
    update("Downloading server WZ files...");
    mkdirSync(workDir, { recursive: true });
    const tarPath = join(workDir, "server-wz.tar.gz");
    const downloadRes = await fetch(`${R2_PUBLIC_URL}/server-wz.tar.gz`);
    if (!downloadRes.ok) throw new Error(`Failed to download server-wz.tar.gz: ${downloadRes.status}`);
    const tarBuffer = Buffer.from(await downloadRes.arrayBuffer());
    writeFileSync(tarPath, tarBuffer);
    update("Downloaded", `Downloaded server-wz.tar.gz (${(tarBuffer.length / 1024 / 1024).toFixed(1)}MB)`);

    // 3. Extract
    update("Extracting...");
    execSync(`tar xzf "${tarPath}" -C "${workDir}"`, { timeout: 300000 });
    const wzRoot = join(workDir, "wz");
    if (!existsSync(wzRoot)) throw new Error("Extracted tar missing wz/ directory");
    update("Extracted");

    // 4. For each reactor: generate frames, write XML + script
    const reactorWzDir = join(wzRoot, "Reactor.wz");
    if (!existsSync(reactorWzDir)) mkdirSync(reactorWzDir, { recursive: true });

    const scriptsDir = join(workDir, "scripts", "reactor");
    if (!existsSync(scriptsDir)) {
      // scripts might be at root level, check both
      const altScriptsDir = join(wzRoot.replace("/wz", ""), "scripts", "reactor");
      if (existsSync(altScriptsDir)) {
        // scripts are outside wz/
      }
    }

    for (const row of rows) {
      const reactorId = row.reactor_id;
      update(`Processing reactor ${reactorId} (${row.name})...`);

      // Download idle PNG from R2
      let idlePng: Buffer;
      if (row.idle_png_url) {
        idlePng = await downloadPng(row.idle_png_url);
      } else {
        update(`Skipping ${reactorId}`, `Reactor ${reactorId} has no idle PNG — skipped`);
        continue;
      }

      // Generate animation frames
      const frames = generateReactorFrames(idlePng, row.animation_style as AnimationStyle);

      // Build definition
      const def = {
        reactorId,
        name: row.name,
        eventType: row.event_type,
        hitsToBreak: row.hits_to_break,
        idlePng: idlePng,
        hitFrames: frames.hit,
        breakFrames: frames.break,
        hitDelay: row.hit_delay ?? 120,
        breakDelay: row.break_delay ?? 150,
        triggerItemId: row.trigger_item_id ?? undefined,
        triggerItemQty: row.trigger_item_qty ?? 1,
        timeout: row.timeout_ms ?? undefined,
      };

      // Write server XML
      const xml = generateReactorXml(def);
      const xmlPath = join(reactorWzDir, `${String(reactorId).padStart(7, "0")}.img.xml`);
      writeFileSync(xmlPath, xml, "utf-8");

      // Write script
      const script = generateReactorScript(row.script_template as ScriptTemplate);
      // Scripts go in scripts/reactor/ at the same level as wz/
      const scriptBaseDir = join(workDir, "scripts", "reactor");
      mkdirSync(scriptBaseDir, { recursive: true });
      writeFileSync(join(scriptBaseDir, `${reactorId}.js`), script, "utf-8");

      update(`Published ${row.name}`, `Reactor ${reactorId}: XML + script written`);
    }

    // 5. Repack tar (include scripts/ if we added any)
    update("Repacking server WZ...");
    const newTarPath = join(workDir, "server-wz-new.tar.gz");
    // Pack both wz/ and scripts/ directories
    const packDirs = ["wz/"];
    if (existsSync(join(workDir, "scripts"))) packDirs.push("scripts/");
    execSync(
      `cd "${workDir}" && COPYFILE_DISABLE=1 tar czf "${newTarPath}" --exclude='.DS_Store' --exclude='._*' ${packDirs.join(" ")}`,
      { timeout: 300000 }
    );
    const newTarBuffer = readFileSync(newTarPath);
    update("Repacked", `Repacked (${(newTarBuffer.length / 1024 / 1024).toFixed(1)}MB)`);

    // 6. Upload to R2
    update("Uploading to R2...");
    const uploadResult = await uploadToR2("server-wz.tar.gz", newTarBuffer);
    if (!uploadResult.success) throw new Error(`R2 upload failed: ${uploadResult.error}`);
    update("Uploaded", "Uploaded server-wz.tar.gz to R2");

    // 7. Mark all as published
    const ids = rows.map((r: any) => r.reactor_id);
    await execute(
      `UPDATE custom_reactors SET published = 1 WHERE reactor_id IN (${ids.join(",")})`
    );

    // 8. Version marker
    const version = new Date().toISOString();
    await uploadToR2("server-wz.version", Buffer.from(version));

    // 9. Patch client Reactor.wz + upload to R2 + bump manifest
    const manifestUpdates: Record<string, { hash?: string; size?: number }> = {};
    if (isR2Configured()) {
      try {
        update("Downloading Reactor.wz from R2 (~54MB)...");
        const reactorWzPath = join(workDir, "Reactor.wz");
        await streamDownload(`${R2_PUBLIC_URL}/Reactor.wz`, reactorWzPath);
        update("Downloaded Reactor.wz", `Downloaded (${(statSync(reactorWzPath).size / 1024 / 1024).toFixed(0)}MB)`);

        update("Patching Reactor.wz with custom reactors...");
        const reactorWz = parseWzFile(reactorWzPath);

        for (const row of rows) {
          let idlePng: Buffer | undefined;
          // Try local file first, then R2
          const localPng = join("/tmp", "reactor-sprites", `reactor-${row.reactor_id}-idle.png`);
          if (existsSync(localPng)) {
            idlePng = readFileSync(localPng);
          } else if (row.idle_png_url) {
            try {
              const res = await fetch(row.idle_png_url);
              if (res.ok) idlePng = Buffer.from(await res.arrayBuffer());
            } catch {}
          }
          if (!idlePng) continue;

          const frames = generateReactorFrames(idlePng, row.animation_style as AnimationStyle);
          addReactorToWz(reactorWz, {
            reactorId: row.reactor_id,
            name: row.name,
            eventType: row.event_type,
            hitsToBreak: row.hits_to_break,
            idlePng: frames.idle,
            hitFrames: frames.hit,
            breakFrames: frames.break,
            hitDelay: row.hit_delay ?? 120,
            breakDelay: row.break_delay ?? 150,
            triggerItemId: row.trigger_item_id ?? undefined,
            triggerItemQty: row.trigger_item_qty ?? 1,
            timeout: row.timeout_ms ?? undefined,
          });
        }

        const patchedPath = join(workDir, "Reactor-patched.wz");
        saveWzFile(reactorWz, patchedPath);
        update("Patched Reactor.wz", `Patched with ${rows.length} custom reactor(s)`);

        update("Uploading Reactor.wz to R2 (streaming)...");
        const reactorUpload = await uploadFileToR2("Reactor.wz", patchedPath);
        if (reactorUpload.success) {
          manifestUpdates["Reactor.wz"] = { hash: reactorUpload.hash, size: reactorUpload.size };
          update("Uploaded Reactor.wz", "Uploaded patched Reactor.wz to R2");
        } else {
          update("Upload warning", `Reactor.wz upload failed: ${reactorUpload.error}`);
        }

        // Trigger WZ→NX conversion for the browser client
        const changedWz = Object.keys(manifestUpdates).filter((n) => n.endsWith(".wz"));
        if (changedWz.length > 0) {
          dispatchWzToNx(changedWz).catch(() => {});
          update("Triggering WZ→NX conversion", `Dispatched wz-to-nx for: ${changedWz.join(", ")}`);
        }

        // Bump launcher manifest
        if (Object.keys(manifestUpdates).length > 0) {
          update("Updating launcher manifest...");
          try {
            const VOLUME_MANIFEST = join(process.env.COSMIC_ROOT || "/cosmic", "launcher-manifest.json");
            const BUNDLED_MANIFEST = join(process.cwd(), "launcher-manifest.json");
            const manifestPath = existsSync(VOLUME_MANIFEST) ? VOLUME_MANIFEST : BUNDLED_MANIFEST;
            const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

            for (const file of manifest.files || []) {
              const upd = manifestUpdates[file.name];
              if (upd) { file.hash = upd.hash; file.size = upd.size; }
            }

            const parts = (manifest.version || "1.0.0").split(".");
            parts[2] = String(parseInt(parts[2] || "0") + 1);
            manifest.version = parts.join(".");
            manifest.updatedAt = new Date().toISOString();

            writeFileSync(VOLUME_MANIFEST, JSON.stringify(manifest, null, 2));
            update("Manifest updated", `Launcher manifest → v${manifest.version}`);
          } catch (err: any) {
            update("Manifest warning", `Manifest update failed: ${err.message}`);
          }
        }
      } catch (err: any) {
        update("Client WZ warning", `Client WZ patching failed: ${err.message}. Server-side publish still succeeded.`);
      }
    }

    // 10. Restart game server
    update("Restarting game server...");
    try {
      const machineId = await restartGameServer();
      update("Server restarted", `Restarted game server (machine: ${machineId})`);
    } catch (err: any) {
      update("Restart warning", `Server restart failed: ${err.message}. Restart manually.`);
    }

    status.status = "done";
    status.step = "Complete";
    status.finishedAt = new Date().toISOString();
    status.actions.push(`Published ${rows.length} reactor(s) — client WZ patched, manifest bumped, server restarted.`);
    writeStatus(status);

    // Cleanup
    try { execSync(`rm -rf "${workDir}"`, { timeout: 10000 }); } catch {}
  } catch (err: any) {
    status.status = "error";
    status.error = err.message;
    status.finishedAt = new Date().toISOString();
    writeStatus(status);
    try { execSync(`rm -rf "${workDir}"`, { timeout: 10000 }); } catch {}
  }
}

// POST: Start publish job
export async function POST() {
  const current = readStatus();
  if (current?.status === "running") {
    return NextResponse.json({ error: "Publish already running" }, { status: 409 });
  }

  // Fire and forget
  runPublishJob();

  return NextResponse.json({ status: "started" });
}

// GET: Check publish status
export async function GET() {
  const status = readStatus();
  return NextResponse.json(status || { status: "idle" });
}
