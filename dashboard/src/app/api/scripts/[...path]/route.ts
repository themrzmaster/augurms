import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { PATHS } from "@/lib/cosmic";

function resolveScriptPath(pathSegments: string[]): string {
  // path segments: [type, scriptName] e.g. ["npc", "9001000"]
  if (pathSegments.length < 2) {
    throw new Error("Path must include type and script name (e.g., /api/scripts/npc/9001000)");
  }

  const type = pathSegments[0];
  const name = pathSegments.slice(1).join("/");
  const filename = name.endsWith(".js") ? name : `${name}.js`;

  return resolve(PATHS.scripts, type, filename);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;

  try {
    const filePath = resolveScriptPath(pathSegments);

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 });
    }

    const content = readFileSync(filePath, "utf-8");
    return NextResponse.json({
      path: pathSegments.join("/"),
      content,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;

  try {
    const filePath = resolveScriptPath(pathSegments);

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 });
    }

    const body = await request.json() as { content: string };
    if (body.content === undefined) {
      return NextResponse.json({ error: "Field 'content' is required" }, { status: 400 });
    }

    writeFileSync(filePath, body.content, "utf-8");
    return NextResponse.json({ success: true, message: "Script updated" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.message.includes("Path must") ? 400 : 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;

  try {
    const filePath = resolveScriptPath(pathSegments);

    if (existsSync(filePath)) {
      return NextResponse.json({ error: "Script already exists. Use PUT to update." }, { status: 409 });
    }

    const body = await request.json() as { content: string };
    if (body.content === undefined) {
      return NextResponse.json({ error: "Field 'content' is required" }, { status: 400 });
    }

    // Ensure directory exists
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(filePath, body.content, "utf-8");
    return NextResponse.json({ success: true, message: "Script created" }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.message.includes("Path must") ? 400 : 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;

  try {
    const filePath = resolveScriptPath(pathSegments);

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 });
    }

    unlinkSync(filePath);
    return NextResponse.json({ success: true, message: "Script deleted" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.message.includes("Path must") ? 400 : 500 });
  }
}
