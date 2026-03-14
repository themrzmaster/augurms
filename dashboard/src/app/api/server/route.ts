import { NextRequest, NextResponse } from "next/server";
import { createConnection, Socket } from "net";
import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import { query } from "@/lib/db";
import { PATHS } from "@/lib/cosmic";

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
    let gmModel = "moonshotai/kimi-k2.5";
    let rates = { exp: 1, drop: 1, meso: 1 };

    // Read rates from actual game config (source of truth)
    try {
      const content = readFileSync(PATHS.config, "utf-8");
      const config = parseYaml(content);
      const world = config?.worlds?.[0];
      if (world) {
        rates = {
          exp: world.exp_rate || 1,
          drop: world.drop_rate || 1,
          meso: world.meso_rate || 1,
        };
      }
    } catch {}

    // Read GM model from DB
    try {
      const [row] = await query("SELECT model FROM gm_schedule WHERE id = 1");
      const r = row as any;
      if (r?.model) gmModel = r.model;
    } catch {}

    return NextResponse.json({
      status: online ? "running" : "stopped",
      gmModel,
      rates,
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
