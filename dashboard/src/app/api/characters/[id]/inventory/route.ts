import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";
import { getItemCategory } from "@/lib/cosmic";

const CATEGORY_TO_INVTYPE: Record<string, number> = {
  equip: 1,
  consume: 2,
  setup: 3,
  etc: 4,
  cash: 5,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const charId = parseInt(idStr);

  if (isNaN(charId)) {
    return NextResponse.json({ error: "Invalid character ID" }, { status: 400 });
  }

  try {
    const { itemId, quantity = 1 } = await request.json();

    if (!itemId || isNaN(itemId)) {
      return NextResponse.json({ error: "Invalid item ID" }, { status: 400 });
    }

    // Get character's accountid
    const chars = await query<{ accountid: number }>(
      "SELECT accountid FROM characters WHERE id = ?",
      [charId],
    );
    if (chars.length === 0) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    const accountId = chars[0].accountid;

    // Determine inventory type from item category
    const category = getItemCategory(itemId);
    const invType = CATEGORY_TO_INVTYPE[category] || 4;

    // Find next available position in that inventory tab
    const rows = await query<{ maxPos: number | null }>(
      "SELECT MAX(position) as maxPos FROM inventoryitems WHERE characterid = ? AND inventorytype = ? AND position > 0",
      [charId, invType],
    );
    const nextPos = (rows[0]?.maxPos ?? 0) + 1;

    // type=1 means normal item (not equip instance)
    const itemType = category === "equip" ? 1 : 2;

    await execute(
      `INSERT INTO inventoryitems (type, characterid, accountid, itemid, inventorytype, position, quantity, owner, petid, flag, expiration, giftFrom)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', -1, 0, -1, '')`,
      [itemType, charId, accountId, itemId, invType, nextPos, quantity],
    );

    return NextResponse.json({
      success: true,
      message: `Added ${quantity}x item ${itemId} to character ${charId}`,
      position: nextPos,
      inventoryType: invType,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to give item", details: err.message },
      { status: 500 },
    );
  }
}
