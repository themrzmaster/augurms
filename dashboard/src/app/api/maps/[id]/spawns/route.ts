import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { PATHS } from "@/lib/cosmic";

function getMapFilePath(mapId: number): string {
  const mapArea = Math.floor(mapId / 100000000);
  const paddedId = mapId.toString().padStart(9, "0");
  return `${PATHS.mapWz}/Map/Map${mapArea}/${paddedId}.img.xml`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const mapId = parseInt(idStr);

  if (isNaN(mapId)) {
    return NextResponse.json({ error: "Invalid map ID" }, { status: 400 });
  }

  try {
    const mapFile = getMapFilePath(mapId);
    if (!existsSync(mapFile)) {
      return NextResponse.json({ error: "Map file not found" }, { status: 404 });
    }

    const body = await request.json() as {
      type: "m" | "n";
      id: number;
      x: number;
      y: number;
      fh?: number;
    };

    if (!body.type || !body.id || body.x === undefined || body.y === undefined) {
      return NextResponse.json(
        { error: "Required fields: type (m|n), id, x, y" },
        { status: 400 },
      );
    }

    let content = readFileSync(mapFile, "utf-8");

    // Find the life section and determine the next index
    const lifeMatch = content.match(/<imgdir name="life">([\s\S]*?)<\/imgdir>\s*(?=<imgdir)/);
    if (!lifeMatch) {
      return NextResponse.json({ error: "Could not find life section in map file" }, { status: 500 });
    }

    const lifeContent = lifeMatch[1];
    const indexRegex = /<imgdir name="(\d+)">/g;
    let maxIndex = -1;
    let m;
    while ((m = indexRegex.exec(lifeContent)) !== null) {
      const idx = parseInt(m[1]);
      if (idx > maxIndex) maxIndex = idx;
    }
    const newIndex = maxIndex + 1;

    const fh = body.fh || 0;
    const cy = body.y;
    const rx0 = body.x - 50;
    const rx1 = body.x + 50;

    const newEntry = `    <imgdir name="${newIndex}">
      <string name="type" value="${body.type}"/>
      <string name="id" value="${body.id}"/>
      <int name="x" value="${body.x}"/>
      <int name="y" value="${body.y}"/>
      <int name="mobTime" value="0"/>
      <int name="f" value="0"/>
      <int name="hide" value="0"/>
      <int name="fh" value="${fh}"/>
      <int name="cy" value="${cy}"/>
      <int name="rx0" value="${rx0}"/>
      <int name="rx1" value="${rx1}"/>
    </imgdir>
  `;

    // Insert before the closing </imgdir> of the life section
    const lifeEndTag = "</imgdir>";
    const lifeStartIdx = content.indexOf('<imgdir name="life">');
    if (lifeStartIdx === -1) {
      return NextResponse.json({ error: "Life section not found" }, { status: 500 });
    }

    // Find the matching closing tag for the life section
    let depth = 0;
    let searchIdx = lifeStartIdx;
    let lifeCloseIdx = -1;

    // Move past the opening tag
    searchIdx = content.indexOf(">", lifeStartIdx) + 1;

    depth = 1;
    while (depth > 0 && searchIdx < content.length) {
      const nextOpen = content.indexOf("<imgdir", searchIdx);
      const nextClose = content.indexOf("</imgdir>", searchIdx);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        searchIdx = content.indexOf(">", nextOpen) + 1;
      } else {
        depth--;
        if (depth === 0) {
          lifeCloseIdx = nextClose;
        }
        searchIdx = nextClose + lifeEndTag.length;
      }
    }

    if (lifeCloseIdx === -1) {
      return NextResponse.json({ error: "Could not parse life section structure" }, { status: 500 });
    }

    content = content.slice(0, lifeCloseIdx) + newEntry + content.slice(lifeCloseIdx);
    writeFileSync(mapFile, content, "utf-8");

    return NextResponse.json({
      success: true,
      message: `Added ${body.type === "m" ? "mob" : "NPC"} spawn at index ${newIndex}`,
      index: newIndex,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to add spawn", details: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const mapId = parseInt(idStr);

  if (isNaN(mapId)) {
    return NextResponse.json({ error: "Invalid map ID" }, { status: 400 });
  }

  try {
    const mapFile = getMapFilePath(mapId);
    if (!existsSync(mapFile)) {
      return NextResponse.json({ error: "Map file not found" }, { status: 404 });
    }

    const body = await request.json() as { type: "m" | "n"; id: number };

    if (!body.type || body.id === undefined) {
      return NextResponse.json(
        { error: "Required fields: type (m|n), id" },
        { status: 400 },
      );
    }

    let content = readFileSync(mapFile, "utf-8");

    // Find and remove the life entry matching type and id
    // Pattern: <imgdir name="N">...<string name="type" value="m|n"/>...<string name="id" value="ID"/>...</imgdir>
    const entryRegex = new RegExp(
      `\\s*<imgdir name="\\d+">\\s*(?:<[^>]*>\\s*)*<string name="type" value="${body.type}"\\s*/>\\s*<string name="id" value="${body.id}"\\s*/>[\\s\\S]*?</imgdir>`,
    );

    const match = content.match(entryRegex);
    if (!match) {
      return NextResponse.json(
        { error: `No spawn found with type=${body.type} and id=${body.id}` },
        { status: 404 },
      );
    }

    content = content.replace(match[0], "");
    writeFileSync(mapFile, content, "utf-8");

    return NextResponse.json({
      success: true,
      message: `Removed ${body.type === "m" ? "mob" : "NPC"} spawn with id ${body.id}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to remove spawn", details: err.message }, { status: 500 });
  }
}
