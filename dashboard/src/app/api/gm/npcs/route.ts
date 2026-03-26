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

// GET - list all custom NPCs, or get one by npcId query param
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const npcId = searchParams.get("npcId");

  try {
    if (npcId) {
      const rows = await query<GmNpc>(
        "SELECT * FROM gm_npcs WHERE npc_id = ?",
        [parseInt(npcId)],
      );
      if (rows.length === 0) {
        return NextResponse.json({ error: "Custom NPC not found" }, { status: 404 });
      }
      const row = rows[0];
      return NextResponse.json({
        ...row,
        config: typeof row.config === "string" ? JSON.parse(row.config) : row.config,
      });
    }

    const rows = await query<GmNpc>("SELECT * FROM gm_npcs ORDER BY created_at DESC");
    return NextResponse.json(
      rows.map((r) => ({
        ...r,
        config: typeof r.config === "string" ? JSON.parse(r.config) : r.config,
      })),
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch custom NPCs", details: err.message },
      { status: 500 },
    );
  }
}

// POST - create a new custom NPC
export async function POST(request: NextRequest) {
  try {
    const { npcId, name, type, config } = await request.json();

    if (!npcId || !name || !type || !config) {
      return NextResponse.json(
        { error: "npcId, name, type, and config are required" },
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

    const configStr = typeof config === "string" ? config : JSON.stringify(config);

    const result = await execute(
      "INSERT INTO gm_npcs (npc_id, name, type, config) VALUES (?, ?, ?, ?)",
      [npcId, name, type, configStr],
    );

    return NextResponse.json(
      {
        success: true,
        id: result.insertId,
        message: `Created custom NPC "${name}" (npc_id=${npcId}, type=${type})`,
      },
      { status: 201 },
    );
  } catch (err: any) {
    if (err.code === "ER_DUP_ENTRY") {
      return NextResponse.json(
        { error: "An NPC with this npc_id already exists. Use PUT to update it." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Failed to create custom NPC", details: err.message },
      { status: 500 },
    );
  }
}

// PUT - update an existing custom NPC by npc_id
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { npcId } = body;

    if (!npcId) {
      return NextResponse.json({ error: "npcId is required" }, { status: 400 });
    }

    const sets: string[] = [];
    const params: any[] = [];

    if (body.name !== undefined) {
      sets.push("name = ?");
      params.push(body.name);
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
      sets.push("config = ?");
      params.push(typeof body.config === "string" ? body.config : JSON.stringify(body.config));
    }
    if (body.enabled !== undefined) {
      sets.push("enabled = ?");
      params.push(body.enabled ? 1 : 0);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    params.push(npcId);
    const result = await execute(
      `UPDATE gm_npcs SET ${sets.join(", ")} WHERE npc_id = ?`,
      params,
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "Custom NPC not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `Updated custom NPC (npc_id=${npcId})`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to update custom NPC", details: err.message },
      { status: 500 },
    );
  }
}

// DELETE - remove a custom NPC by npc_id
export async function DELETE(request: NextRequest) {
  try {
    const { npcId } = await request.json();

    if (!npcId) {
      return NextResponse.json({ error: "npcId is required" }, { status: 400 });
    }

    const result = await execute("DELETE FROM gm_npcs WHERE npc_id = ?", [npcId]);

    return NextResponse.json({
      success: true,
      message: `Deleted custom NPC (npc_id=${npcId})`,
      affectedRows: result.affectedRows,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to delete custom NPC", details: err.message },
      { status: 500 },
    );
  }
}
