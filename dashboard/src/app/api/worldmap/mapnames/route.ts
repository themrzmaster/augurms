import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { PATHS } from "@/lib/cosmic";

let cachedNames: Record<string, { name: string; streetName: string }> | null =
  null;

function parseMapNames(): Record<
  string,
  { name: string; streetName: string }
> {
  if (cachedNames) return cachedNames;

  const content = readFileSync(`${PATHS.stringWz}/Map.img.xml`, "utf-8");
  const result: Record<string, { name: string; streetName: string }> = {};
  const regex =
    /<imgdir name="(\d+)">\s*\n?\s*<string name="streetName" value="([^"]*)"\s*\/>\s*\n?\s*<string name="mapName" value="([^"]*)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    result[match[1]] = { name: match[3], streetName: match[2] };
  }

  cachedNames = result;
  return result;
}

export async function GET() {
  try {
    const names = parseMapNames();
    return NextResponse.json(names, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to parse map names", details: err.message },
      { status: 500 }
    );
  }
}
