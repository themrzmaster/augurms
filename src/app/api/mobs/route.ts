import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { PATHS, parseStringEntries } from "@/lib/cosmic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = (searchParams.get("q") || "").toLowerCase().trim();

  try {
    const content = readFileSync(`${PATHS.stringWz}/Mob.img.xml`, "utf-8");
    const entries = parseStringEntries(content);

    // Deduplicate by ID (WZ files can have duplicate entries)
    const seen = new Set<number>();
    const unique = entries.filter((mob) => {
      if (seen.has(mob.id)) return false;
      seen.add(mob.id);
      return true;
    });

    const filtered = q
      ? unique.filter((mob) => mob.name.toLowerCase().includes(q) || mob.id.toString().includes(q)).slice(0, 100)
      : unique;

    return NextResponse.json(filtered);
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to search mobs", details: err.message }, { status: 500 });
  }
}
