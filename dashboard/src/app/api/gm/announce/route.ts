import { NextRequest, NextResponse } from "next/server";

const GAME_API = process.env.GAME_API_URL || "http://augur-ms-game.internal:8585";

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Push to game server live via Admin API
    const res = await fetch(`${GAME_API}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({
        success: false,
        error: "Game server rejected message update",
        details: err,
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      message: "Server message updated live",
      newMessage: message,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to update announcement", details: err.message },
      { status: 500 },
    );
  }
}
