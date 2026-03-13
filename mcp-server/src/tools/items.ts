import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, readdir } from "fs/promises";
import { resolve } from "path";
import { PATHS } from "../utils/paths.js";

// ── Regex-based WZ XML parsing helpers ──────────────────────────────────────

interface ItemEntry {
  id: number;
  name: string;
  desc?: string;
  category: string;
}

interface MapEntry {
  id: number;
  streetName?: string;
  mapName: string;
}

/**
 * Parse items from a flat String.wz file (Consume, Etc, Cash).
 * These have a simple structure: <imgdir name="ID"> with <string name="name" ...> inside.
 */
function parseItemStringFile(content: string, category: string): ItemEntry[] {
  const items: ItemEntry[] = [];
  const blockRegex = /<imgdir name="(\d+)">\s*\n([\s\S]*?)(?:<\/imgdir>)/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(content)) !== null) {
    const id = parseInt(match[1], 10);
    const block = match[2];

    const nameMatch = block.match(/<string name="name" value="([^"]*)"/);
    if (nameMatch) {
      const descMatch = block.match(/<string name="desc" value="([^"]*)"/);
      items.push({
        id,
        name: nameMatch[1],
        desc: descMatch?.[1],
        category,
      });
    }
  }

  return items;
}

/**
 * Parse items from Eqp.img.xml which has nested category directories:
 * <imgdir name="Eqp"> > <imgdir name="Category"> > <imgdir name="ID">
 */
function parseEqpStringFile(content: string): ItemEntry[] {
  const items: ItemEntry[] = [];
  // Match the innermost imgdir blocks that contain item data (numeric name)
  const blockRegex = /<imgdir name="(\d+)">\s*\n([\s\S]*?)(?:<\/imgdir>)/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(content)) !== null) {
    const id = parseInt(match[1], 10);
    const block = match[2];

    const nameMatch = block.match(/<string name="name" value="([^"]*)"/);
    if (nameMatch) {
      const descMatch = block.match(/<string name="desc" value="([^"]*)"/);
      items.push({
        id,
        name: nameMatch[1],
        desc: descMatch?.[1],
        category: "equip",
      });
    }
  }

  return items;
}

/**
 * Parse maps from Map.img.xml which has nested region directories:
 * <imgdir name="region"> > <imgdir name="mapId">
 */
function parseMapStringFile(content: string): MapEntry[] {
  const maps: MapEntry[] = [];
  const blockRegex = /<imgdir name="(\d+)">\s*\n([\s\S]*?)(?:<\/imgdir>)/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(content)) !== null) {
    const id = parseInt(match[1], 10);
    const block = match[2];

    const mapNameMatch = block.match(/<string name="mapName" value="([^"]*)"/);
    if (mapNameMatch) {
      const streetNameMatch = block.match(/<string name="streetName" value="([^"]*)"/);
      maps.push({
        id,
        streetName: streetNameMatch?.[1],
        mapName: mapNameMatch[1],
      });
    }
  }

  return maps;
}

/**
 * Look up an item's name and description from String.wz files.
 */
async function lookupItemName(itemId: number): Promise<{ name: string; desc?: string; category: string } | null> {
  const idStr = String(itemId);

  // Determine category by ID range
  const categoryMap: { prefix: string; file: string; category: string }[] = [
    { prefix: "1", file: "Eqp.img.xml", category: "equip" },
    { prefix: "2", file: "Consume.img.xml", category: "consume" },
    { prefix: "4", file: "Etc.img.xml", category: "etc" },
    { prefix: "5", file: "Cash.img.xml", category: "cash" },
    { prefix: "3", file: "Ins.img.xml", category: "install" },
  ];

  for (const { prefix, file, category } of categoryMap) {
    if (idStr.startsWith(prefix)) {
      try {
        const content = await readFile(resolve(PATHS.stringWz, file), "utf-8");
        const regex = new RegExp(
          `<imgdir name="${itemId}">\\s*\\n([\\s\\S]*?)(?:<\\/imgdir>)`
        );
        const match = content.match(regex);
        if (match) {
          const block = match[1];
          const nameMatch = block.match(/<string name="name" value="([^"]*)"/);
          const descMatch = block.match(/<string name="desc" value="([^"]*)"/);
          if (nameMatch) {
            return { name: nameMatch[1], desc: descMatch?.[1], category };
          }
        }
      } catch {
        // File may not exist
      }
    }
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
 * Extract the <imgdir name="info"> block from a WZ XML content string.
 */
function extractInfoBlock(content: string): string | null {
  const match = content.match(/<imgdir name="info">([\s\S]*?)<\/imgdir>/);
  return match ? match[1] : null;
}

/**
 * Extract the <imgdir name="spec"> block from a WZ XML content string.
 */
function extractSpecBlock(content: string): string | null {
  const match = content.match(/<imgdir name="spec">([\s\S]*?)<\/imgdir>/);
  return match ? match[1] : null;
}

/**
 * Get item data file path and read its stats.
 * For equips (1xxxxxxx): Character.wz subdirectories
 * For consume (2xxxxxxx): Item.wz/Consume/
 * For etc (4xxxxxxx): Item.wz/Etc/
 * For cash (5xxxxxxx): Item.wz/Cash/
 */
async function getItemStats(itemId: number): Promise<Record<string, string | number> | null> {
  const idStr = String(itemId);

  if (idStr.startsWith("1")) {
    // Equip items are in Character.wz subdirectories
    // File name is the 8-digit zero-padded ID: e.g. 01302000.img.xml
    const paddedId = idStr.padStart(8, "0");
    const fileName = `${paddedId}.img.xml`;

    // Search through Character.wz subdirectories
    try {
      const subdirs = await readdir(PATHS.characterWz);
      for (const subdir of subdirs) {
        if (subdir.endsWith(".img.xml")) continue; // Skip files at root
        const filePath = resolve(PATHS.characterWz, subdir, fileName);
        try {
          const content = await readFile(filePath, "utf-8");
          const infoBlock = extractInfoBlock(content);
          if (infoBlock) {
            return parseInfoBlock(infoBlock);
          }
        } catch {
          // File not in this subdirectory
        }
      }
    } catch {
      return null;
    }
  } else {
    // Non-equip items are in Item.wz subdirectories
    // File structure: Item.wz/{Category}/{prefix}.img.xml containing <imgdir name="0{itemId}">
    const categoryDirs: { prefix: string; dir: string }[] = [
      { prefix: "2", dir: "Consume" },
      { prefix: "3", dir: "Install" },
      { prefix: "4", dir: "Etc" },
      { prefix: "5", dir: "Cash" },
    ];

    for (const { prefix, dir } of categoryDirs) {
      if (!idStr.startsWith(prefix)) continue;

      // Item files are grouped: e.g. itemId 2000004 -> file 0200.img.xml, entry name "02000004"
      const paddedId = idStr.padStart(7, "0");
      const filePrefix = `0${paddedId.substring(0, 3)}`;
      const entryName = `0${paddedId}`;
      const filePath = resolve(PATHS.itemWz, dir, `${filePrefix}.img.xml`);

      try {
        const content = await readFile(filePath, "utf-8");

        // Find the specific item entry within the file
        const entryRegex = new RegExp(
          `<imgdir name="${entryName}">([\\s\\S]*?)(?=<imgdir name="\\d{8}">|<\\/imgdir>\\s*<\\/imgdir>)`,
        );
        const entryMatch = content.match(entryRegex);
        if (entryMatch) {
          const entryContent = entryMatch[1];
          const info = extractInfoBlock(entryContent);
          const spec = extractSpecBlock(entryContent);

          const stats: Record<string, string | number> = {};
          if (info) Object.assign(stats, parseInfoBlock(info));
          if (spec) Object.assign(stats, parseInfoBlock(spec));

          return Object.keys(stats).length > 0 ? stats : null;
        }
      } catch {
        // File doesn't exist
      }
    }
  }

  return null;
}

// ── Tool registration ───────────────────────────────────────────────────────

export function registerItemTools(server: McpServer): void {
  // ── search_items ────────────────────────────────────────────────────────
  server.tool(
    "search_items",
    "Search MapleStory items by name (case-insensitive substring match). Searches through equipment, consumables, etc items, and cash items.",
    {
      query: z.string().describe("Search query to match against item names"),
      category: z.enum(["equip", "consume", "etc", "cash", "all"]).optional()
        .describe("Item category to search in. Defaults to 'all'."),
    },
    async ({ query, category }) => {
      try {
        const searchCategory = category ?? "all";
        const queryLower = query.toLowerCase();
        const allItems: ItemEntry[] = [];

        const filesToSearch: { file: string; category: string; parser: "flat" | "eqp" }[] = [];

        if (searchCategory === "all" || searchCategory === "equip") {
          filesToSearch.push({ file: "Eqp.img.xml", category: "equip", parser: "eqp" });
        }
        if (searchCategory === "all" || searchCategory === "consume") {
          filesToSearch.push({ file: "Consume.img.xml", category: "consume", parser: "flat" });
        }
        if (searchCategory === "all" || searchCategory === "etc") {
          filesToSearch.push({ file: "Etc.img.xml", category: "etc", parser: "flat" });
        }
        if (searchCategory === "all" || searchCategory === "cash") {
          filesToSearch.push({ file: "Cash.img.xml", category: "cash", parser: "flat" });
        }

        for (const { file, category: cat, parser } of filesToSearch) {
          try {
            const content = await readFile(resolve(PATHS.stringWz, file), "utf-8");
            const items = parser === "eqp"
              ? parseEqpStringFile(content)
              : parseItemStringFile(content, cat);
            allItems.push(...items);
          } catch {
            // File may not exist
          }
        }

        const matches = allItems
          .filter(item => item.name.toLowerCase().includes(queryLower))
          .slice(0, 50)
          .map(({ id, name, category: cat }) => ({ id, name, category: cat }));

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              query,
              category: searchCategory,
              resultCount: matches.length,
              results: matches,
            }, null, 2),
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error searching items: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── get_item_info ───────────────────────────────────────────────────────
  server.tool(
    "get_item_info",
    "Get detailed information about a MapleStory item by its ID, including name, description, and stats (requirements, bonuses, price, etc.)",
    {
      itemId: z.number().int().positive()
        .describe("The numeric item ID to look up"),
    },
    async ({ itemId }) => {
      try {
        const nameInfo = await lookupItemName(itemId);
        if (!nameInfo) {
          return {
            content: [{ type: "text" as const, text: `Item with ID ${itemId} not found.` }],
            isError: true,
          };
        }

        const stats = await getItemStats(itemId);

        const result: Record<string, unknown> = {
          id: itemId,
          name: nameInfo.name,
          category: nameInfo.category,
        };

        if (nameInfo.desc) {
          result.description = nameInfo.desc;
        }

        if (stats) {
          // Filter out non-useful properties (canvas/image data)
          const filteredStats: Record<string, string | number> = {};
          for (const [key, value] of Object.entries(stats)) {
            // Skip image-related and slot properties that aren't useful as text
            if (!["icon", "iconRaw", "iconD", "iconRaw2"].includes(key)) {
              filteredStats[key] = value;
            }
          }
          result.stats = filteredStats;
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error getting item info: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── search_maps ─────────────────────────────────────────────────────────
  server.tool(
    "search_maps",
    "Search MapleStory maps by name (case-insensitive substring match). Searches both street names and map names.",
    {
      query: z.string().describe("Search query to match against map names"),
    },
    async ({ query }) => {
      try {
        const queryLower = query.toLowerCase();
        const content = await readFile(resolve(PATHS.stringWz, "Map.img.xml"), "utf-8");
        const allMaps = parseMapStringFile(content);

        const matches = allMaps
          .filter(map =>
            map.mapName.toLowerCase().includes(queryLower) ||
            (map.streetName && map.streetName.toLowerCase().includes(queryLower))
          )
          .slice(0, 50)
          .map(({ id, streetName, mapName }) => ({
            id,
            streetName: streetName ?? null,
            mapName,
          }));

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
          content: [{ type: "text" as const, text: `Error searching maps: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
