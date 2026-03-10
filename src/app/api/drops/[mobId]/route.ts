import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mobId: string }> }
) {
  const { mobId: mobIdStr } = await params;
  const mobId = parseInt(mobIdStr);

  if (isNaN(mobId)) {
    return NextResponse.json({ error: "Invalid mob ID" }, { status: 400 });
  }

  try {
    const rows = await query(
      "SELECT id, dropperid, itemid, minimum_quantity, maximum_quantity, questid, chance FROM drop_data WHERE dropperid = ?",
      [mobId],
    );
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to query drops. Is the database running?", details: err.message },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mobId: string }> }
) {
  const { mobId: mobIdStr } = await params;
  const mobId = parseInt(mobIdStr);

  if (isNaN(mobId)) {
    return NextResponse.json({ error: "Invalid mob ID" }, { status: 400 });
  }

  try {
    const body = await request.json() as {
      itemId: number;
      chance: number;
      minQuantity?: number;
      maxQuantity?: number;
      questId?: number;
    };

    if (!body.itemId || body.chance === undefined) {
      return NextResponse.json(
        { error: "Required fields: itemId, chance" },
        { status: 400 },
      );
    }

    const result = await execute(
      "INSERT INTO drop_data (dropperid, itemid, minimum_quantity, maximum_quantity, questid, chance) VALUES (?, ?, ?, ?, ?, ?)",
      [
        mobId,
        body.itemId,
        body.minQuantity ?? 1,
        body.maxQuantity ?? 1,
        body.questId ?? 0,
        body.chance,
      ],
    );

    return NextResponse.json(
      { success: true, message: "Drop added", insertId: result.insertId },
      { status: 201 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to add drop. Is the database running?", details: err.message },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ mobId: string }> }
) {
  const { mobId: mobIdStr } = await params;
  const mobId = parseInt(mobIdStr);

  if (isNaN(mobId)) {
    return NextResponse.json({ error: "Invalid mob ID" }, { status: 400 });
  }

  try {
    const body = await request.json() as {
      itemId: number;
      chance?: number;
      minQuantity?: number;
      maxQuantity?: number;
    };

    if (!body.itemId) {
      return NextResponse.json({ error: "Required field: itemId" }, { status: 400 });
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (body.chance !== undefined) { updates.push("chance = ?"); values.push(body.chance); }
    if (body.minQuantity !== undefined) { updates.push("minimum_quantity = ?"); values.push(body.minQuantity); }
    if (body.maxQuantity !== undefined) { updates.push("maximum_quantity = ?"); values.push(body.maxQuantity); }

    if (updates.length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    values.push(mobId, body.itemId);
    const result = await execute(
      `UPDATE drop_data SET ${updates.join(", ")} WHERE dropperid = ? AND itemid = ?`,
      values,
    );

    if (result.affectedRows === 0) {
      return NextResponse.json(
        { error: `No drop entry found for mob ${mobId} with item ${body.itemId}` },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, affectedRows: result.affectedRows });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to update drop", details: err.message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ mobId: string }> }
) {
  const { mobId: mobIdStr } = await params;
  const mobId = parseInt(mobIdStr);

  if (isNaN(mobId)) {
    return NextResponse.json({ error: "Invalid mob ID" }, { status: 400 });
  }

  try {
    const body = await request.json() as { itemId: number };

    if (!body.itemId) {
      return NextResponse.json({ error: "Required field: itemId" }, { status: 400 });
    }

    const result = await execute(
      "DELETE FROM drop_data WHERE dropperid = ? AND itemid = ?",
      [mobId, body.itemId],
    );

    if (result.affectedRows === 0) {
      return NextResponse.json(
        { error: `No drop entry found for mob ${mobId} with item ${body.itemId}` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Drop removed",
      affectedRows: result.affectedRows,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to remove drop. Is the database running?", details: err.message },
      { status: 500 },
    );
  }
}
