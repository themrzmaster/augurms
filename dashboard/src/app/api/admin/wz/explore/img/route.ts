import { NextRequest, NextResponse } from "next/server";
import { getImgPropertyTree, getWzCached } from "@/lib/wz/explorer";
import { ensureServerXml, getServerImgXml } from "@/lib/wz/server-xml";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source") || "client";
  const file = request.nextUrl.searchParams.get("file");
  const path = request.nextUrl.searchParams.get("path");
  const force = request.nextUrl.searchParams.get("force") === "1";

  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  try {
    if (source === "server") {
      await ensureServerXml();
      const fullPath = file ? `/${file}${path}` : path;
      const result = getServerImgXml(fullPath);
      return NextResponse.json({ source: "server", file, ...result });
    }
    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const wzInfo = await getWzCached(file, { force });
    const result = getImgPropertyTree(wzInfo, path);
    return NextResponse.json({ source: "client", file, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
