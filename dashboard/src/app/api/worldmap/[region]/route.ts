import { NextRequest, NextResponse } from "next/server";

const MAPLESTORY_API = "https://maplestory.io/api/GMS/83";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ region: string }> }
) {
  const { region } = await params;

  try {
    const res = await fetch(`${MAPLESTORY_API}/map/worldmap/${region}`, {
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch world map data" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch world map data", details: err.message },
      { status: 500 }
    );
  }
}
