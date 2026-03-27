import { NextRequest, NextResponse } from "next/server";
import { execute, query } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const mapId = parseInt(idStr);

  if (isNaN(mapId)) {
    return NextResponse.json({ error: "Invalid map ID" }, { status: 400 });
  }

  try {
    const body = await request.json() as {
      type: "m" | "n";
      id: number;
      x: number;
      y: number;
      fh?: number;
      mobtime?: number;
    };

    if (!body.type || !body.id || body.x === undefined || body.y === undefined) {
      return NextResponse.json(
        { error: "Required fields: type (m|n), id, x, y" },
        { status: 400 },
      );
    }

    const fh = body.fh || 0;
    const cy = body.y;
    const rx0 = body.x - 50;
    const rx1 = body.x + 50;
    const mobtime = body.mobtime ?? (body.type === "m" ? 0 : -1);

    await execute(
      `INSERT INTO plife (world, map, life, type, cy, f, fh, rx0, rx1, x, y, hide, mobtime)
       VALUES (0, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, ?)`,
      [mapId, body.id, body.type, cy, fh, rx0, rx1, body.x, body.y, mobtime]
    );

    return NextResponse.json({
      success: true,
      message: `Added ${body.type === "m" ? "mob" : "NPC"} ${body.id} to map ${mapId} at (${body.x}, ${body.y}). Takes effect on server restart.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to add spawn", details: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const mapId = parseInt(idStr);

  if (isNaN(mapId)) {
    return NextResponse.json({ error: "Invalid map ID" }, { status: 400 });
  }

  try {
    const body = await request.json() as { type: "m" | "n"; id: number };

    if (!body.type || body.id === undefined) {
      return NextResponse.json(
        { error: "Required fields: type (m|n), id" },
        { status: 400 },
      );
    }

    const result = await execute(
      "DELETE FROM plife WHERE map = ? AND life = ? AND type = ?",
      [mapId, body.id, body.type]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json(
        { error: `No spawn found with type=${body.type} and id=${body.id} on map ${mapId}` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Removed ${result.affectedRows} ${body.type === "m" ? "mob" : "NPC"} spawn(s) with id ${body.id} from map ${mapId}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to remove spawn", details: err.message }, { status: 500 });
  }
}
