import { NextRequest, NextResponse } from "next/server";
import { getImgPropertyTree, getWzCached } from "@/lib/wz/explorer";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get("file");
  const path = request.nextUrl.searchParams.get("path");
  const force = request.nextUrl.searchParams.get("force") === "1";

  if (!file || !path) {
    return NextResponse.json(
      { error: "file and path are required" },
      { status: 400 }
    );
  }

  try {
    const wzInfo = await getWzCached(file, { force });
    const result = getImgPropertyTree(wzInfo, path);
    return NextResponse.json({ file, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
