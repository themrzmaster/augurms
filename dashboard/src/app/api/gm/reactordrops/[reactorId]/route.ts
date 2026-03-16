import { NextRequest, NextResponse } from "next/server";
import { execute, query } from "@/lib/db";

// GET: List drops for a reactor
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ reactorId: string }> },
) {
  const { reactorId: idStr } = await params;
  const reactorId = parseInt(idStr);
  if (isNaN(reactorId)) {
    return NextResponse.json({ error: "Invalid reactor ID" }, { status: 400 });
  }

  try {
    const drops = await query(
      "SELECT reactordropid, itemid, chance, questid FROM reactordrops WHERE reactorid = ? ORDER BY reactordropid",
      [reactorId],
    );
    return NextResponse.json({ reactorId, drops });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch reactor drops", details: err.message },
      { status: 500 },
    );
  }
}

// POST: Add a drop to a reactor
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reactorId: string }> },
) {
  const { reactorId: idStr } = await params;
  const reactorId = parseInt(idStr);
  if (isNaN(reactorId)) {
    return NextResponse.json({ error: "Invalid reactor ID" }, { status: 400 });
  }

  try {
    const { itemId, chance, questId = -1 } = await request.json();

    if (!itemId || !chance) {
      return NextResponse.json(
        { error: "Required fields: itemId, chance" },
        { status: 400 },
      );
    }

    const result = await execute(
      "INSERT INTO reactordrops (reactorid, itemid, chance, questid) VALUES (?, ?, ?, ?)",
      [reactorId, itemId, chance, questId],
    );

    return NextResponse.json({
      success: true,
      message: `Added item ${itemId} to reactor ${reactorId} drops`,
      insertId: result.insertId,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to add reactor drop", details: err.message },
      { status: 500 },
    );
  }
}

// DELETE: Remove a drop from a reactor
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ reactorId: string }> },
) {
  const { reactorId: idStr } = await params;
  const reactorId = parseInt(idStr);
  if (isNaN(reactorId)) {
    return NextResponse.json({ error: "Invalid reactor ID" }, { status: 400 });
  }

  try {
    const { itemId } = await request.json();

    if (!itemId) {
      return NextResponse.json(
        { error: "Required field: itemId" },
        { status: 400 },
      );
    }

    const result = await execute(
      "DELETE FROM reactordrops WHERE reactorid = ? AND itemid = ?",
      [reactorId, itemId],
    );

    return NextResponse.json({
      success: true,
      message: `Removed item ${itemId} from reactor ${reactorId} drops`,
      affectedRows: result.affectedRows,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to remove reactor drop", details: err.message },
      { status: 500 },
    );
  }
}
