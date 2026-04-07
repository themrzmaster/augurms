import { resolve } from "path";

export const COSMIC_ROOT = process.env.COSMIC_ROOT || resolve(process.cwd(), "../Cosmic");

export const PATHS = {
  root: COSMIC_ROOT,
  config: resolve(COSMIC_ROOT, "config.yaml"),
  wz: resolve(COSMIC_ROOT, "wz"),
  scripts: resolve(COSMIC_ROOT, "scripts"),
  stringWz: resolve(COSMIC_ROOT, "wz/String.wz"),
  mapWz: resolve(COSMIC_ROOT, "wz/Map.wz"),
  mobWz: resolve(COSMIC_ROOT, "wz/Mob.wz"),
  itemWz: resolve(COSMIC_ROOT, "wz/Item.wz"),
  characterWz: resolve(COSMIC_ROOT, "wz/Character.wz"),
  reactorWz: resolve(COSMIC_ROOT, "wz/Reactor.wz"),
  npcWz: resolve(COSMIC_ROOT, "wz/Npc.wz"),
} as const;

/** Sprite URLs from maplestory.io (GMS v83 community API) */
export const SPRITES = {
  item: (id: number) => `https://maplestory.io/api/GMS/83/item/${id}/icon`,
  mob: (id: number) => `https://maplestory.io/api/GMS/83/mob/${id}/render/stand`,
  npc: (id: number) => `https://maplestory.io/api/GMS/83/npc/${id}/render/stand`,
  map: (id: number) => `https://maplestory.io/api/GMS/83/map/${id}/render`,
};

/** Parse WZ XML string files using regex (fast) */
export function parseStringEntries(content: string): Array<{ id: number; name: string }> {
  const results: Array<{ id: number; name: string }> = [];
  const regex = /<imgdir name="(\d+)">\s*<string name="name" value="([^"]*)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    results.push({ id: parseInt(match[1]), name: match[2] });
  }
  return results;
}

/** Parse nested string entries (like Eqp.img.xml which has subcategories) */
export function parseNestedStringEntries(content: string): Array<{ id: number; name: string }> {
  const results: Array<{ id: number; name: string }> = [];
  const regex = /<imgdir name="(\d{7})">\s*\n?\s*<string name="name" value="([^"]*)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    results.push({ id: parseInt(match[1]), name: match[2] });
  }
  return results;
}

/** Get item category from ID */
export function getItemCategory(id: number): string {
  const prefix = Math.floor(id / 1000000);
  switch (prefix) {
    case 1: return "equip";
    case 2: return "consume";
    case 3: return "setup";
    case 4: return "etc";
    case 5: return "cash";
    default: return "unknown";
  }
}

/** MapleStory job names */
export const JOB_NAMES: Record<number, string> = {
  0: "Beginner", 100: "Warrior", 110: "Fighter", 111: "Crusader", 112: "Hero",
  120: "Page", 121: "White Knight", 122: "Paladin", 130: "Spearman", 131: "Dragon Knight",
  132: "Dark Knight", 200: "Magician", 210: "F/P Wizard", 211: "F/P Mage", 212: "F/P Arch Mage",
  220: "I/L Wizard", 221: "I/L Mage", 222: "I/L Arch Mage", 230: "Cleric", 231: "Priest",
  232: "Bishop", 300: "Bowman", 310: "Hunter", 311: "Ranger", 312: "Bow Master",
  320: "Crossbowman", 321: "Sniper", 322: "Marksman", 400: "Thief", 410: "Assassin",
  411: "Hermit", 412: "Night Lord", 420: "Bandit", 421: "Chief Bandit", 422: "Shadower",
  500: "Pirate", 510: "Brawler", 511: "Marauder", 512: "Buccaneer", 520: "Gunslinger",
  521: "Outlaw", 522: "Corsair", 900: "GM", 910: "Super GM",
  1000: "Noblesse", 1100: "Dawn Warrior 1", 1110: "Dawn Warrior 2", 1111: "Dawn Warrior 3",
  1200: "Blaze Wizard 1", 1210: "Blaze Wizard 2", 1211: "Blaze Wizard 3",
  1300: "Wind Archer 1", 1310: "Wind Archer 2", 1311: "Wind Archer 3",
  1400: "Night Walker 1", 1410: "Night Walker 2", 1411: "Night Walker 3",
  1500: "Thunder Breaker 1", 1510: "Thunder Breaker 2", 1511: "Thunder Breaker 3",
  2000: "Legend", 2001: "Evan 1", 2100: "Aran 1", 2110: "Aran 2", 2111: "Aran 3", 2112: "Aran 4",
};
