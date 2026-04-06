import { NextRequest, NextResponse } from "next/server";
import { execute, query } from "@/lib/db";
import { readdirSync, readFileSync } from "fs";
import { PATHS } from "@/lib/cosmic";

// Pick a random visible reactor ID from WZ files
function pickVisibleReactor(): number {
  const FALLBACK = 1302000; // Ereve chest — known visible
  try {
    const files = readdirSync(PATHS.reactorWz).filter((f) => f.endsWith(".img.xml"));
    const visible: number[] = [];
    for (const file of files) {
      const id = parseInt(file.replace(".img.xml", ""));
      if (isNaN(id)) continue;
      try {
        const content = readFileSync(`${PATHS.reactorWz}/${file}`, "utf-8");
        const state0 = content.match(/<imgdir name="0">([\s\S]*?)<\/imgdir>/);
        if (!state0) continue;
        const canvas = state0[1].match(/<canvas name="0" width="(\d+)" height="(\d+)"/);
        if (!canvas) continue;
        const w = parseInt(canvas[1]), h = parseInt(canvas[2]);
        // Must have a script to drop items, and be visibly sized
        if (w > 20 && h > 20) {
          try {
            readFileSync(`${PATHS.scripts}/reactor/${id}.js`, "utf-8");
            visible.push(id);
          } catch {} // no script = skip
        }
      } catch {}
    }
    if (visible.length === 0) return FALLBACK;
    return visible[Math.floor(Math.random() * visible.length)];
  } catch {
    return FALLBACK;
  }
}

// Auto-pick spawn coordinates from existing map life data
async function pickMapCoordinates(mapId: number): Promise<{ x: number; y: number }> {
  try {
    const res = await fetch(`${process.env.COSMIC_DASHBOARD_URL || "http://localhost:3000"}/api/maps/${mapId}`);
    const data = await res.json();
    const life = data?.life;
    if (Array.isArray(life) && life.length > 0) {
      // Pick a random existing spawn point — guaranteed walkable
      const spawn = life[Math.floor(Math.random() * life.length)];
      return { x: spawn.x ?? 0, y: spawn.y ?? 0 };
    }
    // Fallback: try portals
    const portals = data?.portals;
    if (Array.isArray(portals) && portals.length > 0) {
      const portal = portals[Math.floor(Math.random() * portals.length)];
      return { x: portal.x ?? 0, y: portal.y ?? 0 };
    }
  } catch {}
  return { x: 0, y: 0 };
}

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

    // Pick a visible reactor: use provided reactorId, or auto-select one that renders in client
    const rid = reactorId || pickVisibleReactor();

    const actions: string[] = [];
    const reactorIds: number[] = [];
    const reactorDropIds: { reactorId: number; itemId: number }[] = [];

    // 1. Place reactors on each map
    for (const loc of locations) {
      const mapId = loc.mapId ?? loc.map;
      if (!mapId) continue;

      // Auto-pick coordinates if not provided
      const hasCoords = loc.x !== undefined && loc.y !== undefined;
      const { x: baseX, y: baseY } = hasCoords ? { x: loc.x, y: loc.y } : await pickMapCoordinates(mapId);
      const count = Math.min(loc.count ?? 1, 10);
      const reactorTime = loc.reactorTime ?? loc.respawnTime ?? -1; // -1 = no respawn (one-time break)

      for (let i = 0; i < count; i++) {
        const result = await execute(
          "INSERT INTO preactor (world, map, rid, x, y, f, reactor_time, name) VALUES (0, ?, ?, ?, ?, 0, ?, ?)",
          [mapId, rid, baseX + (i * 40), baseY, reactorTime, `TH: ${name}`]
        );
        if (result.insertId) reactorIds.push(result.insertId);
      }
      actions.push(`Placed ${count}x reactor ${rid} on map ${mapId} at (${baseX}, ${baseY})`);
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
