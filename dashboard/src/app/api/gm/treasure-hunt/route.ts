import { NextRequest, NextResponse } from "next/server";
import { execute, query } from "@/lib/db";

// POST: Create a treasure hunt — place reactors across maps with item drops
export async function POST(request: NextRequest) {
  try {
    const { name, locations, drops, announcement, expiresInHours, reactorId } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Treasure hunt name is required" }, { status: 400 });
    }
    if (!Array.isArray(locations) || locations.length === 0) {
      return NextResponse.json({ error: "At least one location is required" }, { status: 400 });
    }
    if (!Array.isArray(drops) || drops.length === 0) {
      return NextResponse.json({ error: "At least one drop item is required" }, { status: 400 });
    }

    // Default reactor: use provided reactorId or 2002000 (a common box reactor)
    const rid = reactorId || 2002000;

    const actions: string[] = [];
    const reactorIds: number[] = [];
    const reactorDropIds: { reactorId: number; itemId: number }[] = [];

    // 1. Place reactors on each map
    for (const loc of locations) {
      const mapId = loc.mapId ?? loc.map;
      const x = loc.x ?? 0;
      const y = loc.y ?? 0;
      const count = Math.min(loc.count ?? 1, 10);
      const reactorTime = loc.reactorTime ?? loc.respawnTime ?? -1; // -1 = no respawn (one-time break)
      if (!mapId) continue;

      for (let i = 0; i < count; i++) {
        const result = await execute(
          "INSERT INTO preactor (world, map, rid, x, y, f, reactor_time, name) VALUES (0, ?, ?, ?, ?, 0, ?, ?)",
          [mapId, rid, x + (i * 40), y, reactorTime, `TH: ${name}`]
        );
        if (result.insertId) reactorIds.push(result.insertId);
      }
      actions.push(`Placed ${count}x reactor ${rid} on map ${mapId} at (${x}, ${y})`);
    }

    // 2. Configure drops for the reactor
    for (const drop of drops) {
      const itemId = drop.itemId ?? drop.item_id;
      const chance = drop.chance ?? 50; // reactor drops use 1-100 scale
      const questId = drop.questId ?? -1;
      if (!itemId) continue;

      // Check if this reactor already has this drop to avoid duplicates
      const existing = await query(
        "SELECT reactordropid FROM reactordrops WHERE reactorid = ? AND itemid = ?",
        [rid, itemId]
      );
      if (existing.length === 0) {
        await execute(
          "INSERT INTO reactordrops (reactorid, itemid, chance, questid) VALUES (?, ?, ?, ?)",
          [rid, itemId, chance, questId]
        );
        reactorDropIds.push({ reactorId: rid, itemId });
        actions.push(`Added drop: item ${itemId} to reactor ${rid} at ${chance}% chance`);
      } else {
        actions.push(`Reactor ${rid} already drops item ${itemId} — skipped`);
      }
    }

    // 3. Track as event in gm_events
    let eventId: number | null = null;
    const expiresAt = expiresInHours
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ")
      : null;
    try {
      const metadata = JSON.stringify({
        reactorIds,
        reactorDropIds,
        reactorTemplateId: rid,
        locations: locations.map((l: any) => l.mapId ?? l.map),
      });
      const result = await execute(
        "INSERT INTO gm_events (event_name, event_type, expires_at, metadata) VALUES (?, 'treasure_hunt', ?, ?)",
        [name, expiresAt, metadata]
      );
      eventId = result.insertId || null;
      if (expiresAt) actions.push(`Treasure hunt will auto-expire at ${expiresAt} UTC`);
    } catch { /* gm_events may not exist */ }

    // 4. Set server announcement if provided
    if (announcement) {
      try {
        // Use the announce API internally
        await fetch(`${process.env.COSMIC_DASHBOARD_URL || "http://localhost:3000"}/api/gm/announce`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: announcement }),
        });
        actions.push(`Server announcement: "${announcement}"`);
      } catch { /* ignore */ }
    }

    return NextResponse.json({
      success: true,
      treasureHunt: name,
      eventId,
      reactorId: rid,
      reactorsPlaced: reactorIds.length,
      dropsConfigured: reactorDropIds.length,
      expiresAt,
      actions,
      note: "Reactor placements take effect on server restart. Reactor drops are loaded from DB on map init.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to create treasure hunt", details: err.message }, { status: 500 });
  }
}
