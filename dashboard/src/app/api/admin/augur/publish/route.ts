import { NextResponse } from "next/server";
import { uploadFileToR2, isR2Configured } from "@/lib/r2";
import { dispatchWzToNx } from "@/lib/wz-to-nx";
import { parseWzFile, saveWzFile, addNpcToStringWz } from "@/lib/wz/patcher";
import { addNpcToWz, generateNpcXml, processNpcSprite } from "@/lib/wz/npc-builder";
import { restartGameServer } from "@/lib/fly-restart";
import { execute, query } from "@/lib/db";
import { Readable } from "stream";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL ||
  "https://pub-34b8b332208f464a9e74fa14104be3e2.r2.dev";

const NPC_ID = 9900200;
const NPC_NAME = "Augur";

async function streamDownload(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${url} (${res.status})`);
  const body = res.body;
  if (!body) throw new Error(`No response body: ${url}`);
  const readable = Readable.fromWeb(body as any);
  await pipeline(readable, createWriteStream(outputPath));
}

export async function POST() {
  if (!isR2Configured()) {
    return NextResponse.json({ error: "R2 not configured" }, { status: 500 });
  }

  const actions: string[] = [];

  try {
    // 1. Load the sprite PNG
    const spritePath = join("/tmp", "augur-sprite.png");
    if (!existsSync(spritePath)) {
      return NextResponse.json(
        { error: "Augur sprite not found at /tmp/augur-sprite.png. Upload it first." },
        { status: 400 },
      );
    }
    const rawPng = readFileSync(spritePath);
    const processedPng = processNpcSprite(rawPng, 80);
    actions.push("Processed sprite PNG");

    // 2. Patch Npc.wz
    const tmpDir = join(tmpdir(), `augur-publish-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const npcWzPath = join(tmpDir, "Npc.wz");
    await streamDownload(`${R2_PUBLIC_URL}/Npc.wz`, npcWzPath);
    actions.push("Downloaded Npc.wz from R2");

    const npcWz = parseWzFile(npcWzPath);
    addNpcToWz(npcWz, NPC_ID, processedPng);
    const patchedNpcPath = join(tmpDir, "Npc-patched.wz");
    saveWzFile(npcWz, patchedNpcPath);
    actions.push("Patched Npc.wz with Augur sprite");

    const npcUpload = await uploadFileToR2("Npc.wz", patchedNpcPath);
    if (!npcUpload.success) throw new Error(`Npc.wz upload failed: ${npcUpload.error}`);
    actions.push("Uploaded patched Npc.wz to R2");

    // 3. Patch String.wz (add NPC name)
    const stringWzPath = join(tmpDir, "String.wz");
    await streamDownload(`${R2_PUBLIC_URL}/String.wz`, stringWzPath);
    actions.push("Downloaded String.wz from R2");

    const stringWz = parseWzFile(stringWzPath);
    addNpcToStringWz(stringWz, NPC_ID, NPC_NAME, "I sense great potential in you...");
    const patchedStringPath = join(tmpDir, "String-patched.wz");
    saveWzFile(stringWz, patchedStringPath);
    actions.push("Patched String.wz with Augur name");

    const stringUpload = await uploadFileToR2("String.wz", patchedStringPath);
    if (!stringUpload.success) throw new Error(`String.wz upload failed: ${stringUpload.error}`);
    actions.push("Uploaded patched String.wz to R2");

    // 3.5. Trigger WZ→NX conversion for the browser client
    dispatchWzToNx(["Npc.wz", "String.wz"]).catch(() => {});
    actions.push("Dispatched wz-to-nx for Npc.wz, String.wz");

    // 4. Write server XML
    const serverRoot = process.env.WZ_ROOT || "/cosmic/wz";
    const npcXmlDir = join(serverRoot, "Npc.wz");
    mkdirSync(npcXmlDir, { recursive: true });
    const xml = generateNpcXml(NPC_ID, NPC_NAME, processedPng);
    writeFileSync(join(npcXmlDir, `${String(NPC_ID).padStart(7, "0")}.img.xml`), xml, "utf-8");
    actions.push("Wrote server NPC XML");

    // 5. Bump launcher manifest
    try {
      const manifestPath = join(process.env.COSMIC_ROOT || "/cosmic", "launcher-manifest.json");
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

        // Update Npc.wz entry
        if (npcUpload.hash && npcUpload.size) {
          const npcFile = manifest.files?.find((f: any) => f.name === "Npc.wz");
          if (npcFile) {
            npcFile.hash = npcUpload.hash;
            npcFile.size = npcUpload.size;
          }
        }
        // Update String.wz entry
        if (stringUpload.hash && stringUpload.size) {
          const strFile = manifest.files?.find((f: any) => f.name === "String.wz");
          if (strFile) {
            strFile.hash = stringUpload.hash;
            strFile.size = stringUpload.size;
          }
        }

        manifest.version = (manifest.version || 0) + 1;
        manifest.updatedAt = new Date().toISOString();
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

        const { uploadToR2 } = await import("@/lib/r2");
        await uploadToR2("launcher-manifest.json", Buffer.from(JSON.stringify(manifest, null, 2)));
        actions.push(`Bumped manifest to v${manifest.version}`);
      }
    } catch (e: any) {
      actions.push(`Manifest bump failed: ${e.message}`);
    }

    // 6. Spawn NPC on Henesys if not already there
    try {
      const existing = await query(
        "SELECT id FROM plife WHERE life = ? AND type = 'n' AND map = 100000000",
        [NPC_ID],
      );
      if (existing.length === 0) {
        // Henesys center area — near other NPCs
        await execute(
          "INSERT INTO plife (world, map, life, type, cy, f, fh, rx0, rx1, x, y, hide, mobtime) VALUES (0, 100000000, ?, 'n', 0, 0, 24, -200, 200, 55, 0, 0, -1)",
          [NPC_ID],
        );
        actions.push("Spawned Augur NPC on Henesys");
      } else {
        actions.push("Augur already spawned on Henesys");
      }
    } catch (e: any) {
      actions.push(`plife insert failed: ${e.message}`);
    }

    // 7. Restart game server
    try {
      await restartGameServer();
      actions.push("Restarted game server");
    } catch (e: any) {
      actions.push(`Server restart failed: ${e.message}`);
    }

    return NextResponse.json({ success: true, actions });
  } catch (err: any) {
    console.error("Augur publish error:", err);
    return NextResponse.json({ error: err.message, actions }, { status: 500 });
  }
}
