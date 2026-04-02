import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { WEAPON_TYPES } from "@/lib/wz";
import { readdirSync, existsSync } from "fs";
import { join } from "path";

const WZ_ROOT = process.env.WZ_ROOT || "/app/wz";

// ID ranges per sub-category
const ID_RANGES: Record<string, { start: number; end: number; dir: string }> = {
  Ring:      { start: 1112000, end: 1112999, dir: "Character.wz/Ring" },
  Pendant:   { start: 1122000, end: 1122999, dir: "Character.wz/Accessory" },
  Earring:   { start: 1032000, end: 1032999, dir: "Character.wz/Accessory" },
  Face:      { start: 1012000, end: 1012999, dir: "Character.wz/Accessory" },
  Eye:       { start: 1022000, end: 1022999, dir: "Character.wz/Accessory" },
  Belt:      { start: 1132000, end: 1132999, dir: "Character.wz/Accessory" },
  Medal:     { start: 1142000, end: 1142999, dir: "Character.wz/Accessory" },
  Cap:       { start: 1002000, end: 1002999, dir: "Character.wz/Cap" },
  Coat:      { start: 1040000, end: 1041999, dir: "Character.wz/Coat" },
  Longcoat:  { start: 1050000, end: 1051999, dir: "Character.wz/Longcoat" },
  Pants:     { start: 1060000, end: 1061999, dir: "Character.wz/Pants" },
  Shoes:     { start: 1070000, end: 1072999, dir: "Character.wz/Shoes" },
  Glove:     { start: 1080000, end: 1082999, dir: "Character.wz/Glove" },
  Shield:    { start: 1092000, end: 1092999, dir: "Character.wz/Shield" },
  Cape:      { start: 1102000, end: 1102999, dir: "Character.wz/Cape" },
};

// GET: Find next available item ID for a sub-category
// ?subCategory=Ring&count=5  →  returns 5 available IDs
// ?subCategory=Weapon&weaponType=staff&count=5  →  returns IDs in 1382xxx range
export async function GET(request: NextRequest) {
  const subCategory = request.nextUrl.searchParams.get("subCategory") || "Ring";
  const weaponTypeParam = request.nextUrl.searchParams.get("weaponType");
  const count = Math.min(parseInt(request.nextUrl.searchParams.get("count") || "5"), 20);

  // For weapons, scope to the specific weapon type's ID range
  let range: { start: number; end: number; dir: string };
  if (subCategory === "Weapon") {
    const wt = weaponTypeParam && WEAPON_TYPES[weaponTypeParam]
      ? WEAPON_TYPES[weaponTypeParam]
      : null;
    if (!wt) {
      return NextResponse.json({
        error: `Weapon type required. Valid types: ${Object.keys(WEAPON_TYPES).join(", ")}`,
      }, { status: 400 });
    }
    // Each weapon type has a 4-digit prefix (e.g., 1382 for staff)
    // IDs are 7 digits: prefix * 1000 + 000..999
    range = {
      start: wt.prefix * 1000,
      end: wt.prefix * 1000 + 999,
      dir: "Character.wz/Weapon",
    };
  } else {
    const r = ID_RANGES[subCategory];
    if (!r) {
      return NextResponse.json({ error: `Unknown sub-category: ${subCategory}` }, { status: 400 });
    }
    range = r;
  }

  try {
    // 1. Get IDs used in WZ files
    const wzUsed = new Set<number>();
    const wzDir = join(WZ_ROOT, range.dir);
    if (existsSync(wzDir)) {
      for (const file of readdirSync(wzDir)) {
        const match = file.match(/^0*(\d+)\.img\.xml$/);
        if (match) {
          const id = parseInt(match[1]);
          if (id >= range.start && id <= range.end) {
            wzUsed.add(id);
          }
        }
      }
    }

    // 2. Get IDs used in custom_items table
    const customRows = await query<{ item_id: number }>(
      "SELECT item_id FROM custom_items WHERE item_id BETWEEN ? AND ?",
      [range.start, range.end]
    ).catch(() => []);
    const customUsed = new Set((customRows as any[]).map((r: any) => r.item_id));

    // 3. Find available IDs — search from the end of the range (less likely to conflict)
    const available: number[] = [];
    for (let id = range.end; id >= range.start && available.length < count; id--) {
      if (!wzUsed.has(id) && !customUsed.has(id)) {
        available.push(id);
      }
    }

    return NextResponse.json({
      subCategory,
      ...(weaponTypeParam ? { weaponType: weaponTypeParam } : {}),
      range: { start: range.start, end: range.end },
      wzUsedCount: wzUsed.size,
      customUsedCount: customUsed.size,
      totalAvailable: (range.end - range.start + 1) - wzUsed.size - customUsed.size,
      suggested: available,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
