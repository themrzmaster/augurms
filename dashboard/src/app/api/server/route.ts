import { NextRequest, NextResponse } from "next/server";
import { createConnection, Socket } from "net";

const GAME_HOST = process.env.GAME_SERVER_HOST || "augur-ms-game.internal";
const LOGIN_PORT = 8484;

/** Check if the game server is reachable by TCP connecting to the login port */
function tcpCheck(host: string, port: number, timeout = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new Socket();
    sock.setTimeout(timeout);
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("timeout", () => { sock.destroy(); resolve(false); });
    sock.once("error", () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  });
}

export async function GET() {
  try {
    const online = await tcpCheck(GAME_HOST, LOGIN_PORT);
    return NextResponse.json({
      status: online ? "running" : "stopped",
    });
  } catch {
    return NextResponse.json({
      status: "stopped",
    });
  }
}

export async function POST(request: NextRequest) {
  // Server control via Fly Machines API could be added here in the future
  return NextResponse.json(
    { error: "Server control is managed via Fly.io" },
    { status: 501 },
  );
}
