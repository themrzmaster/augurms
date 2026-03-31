const FLY_APP = "augur-ms-game";

export async function restartGameServer(): Promise<string> {
  const token = process.env.FLY_API_TOKEN;
  if (!token) throw new Error("FLY_API_TOKEN not set");

  const listRes = await fetch(
    `https://api.machines.dev/v1/apps/${FLY_APP}/machines`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!listRes.ok) throw new Error(`List machines failed: ${listRes.status}`);
  const machines = await listRes.json();

  if (!machines.length) throw new Error("No machines found");

  const machine = machines[0];

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
