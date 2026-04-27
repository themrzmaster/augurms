import { NextRequest, NextResponse } from "next/server";
import { getWzCached, searchWz } from "@/lib/wz/explorer";
import { ensureServerXml, searchServerXml } from "@/lib/wz/server-xml";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source") || "client";
  const file = request.nextUrl.searchParams.get("file");
  const q = request.nextUrl.searchParams.get("q") || "";
  const limitRaw = parseInt(
    request.nextUrl.searchParams.get("limit") || "100",
    10
  );
  const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 100));
  const force = request.nextUrl.searchParams.get("force") === "1";

  if (q.length < 2) {
    return NextResponse.json({ error: "q must be at least 2 chars" }, { status: 400 });
  }

  try {
    if (source === "server") {
      await ensureServerXml();
      const result = searchServerXml(q, limit);
      return NextResponse.json({ source: "server", ...result });
    }
    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const wzInfo = await getWzCached(file, { force });
    const result = searchWz(file, wzInfo, q, limit);
    return NextResponse.json({ source: "client", file, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
