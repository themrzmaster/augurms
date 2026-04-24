import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Custom hair / face IDs live above the v83 stock ranges to avoid collisions
// with built-in WZ entries. Hair stock is 30000–39999, face is 20000–29999;
// our custom ranges sit one decade above each.
export const ASSET_RANGES = {
  hair: { start: 60000, end: 69999 },
  face: { start: 40000, end: 49999 },
} as const;

export type AssetType = keyof typeof ASSET_RANGES;

export async function GET(request: NextRequest) {
  const typeParam = request.nextUrl.searchParams.get("type");
  const count = Math.min(
    parseInt(request.nextUrl.searchParams.get("count") || "5"),
    20
  );

  if (!typeParam || !(typeParam in ASSET_RANGES)) {
    return NextResponse.json(
      { error: `type must be one of: ${Object.keys(ASSET_RANGES).join(", ")}` },
      { status: 400 }
    );
  }
  const type = typeParam as AssetType;
  const range = ASSET_RANGES[type];

  try {
    const rows = await query<{ in_game_id: number }>(
      "SELECT in_game_id FROM custom_assets WHERE asset_type = ? AND in_game_id BETWEEN ? AND ?",
      [type, range.start, range.end]
    ).catch(() => []);
    const used = new Set((rows as any[]).map((r) => r.in_game_id));

    const available: number[] = [];
    for (let id = range.start; id <= range.end && available.length < count; id++) {
      if (!used.has(id)) available.push(id);
    }

    return NextResponse.json({
      type,
      range,
      usedCount: used.size,
      totalAvailable: range.end - range.start + 1 - used.size,
      suggested: available,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
