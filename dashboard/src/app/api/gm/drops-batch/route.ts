import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

export async function PUT(request: NextRequest) {
  try {
    const { changes } = await request.json();

    if (!Array.isArray(changes) || changes.length === 0) {
      return NextResponse.json({ error: "changes array is required" }, { status: 400 });
    }

    if (changes.length > 100) {
      return NextResponse.json({ error: "Max 100 changes per batch" }, { status: 400 });
    }

    const results: Array<{ mobId: number; action: string; success: boolean; detail?: string; error?: string }> = [];

    for (const change of changes) {
      const { mobId, add, remove, update } = change;

      if (!mobId) {
        results.push({ mobId: 0, action: "unknown", success: false, error: "mobId required" });
        continue;
      }

      // Add new drops
      if (Array.isArray(add)) {
        for (const drop of add) {
          try {
            const { itemId, chance = 100000, minQuantity = 1, maxQuantity = 1, questId = 0 } = drop;
            if (!itemId) {
              results.push({ mobId, action: "add", success: false, error: "itemId required" });
              continue;
            }
            await execute(
              "INSERT INTO drop_data (dropperid, itemid, minimum_quantity, maximum_quantity, questid, chance) VALUES (?, ?, ?, ?, ?, ?)",
              [mobId, itemId, minQuantity, maxQuantity, questId, chance]
            );
            results.push({ mobId, action: "add", success: true, detail: `Added item ${itemId} with chance ${chance}` });
          } catch (err: any) {
            results.push({ mobId, action: "add", success: false, error: err.message });
          }
        }
      }

      // Remove drops
      if (Array.isArray(remove)) {
        for (const drop of remove) {
          try {
            const { itemId } = drop;
            if (!itemId) {
              results.push({ mobId, action: "remove", success: false, error: "itemId required" });
              continue;
            }
            const result = await execute(
              "DELETE FROM drop_data WHERE dropperid = ? AND itemid = ?",
              [mobId, itemId]
            );
            results.push({ mobId, action: "remove", success: true, detail: `Removed item ${itemId} (${result.affectedRows} rows)` });
          } catch (err: any) {
            results.push({ mobId, action: "remove", success: false, error: err.message });
          }
        }
      }

      // Update existing drops (change chance/quantities)
      if (Array.isArray(update)) {
        for (const drop of update) {
          try {
            const { itemId, chance, minQuantity, maxQuantity } = drop;
            if (!itemId) {
              results.push({ mobId, action: "update", success: false, error: "itemId required" });
              continue;
            }

            const sets: string[] = [];
            const params: any[] = [];
            if (chance != null) { sets.push("chance = ?"); params.push(chance); }
            if (minQuantity != null) { sets.push("minimum_quantity = ?"); params.push(minQuantity); }
            if (maxQuantity != null) { sets.push("maximum_quantity = ?"); params.push(maxQuantity); }

            if (sets.length === 0) {
              results.push({ mobId, action: "update", success: false, error: "No fields to update" });
              continue;
            }

            params.push(mobId, itemId);
            const result = await execute(
              `UPDATE drop_data SET ${sets.join(", ")} WHERE dropperid = ? AND itemid = ?`,
              params
            );
            results.push({ mobId, action: "update", success: true, detail: `Updated item ${itemId} (${result.affectedRows} rows)` });
          } catch (err: any) {
            results.push({ mobId, action: "update", success: false, error: err.message });
          }
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    return NextResponse.json({
      success: true,
      message: `Processed ${successCount}/${results.length} operations`,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to batch update drops", details: err.message }, { status: 500 });
  }
}
