import { NextResponse } from "next/server";
import { execute, query } from "@/lib/db";
import { uploadFileToR2, uploadToR2, isR2Configured } from "@/lib/r2";
import { dispatchWzToNx } from "@/lib/wz-to-nx";
import { restartGameServer } from "@/lib/fly-restart";
import {
  parseWzFile,
  saveWzFile,
  addImgToCharacterWz,
  addStringsToStringWz,
  addNpcToWz,
  addNpcToStringWz,
  addEtcBucketToItemWz,
  addEtcStringsToStringWz,
  generateNpcXml,
} from "@/lib/wz";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { execSync } from "child_process";
import {
  createWriteStream,
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  statSync,
} from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL ||
  "https://pub-34b8b332208f464a9e74fa14104be3e2.r2.dev";

const STATUS_DIR = process.env.COSMIC_ROOT || "/cosmic";
const STATUS_FILE = join(STATUS_DIR, "assets-publish-status.json");

// All custom ETCs share one bucket (4090xxx → 0409.img). Empty in v83 stock,
// so we rebuild it from scratch every publish; that keeps string-pool offsets
// inside the bucket self-contained and avoids relocating any pre-existing data.
const ETC_BUCKET_NAME = "0409.img";

interface PublishStatus {
  id: string;
  status: "running" | "done" | "error";
  step: string;
  actions: string[];
  error?: string;
  startedAt: string;
  finishedAt?: string;
  assets_published?: number;
  version?: string;
}

function writeStatus(s: PublishStatus) {
  try {
    writeFileSync(STATUS_FILE, JSON.stringify(s), "utf-8");
  } catch {}
}

function readStatus(): PublishStatus | null {
  try {
    if (!existsSync(STATUS_FILE)) return null;
    return JSON.parse(readFileSync(STATUS_FILE, "utf-8"));
  } catch {
    return null;
  }
}

async function streamDownload(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${url} (${res.status})`);
  const body = res.body;
  if (!body) throw new Error(`No response body: ${url}`);
  const readable = Readable.fromWeb(body as any);
  await pipeline(readable, createWriteStream(outputPath));
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

interface AssetRow {
  id: number;
  asset_type: "hair" | "face" | "npc" | "etc";
  in_game_id: number;
  file_key: string;
  name: string | null;
  attrs: any;
  status: "ready" | "published" | "rejected";
}

interface NpcAttrs {
  dialogue?: string;
  script?: string;
}
interface EtcAttrs {
  desc?: string;
  slotMax?: number;
  price?: number;
  quest?: number;
}

function parseAttrs(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, any>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---------- Server-side String.wz XML helpers ----------

/** Add or replace an entry under the named section of a server String.wz XML file. */
function upsertStringEntryXml(
  filePath: string,
  rootImg: string, // e.g. "Etc.img" or "Npc.img" — root <imgdir name="..."> tag
  section: string | null, // for Etc.img use "Etc"; for Npc.img use null (entries are direct children)
  itemId: number,
  fields: Array<{ name: string; value: string }>
): { success: boolean; error?: string } {
  try {
    if (!existsSync(filePath))
      return { success: false, error: `${filePath} not found` };

    let content = readFileSync(filePath, "utf-8");
    const idStr = String(itemId);

    const block =
      `      <imgdir name="${idStr}">\n` +
      fields
        .map((f) => `        <string name="${f.name}" value="${escapeXml(f.value)}"/>`)
        .join("\n") +
      `\n      </imgdir>`;

    // Remove any existing entry with the same id so we can re-publish updated names.
    const existingRegex = new RegExp(
      `\\n[\\t ]*<imgdir name="${idStr}">[\\s\\S]*?</imgdir>\\n`,
      ""
    );
    content = content.replace(existingRegex, "\n");

    let insertAfter: number;
    if (section) {
      const sectionOpen = content.indexOf(`<imgdir name="${section}">`);
      if (sectionOpen === -1) {
        return {
          success: false,
          error: `Section "${section}" not found in ${rootImg}`,
        };
      }
      const sectionCloseRegex = /\n[\t ]+<\/imgdir>/g;
      sectionCloseRegex.lastIndex = sectionOpen;
      const closeMatch = sectionCloseRegex.exec(content);
      if (!closeMatch) {
        return {
          success: false,
          error: `Could not find closing tag for ${section}`,
        };
      }
      insertAfter = closeMatch.index;
    } else {
      // Insert right before the root <imgdir>'s closing tag (last </imgdir>).
      const lastClose = content.lastIndexOf("</imgdir>");
      if (lastClose === -1) {
        return { success: false, error: `Malformed ${rootImg} (no closing tag)` };
      }
      // Walk back to start of that line so we insert above it.
      insertAfter = content.lastIndexOf("\n", lastClose);
      if (insertAfter === -1) insertAfter = lastClose;
    }

    content =
      content.slice(0, insertAfter) + "\n" + block + content.slice(insertAfter);
    writeFileSync(filePath, content, "utf-8");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Build the server-side Item.wz/Etc/<bucket>.img.xml from the full custom ETC list. */
function generateEtcBucketXml(
  bucketName: string,
  items: Array<{ itemId: number; slotMax?: number; price?: number; quest?: number }>
): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  lines.push(`<imgdir name="${bucketName}">`);
  for (const item of items) {
    lines.push(`  <imgdir name="${item.itemId}">`);
    lines.push(`    <imgdir name="info">`);
    lines.push(`      <int name="slotMax" value="${item.slotMax ?? 100}"/>`);
    lines.push(`      <int name="price" value="${item.price ?? 0}"/>`);
    if (item.quest) {
      lines.push(`      <int name="quest" value="${item.quest}"/>`);
    }
    lines.push(`    </imgdir>`);
    lines.push(`  </imgdir>`);
  }
  lines.push(`</imgdir>`);
  return lines.join("\n") + "\n";
}

// ---------- Main publish job ----------

async function runPublishJob(jobId: string) {
  const workDir = join(tmpdir(), `assets-publish-${jobId}`);
  const status: PublishStatus = {
    id: jobId,
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
    update("Fetching ready assets from database...");
    const ready = (await query<AssetRow>(
      "SELECT id, asset_type, in_game_id, file_key, name, attrs, status FROM custom_assets WHERE status = 'ready' ORDER BY asset_type, in_game_id"
    )) as AssetRow[];

    if (ready.length === 0) {
      status.status = "error";
      status.error = "No ready assets to publish";
      status.finishedAt = new Date().toISOString();
      writeStatus(status);
      return;
    }
    update("Fetched assets", `Found ${ready.length} ready asset(s)`);

    const hairFace = ready.filter(
      (a) => a.asset_type === "hair" || a.asset_type === "face"
    );
    const npcs = ready.filter((a) => a.asset_type === "npc");
    const etcs = ready.filter((a) => a.asset_type === "etc");

    // For ETC, the bucket gets rebuilt from scratch — pull every previously
    // published custom ETC plus the ready ones so nothing disappears.
    const allEtcs =
      etcs.length > 0
        ? ((await query<AssetRow>(
            "SELECT id, asset_type, in_game_id, file_key, name, attrs, status FROM custom_assets WHERE asset_type = 'etc' AND status IN ('ready','published') ORDER BY in_game_id"
          )) as AssetRow[])
        : [];

    const needCharacterWz = hairFace.length > 0;
    const needNpcWz = npcs.length > 0;
    const needItemWz = etcs.length > 0;
    const namedAssets = ready.filter((a) => a.name && a.name.trim().length > 0);
    const needStringWz = namedAssets.length > 0;
    const needServerTar = npcs.length > 0 || etcs.length > 0;

    mkdirSync(workDir, { recursive: true });

    // ---------- Server-side WZ tar (NPC + ETC only) ----------
    if (needServerTar) {
      update("Downloading server WZ tarball...");
      const tarPath = join(workDir, "server-wz.tar.gz");
      await streamDownload(`${R2_PUBLIC_URL}/server-wz.tar.gz`, tarPath);
      update(
        "Downloaded server tar",
        `Downloaded server-wz.tar.gz (${(statSync(tarPath).size / 1024 / 1024).toFixed(1)}MB)`
      );

      update("Extracting server WZ...");
      execSync(`tar xzf "${tarPath}" -C "${workDir}"`, { timeout: 300000 });
      const wzRoot = join(workDir, "wz");
      if (!existsSync(wzRoot)) {
        throw new Error("Extracted tar does not contain wz/ directory");
      }
      update("Extracted", "Extracted server-wz.tar.gz");

      // ETC: rebuild server bucket XML from full custom-etc list.
      if (etcs.length > 0) {
        const etcBucketDir = join(wzRoot, "Item.wz", "Etc");
        if (!existsSync(etcBucketDir)) {
          mkdirSync(etcBucketDir, { recursive: true });
        }
        const etcBucketXmlItems = allEtcs.map((a) => {
          const at = parseAttrs(a.attrs) as EtcAttrs;
          return {
            itemId: a.in_game_id,
            slotMax: at.slotMax,
            price: at.price,
            quest: at.quest,
          };
        });
        const etcBucketXml = generateEtcBucketXml(
          ETC_BUCKET_NAME,
          etcBucketXmlItems
        );
        writeFileSync(
          join(etcBucketDir, `${ETC_BUCKET_NAME}.xml`),
          etcBucketXml,
          "utf-8"
        );
        update(
          "Wrote ETC bucket XML",
          `Wrote Item.wz/Etc/${ETC_BUCKET_NAME}.xml (${allEtcs.length} item(s))`
        );

        const etcStringPath = join(wzRoot, "String.wz", "Etc.img.xml");
        for (const a of etcs) {
          if (!a.name) continue;
          const at = parseAttrs(a.attrs) as EtcAttrs;
          const r = upsertStringEntryXml(
            etcStringPath,
            "Etc.img",
            "Etc",
            a.in_game_id,
            [
              { name: "name", value: a.name },
              { name: "desc", value: at.desc || "" },
            ]
          );
          if (!r.success) {
            update(
              "ETC string warning",
              `Warning: Etc.img.xml update failed for ${a.in_game_id}: ${r.error}`
            );
          }
        }
        update("Patched ETC server strings", `Updated String.wz/Etc.img.xml`);
      }

      // NPC: write per-id XML files + patch String.wz/Npc.img.xml.
      if (npcs.length > 0) {
        const npcWzDir = join(wzRoot, "Npc.wz");
        if (!existsSync(npcWzDir)) mkdirSync(npcWzDir, { recursive: true });

        for (const a of npcs) {
          const at = parseAttrs(a.attrs) as NpcAttrs;
          const pngBuf = await fetchBuffer(`${R2_PUBLIC_URL}/${a.file_key}`);
          const xml = generateNpcXml(
            a.in_game_id,
            a.name || "",
            pngBuf,
            at.script
          );
          const padded = String(a.in_game_id).padStart(7, "0");
          writeFileSync(join(npcWzDir, `${padded}.img.xml`), xml, "utf-8");
          update(
            `Wrote NPC ${a.in_game_id}`,
            `Wrote Npc.wz/${padded}.img.xml${at.script ? ` (script=${at.script})` : ""}`
          );
        }

        const npcStringPath = join(wzRoot, "String.wz", "Npc.img.xml");
        for (const a of npcs) {
          if (!a.name) continue;
          const at = parseAttrs(a.attrs) as NpcAttrs;
          const fields = [{ name: "name", value: a.name }];
          if (at.dialogue) fields.push({ name: "n0", value: at.dialogue });
          const r = upsertStringEntryXml(
            npcStringPath,
            "Npc.img",
            null,
            a.in_game_id,
            fields
          );
          if (!r.success) {
            update(
              "NPC string warning",
              `Warning: Npc.img.xml update failed for ${a.in_game_id}: ${r.error}`
            );
          }
        }
        update("Patched NPC server strings", `Updated String.wz/Npc.img.xml`);
      }

      update("Repacking server WZ...");
      const newTarPath = join(workDir, "server-wz-new.tar.gz");
      execSync(
        `cd "${workDir}" && COPYFILE_DISABLE=1 tar czf "${newTarPath}" --exclude='.DS_Store' --exclude='._*' wz/`,
        { timeout: 300000 }
      );
      const newTarBuffer = readFileSync(newTarPath);
      update(
        "Repacked",
        `Repacked server-wz.tar.gz (${(newTarBuffer.length / 1024 / 1024).toFixed(1)}MB)`
      );

      update("Uploading server WZ to R2...");
      const tarUpload = await uploadToR2("server-wz.tar.gz", newTarBuffer);
      if (!tarUpload.success) {
        throw new Error(`server-wz.tar.gz upload failed: ${tarUpload.error}`);
      }
      update("Uploaded server tar", "Uploaded server-wz.tar.gz to R2");

      // Version marker so the server's startup script picks up the new bundle.
      const ver = new Date().toISOString();
      await uploadToR2("server-wz.version", Buffer.from(ver));
      update("Server version marker", `Uploaded version marker: ${ver}`);
    }

    // ---------- Client-side WZ patches ----------

    const manifestUpdates: Record<string, { hash: string; size: number }> = {};

    // Character.wz (hair/face .img injection).
    if (needCharacterWz) {
      update("Downloading Character.wz (~200MB)...");
      const charWzPath = join(workDir, "Character.wz");
      await streamDownload(`${R2_PUBLIC_URL}/Character.wz`, charWzPath);
      update(
        "Downloaded Character.wz",
        `Downloaded Character.wz (${(statSync(charWzPath).size / 1024 / 1024).toFixed(0)}MB)`
      );

      const charWz = parseWzFile(charWzPath);
      for (const a of hairFace) {
        const imgData = await fetchBuffer(`${R2_PUBLIC_URL}/${a.file_key}`);
        addImgToCharacterWz(charWz, {
          dirName: a.asset_type === "hair" ? "Hair" : "Face",
          id: a.in_game_id,
          imgData,
        });
        update(
          `Injected ${a.asset_type} ${a.in_game_id}`,
          `Added ${a.asset_type === "hair" ? "Hair" : "Face"}/${String(a.in_game_id).padStart(8, "0")}.img${a.name ? ` (${a.name})` : ""} (${imgData.length} bytes)`
        );
      }
      const charWzOut = join(workDir, "Character-patched.wz");
      saveWzFile(charWz, charWzOut);

      update("Uploading Character.wz to R2...");
      const upload = await uploadFileToR2("Character.wz", charWzOut);
      if (!upload.success) {
        throw new Error(`Character.wz upload failed: ${upload.error}`);
      }
      manifestUpdates["Character.wz"] = {
        hash: upload.hash,
        size: upload.size,
      };
      update("Uploaded Character.wz", "Uploaded patched Character.wz to R2");
    }

    // Npc.wz (custom NPC sprite .imgs).
    if (needNpcWz) {
      update("Downloading Npc.wz...");
      const npcWzPath = join(workDir, "Npc.wz");
      await streamDownload(`${R2_PUBLIC_URL}/Npc.wz`, npcWzPath);
      update(
        "Downloaded Npc.wz",
        `Downloaded Npc.wz (${(statSync(npcWzPath).size / 1024 / 1024).toFixed(0)}MB)`
      );

      const npcWz = parseWzFile(npcWzPath);
      for (const a of npcs) {
        const at = parseAttrs(a.attrs) as NpcAttrs;
        const pngBuf = await fetchBuffer(`${R2_PUBLIC_URL}/${a.file_key}`);
        addNpcToWz(npcWz, a.in_game_id, pngBuf, at.script);
        update(
          `Injected NPC ${a.in_game_id}`,
          `Added ${String(a.in_game_id).padStart(7, "0")}.img${a.name ? ` (${a.name})` : ""}${at.script ? ` (script=${at.script})` : ""}`
        );
      }
      const npcWzOut = join(workDir, "Npc-patched.wz");
      saveWzFile(npcWz, npcWzOut);

      update("Uploading Npc.wz to R2...");
      const upload = await uploadFileToR2("Npc.wz", npcWzOut);
      if (!upload.success) {
        throw new Error(`Npc.wz upload failed: ${upload.error}`);
      }
      manifestUpdates["Npc.wz"] = { hash: upload.hash, size: upload.size };
      update("Uploaded Npc.wz", "Uploaded patched Npc.wz to R2");
    }

    // Item.wz (rebuild custom ETC bucket from full list).
    if (needItemWz) {
      update("Downloading Item.wz...");
      const itemWzPath = join(workDir, "Item.wz");
      await streamDownload(`${R2_PUBLIC_URL}/Item.wz`, itemWzPath);
      update(
        "Downloaded Item.wz",
        `Downloaded Item.wz (${(statSync(itemWzPath).size / 1024 / 1024).toFixed(0)}MB)`
      );

      // Fetch icons for every custom ETC (already-published + new) so the
      // rebuilt bucket has all icons baked in.
      const bucketItems: Array<{
        itemId: number;
        iconPng?: Buffer;
        slotMax?: number;
        price?: number;
        quest?: number;
      }> = [];
      for (const a of allEtcs) {
        const at = parseAttrs(a.attrs) as EtcAttrs;
        let iconPng: Buffer | undefined;
        try {
          iconPng = await fetchBuffer(`${R2_PUBLIC_URL}/${a.file_key}`);
        } catch (err: any) {
          update(
            "Icon warning",
            `Warning: failed to fetch icon for ETC ${a.in_game_id}: ${err.message}`
          );
        }
        bucketItems.push({
          itemId: a.in_game_id,
          iconPng,
          slotMax: at.slotMax,
          price: at.price,
          quest: at.quest,
        });
      }

      const itemWz = parseWzFile(itemWzPath);
      addEtcBucketToItemWz(itemWz, ETC_BUCKET_NAME, bucketItems);
      const itemWzOut = join(workDir, "Item-patched.wz");
      saveWzFile(itemWz, itemWzOut);
      update(
        "Patched Item.wz",
        `Rebuilt Etc/${ETC_BUCKET_NAME} with ${bucketItems.length} item(s)`
      );

      update("Uploading Item.wz to R2...");
      const upload = await uploadFileToR2("Item.wz", itemWzOut);
      if (!upload.success) {
        throw new Error(`Item.wz upload failed: ${upload.error}`);
      }
      manifestUpdates["Item.wz"] = { hash: upload.hash, size: upload.size };
      update("Uploaded Item.wz", "Uploaded patched Item.wz to R2");
    }

    // String.wz (names for any named asset, all four types).
    if (needStringWz) {
      update("Downloading String.wz...");
      const strWzPath = join(workDir, "String.wz");
      await streamDownload(`${R2_PUBLIC_URL}/String.wz`, strWzPath);
      update(
        "Downloaded String.wz",
        `Downloaded String.wz (${(statSync(strWzPath).size / 1024 / 1024).toFixed(0)}MB)`
      );

      const strWz = parseWzFile(strWzPath);

      const namedHairFace = hairFace.filter((a) => a.name);
      if (namedHairFace.length > 0) {
        addStringsToStringWz(
          strWz,
          namedHairFace.map((a) => ({
            itemId: a.in_game_id,
            name: a.name!,
            desc: "",
            sectionName: a.asset_type === "hair" ? "Hair" : "Face",
          }))
        );
        update(
          "Patched String.wz/Eqp",
          `Added ${namedHairFace.length} hair/face name(s)`
        );
      }

      const namedNpcs = npcs.filter((a) => a.name);
      for (const a of namedNpcs) {
        const at = parseAttrs(a.attrs) as NpcAttrs;
        addNpcToStringWz(strWz, a.in_game_id, a.name!, at.dialogue);
      }
      if (namedNpcs.length > 0) {
        update(
          "Patched String.wz/Npc",
          `Added ${namedNpcs.length} NPC name(s)`
        );
      }

      const namedEtcs = etcs.filter((a) => a.name);
      if (namedEtcs.length > 0) {
        addEtcStringsToStringWz(
          strWz,
          namedEtcs.map((a) => {
            const at = parseAttrs(a.attrs) as EtcAttrs;
            return {
              itemId: a.in_game_id,
              name: a.name!,
              desc: at.desc || "",
            };
          })
        );
        update(
          "Patched String.wz/Etc",
          `Added ${namedEtcs.length} ETC name(s)`
        );
      }

      const strWzOut = join(workDir, "String-patched.wz");
      saveWzFile(strWz, strWzOut);

      update("Uploading String.wz to R2...");
      const upload = await uploadFileToR2("String.wz", strWzOut);
      if (!upload.success) {
        throw new Error(`String.wz upload failed: ${upload.error}`);
      }
      manifestUpdates["String.wz"] = {
        hash: upload.hash,
        size: upload.size,
      };
      update("Uploaded String.wz", "Uploaded patched String.wz to R2");
    }

    // ---------- Manifest + NX dispatch + DB + restart ----------

    const changedWz = Object.keys(manifestUpdates);
    if (changedWz.length > 0) {
      update(
        "Triggering WZ→NX conversion",
        `Dispatching wz-to-nx for: ${changedWz.join(", ")}`
      );
      dispatchWzToNx(changedWz).catch(() => {});
    }

    update("Updating launcher manifest...");
    let version = "?";
    try {
      const VOLUME_MANIFEST = join(
        process.env.COSMIC_ROOT || "/cosmic",
        "launcher-manifest.json"
      );
      const BUNDLED_MANIFEST = join(process.cwd(), "launcher-manifest.json");
      const manifestPath = existsSync(VOLUME_MANIFEST)
        ? VOLUME_MANIFEST
        : BUNDLED_MANIFEST;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

      for (const file of manifest.files || []) {
        const upd = manifestUpdates[file.name];
        if (upd) {
          file.hash = upd.hash;
          file.size = upd.size;
        }
      }

      if (changedWz.length > 0) {
        const parts = (manifest.version || "1.0.0").split(".");
        parts[2] = String(parseInt(parts[2] || "0") + 1);
        manifest.version = parts.join(".");
        manifest.updatedAt = new Date().toISOString();
      }
      version = manifest.version;

      // Make sure the directory exists before writing (volume mount on prod).
      mkdirSync(dirname(VOLUME_MANIFEST), { recursive: true });
      writeFileSync(VOLUME_MANIFEST, JSON.stringify(manifest, null, 2));
      update("Manifest updated", `Updated launcher manifest to v${version}`);
    } catch (err: any) {
      update(
        "Manifest warning",
        `Warning: manifest update failed: ${err.message}`
      );
    }

    update("Marking assets as published...");
    const ids = ready.map((a) => a.id);
    if (ids.length > 0) {
      await execute(
        `UPDATE custom_assets SET status = 'published', published_at = NOW() WHERE id IN (${ids
          .map(() => "?")
          .join(",")})`,
        ids
      );
    }

    update("Restarting game server...");
    try {
      const machineId = await restartGameServer();
      update("Server restarted", `Restarted game server (machine: ${machineId})`);
    } catch (err: any) {
      update(
        "Restart warning",
        `Warning: server restart failed: ${err.message}. Restart manually.`
      );
    }

    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {}

    status.status = "done";
    status.step = "Complete";
    status.finishedAt = new Date().toISOString();
    status.assets_published = ready.length;
    status.version = version;
    writeStatus(status);
  } catch (err: any) {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {}
    status.status = "error";
    status.error = err.message;
    status.step = "Failed";
    status.finishedAt = new Date().toISOString();
    writeStatus(status);
  }
}

export async function POST() {
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 credentials not configured" },
      { status: 500 }
    );
  }

  const current = readStatus();
  if (current?.status === "running") {
    const elapsed = Date.now() - new Date(current.startedAt).getTime();
    if (elapsed < 10 * 60 * 1000) {
      return NextResponse.json(
        { error: "An assets publish job is already running", status: current },
        { status: 409 }
      );
    }
  }

  const jobId = randomUUID().slice(0, 8);
  runPublishJob(jobId).catch((err) => {
    console.error("Assets publish job crashed:", err);
  });

  return NextResponse.json({ started: true, id: jobId });
}

export async function GET() {
  const status = readStatus();
  if (!status) {
    return NextResponse.json({ status: "idle" });
  }
  return NextResponse.json(status);
}
