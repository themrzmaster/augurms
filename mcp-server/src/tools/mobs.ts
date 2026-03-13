import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { PATHS } from "../utils/paths.js";

// ── Regex-based WZ XML parsing helpers ──────────────────────────────────────

interface MobEntry {
  id: number;
  name: string;
}

/**
 * Parse mob entries from String.wz/Mob.img.xml.
 * Structure: <imgdir name="mobId"> <string name="name" value="..."/> </imgdir>
 */
function parseMobStringFile(content: string): MobEntry[] {
  const mobs: MobEntry[] = [];
  const blockRegex = /<imgdir name="(\d+)">\s*\n([\s\S]*?)(?:<\/imgdir>)/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(content)) !== null) {
    const id = parseInt(match[1], 10);
    const block = match[2];

    const nameMatch = block.match(/<string name="name" value="([^"]*)"/);
    if (nameMatch) {
      mobs.push({ id, name: nameMatch[1] });
    }
  }

  return mobs;
}

/**
 * Look up a mob's name from String.wz/Mob.img.xml.
 */
async function lookupMobName(mobId: number): Promise<string | null> {
  try {
    const content = await readFile(resolve(PATHS.stringWz, "Mob.img.xml"), "utf-8");
    const regex = new RegExp(
      `<imgdir name="${mobId}">\\s*\\n([\\s\\S]*?)(?:<\\/imgdir>)`
    );
    const match = content.match(regex);
    if (match) {
      const nameMatch = match[1].match(/<string name="name" value="([^"]*)"/);
      return nameMatch ? nameMatch[1] : null;
    }
  } catch {
    // File may not exist
  }
  return null;
}

/**
 * Extract properties from a WZ XML info block.
 * Parses <int>, <string>, <float>, <short> tags.
 */
function parseInfoBlock(block: string): Record<string, string | number> {
  const props: Record<string, string | number> = {};

  const intRegex = /<(?:int|short) name="([^"]*)" value="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = intRegex.exec(block)) !== null) {
    props[match[1]] = parseInt(match[2], 10);
  }

  const floatRegex = /<float name="([^"]*)" value="([^"]*)"/g;
  while ((match = floatRegex.exec(block)) !== null) {
    props[match[1]] = parseFloat(match[2]);
  }

  const strRegex = /<string name="([^"]*)" value="([^"]*)"/g;
  while ((match = strRegex.exec(block)) !== null) {
    props[match[1]] = match[2];
  }

  return props;
}

/**
 * Read mob stats from Mob.wz/{mobId}.img.xml.
 * Mob files are named with 7-digit zero-padded IDs: e.g. 0100100.img.xml
 * Stats are in the <imgdir name="info"> block.
 */
async function getMobStats(mobId: number): Promise<Record<string, string | number> | null> {
  const paddedId = String(mobId).padStart(7, "0");
  const filePath = resolve(PATHS.mobWz, `${paddedId}.img.xml`);

  try {
    const content = await readFile(filePath, "utf-8");
    const infoMatch = content.match(/<imgdir name="info">([\s\S]*?)<\/imgdir>/);
    if (infoMatch) {
      return parseInfoBlock(infoMatch[1]);
    }
  } catch {
    // Mob data file doesn't exist
  }

  return null;
}

// ── Stat display names for readability ──────────────────────────────────────

const STAT_LABELS: Record<string, string> = {
  maxHP: "Max HP",
  maxMP: "Max MP",
  level: "Level",
  exp: "EXP",
  PADamage: "Physical Attack",
  PDDamage: "Physical Defense",
  MADamage: "Magic Attack",
  MDDamage: "Magic Defense",
  acc: "Accuracy",
  eva: "Evasion",
  speed: "Speed",
  undead: "Undead",
  pushed: "Knockback",
  bodyAttack: "Body Attack",
  boss: "Boss",
  hpRecovery: "HP Recovery",
  mpRecovery: "MP Recovery",
  fs: "Fly Speed",
  summonType: "Summon Type",
  mobType: "Mob Type",
};

// ── Tool registration ───────────────────────────────────────────────────────

export function registerMobTools(server: McpServer): void {
  // ── search_mobs ─────────────────────────────────────────────────────────
  server.tool(
    "search_mobs",
    "Search MapleStory mobs/monsters by name (case-insensitive substring match).",
    {
      query: z.string().describe("Search query to match against mob names"),
    },
    async ({ query }) => {
      try {
        const queryLower = query.toLowerCase();
        const content = await readFile(resolve(PATHS.stringWz, "Mob.img.xml"), "utf-8");
        const allMobs = parseMobStringFile(content);

        const matches = allMobs
          .filter(mob => mob.name.toLowerCase().includes(queryLower))
          .slice(0, 50)
          .map(({ id, name }) => ({ id, name }));

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              query,
              resultCount: matches.length,
              results: matches,
            }, null, 2),
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error searching mobs: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── get_mob_info ────────────────────────────────────────────────────────
  server.tool(
    "get_mob_info",
    "Get detailed information about a MapleStory mob/monster by its ID, including HP, MP, level, EXP, attack, defense, and other stats.",
    {
      mobId: z.number().int().positive()
        .describe("The numeric mob ID to look up"),
    },
    async ({ mobId }) => {
      try {
        const name = await lookupMobName(mobId);
        if (!name) {
          return {
            content: [{ type: "text" as const, text: `Mob with ID ${mobId} not found.` }],
            isError: true,
          };
        }

        const stats = await getMobStats(mobId);

        const result: Record<string, unknown> = {
          id: mobId,
          name,
        };

        if (stats) {
          // Build a clean stats object with labeled keys
          const labeledStats: Record<string, string | number> = {};
          const rawStats: Record<string, string | number> = {};

          for (const [key, value] of Object.entries(stats)) {
            if (STAT_LABELS[key]) {
              labeledStats[key] = value;
            } else {
              rawStats[key] = value;
            }
          }

          // Provide key stats at the top level for convenience
          if (stats.level !== undefined) result.level = stats.level;
          if (stats.maxHP !== undefined) result.hp = stats.maxHP;
          if (stats.maxMP !== undefined) result.mp = stats.maxMP;
          if (stats.exp !== undefined) result.exp = stats.exp;
          if (stats.PADamage !== undefined) result.physicalAttack = stats.PADamage;
          if (stats.PDDamage !== undefined) result.physicalDefense = stats.PDDamage;
          if (stats.MADamage !== undefined) result.magicAttack = stats.MADamage;
          if (stats.MDDamage !== undefined) result.magicDefense = stats.MDDamage;
          if (stats.acc !== undefined) result.accuracy = stats.acc;
          if (stats.eva !== undefined) result.evasion = stats.eva;
          if (stats.undead !== undefined) result.undead = stats.undead === 1;
          if (stats.boss !== undefined) result.boss = stats.boss === 1;

          // Include all raw stats for completeness
          result.allStats = stats;
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error getting mob info: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
