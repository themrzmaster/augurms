import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { PATHS } from "@/lib/cosmic";

export async function POST(request: NextRequest) {
  try {
    const { message, world = 0 } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Update the server_message in config.yaml for the specified world
    const configContent = readFileSync(PATHS.config, "utf-8");
    const config = parseYaml(configContent);

    if (!config.worlds || !config.worlds[world]) {
      return NextResponse.json({ error: `World ${world} not found` }, { status: 404 });
    }

    const previousMessage = config.worlds[world].server_message;
    config.worlds[world].server_message = message;
    config.worlds[world].event_message = message;

    writeFileSync(PATHS.config, stringifyYaml(config, { lineWidth: 0 }), "utf-8");

    return NextResponse.json({
      success: true,
      message: `Server message updated for world ${world}`,
      previousMessage,
      newMessage: message,
      note: "Server restart required for message to take effect in-game. Players see this on channel select.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to update announcement", details: err.message },
      { status: 500 }
    );
  }
}
