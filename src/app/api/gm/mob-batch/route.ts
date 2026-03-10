import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { PATHS } from "@/lib/cosmic";

const ALLOWED_STATS = [
  "level", "maxHP", "maxMP", "exp", "PADamage", "MADamage",
  "PDDamage", "MDDamage", "acc", "eva", "speed", "boss",
  "undead", "bodyAttack", "pushed",
];

export async function PUT(request: NextRequest) {
  try {
    const { mobs } = await request.json();

    if (!Array.isArray(mobs) || mobs.length === 0) {
      return NextResponse.json({ error: "mobs array is required" }, { status: 400 });
    }

    if (mobs.length > 50) {
      return NextResponse.json({ error: "Max 50 mobs per batch" }, { status: 400 });
    }

    const results: Array<{ id: number; success: boolean; changes?: Record<string, { from: number; to: number }>; error?: string }> = [];

    for (const mob of mobs) {
      const { id, changes } = mob;
      if (!id || !changes || typeof changes !== "object") {
        results.push({ id, success: false, error: "Invalid mob entry: needs id and changes" });
        continue;
      }

      try {
        // Find the mob file
        const mobIdStr = String(id).padStart(7, "0");
        const mobFile = `${PATHS.mobWz}/${mobIdStr}.img.xml`;

        let content: string;
        try {
          content = readFileSync(mobFile, "utf-8");
        } catch {
          results.push({ id, success: false, error: "Mob file not found" });
          continue;
        }

        const appliedChanges: Record<string, { from: number; to: number }> = {};

        for (const [stat, value] of Object.entries(changes)) {
          if (!ALLOWED_STATS.includes(stat)) continue;
          const numValue = Number(value);
          if (isNaN(numValue)) continue;

          const regex = new RegExp(`(<int name="${stat}" value=")(\\d+)(")`);
          const match = content.match(regex);
          if (match) {
            appliedChanges[stat] = { from: parseInt(match[2]), to: numValue };
            content = content.replace(regex, `$1${numValue}$3`);
          }
        }

        if (Object.keys(appliedChanges).length > 0) {
          writeFileSync(mobFile, content, "utf-8");
          results.push({ id, success: true, changes: appliedChanges });
        } else {
          results.push({ id, success: true, changes: {} });
        }
      } catch (err: any) {
        results.push({ id, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return NextResponse.json({
      success: true,
      message: `Updated ${successCount}/${mobs.length} mobs`,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to batch update mobs", details: err.message }, { status: 500 });
  }
}
