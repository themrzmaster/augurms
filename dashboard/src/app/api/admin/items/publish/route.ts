import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { uploadToR2, uploadFileToR2, isR2Configured } from "@/lib/r2";
import { restartGameServer } from "@/lib/fly-restart";
import {
  parseWzFile,
  saveWzFile,
  addEquipToCharacterWz,
  addWeaponToCharacterWz,
  addStringsToStringWz,
  getSectionName,
  WEAPON_TYPES,
} from "@/lib/wz";
import type { WeaponData, WeaponFrame } from "@/lib/wz";
import { execSync } from "child_process";
import { createHash, randomUUID } from "crypto";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  createWriteStream,
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  statSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL ||
  "https://pub-34b8b332208f464a9e74fa14104be3e2.r2.dev";

const STATUS_DIR = process.env.COSMIC_ROOT || "/cosmic";
const STATUS_FILE = join(STATUS_DIR, "publish-status.json");

// --- Status helpers ---

interface PublishStatus {
  id: string;
  status: "running" | "done" | "error";
  step: string;
  actions: string[];
  error?: string;
  startedAt: string;
  finishedAt?: string;
  items_published?: number;
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

// --- Helpers ---

async function streamDownload(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${url} (${res.status})`);
  const body = res.body;
  if (!body) throw new Error(`No response body: ${url}`);
  const readable = Readable.fromWeb(body as any);
  await pipeline(readable, createWriteStream(outputPath));
}

// --- WZ XML generation ---

const SUB_CATEGORY_DIRS: Record<string, string> = {
  Ring: "Character.wz/Ring",
  Pendant: "Character.wz/Accessory",
  Face: "Character.wz/Accessory",
  Eye: "Character.wz/Accessory",
  Earring: "Character.wz/Accessory",
  Belt: "Character.wz/Accessory",
  Medal: "Character.wz/Accessory",
  Cap: "Character.wz/Cap",
  Coat: "Character.wz/Coat",
  Longcoat: "Character.wz/Longcoat",
  Pants: "Character.wz/Pants",
  Shoes: "Character.wz/Shoes",
  Glove: "Character.wz/Glove",
  Shield: "Character.wz/Shield",
  Cape: "Character.wz/Cape",
  Weapon: "Character.wz/Weapon",
};

const STAT_FIELDS: Record<string, string> = {
  str: "incSTR",
  dex: "incDEX",
  int: "incINT",
  luk: "incLUK",
  hp: "incMHP",
  mp: "incMMP",
  watk: "incPAD",
  matk: "incMAD",
  wdef: "incPDD",
  mdef: "incMDD",
  acc: "incACC",
  avoid: "incEVA",
  speed: "incSpeed",
  jump: "incJump",
};

const STRING_SECTIONS: Record<string, string> = {
  Ring: "Ring",
  Pendant: "Accessory",
  Face: "Accessory",
  Eye: "Accessory",
  Earring: "Accessory",
  Belt: "Accessory",
  Medal: "Accessory",
  Cap: "Cap",
  Coat: "Top",
  Longcoat: "Overall",
  Pants: "Bottom",
  Shoes: "Shoes",
  Glove: "Glove",
  Shield: "Shield",
  Cape: "Cape",
  Weapon: "Weapon",
};

function padItemId(id: number): string {
  return String(id).padStart(8, "0");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateEquipXml(item: {
  item_id: number;
  sub_category: string;
  stats: Record<string, number>;
  requirements: Record<string, number>;
  flags: Record<string, boolean>;
}): string {
  const padded = padItemId(item.item_id);
  const stats = item.stats || {};
  const reqs = item.requirements || {};
  const flags = item.flags || {};

  const slotMap: Record<string, string> = {
    Ring: "Ri",
    Pendant: "Pe",
    Face: "Af",
    Eye: "Ae",
    Earring: "Ae",
    Belt: "Be",
    Medal: "Me",
    Cap: "Cp",
    Coat: "Ma",
    Longcoat: "Ma",
    Pants: "Pn",
    Shoes: "So",
    Glove: "Gv",
    Shield: "Si",
    Cape: "Sr",
    Weapon: "Wp",
  };
  const slot = slotMap[item.sub_category] || "Ri";

  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
  xml += `<imgdir name="${padded}.img">\n`;
  xml += `  <imgdir name="info">\n`;
  xml += `    <canvas name="icon" width="26" height="28">\n`;
  xml += `      <vector name="origin" x="-4" y="28"/>\n`;
  xml += `    </canvas>\n`;
  xml += `    <canvas name="iconRaw" width="24" height="26">\n`;
  xml += `      <vector name="origin" x="-4" y="28"/>\n`;
  xml += `    </canvas>\n`;
  xml += `    <string name="islot" value="${slot}"/>\n`;
  xml += `    <string name="vslot" value="${slot}"/>\n`;
  xml += `    <int name="reqJob" value="${reqs.job ?? 0}"/>\n`;
  xml += `    <int name="reqLevel" value="${reqs.level ?? 0}"/>\n`;
  xml += `    <int name="reqSTR" value="${reqs.str ?? 0}"/>\n`;
  xml += `    <int name="reqDEX" value="${reqs.dex ?? 0}"/>\n`;
  xml += `    <int name="reqINT" value="${reqs.int ?? 0}"/>\n`;
  xml += `    <int name="reqLUK" value="${reqs.luk ?? 0}"/>\n`;
  xml += `    <int name="cash" value="${flags.cash ? 1 : 0}"/>\n`;
  xml += `    <int name="slotMax" value="${stats.slots ?? 0}"/>\n`;
  if (stats.slots) xml += `    <int name="tuc" value="${stats.slots}"/>\n`;
  if (flags.tradeBlock) xml += `    <int name="tradeBlock" value="1"/>\n`;
  if (flags.only) xml += `    <int name="only" value="1"/>\n`;
  if (flags.notSale) xml += `    <int name="notSale" value="1"/>\n`;

  for (const [key, wzField] of Object.entries(STAT_FIELDS)) {
    if (stats[key] && stats[key] !== 0) {
      xml += `    <int name="${wzField}" value="${stats[key]}"/>\n`;
    }
  }

  if (item.sub_category === "Weapon") {
    const wt = (stats as any)._weaponType || "staff";
    const wtMeta = WEAPON_TYPES[wt] || WEAPON_TYPES.staff;
    xml += `    <int name="walk" value="${wtMeta.walk}"/>\n`;
    xml += `    <int name="stand" value="${wtMeta.stand}"/>\n`;
    xml += `    <short name="attack" value="${wtMeta.attack}"/>\n`;
    xml += `    <string name="afterImage" value="${wtMeta.afterImage}"/>\n`;
    xml += `    <string name="sfx" value="${wtMeta.sfx}"/>\n`;
    xml += `    <int name="attackSpeed" value="${(stats as any)._attackSpeed || 6}"/>\n`;
  }

  xml += `  </imgdir>\n`;
  xml += `</imgdir>\n`;
  return xml;
}

function writeEquipXml(
  wzRoot: string,
  item: {
    item_id: number;
    sub_category: string;
    stats: Record<string, number>;
    requirements: Record<string, number>;
    flags: Record<string, boolean>;
  }
): string {
  const dir = SUB_CATEGORY_DIRS[item.sub_category] || "Character.wz/Ring";
  const fullDir = join(wzRoot, dir);
  if (!existsSync(fullDir)) mkdirSync(fullDir, { recursive: true });

  const filename = `${padItemId(item.item_id)}.img.xml`;
  const filePath = join(fullDir, filename);
  const xml = generateEquipXml(item);
  writeFileSync(filePath, xml, "utf-8");
  return filePath;
}

function addToStringWz(
  wzRoot: string,
  itemId: number,
  name: string,
  desc: string,
  subCategory: string
): { success: boolean; error?: string } {
  try {
    const stringPath = join(wzRoot, "String.wz", "Eqp.img.xml");
    if (!existsSync(stringPath))
      return { success: false, error: "String.wz/Eqp.img.xml not found" };

    let content = readFileSync(stringPath, "utf-8");

    if (content.includes(`<imgdir name="${itemId}">`)) {
      return { success: true };
    }

    const sectionName = STRING_SECTIONS[subCategory] || "Accessory";
    const entry = `      <imgdir name="${itemId}">\n        <string name="name" value="${escapeXml(name)}"/>\n        <string name="desc" value="${escapeXml(desc)}"/>\n      </imgdir>`;

    const sectionOpen = content.indexOf(`<imgdir name="${sectionName}">`);
    if (sectionOpen === -1) {
      return {
        success: false,
        error: `Section "${sectionName}" not found in Eqp.img.xml`,
      };
    }

    const sectionCloseRegex = /\n    <\/imgdir>/g;
    sectionCloseRegex.lastIndex = sectionOpen;
    const closeMatch = sectionCloseRegex.exec(content);
    if (!closeMatch) {
      return {
        success: false,
        error: `Could not find closing tag for ${sectionName} section`,
      };
    }

    const insertPos = closeMatch.index;
    content =
      content.slice(0, insertPos) + "\n" + entry + content.slice(insertPos);
    writeFileSync(stringPath, content, "utf-8");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// --- Background publish job ---

async function runPublishJob(jobId: string) {
  const workDir = join(tmpdir(), `publish-${jobId}`);
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
    // 1. Fetch custom equip items from DB
    update("Fetching custom items from database...");
    const rows = await query(
      "SELECT * FROM custom_items WHERE category = 'equip' ORDER BY item_id"
    );
    const items = (rows as any[]).map((r) => ({
      item_id: r.item_id,
      name: r.name,
      description: r.description || "",
      sub_category: r.sub_category || "Ring",
      icon_url: r.icon_url || null,
      stats:
        typeof r.stats === "string" ? JSON.parse(r.stats) : r.stats || {},
      requirements:
        typeof r.requirements === "string"
          ? JSON.parse(r.requirements)
          : r.requirements || {},
      flags:
        typeof r.flags === "string" ? JSON.parse(r.flags) : r.flags || {},
    }));

    if (items.length === 0) {
      status.status = "error";
      status.error = "No custom equip items to publish";
      status.finishedAt = new Date().toISOString();
      writeStatus(status);
      return;
    }
    update("Fetched items", `Found ${items.length} custom equip item(s)`);

    // 2. Download server-wz.tar.gz from R2
    update("Downloading server WZ files...");
    mkdirSync(workDir, { recursive: true });
    const tarPath = join(workDir, "server-wz.tar.gz");
    const wzUrl = `${R2_PUBLIC_URL}/server-wz.tar.gz`;

    const downloadRes = await fetch(wzUrl);
    if (!downloadRes.ok) {
      throw new Error(
        `Failed to download server-wz.tar.gz: ${downloadRes.status}`
      );
    }
    const tarBuffer = Buffer.from(await downloadRes.arrayBuffer());
    writeFileSync(tarPath, tarBuffer);
    update(
      "Downloaded server WZ",
      `Downloaded server-wz.tar.gz (${(tarBuffer.length / 1024 / 1024).toFixed(1)}MB)`
    );

    // 3. Extract
    update("Extracting WZ files...");
    execSync(`tar xzf "${tarPath}" -C "${workDir}"`, { timeout: 300000 });
    update("Extracted", "Extracted WZ files");

    const wzRoot = join(workDir, "wz");
    if (!existsSync(wzRoot)) {
      throw new Error("Extracted tar does not contain wz/ directory");
    }

    // 4. Generate and inject XML for each item
    update("Generating server XML...");
    for (const item of items) {
      const xmlPath = writeEquipXml(wzRoot, item);
      update(
        `Writing ${item.name}...`,
        `Wrote ${item.name} (${item.item_id}) → ${xmlPath.replace(workDir + "/", "")}`
      );
    }

    // 5. Update String.wz/Eqp.img.xml with names
    update("Updating item names...");
    for (const item of items) {
      const result = addToStringWz(
        wzRoot,
        item.item_id,
        item.name,
        item.description,
        item.sub_category
      );
      if (!result.success) {
        update(
          "String.wz warning",
          `Warning: String.wz update failed for ${item.name}: ${result.error}`
        );
      }
    }
    update("Updated names", "Updated String.wz/Eqp.img.xml with item names");

    // 6. Repack tar
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

    // 7. Upload new tar to R2
    update("Uploading server WZ to R2...");
    const uploadResult = await uploadToR2("server-wz.tar.gz", newTarBuffer);
    if (!uploadResult.success) {
      throw new Error(`R2 upload failed: ${uploadResult.error}`);
    }
    update("Uploaded server WZ", "Uploaded server-wz.tar.gz to R2");

    // 8. Upload version marker
    const version = new Date().toISOString();
    const versionResult = await uploadToR2(
      "server-wz.version",
      Buffer.from(version)
    );
    if (versionResult.success) {
      update("Version marker", `Uploaded version marker: ${version}`);
    }

    // 9. Patch client WZ files
    const manifestUpdates: Record<string, { hash: string; size: number }> = {};
    try {
      // 9a. Download and patch Character.wz
      update("Downloading Character.wz (~200MB)...");
      const charWzPath = join(workDir, "Character.wz");
      const charWzUrl = `${R2_PUBLIC_URL}/Character.wz`;
      await streamDownload(charWzUrl, charWzPath);
      update(
        "Downloaded Character.wz",
        `Downloaded Character.wz (${(statSync(charWzPath).size / 1024 / 1024).toFixed(0)}MB)`
      );

      update("Patching Character.wz...");
      const charWz = parseWzFile(charWzPath);
      for (const item of items) {
        let iconPng: Buffer | undefined;
        if (item.icon_url) {
          try {
            const iconRes = await fetch(item.icon_url);
            if (iconRes.ok) {
              iconPng = Buffer.from(await iconRes.arrayBuffer());
              update(`Icon for ${item.name}`, `Downloaded icon for ${item.name}`);
            }
          } catch {
            update("Icon warning", `Warning: failed to download icon for ${item.name}`);
          }
        }

        if (item.sub_category === "Weapon" && item.stats._weaponFrames) {
          try {
            const wfData = item.stats._weaponFrames as {
              origins: Record<string, Array<{ gripX?: number; gripY?: number; x?: number; y?: number }>>;
              frames: Record<string, string[]>;
            };
            const wt = item.stats._weaponType || "staff";
            const wtMeta = WEAPON_TYPES[wt] || WEAPON_TYPES.staff;

            const animations: Record<string, WeaponFrame[]> = {};
            for (const [animName, frameUrls] of Object.entries(wfData.frames)) {
              const originList = wfData.origins[animName] || [];
              animations[animName] = [];
              for (let fi = 0; fi < frameUrls.length; fi++) {
                try {
                  const frameRes = await fetch(frameUrls[fi]);
                  if (!frameRes.ok) continue;
                  const pngBuf = Buffer.from(await frameRes.arrayBuffer());
                  const orig = originList[fi] || { gripX: 0, gripY: 0 };
                  const gripX = orig.gripX ?? orig.x ?? 0;
                  const gripY = orig.gripY ?? orig.y ?? 0;
                  const isAttack = animName.startsWith("swing") || animName.startsWith("stab") || animName.startsWith("shoot") || animName === "proneStab";
                  animations[animName].push({
                    pngBuf,
                    originX: gripX,
                    originY: gripY,
                    attachX: 0,
                    attachY: 0,
                    attachType: isAttack ? "navel" : "hand",
                    z: isAttack ? "weaponBelowBody" : "weapon",
                  });
                } catch {
                  update("Frame warning", `Warning: failed to download frame ${animName}/${fi} for ${item.name}`);
                }
              }
            }

            const weaponData: WeaponData = {
              itemId: item.item_id,
              weaponType: wt,
              attackSpeed: item.stats._attackSpeed || 6,
              afterImage: wtMeta.afterImage,
              sfx: wtMeta.sfx,
              stats: item.stats,
              requirements: item.requirements,
              flags: item.flags,
              iconPng,
              animations,
            };
            addWeaponToCharacterWz(charWz, weaponData);
            update(
              `Added weapon ${item.name}`,
              `Added weapon ${item.name} with ${Object.values(animations).flat().length} frames`
            );
          } catch (err: any) {
            update("Weapon warning", `Warning: weapon frame processing failed for ${item.name}: ${err.message}`);
            addEquipToCharacterWz(charWz, {
              itemId: item.item_id,
              subCategory: item.sub_category,
              stats: item.stats,
              requirements: item.requirements,
              flags: item.flags,
              iconPng,
            });
          }
        } else {
          addEquipToCharacterWz(charWz, {
            itemId: item.item_id,
            subCategory: item.sub_category,
            stats: item.stats,
            requirements: item.requirements,
            flags: item.flags,
            iconPng,
          });
        }
      }

      update("Saving patched Character.wz...");
      const charWzOut = join(workDir, "Character-patched.wz");
      saveWzFile(charWz, charWzOut);
      update("Patched", "Patched Character.wz with custom items");

      update("Uploading Character.wz to R2 (streaming)...");
      const charUpload = await uploadFileToR2("Character.wz", charWzOut);
      if (charUpload.success) {
        manifestUpdates["Character.wz"] = {
          hash: charUpload.hash,
          size: charUpload.size,
        };
        update("Uploaded Character.wz", "Uploaded patched Character.wz to R2");
      } else {
        update("Upload warning", `Warning: Character.wz upload failed: ${charUpload.error}`);
      }

      // 9b. Download and patch String.wz
      update("Downloading String.wz...");
      const strWzPath = join(workDir, "String.wz");
      const strWzUrl = `${R2_PUBLIC_URL}/String.wz`;
      await streamDownload(strWzUrl, strWzPath);

      const strWz = parseWzFile(strWzPath);
      addStringsToStringWz(
        strWz,
        items.map((item) => ({
          itemId: item.item_id,
          name: item.name,
          desc: item.description,
          sectionName: getSectionName(item.sub_category),
        }))
      );
      const strWzOut = join(workDir, "String-patched.wz");
      saveWzFile(strWz, strWzOut);
      update("Patched String.wz", "Patched String.wz with item names");

      update("Uploading String.wz to R2 (streaming)...");
      const strUpload = await uploadFileToR2("String.wz", strWzOut);
      if (strUpload.success) {
        manifestUpdates["String.wz"] = {
          hash: strUpload.hash,
          size: strUpload.size,
        };
        update("Uploaded String.wz", "Uploaded patched String.wz to R2");
      } else {
        update("Upload warning", `Warning: String.wz upload failed: ${strUpload.error}`);
      }

      // 9c. Update launcher manifest (write directly to volume, no self-fetch)
      if (Object.keys(manifestUpdates).length > 0) {
        update("Updating launcher manifest...");
        try {
          const VOLUME_MANIFEST = join(process.env.COSMIC_ROOT || "/cosmic", "launcher-manifest.json");
          const BUNDLED_MANIFEST = join(process.cwd(), "launcher-manifest.json");
          const manifestPath = existsSync(VOLUME_MANIFEST) ? VOLUME_MANIFEST : BUNDLED_MANIFEST;
          const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

          for (const file of manifest.files || []) {
            const upd = manifestUpdates[file.name];
            if (upd) {
              file.hash = upd.hash;
              file.size = upd.size;
            }
          }

          const parts = (manifest.version || "1.0.0").split(".");
          parts[2] = String(parseInt(parts[2] || "0") + 1);
          manifest.version = parts.join(".");
          manifest.updatedAt = new Date().toISOString();

          writeFileSync(VOLUME_MANIFEST, JSON.stringify(manifest, null, 2));
          update("Manifest updated", `Updated launcher manifest to v${manifest.version}`);
        } catch (err: any) {
          update("Manifest warning", `Warning: manifest update failed: ${err.message}`);
        }
      }
    } catch (err: any) {
      update(
        "Client WZ warning",
        `Warning: client WZ patching failed: ${err.message}. Server-side publish still succeeded.`
      );
    }

    // 10. Restart game server
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

    // 11. Cleanup
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {}

    status.status = "done";
    status.step = "Complete";
    status.finishedAt = new Date().toISOString();
    status.items_published = items.length;
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

// --- Endpoints ---

// POST: Start a publish job (returns immediately)
export async function POST() {
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 credentials not configured" },
      { status: 500 }
    );
  }

  // Check if a job is already running
  const current = readStatus();
  if (current?.status === "running") {
    const elapsed = Date.now() - new Date(current.startedAt).getTime();
    // Allow restart if stuck for more than 10 minutes
    if (elapsed < 10 * 60 * 1000) {
      return NextResponse.json(
        { error: "A publish job is already running", status: current },
        { status: 409 }
      );
    }
  }

  const jobId = randomUUID().slice(0, 8);

  // Fire and forget — don't await
  runPublishJob(jobId).catch((err) => {
    console.error("Publish job crashed:", err);
  });

  return NextResponse.json({ started: true, id: jobId });
}

// GET: Poll publish status
export async function GET() {
  const status = readStatus();
  if (!status) {
    return NextResponse.json({ status: "idle" });
  }
  return NextResponse.json(status);
}
