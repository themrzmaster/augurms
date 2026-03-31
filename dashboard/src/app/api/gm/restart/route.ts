import { NextResponse } from "next/server";
import { restartGameServer } from "@/lib/fly-restart";

export const dynamic = "force-dynamic";

// GET /api/gm/restart — Manual trigger to restart the game server
export async function GET() {
  try {
    const machineId = await restartGameServer();
    return NextResponse.json({ action: "restarted", machine: machineId });
  } catch (err: any) {
    return NextResponse.json(
      { action: "error", error: err.message },
      { status: 500 },
    );
  }
}
