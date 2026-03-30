import { NextRequest, NextResponse } from "next/server";

const MAPLESTORY_API = "https://maplestory.io/api/GMS/83";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const res = await fetch(`${MAPLESTORY_API}/map/${id}`, {
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch map info" },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Return only what we need for coordinate mapping
    const miniMap = data.miniMap
      ? {
          centerX: data.miniMap.centerX,
          centerY: data.miniMap.centerY,
          width: data.miniMap.width,
          height: data.miniMap.height,
          magnification: data.miniMap.magnification,
        }
      : null;

    return NextResponse.json(
      { miniMap, name: data.name, streetName: data.streetName },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch map info", details: err.message },
      { status: 500 }
    );
  }
}
