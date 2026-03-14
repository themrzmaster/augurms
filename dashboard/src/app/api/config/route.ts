import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { PATHS } from "@/lib/cosmic";

export async function GET() {
  try {
    const content = readFileSync(PATHS.config, "utf-8");
    const config = parseYaml(content);
    return NextResponse.json(config);
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to read config", details: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as { path: string; value: any };

    if (!body.path) {
      return NextResponse.json({ error: "Field 'path' is required (dot-notation)" }, { status: 400 });
    }

    const content = readFileSync(PATHS.config, "utf-8");
    const config = parseYaml(content);

    // Navigate the path and set the value
    const keys = body.path.split(".");
    let obj = config;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      // Handle array indices like "worlds.0"
      if (/^\d+$/.test(key)) {
        obj = obj[parseInt(key)];
      } else {
        obj = obj[key];
      }

      if (obj === undefined || obj === null) {
        return NextResponse.json(
          { error: `Invalid path: '${keys.slice(0, i + 1).join(".")}' does not exist` },
          { status: 400 },
        );
      }
    }

    const lastKey = keys[keys.length - 1];
    if (/^\d+$/.test(lastKey)) {
      obj[parseInt(lastKey)] = body.value;
    } else {
      obj[lastKey] = body.value;
    }

    // Preserve comments by using yaml stringify with options
    const newContent = stringifyYaml(config, {
      lineWidth: 0,
      defaultKeyType: "PLAIN",
      defaultStringType: "PLAIN",
    });

    writeFileSync(PATHS.config, newContent, "utf-8");

    // If a rate was changed, push to the live game server
    const RATE_KEYS = ["exp_rate", "meso_rate", "drop_rate", "boss_drop_rate"];
    if (RATE_KEYS.includes(lastKey)) {
      const GAME_API = process.env.GAME_API_URL || "http://augur-ms-game.internal:8585";
      try {
        const world = config.worlds?.[0] || {};
        await fetch(`${GAME_API}/rates`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exp_rate: world.exp_rate,
            meso_rate: world.meso_rate,
            drop_rate: world.drop_rate,
            boss_drop_rate: world.boss_drop_rate,
          }),
        });
      } catch { /* game server may not be running */ }
    }

    return NextResponse.json({ success: true, message: "Config updated" });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to update config", details: err.message }, { status: 500 });
  }
}
