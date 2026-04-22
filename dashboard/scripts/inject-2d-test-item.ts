/**
 * Injects the 2D-pipeline sprites from test-output/compare-2d-gen10/v2d/ into
 * the LOCAL server + client WZ files so the user can eyeball it in-game.
 *
 * What it does:
 *   - Writes server XML          → server/wz/Character.wz/Weapon/0{ID}.img.xml
 *   - Updates server String.wz   → server/wz/String.wz/Eqp.img.xml (Weapon section)
 *   - Patches client Character.wz (binary) → writes patched file to --out dir
 *   - Patches client String.wz   (binary) → writes patched file to --out dir
 *
 * The patched client WZ files are written to test-output/local-inject/ by
 * default — the user copies them into client/cosmic-wz/ (or their game
 * install) after backing up the originals. Pass --in-place to overwrite
 * client/cosmic-wz/ directly (only safe if that dir already holds a
 * throwaway copy).
 *
 * The web client's NX files cannot be patched offline here — they're
 * regenerated on publish by the wz-to-nx GitHub workflow. To test via the
 * web client, publish normally; to test now, use the patched Character.wz
 * with a desktop client.
 *
 * Usage:
 *   cd dashboard
 *   npx tsx scripts/inject-2d-test-item.ts                   # defaults
 *   npx tsx scripts/inject-2d-test-item.ts --id 1432098 --name "Test Spear v2D"
 *   npx tsx scripts/inject-2d-test-item.ts --in-place        # overwrite client/cosmic-wz/
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "fs";
import { join, resolve } from "path";
import {
  parseWzFile,
  saveWzFile,
  addStringsToStringWz,
  addWeaponToCharacterWz,
  WEAPON_TYPES,
  type WeaponData,
  type WeaponFrame,
} from "../src/lib/wz";

const DEFAULT_ITEM_ID = 1432099;
const DEFAULT_NAME = "Celestial Phoenix Spear (2D test)";
const DEFAULT_DESC = "Rendered via the 2D-rotation pipeline. For local testing only.";
const WEAPON_TYPE = "spear";

// Reasonable mid-level spear stats for a hands-on feel test.
const STATS: Record<string, number> = {
  watk: 80, str: 12, dex: 5, acc: 4, speed: 3, slots: 7, _attackSpeed: 6,
};
const REQS = { level: 50, str: 100 };
const FLAGS = {};

// Spear animations that the 2D pipeline produces (swingO*/stabO*) fall back
// naturally to the spear-required swingT2/P1/P2/PF/stabT1/T2/TF in patcher.ts.
const ANIMS_RENDERED = [
  "stand1", "walk1", "alert",
  "swingO1", "swingO2", "swingO3", "swingOF",
  "stabO1", "stabO2", "stabOF",
  "shoot1", "shootF", "proneStab",
];

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) { args[key] = next; i++; }
    else args[key] = true;
  }
  return args;
}

function padId(id: number) { return String(id).padStart(8, "0"); }
function xmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildServerXml(itemId: number): string {
  const padded = padId(itemId);
  const wt = WEAPON_TYPES[WEAPON_TYPE];
  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
  xml += `<imgdir name="${padded}.img">\n  <imgdir name="info">\n`;
  xml += `    <canvas name="icon" width="32" height="32"><vector name="origin" x="-4" y="32"/></canvas>\n`;
  xml += `    <canvas name="iconRaw" width="32" height="32"><vector name="origin" x="-4" y="32"/></canvas>\n`;
  xml += `    <string name="islot" value="Wp"/>\n    <string name="vslot" value="Wp"/>\n`;
  xml += `    <int name="reqJob" value="0"/>\n    <int name="reqLevel" value="${REQS.level}"/>\n`;
  xml += `    <int name="reqSTR" value="${REQS.str}"/>\n    <int name="reqDEX" value="0"/>\n`;
  xml += `    <int name="reqINT" value="0"/>\n    <int name="reqLUK" value="0"/>\n`;
  xml += `    <int name="cash" value="0"/>\n`;
  xml += `    <int name="slotMax" value="${STATS.slots}"/>\n    <int name="tuc" value="${STATS.slots}"/>\n`;
  xml += `    <int name="incPAD" value="${STATS.watk}"/>\n    <int name="incSTR" value="${STATS.str}"/>\n`;
  xml += `    <int name="incDEX" value="${STATS.dex}"/>\n    <int name="incACC" value="${STATS.acc}"/>\n`;
  xml += `    <int name="incSpeed" value="${STATS.speed}"/>\n`;
  xml += `    <int name="walk" value="${wt.walk}"/>\n    <int name="stand" value="${wt.stand}"/>\n`;
  xml += `    <short name="attack" value="${wt.attack}"/>\n`;
  xml += `    <string name="afterImage" value="${wt.afterImage}"/>\n    <string name="sfx" value="${wt.sfx}"/>\n`;
  xml += `    <int name="attackSpeed" value="${STATS._attackSpeed}"/>\n`;
  xml += `  </imgdir>\n</imgdir>\n`;
  return xml;
}

function updateServerStringXml(path: string, itemId: number, name: string, desc: string) {
  if (!existsSync(path)) throw new Error(`String xml missing: ${path}`);
  let content = readFileSync(path, "utf-8");
  if (content.includes(`<imgdir name="${itemId}">`)) {
    // Update the existing entry's name/desc in place
    const re = new RegExp(`(<imgdir name="${itemId}">)[\\s\\S]*?(</imgdir>)`, "m");
    content = content.replace(re,
      `$1\n        <string name="name" value="${xmlEscape(name)}"/>\n        <string name="desc" value="${xmlEscape(desc)}"/>\n      $2`);
    writeFileSync(path, content, "utf-8");
    return "updated";
  }
  const sectionOpen = content.indexOf(`<imgdir name="Weapon">`);
  if (sectionOpen === -1) throw new Error(`Weapon section not found in ${path}`);
  const closeRe = /\n    <\/imgdir>/g;
  closeRe.lastIndex = sectionOpen;
  const m = closeRe.exec(content);
  if (!m) throw new Error("closing tag for Weapon section not found");
  const entry = `      <imgdir name="${itemId}">\n        <string name="name" value="${xmlEscape(name)}"/>\n        <string name="desc" value="${xmlEscape(desc)}"/>\n      </imgdir>`;
  content = content.slice(0, m.index) + "\n" + entry + content.slice(m.index);
  writeFileSync(path, content, "utf-8");
  return "inserted";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const itemId = parseInt(String(args.id ?? DEFAULT_ITEM_ID));
  const name = String(args.name ?? DEFAULT_NAME);
  const desc = String(args.desc ?? DEFAULT_DESC);
  const spritesDir = resolve(String(args.sprites ?? "test-output/compare-2d-gen10/v2d"));
  const inPlace = Boolean(args["in-place"]);

  const projectRoot = resolve(process.cwd(), "..");
  const serverWzRoot = join(projectRoot, "server", "wz");
  const clientWzRoot = join(projectRoot, "client", "cosmic-wz");
  const outDir = inPlace ? clientWzRoot : join(process.cwd(), "test-output", "local-inject");
  mkdirSync(outDir, { recursive: true });

  if (!existsSync(spritesDir)) throw new Error(`Sprites dir not found: ${spritesDir}. Run test-2d-flow.ts first.`);
  if (!existsSync(serverWzRoot)) throw new Error(`Server WZ dir not found: ${serverWzRoot}`);
  if (!existsSync(clientWzRoot)) throw new Error(`Client WZ dir not found: ${clientWzRoot}`);

  console.log(`Injecting test spear ${itemId} "${name}"`);
  console.log(`  Sprites: ${spritesDir}`);
  console.log(`  Server XML root: ${serverWzRoot}`);
  console.log(`  Client WZ root:  ${clientWzRoot}`);
  console.log(`  Patched WZ → ${outDir} ${inPlace ? "(in-place)" : "(copy + use)"}`);

  // --- 1. Server XML ---
  const weaponDir = join(serverWzRoot, "Character.wz", "Weapon");
  mkdirSync(weaponDir, { recursive: true });
  const serverXmlPath = join(weaponDir, `${padId(itemId)}.img.xml`);
  writeFileSync(serverXmlPath, buildServerXml(itemId), "utf-8");
  console.log(`✓ Wrote ${serverXmlPath}`);

  // --- 2. Server String.wz XML ---
  const serverStringPath = join(serverWzRoot, "String.wz", "Eqp.img.xml");
  const strResult = updateServerStringXml(serverStringPath, itemId, name, desc);
  console.log(`✓ ${strResult === "inserted" ? "Inserted" : "Updated"} ${serverStringPath}`);

  // --- 3. Load sprites + origins ---
  const origins = JSON.parse(readFileSync(join(spritesDir, "origins.json"), "utf-8")) as Record<
    string, Array<{ gripX: number; gripY: number }>
  >;
  const iconPng = readFileSync(join(spritesDir, "icon.png"));
  const animations: Record<string, WeaponFrame[]> = {};
  for (const anim of ANIMS_RENDERED) {
    const oList = origins[anim] ?? [];
    const frames: WeaponFrame[] = [];
    for (let i = 0; i < oList.length; i++) {
      const p = join(spritesDir, anim, `${i}.png`);
      if (!existsSync(p)) { console.warn(`  skip missing ${anim}/${i}.png`); continue; }
      const isAttack = anim.startsWith("swing") || anim.startsWith("stab") || anim.startsWith("shoot") || anim === "proneStab";
      frames.push({
        pngBuf: readFileSync(p),
        originX: oList[i].gripX, originY: oList[i].gripY,
        attachX: 0, attachY: 0,
        attachType: isAttack ? "navel" : "hand",
        z: isAttack ? "weaponBelowBody" : "weapon",
      });
    }
    if (frames.length) animations[anim] = frames;
  }
  const totalFrames = Object.values(animations).reduce((s, f) => s + f.length, 0);
  console.log(`Loaded ${totalFrames} frames across ${Object.keys(animations).length} anims + icon`);

  const wt = WEAPON_TYPES[WEAPON_TYPE];
  const weapon: WeaponData = {
    itemId, weaponType: WEAPON_TYPE,
    attackSpeed: STATS._attackSpeed, afterImage: wt.afterImage, sfx: wt.sfx,
    stats: STATS, requirements: REQS, flags: FLAGS,
    iconPng, animations,
  };

  // --- 4. Patch client Character.wz ---
  const charIn = join(clientWzRoot, "Character.wz");
  const charOut = join(outDir, "Character.wz");
  console.log(`Parsing ${charIn}...`);
  const tChar = Date.now();
  const charWz = parseWzFile(charIn);
  addWeaponToCharacterWz(charWz, weapon);
  saveWzFile(charWz, charOut);
  console.log(`✓ Patched Character.wz → ${charOut} (${((Date.now() - tChar) / 1000).toFixed(1)}s)`);

  // --- 5. Patch client String.wz ---
  const strIn = join(clientWzRoot, "String.wz");
  const strOut = join(outDir, "String.wz");
  console.log(`Parsing ${strIn}...`);
  const tStr = Date.now();
  const strWz = parseWzFile(strIn);
  addStringsToStringWz(strWz, [{ itemId, name, desc, sectionName: "Weapon" }]);
  saveWzFile(strWz, strOut);
  console.log(`✓ Patched String.wz → ${strOut} (${((Date.now() - tStr) / 1000).toFixed(1)}s)`);

  console.log(`\nDone. Next steps:`);
  if (!inPlace) {
    console.log(`  1. Back up your client WZ files, then copy:`);
    console.log(`       cp ${outDir}/Character.wz ${clientWzRoot}/Character.wz`);
    console.log(`       cp ${outDir}/String.wz    ${clientWzRoot}/String.wz`);
  }
  console.log(`  2. Restart the local docker server so it picks up the new server XML:`);
  console.log(`       docker compose -f docker-compose.local.yml restart server`);
  console.log(`  3. In-game as GM: @item ${itemId}`);
  console.log(`\nWeb client (NX) note: NX files live on R2, regenerated on publish. To test via`);
  console.log(`play.augurms.com, publish this item normally (wz-to-nx workflow auto-dispatches).`);
}

main().catch(e => { console.error(e); process.exit(1); });
