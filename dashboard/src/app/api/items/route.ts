import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { PATHS, parseStringEntries, parseNestedStringEntries, getItemCategory } from "@/lib/cosmic";

const CATEGORY_FILES: Record<string, { file: string; nested: boolean }> = {
  equip: { file: "Eqp.img.xml", nested: true },
  consume: { file: "Consume.img.xml", nested: false },
  etc: { file: "Etc.img.xml", nested: false },
  cash: { file: "Cash.img.xml", nested: false },
};

function loadCategory(key: string): Array<{ id: number; name: string; category: string }> {
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

  try {
    let allItems: Array<{ id: number; name: string; category: string }> = [];

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
    const unique = allItems.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    const filtered = q
      ? unique.filter((item) => item.name.toLowerCase().includes(q) || item.id.toString().includes(q)).slice(0, 100)
      : unique;

    return NextResponse.json(filtered);
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to search items", details: err.message }, { status: 500 });
  }
}
