import { NextRequest, NextResponse } from "next/server";
import { readdirSync, existsSync } from "fs";
import { resolve } from "path";
import { PATHS } from "@/lib/cosmic";

const SCRIPT_TYPES = ["npc", "event", "portal", "quest", "map", "reactor", "item"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type") || "npc";
  const filter = (searchParams.get("filter") || "").toLowerCase();

  if (!SCRIPT_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `Invalid type. Use: ${SCRIPT_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const dir = resolve(PATHS.scripts, type);

    if (!existsSync(dir)) {
      return NextResponse.json({ error: `Script directory '${type}' not found` }, { status: 404 });
    }

    let files: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".js")) {
        files.push(entry.name);
      } else if (entry.isDirectory()) {
        const subDir = resolve(dir, entry.name);
        const subFiles = readdirSync(subDir).filter((f) => f.endsWith(".js"));
        files.push(...subFiles.map((f) => `${entry.name}/${f}`));
      }
    }

    if (filter) {
      files = files.filter((f) => f.toLowerCase().includes(filter));
    }

    return NextResponse.json({
      type,
      count: files.length,
      files,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to list scripts", details: err.message }, { status: 500 });
  }
}
