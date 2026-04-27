import { NextRequest, NextResponse } from "next/server";
import { getCanvasPng, getWzCached } from "@/lib/wz/explorer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get("file");
  const path = request.nextUrl.searchParams.get("path");
  const prop = request.nextUrl.searchParams.get("prop");
  const force = request.nextUrl.searchParams.get("force") === "1";

  if (!file || !path || !prop) {
    return NextResponse.json(
      { error: "file, path, and prop are required" },
      { status: 400 }
    );
  }

  try {
    const wzInfo = await getWzCached(file, { force });
    const result = getCanvasPng(wzInfo, path, prop);
    return new Response(new Uint8Array(result.png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=300",
        "X-Canvas-Width": String(result.width),
        "X-Canvas-Height": String(result.height),
        "X-Canvas-Format": String(result.format),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
