import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { PATHS } from "@/lib/cosmic";

const execAsync = promisify(exec);

const VALID_ACTIONS = ["start", "stop", "restart", "rebuild"] as const;
type Action = typeof VALID_ACTIONS[number];

export async function GET() {
  try {
    const { stdout } = await execAsync("docker compose ps --format json", {
      cwd: PATHS.root,
      timeout: 15000,
    });

    // docker compose ps --format json outputs one JSON object per line
    const containers = stdout
      .trim()
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return NextResponse.json({
      status: containers.length > 0 ? "running" : "stopped",
      containers,
    });
  } catch (err: any) {
    // If docker compose fails, the server is likely not running
    return NextResponse.json({
      status: "stopped",
      containers: [],
      error: err.message,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { action: Action };

    if (!body.action || !VALID_ACTIONS.includes(body.action)) {
      return NextResponse.json(
        { error: `Invalid action. Use: ${VALID_ACTIONS.join(", ")}` },
        { status: 400 },
      );
    }

    let command: string;
    switch (body.action) {
      case "start":
        command = "docker compose up -d";
        break;
      case "stop":
        command = "docker compose down";
        break;
      case "restart":
        command = "docker compose restart";
        break;
      case "rebuild":
        command = "docker compose up -d --build";
        break;
    }

    const { stdout, stderr } = await execAsync(command, {
      cwd: PATHS.root,
      timeout: 120000, // 2 minutes for rebuilds
    });

    return NextResponse.json({
      success: true,
      action: body.action,
      stdout,
      stderr,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to ${(err as any).action || "execute"} server`, details: err.message, stderr: err.stderr },
      { status: 500 },
    );
  }
}
