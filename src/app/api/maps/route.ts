import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { PATHS } from "@/lib/cosmic";

interface MapEntry {
  id: number;
  streetName: string;
  mapName: string;
}

function parseMapStrings(content: string): MapEntry[] {
  const results: MapEntry[] = [];
  // Map.img.xml has nested regions (maple, victoria, etc.) with map entries inside
  // Each map entry: <imgdir name="mapId"><string name="streetName" .../><string name="mapName" .../>
  const regex = /<imgdir name="(\d+)">\s*\n?\s*<string name="streetName" value="([^"]*)"\s*\/>\s*\n?\s*<string name="mapName" value="([^"]*)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    results.push({
      id: parseInt(match[1]),
      streetName: match[2],
      mapName: match[3],
    });
  }
  return results;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = (searchParams.get("q") || "").toLowerCase().trim();

  if (!q) {
    return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }

  try {
    const content = readFileSync(`${PATHS.stringWz}/Map.img.xml`, "utf-8");
    const maps = parseMapStrings(content);

    const filtered = maps
      .filter(
        (map) =>
          map.mapName.toLowerCase().includes(q) ||
          map.streetName.toLowerCase().includes(q) ||
          map.id.toString().includes(q)
      )
      .slice(0, 100);

    return NextResponse.json(filtered);
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to search maps", details: err.message }, { status: 500 });
  }
}
