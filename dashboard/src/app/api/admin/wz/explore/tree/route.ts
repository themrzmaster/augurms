import { NextRequest, NextResponse } from "next/server";
import { getDirectoryListing, getWzCached, HEAVY_FILES } from "@/lib/wz/explorer";
import {
  ensureServerXml,
  getServerDirectoryListing,
} from "@/lib/wz/server-xml";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source") || "client";
  const file = request.nextUrl.searchParams.get("file");
  const path = request.nextUrl.searchParams.get("path") || "/";
  const force = request.nextUrl.searchParams.get("force") === "1";

  try {
    if (source === "server") {
      await ensureServerXml();
      // For server-XML, "file" optionally narrows to one top-level WZ subdir.
      // Path is interpreted relative to that subdir for parity with client.
      const fullPath = file ? `/${file}${path === "/" ? "" : path}` : path;
      const listing = getServerDirectoryListing(fullPath === "/" ? "" : fullPath);
      return NextResponse.json({ source: "server", file, ...listing });
    }
    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const wzInfo = await getWzCached(file, { force });
    const listing = getDirectoryListing(wzInfo, path);
    return NextResponse.json({
      source: "client",
      file,
      heavy: HEAVY_FILES.has(file),
      ...listing,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
