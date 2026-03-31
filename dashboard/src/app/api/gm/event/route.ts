import { NextRequest, NextResponse } from "next/server";
import { execute, query } from "@/lib/db";
import { readFileSync, writeFileSync } from "fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { PATHS } from "@/lib/cosmic";

export async function POST(request: NextRequest) {
  try {
    const { name, mapId, mobs, bonusDrops, announcement, world = 0, expiresInHours } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Event name is required" }, { status: 400 });
    }

    const actions: string[] = [];
    const plifeIds: number[] = [];
    const globalDropIds: number[] = [];
    const mobDropIds: number[] = [];

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
          const result = await execute(
            `INSERT INTO plife (world, map, life, type, cy, f, fh, rx0, rx1, x, y, mobtime)
             VALUES (?, ?, ?, 'm', ?, 0, 0, ?, ?, ?, ?, ?)`,
            [world, mapId, id, y, x - 50, x + 50, x + (i * 30), y, mobtime]
          );
          if (result.insertId) plifeIds.push(result.insertId);
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
          const result = await execute(
            "INSERT INTO drop_data (dropperid, itemid, minimum_quantity, maximum_quantity, questid, chance) VALUES (?, ?, ?, ?, 0, ?)",
            [mobId, itemId, minQty, maxQty, chance]
          );
          if (result.insertId) mobDropIds.push(result.insertId);
          actions.push(`Added drop: item ${itemId} from mob ${mobId} at ${chance}/1M chance`);
        } else {
          // Global drop (all mobs)
          const result = await execute(
            "INSERT INTO drop_data_global (continent, itemid, minimum_quantity, maximum_quantity, questid, chance, comments) VALUES (-1, ?, ?, ?, 0, ?, ?)",
            [itemId, minQty, maxQty, chance, `Event: ${name}`]
          );
          if (result.insertId) globalDropIds.push(result.insertId);
          actions.push(`Added global drop: item ${itemId} at ${chance}/1M chance`);
        }
      }
    }

    // 3. Update server announcement
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

    // 4. Track event in gm_events for lifecycle management
    let eventId: number | null = null;
    const expiresAt = expiresInHours
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ")
      : null;
    try {
      const metadata = JSON.stringify({
        mapId: mapId || null,
        plifeIds,
        globalDropIds,
        mobDropIds,
      });
      const result = await execute(
        "INSERT INTO gm_events (event_name, event_type, expires_at, metadata) VALUES (?, 'general', ?, ?)",
        [name, expiresAt, metadata]
      );
      eventId = result.insertId || null;
      if (expiresAt) actions.push(`Event will auto-expire at ${expiresAt} UTC`);
    } catch { /* gm_events table may not exist yet */ }

    return NextResponse.json({
      success: true,
      event: name,
      eventId,
      expiresAt,
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

    let trackedEvents: any[] = [];
    try {
      trackedEvents = await query(
        "SELECT id, event_name, event_type, created_at, expires_at, status, metadata FROM gm_events WHERE status = 'active' ORDER BY created_at DESC"
      );
    } catch { /* gm_events may not exist */ }

    return NextResponse.json({
      customSpawns: spawns,
      globalDrops,
      trackedEvents,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch event data", details: err.message }, { status: 500 });
  }
}

// DELETE: clean up event spawns
export async function DELETE(request: NextRequest) {
  try {
    const { mapId, mobId, clearGlobalDrops, eventId } = await request.json();

    const actions: string[] = [];

    // If eventId provided, clean up by tracked metadata
    if (eventId) {
      try {
        const [event] = await query<{ metadata: string; event_name: string }>(
          "SELECT metadata, event_name FROM gm_events WHERE id = ? AND status = 'active'",
          [eventId]
        );
        if (event) {
          const meta = typeof event.metadata === "string" ? JSON.parse(event.metadata) : event.metadata;
          if (meta.plifeIds?.length) {
            await execute(`DELETE FROM plife WHERE id IN (${meta.plifeIds.join(",")})`);
            actions.push(`Removed ${meta.plifeIds.length} spawns from event "${event.event_name}"`);
          }
          if (meta.globalDropIds?.length) {
            await execute(`DELETE FROM drop_data_global WHERE id IN (${meta.globalDropIds.join(",")})`);
            actions.push(`Removed ${meta.globalDropIds.length} global drops from event "${event.event_name}"`);
          }
          if (meta.mobDropIds?.length) {
            await execute(`DELETE FROM drop_data WHERE id IN (${meta.mobDropIds.join(",")})`);
            actions.push(`Removed ${meta.mobDropIds.length} mob drops from event "${event.event_name}"`);
          }
          if (meta.reactorIds?.length) {
            await execute(`DELETE FROM preactor WHERE id IN (${meta.reactorIds.join(",")})`);
            actions.push(`Removed ${meta.reactorIds.length} reactors from event "${event.event_name}"`);
          }
          if (meta.reactorDropIds?.length) {
            for (const rd of meta.reactorDropIds) {
              await execute("DELETE FROM reactordrops WHERE reactorid = ? AND itemid = ?", [rd.reactorId, rd.itemId]);
            }
            actions.push(`Removed ${meta.reactorDropIds.length} reactor drops from event "${event.event_name}"`);
          }
          await execute("UPDATE gm_events SET status = 'cleaned' WHERE id = ?", [eventId]);
          actions.push(`Marked event "${event.event_name}" as cleaned`);
        }
      } catch { /* gm_events may not exist */ }
    }

    // Legacy cleanup by map/mob/global drops
    if (mapId && mobId) {
      const result = await execute(
        "DELETE FROM plife WHERE map = ? AND life = ?",
        [mapId, mobId]
      );
      actions.push(`Removed ${result.affectedRows} custom spawns of mob ${mobId} from map ${mapId}`);
    } else if (mapId && !eventId) {
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
