import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  const { shopId: shopIdStr } = await params;
  const shopId = parseInt(shopIdStr);

  if (isNaN(shopId)) {
    return NextResponse.json({ error: "Invalid shop ID" }, { status: 400 });
  }

  try {
    const shop = await query<{ shopid: number; npcid: number }>(
      "SELECT shopid, npcid FROM shops WHERE shopid = ?",
      [shopId]
    );

    if (shop.length === 0) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const items = await query<{ shopid: number; itemid: number; price: number; pitch: number; position: number }>(
      "SELECT shopid, itemid, price, pitch, position FROM shopitems WHERE shopid = ? ORDER BY position",
      [shopId]
    );

    return NextResponse.json({
      shop: shop[0],
      items,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch shop items", details: err.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  const { shopId: shopIdStr } = await params;
  const shopId = parseInt(shopIdStr);

  if (isNaN(shopId)) {
    return NextResponse.json({ error: "Invalid shop ID" }, { status: 400 });
  }

  try {
    const { itemId, price, pitch = 0 } = await request.json();

    if (!itemId || isNaN(itemId) || price == null || isNaN(price)) {
      return NextResponse.json({ error: "itemId and price are required" }, { status: 400 });
    }

    // Get next position
    const [maxPos] = await query<{ maxPos: number | null }>(
      "SELECT MAX(position) as maxPos FROM shopitems WHERE shopid = ?",
      [shopId]
    );
    const nextPos = (maxPos?.maxPos ?? -1) + 1;

    await execute(
      "INSERT INTO shopitems (shopid, itemid, price, pitch, position) VALUES (?, ?, ?, ?, ?)",
      [shopId, itemId, price, pitch, nextPos]
    );

    return NextResponse.json({
      success: true,
      message: `Added item ${itemId} to shop ${shopId} at price ${price}`,
      position: nextPos,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to add shop item", details: err.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  const { shopId: shopIdStr } = await params;
  const shopId = parseInt(shopIdStr);

  if (isNaN(shopId)) {
    return NextResponse.json({ error: "Invalid shop ID" }, { status: 400 });
  }

  try {
    const { itemId, price } = await request.json();

    if (!itemId || price == null) {
      return NextResponse.json({ error: "itemId and price are required" }, { status: 400 });
    }

    const result = await execute(
      "UPDATE shopitems SET price = ? WHERE shopid = ? AND itemid = ?",
      [price, shopId, itemId]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "Item not found in this shop" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `Updated price of item ${itemId} in shop ${shopId} to ${price}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to update shop item", details: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  const { shopId: shopIdStr } = await params;
  const shopId = parseInt(shopIdStr);

  if (isNaN(shopId)) {
    return NextResponse.json({ error: "Invalid shop ID" }, { status: 400 });
  }

  try {
    const { itemId } = await request.json();

    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    const result = await execute(
      "DELETE FROM shopitems WHERE shopid = ? AND itemid = ?",
      [shopId, itemId]
    );

    return NextResponse.json({
      success: true,
      message: `Removed item ${itemId} from shop ${shopId}`,
      affectedRows: result.affectedRows,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to remove shop item", details: err.message }, { status: 500 });
  }
}
