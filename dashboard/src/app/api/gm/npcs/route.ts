import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

interface GmNpc {
  id: number;
  npc_id: number;
  name: string;
  type: string;
  config: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

// NPC IDs verified to have interactive WZ data (client `script` field)
// AND zero quest refs in Quest.wz. NPCs with quests get their clicks
// intercepted by the client (shows quest UI, no NPC talk packet sent).
const INTERACTIVE_NPC_IDS = new Set([
  9000018, // Matilda (woman with cat)
  9000003, // Vikan (warrior man)
  9000005, // Vikone (female character)
  9010005, // Diane (young woman)
  9010006, // Sally (young woman)
  9010007, // Josh (young man)
  9000035, // Agent P
  9000039, // Agent W
  9201117, // Toh Relicseeker
]);

function parseConfig(row: GmNpc) {
  return {
    ...row,
    config: typeof row.config === "string" ? JSON.parse(row.config) : row.config,
  };
}

// GET - list all custom NPCs, or get one by name query param
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  const npcId = searchParams.get("npcId");

  try {
    if (name) {
      const rows = await query<GmNpc>(
        "SELECT * FROM gm_npcs WHERE name = ?",
        [name],
      );
      if (rows.length === 0) {
        return NextResponse.json({ error: "Custom NPC not found" }, { status: 404 });
      }
      return NextResponse.json(parseConfig(rows[0]));
    }

    if (npcId) {
      const rows = await query<GmNpc>(
        "SELECT * FROM gm_npcs WHERE npc_id = ?",
        [parseInt(npcId)],
      );
      if (rows.length === 0) {
        return NextResponse.json({ error: "Custom NPC not found" }, { status: 404 });
      }
      return NextResponse.json(parseConfig(rows[0]));
    }

    const rows = await query<GmNpc>("SELECT * FROM gm_npcs ORDER BY created_at DESC");
    return NextResponse.json(rows.map(parseConfig));
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch custom NPCs", details: err.message },
      { status: 500 },
    );
  }
}

// POST - create a new custom NPC + auto-spawn on map
export async function POST(request: NextRequest) {
  try {
    const { npcId, name, type, config, mapId, x, y, fh } = await request.json();

    if (!name || !type || !config) {
      return NextResponse.json(
        { error: "name, type, and config are required" },
        { status: 400 },
      );
    }

    const validTypes = ["exchange", "dialogue", "teleporter"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 },
      );
    }

    // Validate NPC ID is from the interactive pool
    const chosenId = npcId || 9000018; // default to Matilda
    if (!INTERACTIVE_NPC_IDS.has(chosenId)) {
      return NextResponse.json(
        { error: `NPC ID ${chosenId} is not interactive. Use one of: ${[...INTERACTIVE_NPC_IDS].join(", ")}` },
        { status: 400 },
      );
    }

    // Normalize config: ensure "price" key is used (not "cost")
    const configObj = typeof config === "string" ? JSON.parse(config) : config;
    if (configObj.items) {
      for (const item of configObj.items) {
        if (item.cost !== undefined && item.price === undefined) {
          item.price = item.cost;
          delete item.cost;
        }
      }
    }
    // Auto-set currency_name if missing
    if (!configObj.currency_name && configObj.currency === "votepoints") {
      configObj.currency_name = "Vote Points";
    }

    const configStr = JSON.stringify(configObj);

    const result = await execute(
      "INSERT INTO gm_npcs (npc_id, name, type, config) VALUES (?, ?, ?, ?)",
      [chosenId, name, type, configStr],
    );

    // Auto-spawn on map if mapId + coords provided
    let spawnMessage = "";
    if (mapId !== undefined && x !== undefined && y !== undefined) {
      const foothold = fh || 0;
      const cy = y;
      const rx0 = x - 50;
      const rx1 = x + 50;
      await execute(
        `INSERT INTO plife (world, map, life, type, cy, f, fh, rx0, rx1, x, y, hide, mobtime)
         VALUES (0, ?, ?, 'n', ?, 0, ?, ?, ?, ?, ?, 0, -1)`,
        [mapId, chosenId, cy, foothold, rx0, rx1, x, y],
      );
      spawnMessage = ` Spawned on map ${mapId} at (${x}, ${y}). Takes effect on server restart.`;
      await execute(
        "INSERT INTO server_config (config_key, config_value) VALUES ('restart_pending', 'true') ON DUPLICATE KEY UPDATE config_value = 'true'"
      );
    }

    return NextResponse.json(
      {
        success: true,
        id: result.insertId,
        npcId: chosenId,
        message: `Created "${name}" (${type}).${spawnMessage}`,
      },
      { status: 201 },
    );
  } catch (err: any) {
    if (err.code === "ER_DUP_ENTRY") {
      return NextResponse.json(
        { error: "An NPC with this npc_id already exists. Use PUT to update it, or pick a different NPC appearance." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Failed to create custom NPC", details: err.message },
      { status: 500 },
    );
  }
}

// PUT - update an existing custom NPC by name
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, npcId } = body;

    if (!name && !npcId) {
      return NextResponse.json({ error: "name or npcId is required" }, { status: 400 });
    }

    const sets: string[] = [];
    const params: any[] = [];

    if (body.newName !== undefined) {
      sets.push("name = ?");
      params.push(body.newName);
    }
    if (body.type !== undefined) {
      const validTypes = ["exchange", "dialogue", "teleporter"];
      if (!validTypes.includes(body.type)) {
        return NextResponse.json(
          { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
          { status: 400 },
        );
      }
      sets.push("type = ?");
      params.push(body.type);
    }
    if (body.config !== undefined) {
      const configObj = typeof body.config === "string" ? JSON.parse(body.config) : body.config;
      // Normalize price keys
      if (configObj.items) {
        for (const item of configObj.items) {
          if (item.cost !== undefined && item.price === undefined) {
            item.price = item.cost;
            delete item.cost;
          }
        }
      }
      if (!configObj.currency_name && configObj.currency === "votepoints") {
        configObj.currency_name = "Vote Points";
      }
      sets.push("config = ?");
      params.push(JSON.stringify(configObj));
    }
    if (body.enabled !== undefined) {
      sets.push("enabled = ?");
      params.push(body.enabled ? 1 : 0);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // Look up by name or npcId
    if (name) {
      params.push(name);
      const result = await execute(
        `UPDATE gm_npcs SET ${sets.join(", ")} WHERE name = ?`,
        params,
      );
      if (result.affectedRows === 0) {
        return NextResponse.json({ error: `Custom NPC "${name}" not found` }, { status: 404 });
      }
    } else {
      params.push(npcId);
      const result = await execute(
        `UPDATE gm_npcs SET ${sets.join(", ")} WHERE npc_id = ?`,
        params,
      );
      if (result.affectedRows === 0) {
        return NextResponse.json({ error: "Custom NPC not found" }, { status: 404 });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Updated custom NPC "${body.newName || name || npcId}"`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to update custom NPC", details: err.message },
      { status: 500 },
    );
  }
}

// DELETE - remove a custom NPC by name + its plife spawn
export async function DELETE(request: NextRequest) {
  try {
    const { name, npcId: directNpcId } = await request.json();

    if (!name && !directNpcId) {
      return NextResponse.json({ error: "name or npcId is required" }, { status: 400 });
    }

    let npcIdToDelete = directNpcId;

    if (name) {
      // Look up npc_id by name so we can also delete the plife spawn
      const rows = await query<GmNpc>("SELECT npc_id FROM gm_npcs WHERE name = ?", [name]);
      if (rows.length === 0) {
        return NextResponse.json({ error: `Custom NPC "${name}" not found` }, { status: 404 });
      }
      npcIdToDelete = rows[0].npc_id;
    }

    // Delete gm_npcs entry
    await execute("DELETE FROM gm_npcs WHERE npc_id = ?", [npcIdToDelete]);

    // Also delete plife spawn
    const plifeResult = await execute(
      "DELETE FROM plife WHERE life = ? AND type = 'n' AND world = 0",
      [npcIdToDelete],
    );

    if (plifeResult.affectedRows > 0) {
      await execute(
        "INSERT INTO server_config (config_key, config_value) VALUES ('restart_pending', 'true') ON DUPLICATE KEY UPDATE config_value = 'true'"
      );
    }

    return NextResponse.json({
      success: true,
      message: `Deleted NPC "${name || npcIdToDelete}" and ${plifeResult.affectedRows} map spawn(s)`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to delete custom NPC", details: err.message },
      { status: 500 },
    );
  }
}
