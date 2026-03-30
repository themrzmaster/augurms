import { NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

export const dynamic = "force-dynamic";

const FLY_APP = "augur-ms-game";

async function restartGameServer(): Promise<string> {
  const token = process.env.FLY_API_TOKEN;
  if (!token) throw new Error("FLY_API_TOKEN not set");

  // List machines for the game server app
  const listRes = await fetch(
    `https://api.machines.dev/v1/apps/${FLY_APP}/machines`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!listRes.ok) throw new Error(`List machines failed: ${listRes.status}`);
  const machines = await listRes.json();

  if (!machines.length) throw new Error("No machines found");

  const machine = machines[0];

  // Restart the machine
  const restartRes = await fetch(
    `https://api.machines.dev/v1/apps/${FLY_APP}/machines/${machine.id}/restart`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!restartRes.ok) throw new Error(`Restart failed: ${restartRes.status}`);

  return machine.id;
}

// GET /api/gm/restart — Called by cron at 06:00 UTC
// Restarts game server if restart_pending flag is set
export async function GET() {
  try {
    const rows = await query<{ config_value: string }>(
      "SELECT config_value FROM server_config WHERE config_key = 'restart_pending'",
    );

    if (!rows.length || rows[0].config_value !== "true") {
      return NextResponse.json({ action: "skip", reason: "no restart pending" });
    }

    const machineId = await restartGameServer();

    await execute(
      "UPDATE server_config SET config_value = 'false' WHERE config_key = 'restart_pending'",
    );

    return NextResponse.json({
      action: "restarted",
      machine: machineId,
      app: FLY_APP,
    });
  } catch (err: any) {
    return NextResponse.json(
      { action: "error", error: err.message },
      { status: 500 },
    );
  }
}
