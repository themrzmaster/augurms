import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { PATHS } from "@/lib/cosmic";

const ALLOWED_RATES = [
  "exp_rate", "meso_rate", "drop_rate", "boss_drop_rate",
  "quest_rate", "fishing_rate", "travel_rate",
] as const;

const SERVER_RATES = [
  "EQUIP_EXP_RATE", "PQ_BONUS_EXP_RATE", "PARTY_BONUS_EXP_RATE",
  "RESPAWN_INTERVAL", "SCROLL_CHANCE_ROLLS", "CHSCROLL_STAT_RANGE",
] as const;

export async function GET() {
  try {
    const configContent = readFileSync(PATHS.config, "utf-8");
    const config = parseYaml(configContent);
    const world0 = config.worlds?.[0] || {};
    const server = config.server || {};

    return NextResponse.json({
      worldRates: {
        exp_rate: world0.exp_rate,
        meso_rate: world0.meso_rate,
        drop_rate: world0.drop_rate,
        boss_drop_rate: world0.boss_drop_rate,
        quest_rate: world0.quest_rate,
        fishing_rate: world0.fishing_rate,
        travel_rate: world0.travel_rate,
      },
      serverRates: {
        EQUIP_EXP_RATE: server.EQUIP_EXP_RATE,
        PQ_BONUS_EXP_RATE: server.PQ_BONUS_EXP_RATE,
        PARTY_BONUS_EXP_RATE: server.PARTY_BONUS_EXP_RATE,
        RESPAWN_INTERVAL: server.RESPAWN_INTERVAL,
        SCROLL_CHANCE_ROLLS: server.SCROLL_CHANCE_ROLLS,
        CHSCROLL_STAT_RANGE: server.CHSCROLL_STAT_RANGE,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to read rates", details: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { world = 0, ...rates } = body;

    const configContent = readFileSync(PATHS.config, "utf-8");
    const config = parseYaml(configContent);

    if (!config.worlds?.[world]) {
      return NextResponse.json({ error: `World ${world} not found` }, { status: 404 });
    }

    const changes: Record<string, { from: any; to: any }> = {};

    // Apply world rates
    for (const key of ALLOWED_RATES) {
      if (key in rates) {
        const val = Number(rates[key]);
        if (isNaN(val) || val < 1 || val > 50) {
          return NextResponse.json({ error: `${key} must be between 1 and 50` }, { status: 400 });
        }
        changes[key] = { from: config.worlds[world][key], to: val };
        config.worlds[world][key] = val;
      }
    }

    // Apply server rates
    for (const key of SERVER_RATES) {
      if (key in rates) {
        const val = Number(rates[key]);
        if (isNaN(val)) {
          return NextResponse.json({ error: `${key} must be a number` }, { status: 400 });
        }
        changes[key] = { from: config.server[key], to: val };
        config.server[key] = val;
      }
    }

    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ error: "No valid rate changes provided", allowed: [...ALLOWED_RATES, ...SERVER_RATES] }, { status: 400 });
    }

    writeFileSync(PATHS.config, stringifyYaml(config, { lineWidth: 0 }), "utf-8");

    // Push rates to the live game server via Admin API
    const GAME_API = process.env.GAME_API_URL || "http://augur-ms-game.internal:8585";
    try {
      await fetch(`${GAME_API}/rates`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exp_rate: config.worlds[world].exp_rate,
          meso_rate: config.worlds[world].meso_rate,
          drop_rate: config.worlds[world].drop_rate,
          boss_drop_rate: config.worlds[world].boss_drop_rate,
        }),
      });
    } catch {
      // Game server might not be running — rates saved to config for next restart
    }

    return NextResponse.json({
      success: true,
      changes,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to update rates", details: err.message }, { status: 500 });
  }
}
