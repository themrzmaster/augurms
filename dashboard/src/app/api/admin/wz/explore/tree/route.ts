import { NextRequest, NextResponse } from "next/server";
import { getDirectoryListing, getWzCached, HEAVY_FILES } from "@/lib/wz/explorer";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get("file");
  const path = request.nextUrl.searchParams.get("path") || "/";
  const force = request.nextUrl.searchParams.get("force") === "1";

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  try {
    const wzInfo = await getWzCached(file, { force });
    const listing = getDirectoryListing(wzInfo, path);
    return NextResponse.json({
      file,
      heavy: HEAVY_FILES.has(file),
      ...listing,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
