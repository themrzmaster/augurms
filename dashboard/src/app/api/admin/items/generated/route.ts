import { NextRequest, NextResponse } from "next/server";
import { listGenerated, type GeneratedItemStatus } from "@/lib/gm/generated-items";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const statusParam = request.nextUrl.searchParams.get("status");
  const sessionId = request.nextUrl.searchParams.get("session_id");
  const sinceDays = request.nextUrl.searchParams.get("since_days");
  const limit = request.nextUrl.searchParams.get("limit");

  try {
    const items = await listGenerated({
      status: statusParam
        ? (statusParam.split(",") as GeneratedItemStatus[])
        : undefined,
      sessionId: sessionId ?? undefined,
      sinceDays: sinceDays ? parseInt(sinceDays) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
    return NextResponse.json({ items });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
