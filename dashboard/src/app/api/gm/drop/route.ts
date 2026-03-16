import { NextRequest, NextResponse } from "next/server";

const GAME_API_URL = process.env.GAME_API_URL || "http://augur-ms-game.internal:8585";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemId, quantity = 1, characterName, characterId, mapId, x, y, world = 0 } = body;

    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    if (!characterName && !characterId && !(mapId && x !== undefined && y !== undefined)) {
      return NextResponse.json(
        { error: "Provide characterName or characterId (online player), or mapId + x + y" },
        { status: 400 },
      );
    }

    const res = await fetch(`${GAME_API_URL}/drop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, quantity, characterName, characterId, mapId, x, y, world }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to spawn drop. Is the game server running?", details: err.message },
      { status: 500 },
    );
  }
}
