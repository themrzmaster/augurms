import { NextResponse } from "next/server";
import { query } from "@/lib/db";
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
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
  readdirSync,
} from "fs";
import { join } from "path";
import { PNG } from "pngjs";

const STAT_FIELDS: Record<string, string> = {
  str: "incSTR", dex: "incDEX", int: "incINT", luk: "incLUK",
  hp: "incMHP", mp: "incMMP", watk: "incPAD", matk: "incMAD",
  wdef: "incPDD", mdef: "incMDD", acc: "incACC", avoid: "incEVA",
  speed: "incSpeed", jump: "incJump",
};

function padItemId(id: number): string {
  return String(id).padStart(8, "0");
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * POST /api/admin/items/publish-local
 *
 * Local-only publish: patches client WZ files on disk + generates server XML.
 * No R2 needed. Reads from client/cosmic-wz/, writes to dashboard/test-output/.
 * Also writes server XML to server/wz/.
 */
export async function POST() {
  const projectRoot = join(process.cwd(), "..");
  const clientWzDir = join(projectRoot, "client", "cosmic-wz");
  const outputDir = join(projectRoot, "dashboard", "test-output");
  const serverWzDir = join(projectRoot, "server", "wz");
  const framesBaseDir = join(projectRoot, "tools");
  const actions: string[] = [];

  try {
    // Check client WZ files exist
    const charWzPath = join(clientWzDir, "Character.wz");
    const strWzPath = join(clientWzDir, "String.wz");

    if (!existsSync(charWzPath)) {
      return NextResponse.json(
        { error: `Client WZ not found: ${charWzPath}. Place Character.wz in client/cosmic-wz/` },
        { status: 400 }
      );
    }

    // Fetch custom items from DB
    const rows = await query(
      "SELECT * FROM custom_items WHERE category = 'equip' ORDER BY item_id"
    );
    const items = (rows as any[]).map((r) => ({
      item_id: r.item_id,
      name: r.name,
      description: r.description || "",
      sub_category: r.sub_category || "Ring",
      icon_url: r.icon_url || null,
      stats: typeof r.stats === "string" ? JSON.parse(r.stats) : r.stats || {},
      requirements: typeof r.requirements === "string" ? JSON.parse(r.requirements) : r.requirements || {},
      flags: typeof r.flags === "string" ? JSON.parse(r.flags) : r.flags || {},
    }));

    if (items.length === 0) {
      return NextResponse.json({ error: "No custom equip items in DB" }, { status: 400 });
    }
    actions.push(`Found ${items.length} custom item(s)`);

    mkdirSync(outputDir, { recursive: true });

    // --- Patch Character.wz ---
    const charWz = parseWzFile(charWzPath);
    actions.push(`Parsed Character.wz (${charWz.root.length} dirs)`);

    for (const item of items) {
      // Try to load icon from local file or rendered frames
      let iconPng: Buffer | undefined;
      const localIconPath = join(framesBaseDir, "weapon-frames", "icon.png");

      if (item.sub_category === "Weapon" && item.stats._weaponFrames) {
        // Weapon with rendered frames — load from local files
        const framesDir = join(framesBaseDir, "weapon-frames");
        if (existsSync(framesDir) && existsSync(join(framesDir, "origins.json"))) {
          const origins = JSON.parse(readFileSync(join(framesDir, "origins.json"), "utf-8"));

          if (existsSync(join(framesDir, "icon.png"))) {
            iconPng = readFileSync(join(framesDir, "icon.png"));
          }

          // Load animation frames from local files
          const animations: Record<string, WeaponFrame[]> = {};
          const animDirs = readdirSync(framesDir, { withFileTypes: true })
            .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
            .map((d) => d.name);

          for (const animName of animDirs) {
            const animDir = join(framesDir, animName);
            const pngFiles = readdirSync(animDir)
              .filter((f) => f.endsWith(".png"))
              .sort((a, b) => parseInt(a) - parseInt(b));

            const originList = origins[animName] || [];
            animations[animName] = [];

            for (let i = 0; i < pngFiles.length; i++) {
              const pngBuf = readFileSync(join(animDir, pngFiles[i]));
              const orig = originList[i] || { gripX: 0, gripY: 0 };
              // Use grip point from Blender render as origin
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
            }
          }

          const wt = item.stats._weaponType || "staff";
          const wtMeta = WEAPON_TYPES[wt] || WEAPON_TYPES.staff;

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
          const frameCount = Object.values(animations).flat().length;
          actions.push(`+ Weapon: ${item.name} (${item.item_id}) with ${frameCount} frames`);
        } else {
          // No local frames — fall back to icon-only
          addEquipToCharacterWz(charWz, {
            itemId: item.item_id,
            subCategory: item.sub_category,
            stats: item.stats,
            requirements: item.requirements,
            flags: item.flags,
          });
          actions.push(`+ Weapon: ${item.name} (${item.item_id}) — icon only (no frames in tools/weapon-frames/)`);
        }
      } else {
        // Non-weapon equip
        addEquipToCharacterWz(charWz, {
          itemId: item.item_id,
          subCategory: item.sub_category,
          stats: item.stats,
          requirements: item.requirements,
          flags: item.flags,
          iconPng,
        });
        actions.push(`+ ${item.sub_category}: ${item.name} (${item.item_id})`);
      }
    }

    const charOutPath = join(outputDir, "Character.wz");
    saveWzFile(charWz, charOutPath);
    const charSize = statSync(charOutPath).size;
    actions.push(`Saved Character.wz (${(charSize / 1024 / 1024).toFixed(1)}MB)`);

    // --- Patch String.wz ---
    if (existsSync(strWzPath)) {
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
      const strOutPath = join(outputDir, "String.wz");
      saveWzFile(strWz, strOutPath);
      actions.push(`Saved String.wz (${(statSync(strOutPath).size / 1024).toFixed(0)}KB)`);
    }

    // --- Generate server XML for each item ---
    for (const item of items) {
      const padded = padItemId(item.item_id);
      const stats = item.stats;
      const reqs = item.requirements;
      const flags = item.flags;

      let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
      xml += `<imgdir name="${padded}.img">\n  <imgdir name="info">\n`;
      xml += `    <canvas name="icon" width="26" height="28"><vector name="origin" x="-4" y="28"/></canvas>\n`;
      xml += `    <canvas name="iconRaw" width="24" height="26"><vector name="origin" x="-4" y="28"/></canvas>\n`;
      const slot = item.sub_category === "Weapon" ? "Wp" : "Ri";
      xml += `    <string name="islot" value="${slot}"/>\n    <string name="vslot" value="${slot}"/>\n`;
      xml += `    <int name="reqJob" value="${reqs.job ?? 0}"/>\n`;
      xml += `    <int name="reqLevel" value="${reqs.level ?? 0}"/>\n`;
      xml += `    <int name="reqSTR" value="${reqs.str ?? 0}"/>\n`;
      xml += `    <int name="reqDEX" value="${reqs.dex ?? 0}"/>\n`;
      xml += `    <int name="reqINT" value="${reqs.int ?? 0}"/>\n`;
      xml += `    <int name="reqLUK" value="${reqs.luk ?? 0}"/>\n`;
      xml += `    <int name="cash" value="${flags.cash ? 1 : 0}"/>\n`;
      xml += `    <int name="tuc" value="${stats.slots ?? 7}"/>\n`;
      if (flags.tradeBlock) xml += `    <int name="tradeBlock" value="1"/>\n`;
      if (flags.only) xml += `    <int name="only" value="1"/>\n`;

      if (item.sub_category === "Weapon") {
        const wt = stats._weaponType || "staff";
        const wtMeta = WEAPON_TYPES[wt] || WEAPON_TYPES.staff;
        xml += `    <int name="walk" value="${wtMeta.walk}"/>\n    <int name="stand" value="${wtMeta.stand}"/>\n`;
        xml += `    <short name="attack" value="${wtMeta.attack}"/>\n`;
        xml += `    <string name="afterImage" value="${wtMeta.afterImage}"/>\n`;
        xml += `    <string name="sfx" value="${wtMeta.sfx}"/>\n`;
        xml += `    <int name="attackSpeed" value="${stats._attackSpeed || 6}"/>\n`;
      }

      for (const [key, field] of Object.entries(STAT_FIELDS)) {
        if (stats[key] && stats[key] !== 0) xml += `    <int name="${field}" value="${stats[key]}"/>\n`;
      }

      xml += `  </imgdir>\n</imgdir>\n`;

      const dirMap: Record<string, string> = {
        Ring: "Ring", Pendant: "Accessory", Weapon: "Weapon", Cap: "Cap",
        Coat: "Coat", Shoes: "Shoes", Glove: "Glove", Cape: "Cape",
      };
      const dir = dirMap[item.sub_category] || "Ring";
      const xmlDir = join(serverWzDir, "Character.wz", dir);
      mkdirSync(xmlDir, { recursive: true });
      writeFileSync(join(xmlDir, `${padded}.img.xml`), xml);
    }
    actions.push("Generated server WZ XML files");

    // Update server String.wz
    const eqpPath = join(serverWzDir, "String.wz", "Eqp.img.xml");
    if (existsSync(eqpPath)) {
      let eqpContent = readFileSync(eqpPath, "utf-8");
      for (const item of items) {
        if (eqpContent.includes(`<imgdir name="${item.item_id}">`)) continue;
        const sectionMap: Record<string, string> = {
          Ring: "Ring", Pendant: "Accessory", Weapon: "Weapon", Cap: "Cap",
          Coat: "Top", Shoes: "Shoes", Glove: "Glove", Cape: "Cape",
        };
        const section = sectionMap[item.sub_category] || "Accessory";
        const entry = `      <imgdir name="${item.item_id}">\n        <string name="name" value="${escapeXml(item.name)}"/>\n        <string name="desc" value="${escapeXml(item.description)}"/>\n      </imgdir>`;
        const secOpen = eqpContent.indexOf(`<imgdir name="${section}">`);
        if (secOpen === -1) continue;
        const closeRe = /\n    <\/imgdir>/g;
        closeRe.lastIndex = secOpen;
        const m = closeRe.exec(eqpContent);
        if (m) {
          eqpContent = eqpContent.slice(0, m.index) + "\n" + entry + eqpContent.slice(m.index);
        }
      }
      writeFileSync(eqpPath, eqpContent);
      actions.push("Updated server String.wz/Eqp.img.xml");
    }

    return NextResponse.json({
      success: true,
      actions,
      output: outputDir,
      instructions: [
        `Copy ${outputDir}/Character.wz and String.wz to your game client folder`,
        "Restart server: docker compose -f docker-compose.local.yml restart server",
        `Log in and use: @item ${items[0].item_id}`,
      ],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, actions }, { status: 500 });
  }
}
