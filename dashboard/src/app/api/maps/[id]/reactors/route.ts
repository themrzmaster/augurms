import { NextRequest, NextResponse } from "next/server";
import { execute, query } from "@/lib/db";

// POST: Add a reactor spawn to a map (via preactor table — loaded by server on map init)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const mapId = parseInt(idStr);
  if (isNaN(mapId)) {
    return NextResponse.json({ error: "Invalid map ID" }, { status: 400 });
  }

  try {
    const { reactorId, x, y, f = 0, reactorTime = -1, name = "", world = 0 } = await request.json();

    if (!reactorId || x === undefined || y === undefined) {
      return NextResponse.json(
        { error: "Required fields: reactorId, x, y" },
        { status: 400 },
      );
    }

    // Custom reactors (9900000+) must be published — otherwise the client has no
    // WZ asset for them and the map fails to render.
    if (reactorId >= 9900000) {
      const [row] = await query<{ published: number }>(
        "SELECT published FROM custom_reactors WHERE reactor_id = ?",
        [reactorId],
      );
      if (!row) {
        return NextResponse.json(
          { error: `Reactor ${reactorId} is in the custom ID range but not registered. Use create_custom_reactor first.` },
          { status: 400 },
        );
      }
      if (!row.published) {
        return NextResponse.json(
          { error: `Reactor ${reactorId} is not published yet. The client has no sprite for it, so placing it will break the map. Re-run create_custom_reactor or wait for the end-of-session publish pass.` },
          { status: 400 },
        );
      }
    }

    await execute(
      "INSERT INTO preactor (world, map, rid, x, y, f, reactor_time, name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [world, mapId, reactorId, x, y, f, reactorTime, name],
    );

    return NextResponse.json({
      success: true,
      message: `Added reactor ${reactorId} to map ${mapId} at (${x}, ${y}). Takes effect on server restart.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to add reactor", details: err.message },
      { status: 500 },
    );
  }
}

// GET: List reactor spawns on a map
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const mapId = parseInt(idStr);
  if (isNaN(mapId)) {
    return NextResponse.json({ error: "Invalid map ID" }, { status: 400 });
  }

  try {
    const rows = await query(
      "SELECT id, rid, x, y, f, reactor_time, name FROM preactor WHERE map = ? ORDER BY id",
      [mapId],
    );
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to list reactors", details: err.message },
      { status: 500 },
    );
  }
}

// DELETE: Remove a reactor spawn from a map
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const mapId = parseInt(idStr);
  if (isNaN(mapId)) {
    return NextResponse.json({ error: "Invalid map ID" }, { status: 400 });
  }

  try {
    const { reactorId, world = 0 } = await request.json();

    if (!reactorId) {
      return NextResponse.json(
        { error: "Required field: reactorId" },
        { status: 400 },
      );
    }

    const result = await execute(
      "DELETE FROM preactor WHERE map = ? AND rid = ? AND world = ?",
      [mapId, reactorId, world],
    );

    return NextResponse.json({
      success: true,
      message: `Removed ${result.affectedRows} reactor spawn(s) of ${reactorId} from map ${mapId}`,
      affectedRows: result.affectedRows,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to remove reactor", details: err.message },
      { status: 500 },
    );
  }
}
