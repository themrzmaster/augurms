import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { PATHS, parseStringEntries, parseNestedStringEntries, getItemCategory } from "@/lib/cosmic";

const CATEGORY_FILES: Record<string, { file: string; nested: boolean }> = {
  equip: { file: "Eqp.img.xml", nested: true },
  consume: { file: "Consume.img.xml", nested: false },
  etc: { file: "Etc.img.xml", nested: false },
  cash: { file: "Cash.img.xml", nested: false },
};

interface ItemEntry {
  id: number;
  name: string;
  category: string;
  quest?: boolean;
}

// Cache quest item IDs (parsed from WZ on first request)
let questItemCache: Set<number> | null = null;

function getQuestItems(): Set<number> {
  if (questItemCache) return questItemCache;
  const questIds = new Set<number>();

  // Scan Item.wz XML files for quest=1 or questId properties
  const itemWzDirs = ["Consume", "Etc", "Cash"];
  for (const dir of itemWzDirs) {
    const dirPath = resolve(PATHS.itemWz, dir);
    try {
      const files = require("fs").readdirSync(dirPath) as string[];
      for (const file of files) {
        if (!file.endsWith(".img.xml")) continue;
        try {
          const content = readFileSync(resolve(dirPath, file), "utf-8");
          // Find items with quest=1 or questId
          const itemBlocks = content.matchAll(/<imgdir name="(\d+)">([\s\S]*?)(?=<imgdir name="\d+">|<\/imgdir>\s*$)/g);
          for (const block of itemBlocks) {
            const itemId = parseInt(block[1]);
            const blockContent = block[2];
            if (
              /<int name="quest" value="1"/.test(blockContent) ||
              /<string name="questId"/.test(blockContent) ||
              /<int name="only" value="1"/.test(blockContent)
            ) {
              questIds.add(itemId);
            }
          }
        } catch {}
      }
    } catch {}
  }

  questItemCache = questIds;
  return questIds;
}

function loadCategory(key: string): ItemEntry[] {
  const info = CATEGORY_FILES[key];
  if (!info) return [];
  try {
    const content = readFileSync(`${PATHS.stringWz}/${info.file}`, "utf-8");
    const entries = info.nested
      ? parseNestedStringEntries(content)
      : parseStringEntries(content);
    return entries.map((e) => ({ ...e, category: key }));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = (searchParams.get("q") || "").toLowerCase().trim();
  const category = searchParams.get("category") || "all";
  const filter = searchParams.get("filter") || "none";

  try {
    let allItems: ItemEntry[] = [];

    if (category === "all") {
      for (const key of Object.keys(CATEGORY_FILES)) {
        allItems.push(...loadCategory(key));
      }
    } else if (CATEGORY_FILES[category]) {
      allItems = loadCategory(category);
    } else {
      return NextResponse.json(
        { error: `Invalid category. Use: ${Object.keys(CATEGORY_FILES).join(", ")}, or all` },
        { status: 400 }
      );
    }

    // Deduplicate by ID
    const seen = new Set<number>();
    let unique = allItems.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    // Tag quest items
    const questItems = getQuestItems();
    unique = unique.map((item) => ({
      ...item,
      quest: questItems.has(item.id),
    }));

    // Apply property filter
    if (filter === "quest") {
      unique = unique.filter((item) => item.quest);
    } else if (filter === "no_quest") {
      unique = unique.filter((item) => !item.quest);
    } else if (filter === "droppable") {
      // Safe for spawn_drop: non-quest, consume or equip or cash
      unique = unique.filter(
        (item) => !item.quest && (item.category === "consume" || item.category === "equip" || item.category === "cash")
      );
    }

    // Search filter
    const filtered = q
      ? unique.filter((item) => item.name.toLowerCase().includes(q) || item.id.toString().includes(q)).slice(0, 100)
      : unique;

    return NextResponse.json(filtered);
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to search items", details: err.message }, { status: 500 });
  }
}
