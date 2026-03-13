import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { PATHS } from "@/lib/cosmic";

const execAsync = promisify(exec);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lines = parseInt(searchParams.get("lines") || "100");
  const service = searchParams.get("service") || "";

  if (lines < 1 || lines > 5000) {
    return NextResponse.json({ error: "Lines must be between 1 and 5000" }, { status: 400 });
  }

  const validServices = ["", "maplestory", "db"];
  if (!validServices.includes(service)) {
    return NextResponse.json(
      { error: `Invalid service. Use: ${validServices.filter(Boolean).join(", ")} (or omit for all)` },
      { status: 400 },
    );
  }

  try {
    const serviceArg = service ? ` ${service}` : "";
    const { stdout, stderr } = await execAsync(
      `docker compose logs --tail=${lines} --no-color${serviceArg}`,
      {
        cwd: PATHS.root,
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for logs
      },
    );

    return NextResponse.json({
      lines: lines,
      service: service || "all",
      logs: stdout || stderr,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch logs. Is Docker running?", details: err.message },
      { status: 500 },
    );
  }
}
