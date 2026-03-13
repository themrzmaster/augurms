import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const COSMIC_ROOT = process.env.COSMIC_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), "../../../Cosmic");

export const PATHS = {
  root: COSMIC_ROOT,
  config: resolve(COSMIC_ROOT, "config.yaml"),
  wz: resolve(COSMIC_ROOT, "wz"),
  scripts: resolve(COSMIC_ROOT, "scripts"),
  stringWz: resolve(COSMIC_ROOT, "wz/String.wz"),
  mapWz: resolve(COSMIC_ROOT, "wz/Map.wz"),
  mobWz: resolve(COSMIC_ROOT, "wz/Mob.wz"),
  npcWz: resolve(COSMIC_ROOT, "wz/Npc.wz"),
  itemWz: resolve(COSMIC_ROOT, "wz/Item.wz"),
  characterWz: resolve(COSMIC_ROOT, "wz/Character.wz"),
  skillWz: resolve(COSMIC_ROOT, "wz/Skill.wz"),
  reactorWz: resolve(COSMIC_ROOT, "wz/Reactor.wz"),
  etcWz: resolve(COSMIC_ROOT, "wz/Etc.wz"),
} as const;
