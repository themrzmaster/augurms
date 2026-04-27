import { NextRequest, NextResponse } from "next/server";
import { getWzCached, searchWz } from "@/lib/wz/explorer";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get("file");
  const q = request.nextUrl.searchParams.get("q") || "";
  const limitRaw = parseInt(
    request.nextUrl.searchParams.get("limit") || "100",
    10
  );
  const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 100));
  const force = request.nextUrl.searchParams.get("force") === "1";

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (q.length < 2) {
    return NextResponse.json({ error: "q must be at least 2 chars" }, { status: 400 });
  }

  try {
    const wzInfo = await getWzCached(file, { force });
    const result = searchWz(wzInfo, q, limit);
    return NextResponse.json({ file, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
