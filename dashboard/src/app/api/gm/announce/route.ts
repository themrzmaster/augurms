import { NextRequest, NextResponse } from "next/server";

const GAME_API = process.env.GAME_API_URL || "http://augur-ms-game.internal:8585";

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Push to game server live via Admin API. Retry across the ~15-20s
    // auto-restart window that can follow GM tool calls that place content.
    const attempts = 4;
    const backoffMs = [0, 3000, 8000, 15000];
    let lastErr: unknown = null;
    let res: Response | null = null;
    for (let i = 0; i < attempts; i++) {
      if (backoffMs[i]) await new Promise((r) => setTimeout(r, backoffMs[i]));
      try {
        res = await fetch(`${GAME_API}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) break;
        lastErr = { status: res.status, body: await res.text().catch(() => "") };
      } catch (e) {
        lastErr = e;
      }
    }

    if (!res || !res.ok) {
      return NextResponse.json({
        success: false,
        error: "Game server unreachable after retries",
        details: lastErr instanceof Error ? lastErr.message : lastErr,
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
