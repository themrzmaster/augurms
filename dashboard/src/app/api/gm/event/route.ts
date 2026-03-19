import { NextRequest, NextResponse } from "next/server";
import { execute, query } from "@/lib/db";
import { readFileSync, writeFileSync } from "fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { PATHS } from "@/lib/cosmic";

export async function POST(request: NextRequest) {
  try {
    const { name, mapId, mobs, bonusDrops, announcement, world = 0 } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Event name is required" }, { status: 400 });
    }

    const actions: string[] = [];

    // 1. Add mob spawns to the map via plife table
    if (Array.isArray(mobs) && mobs.length > 0 && mapId) {
      for (const mob of mobs) {
        // Accept common AI field name variations
        const id = mob.id ?? mob.mobId ?? mob.lifeId;
        const count = Math.min(mob.count ?? 1, 20);
        const x = mob.x ?? 0;
        const y = mob.y ?? 0;
        const mobtime = mob.mobtime ?? mob.respawnTime ?? mob.respawn ?? 0;
        if (!id) continue;
        for (let i = 0; i < count; i++) {
          await execute(
            `INSERT INTO plife (world, map, life, type, cy, f, fh, rx0, rx1, x, y, mobtime)
             VALUES (?, ?, ?, 'm', ?, 0, 0, ?, ?, ?, ?, ?)`,
            [world, mapId, id, y, x - 50, x + 50, x + (i * 30), y, mobtime]
          );
        }
        actions.push(`Spawned ${count}x mob ${id} on map ${mapId}`);
      }
    }

    // 2. Add bonus drops (mob-specific or global)
    if (Array.isArray(bonusDrops) && bonusDrops.length > 0) {
      for (const drop of bonusDrops) {
        // Accept common AI field name variations
        const mobId = drop.mobId ?? drop.dropperId;
        const itemId = drop.itemId ?? drop.itemid ?? drop.item_id;
        // Normalize chance: if < 1 treat as fraction (0.3 = 30%), convert to out-of-1M
        let chance = drop.chance ?? 100000;
        if (chance > 0 && chance < 1) chance = Math.round(chance * 1000000);
        const minQty = drop.minQuantity ?? drop.minimum_quantity ?? drop.min ?? 1;
        const maxQty = drop.maxQuantity ?? drop.maximum_quantity ?? drop.max ?? 1;
        if (!itemId) continue;

        if (mobId) {
          // Mob-specific drop
          await execute(
            "INSERT INTO drop_data (dropperid, itemid, minimum_quantity, maximum_quantity, questid, chance) VALUES (?, ?, ?, ?, 0, ?)",
            [mobId, itemId, minQty, maxQty, chance]
          );
          actions.push(`Added drop: item ${itemId} from mob ${mobId} at ${chance}/1M chance`);
        } else {
          // Global drop (all mobs)
          await execute(
            "INSERT INTO drop_data_global (continent, itemid, minimum_quantity, maximum_quantity, questid, chance, comments) VALUES (-1, ?, ?, ?, 0, ?, ?)",
            [itemId, minQty, maxQty, chance, `Event: ${name}`]
          );
          actions.push(`Added global drop: item ${itemId} at ${chance}/1M chance`);
        }
      }
    }

    // 4. Update server announcement
    if (announcement) {
      try {
        const configContent = readFileSync(PATHS.config, "utf-8");
        const config = parseYaml(configContent);
        if (config.worlds?.[world]) {
          config.worlds[world].server_message = announcement;
          config.worlds[world].event_message = announcement;
          writeFileSync(PATHS.config, stringifyYaml(config, { lineWidth: 0 }), "utf-8");
          actions.push(`Updated server message: "${announcement}"`);
        }
      } catch { /* ignore config errors */ }
    }

    return NextResponse.json({
      success: true,
      event: name,
      actions,
      note: "Spawns added to plife table take effect on server restart. Drop changes are live.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to create event", details: err.message }, { status: 500 });
  }
}

// GET: list active custom spawns (events)
export async function GET() {
  try {
    const spawns = await query<{
      world: number; map: number; life: number; type: string;
      x: number; y: number; mobtime: number;
    }>(
      "SELECT world, map, life, type, x, y, mobtime FROM plife ORDER BY map, life"
    );

    const globalDrops = await query<{
      itemid: number; chance: number; minimum_quantity: number;
      maximum_quantity: number; comments: string;
    }>(
      "SELECT itemid, chance, minimum_quantity, maximum_quantity, comments FROM drop_data_global"
    );

    return NextResponse.json({
      customSpawns: spawns,
      globalDrops,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch event data", details: err.message }, { status: 500 });
  }
}

// DELETE: clean up event spawns
export async function DELETE(request: NextRequest) {
  try {
    const { mapId, mobId, clearGlobalDrops } = await request.json();

    const actions: string[] = [];

    if (mapId && mobId) {
      const result = await execute(
        "DELETE FROM plife WHERE map = ? AND life = ?",
        [mapId, mobId]
      );
      actions.push(`Removed ${result.affectedRows} custom spawns of mob ${mobId} from map ${mapId}`);
    } else if (mapId) {
      const result = await execute("DELETE FROM plife WHERE map = ?", [mapId]);
      actions.push(`Removed ${result.affectedRows} custom spawns from map ${mapId}`);
    }

    if (clearGlobalDrops) {
      const result = await execute("DELETE FROM drop_data_global WHERE comments LIKE 'Event:%'");
      actions.push(`Removed ${result.affectedRows} event global drops`);
    }

    return NextResponse.json({ success: true, actions });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to clean up event", details: err.message }, { status: 500 });
  }
}
