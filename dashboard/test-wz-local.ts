#!/usr/bin/env npx tsx
/**
 * Local WZ patcher test — no DB, no dashboard, no Docker needed.
 * Just patches the local client WZ files with test items.
 *
 * Usage:
 *   cd dashboard && npx tsx test-wz-local.mjs
 *
 * Then copy the output files to your MapleStory client folder to test in-game.
 */
import { parseWzFile, saveWzFile, addEquipToCharacterWz, addStringsToStringWz, getSectionName } from "./src/lib/wz";
import { existsSync, statSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";

const ROOT = join(__dirname, "..");
const CLIENT_WZ = join(ROOT, "client", "cosmic-wz");
const OUTPUT = join(ROOT, "dashboard", "test-output");

// ---- Define test items (no DB needed) ----
const TEST_ITEMS = [
  {
    itemId: 1112999,
    name: "Augur's Ring",
    desc: "A ring forged by the AI Game Master. +10 all stats, +500 HP.",
    subCategory: "Ring",
    stats: { str: 10, dex: 10, int: 10, luk: 10, hp: 500, watk: 5 },
    requirements: { level: 50 },
    flags: { tradeBlock: true },
    iconColor: [255, 200, 50] as [number, number, number], // gold
  },
  {
    itemId: 1112998,
    name: "Ring of Testing",
    desc: "A powerful ring for testing. +50 STR/DEX, +1000 HP.",
    subCategory: "Ring",
    stats: { str: 50, dex: 50, hp: 1000, watk: 15, matk: 15 },
    requirements: { level: 100 },
    flags: { only: true, tradeBlock: true },
    iconColor: [100, 150, 255] as [number, number, number], // blue
  },
];

// ---- Generate a simple ring icon PNG ----
function makeRingIcon(r: number, g: number, b: number) {
  const size = 24;
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const cx = x - size / 2, cy = y - size / 2;
      const dist = Math.sqrt(cx * cx + cy * cy);
      if (dist >= 7 && dist <= 11) {
        png.data[idx] = r;
        png.data[idx + 1] = g;
        png.data[idx + 2] = b;
        png.data[idx + 3] = 255;
      }
    }
  }
  return PNG.sync.write(png);
}

// ---- Main ----
if (!existsSync(join(CLIENT_WZ, "Character.wz"))) {
  console.error("Client WZ files not found at:", CLIENT_WZ);
  console.error("Expected: client/cosmic-wz/Character.wz");
  process.exit(1);
}

mkdirSync(OUTPUT, { recursive: true });
console.log("WZ files:", CLIENT_WZ);
console.log("Output:  ", OUTPUT);

// 1. Patch Character.wz
console.log("\n--- Character.wz ---");
let t = Date.now();
const charWz = parseWzFile(join(CLIENT_WZ, "Character.wz"));
console.log(`Parsed in ${Date.now() - t}ms (v${charWz.version}, ${charWz.root.length} dirs)`);

for (const item of TEST_ITEMS) {
  const iconPng = makeRingIcon(...item.iconColor);
  addEquipToCharacterWz(charWz, {
    itemId: item.itemId,
    subCategory: item.subCategory,
    stats: item.stats,
    requirements: item.requirements,
    flags: item.flags,
    iconPng,
  });
  console.log(`  + ${item.name} (${item.itemId}) with icon`);
}

t = Date.now();
saveWzFile(charWz, join(OUTPUT, "Character.wz"));
const charSize = statSync(join(OUTPUT, "Character.wz")).size;
console.log(`Saved in ${Date.now() - t}ms (${(charSize / 1024 / 1024).toFixed(1)}MB)`);

// 2. Patch String.wz
console.log("\n--- String.wz ---");
const strWz = parseWzFile(join(CLIENT_WZ, "String.wz"));
addStringsToStringWz(
  strWz,
  TEST_ITEMS.map((i) => ({
    itemId: i.itemId,
    name: i.name,
    desc: i.desc,
    sectionName: getSectionName(i.subCategory),
  }))
);
saveWzFile(strWz, join(OUTPUT, "String.wz"));
console.log(`Saved (${(statSync(join(OUTPUT, "String.wz")).size / 1024).toFixed(0)}KB)`);

// 3. Generate server-side XML (so the server knows the stats)
console.log("\n--- Server WZ XML ---");
const SERVER_WZ = join(ROOT, "server", "wz");

const STAT_FIELDS: Record<string, string> = {
  str: "incSTR", dex: "incDEX", int: "incINT", luk: "incLUK",
  hp: "incMHP", mp: "incMMP", watk: "incPAD", matk: "incMAD",
  wdef: "incPDD", mdef: "incMDD", acc: "incACC", avoid: "incEVA",
  speed: "incSpeed", jump: "incJump",
};
const SLOT_MAP: Record<string, string> = {
  Ring: "Ri", Pendant: "Pe", Cap: "Cp", Coat: "Ma", Weapon: "Wp",
  Shoes: "So", Glove: "Gv", Cape: "Sr", Shield: "Si", Pants: "Pn",
};
const DIR_MAP: Record<string, string> = {
  Ring: "Ring", Pendant: "Accessory", Cap: "Cap", Coat: "Coat",
  Weapon: "Weapon", Shoes: "Shoes", Glove: "Glove", Cape: "Cape",
};
const STRING_SEC: Record<string, string> = {
  Ring: "Ring", Pendant: "Accessory", Cap: "Cap", Coat: "Top",
  Weapon: "Weapon", Shoes: "Shoes", Glove: "Glove", Cape: "Cape",
};

for (const item of TEST_ITEMS) {
  const padded = String(item.itemId).padStart(8, "0");
  const slot = SLOT_MAP[item.subCategory] || "Ri";
  const reqs = item.requirements as Record<string, number>;
  const flags = item.flags as Record<string, boolean>;
  const stats = item.stats as Record<string, number>;

  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
  xml += `<imgdir name="${padded}.img">\n  <imgdir name="info">\n`;
  xml += `    <canvas name="icon" width="26" height="28"><vector name="origin" x="-4" y="28"/></canvas>\n`;
  xml += `    <canvas name="iconRaw" width="24" height="26"><vector name="origin" x="-4" y="28"/></canvas>\n`;
  xml += `    <string name="islot" value="${slot}"/>\n    <string name="vslot" value="${slot}"/>\n`;
  xml += `    <int name="reqJob" value="${reqs.job ?? 0}"/>\n`;
  xml += `    <int name="reqLevel" value="${reqs.level ?? 0}"/>\n`;
  xml += `    <int name="reqSTR" value="${reqs.str ?? 0}"/>\n`;
  xml += `    <int name="reqDEX" value="${reqs.dex ?? 0}"/>\n`;
  xml += `    <int name="reqINT" value="${reqs.int ?? 0}"/>\n`;
  xml += `    <int name="reqLUK" value="${reqs.luk ?? 0}"/>\n`;
  xml += `    <int name="cash" value="${flags.cash ? 1 : 0}"/>\n`;
  xml += `    <int name="slotMax" value="${stats.slots ?? 0}"/>\n`;
  if (flags.tradeBlock) xml += `    <int name="tradeBlock" value="1"/>\n`;
  if (flags.only) xml += `    <int name="only" value="1"/>\n`;
  for (const [key, field] of Object.entries(STAT_FIELDS)) {
    if (stats[key]) xml += `    <int name="${field}" value="${stats[key]}"/>\n`;
  }
  xml += `  </imgdir>\n</imgdir>\n`;

  const dir = DIR_MAP[item.subCategory] || "Ring";
  const xmlDir = join(SERVER_WZ, "Character.wz", dir);
  mkdirSync(xmlDir, { recursive: true });
  const xmlPath = join(xmlDir, `${padded}.img.xml`);
  writeFileSync(xmlPath, xml);
  console.log(`  ${xmlPath.replace(ROOT + "/", "")}`);
}

// Also update server String.wz
const eqpPath = join(SERVER_WZ, "String.wz", "Eqp.img.xml");
if (existsSync(eqpPath)) {
  let eqpContent = readFileSync(eqpPath, "utf-8");
  for (const item of TEST_ITEMS) {
    if (eqpContent.includes(`<imgdir name="${item.itemId}">`)) continue;
    const section = STRING_SEC[item.subCategory] || "Accessory";
    const entry = `      <imgdir name="${item.itemId}">\n        <string name="name" value="${item.name}"/>\n        <string name="desc" value="${item.desc}"/>\n      </imgdir>`;
    const secOpen = eqpContent.indexOf(`<imgdir name="${section}">`);
    if (secOpen === -1) continue;
    const closeRe = /\n    <\/imgdir>/g;
    closeRe.lastIndex = secOpen;
    const m = closeRe.exec(eqpContent);
    if (!m) continue;
    eqpContent = eqpContent.slice(0, m.index) + "\n" + entry + eqpContent.slice(m.index);
  }
  writeFileSync(eqpPath, eqpContent);
  console.log(`  Updated server String.wz/Eqp.img.xml`);
}

// 4. Verify client WZ
console.log("\n--- Verify ---");
const cw2 = parseWzFile(join(OUTPUT, "Character.wz"));
const ring = cw2.root.find((e) => e.name === "Ring");
for (const item of TEST_ITEMS) {
  const name = String(item.itemId).padStart(8, "0") + ".img";
  const found = ring?.children?.find((e) => e.name === name);
  console.log(`  ${name}: ${found ? "OK (" + found.blockSize + "b)" : "MISSING!"}`);
}

console.log(`\n=== Done! ===`);
console.log(`\nFiles created:`);
console.log(`  Client: ${OUTPUT}/Character.wz, ${OUTPUT}/String.wz`);
console.log(`  Server: server/wz/Character.wz/Ring/0111299*.img.xml`);
console.log(`          server/wz/String.wz/Eqp.img.xml (updated)`);
console.log(`\nTo test locally with Docker:`);
console.log(`  1. Copy ${OUTPUT}/Character.wz and String.wz to your game client folder`);
console.log(`  2. Rebuild & run the game server (it reads from server/wz/)`);
console.log(`  3. Log in, use: @item 1112999`);
console.log(`  4. "Augur's Ring" should appear with gold ring icon, +10 all stats, +500 HP`);
