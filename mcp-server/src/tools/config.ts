import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, writeFile } from "fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { PATHS } from "../utils/paths.js";

const WORLD_NAMES = [
  "Scania", "Bera", "Broa", "Windia", "Khaini", "Bellocan", "Mardia",
  "Kradia", "Yellonde", "Demethos", "Galicia", "El Nido", "Zenith",
  "Arcenia", "Kastia", "Judis", "Plana", "Kalluna", "Stius", "Croa", "Medere",
];

async function readConfig(): Promise<any> {
  const content = await readFile(PATHS.config, "utf-8");
  return parseYaml(content);
}

async function writeConfig(doc: any): Promise<void> {
  const yamlStr = stringifyYaml(doc, {
    lineWidth: 0,
    defaultKeyType: "PLAIN",
    defaultStringType: "PLAIN",
  });
  await writeFile(PATHS.config, yamlStr, "utf-8");
}

function formatAsText(data: unknown): string {
  if (typeof data === "object" && data !== null) {
    return stringifyYaml(data, { lineWidth: 0 });
  }
  return String(data);
}

export function registerConfigTools(server: McpServer): void {
  // ── get_config ──────────────────────────────────────────────────────
  server.tool(
    "get_config",
    "Read the entire Cosmic server config or a specific section (server, worlds)",
    {
      section: z.enum(["server", "worlds"]).optional()
        .describe("Optional section to retrieve: 'server' or 'worlds'. Omit for the full config."),
    },
    async ({ section }) => {
      try {
        const config = await readConfig();

        let result: unknown;
        if (section) {
          result = config[section];
          if (result === undefined) {
            return {
              content: [{ type: "text" as const, text: `Section '${section}' not found in config.` }],
              isError: true,
            };
          }
        } else {
          result = config;
        }

        // Annotate worlds with their names for readability
        if (section === "worlds" || !section) {
          const worlds = section === "worlds" ? result : (result as any)?.worlds;
          if (Array.isArray(worlds)) {
            worlds.forEach((world: any, i: number) => {
              if (world && i < WORLD_NAMES.length) {
                world._worldName = WORLD_NAMES[i];
                world._worldIndex = i;
              }
            });
          }
        }

        return {
          content: [{ type: "text" as const, text: formatAsText(result) }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error reading config: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── set_rates ───────────────────────────────────────────────────────
  server.tool(
    "set_rates",
    "Modify exp/meso/drop/boss_drop/quest/fishing/travel rates for a specific world",
    {
      worldIndex: z.number().int().min(0).max(20)
        .describe("Index of the world to modify (0 = Scania, 1 = Bera, etc.)"),
      expRate: z.number().optional()
        .describe("New EXP rate multiplier"),
      mesoRate: z.number().optional()
        .describe("New Meso rate multiplier"),
      dropRate: z.number().optional()
        .describe("New Drop rate multiplier"),
      bossDropRate: z.number().optional()
        .describe("New Boss Drop rate multiplier (overrides drop rate for bosses)"),
      questRate: z.number().optional()
        .describe("New Quest rate multiplier (requires USE_QUEST_RATE to be true)"),
      fishingRate: z.number().optional()
        .describe("New Fishing rate multiplier"),
      travelRate: z.number().optional()
        .describe("New Travel rate multiplier (transportation speed factor)"),
    },
    async ({ worldIndex, expRate, mesoRate, dropRate, bossDropRate, questRate, fishingRate, travelRate }) => {
      try {
        const config = await readConfig();
        const worlds = config.worlds;

        if (!Array.isArray(worlds) || worldIndex >= worlds.length) {
          return {
            content: [{ type: "text" as const, text: `World index ${worldIndex} is out of range. There are ${Array.isArray(worlds) ? worlds.length : 0} worlds configured.` }],
            isError: true,
          };
        }

        const world = worlds[worldIndex];
        const changes: string[] = [];

        if (expRate !== undefined) { world.exp_rate = expRate; changes.push(`exp_rate: ${expRate}`); }
        if (mesoRate !== undefined) { world.meso_rate = mesoRate; changes.push(`meso_rate: ${mesoRate}`); }
        if (dropRate !== undefined) { world.drop_rate = dropRate; changes.push(`drop_rate: ${dropRate}`); }
        if (bossDropRate !== undefined) { world.boss_drop_rate = bossDropRate; changes.push(`boss_drop_rate: ${bossDropRate}`); }
        if (questRate !== undefined) { world.quest_rate = questRate; changes.push(`quest_rate: ${questRate}`); }
        if (fishingRate !== undefined) { world.fishing_rate = fishingRate; changes.push(`fishing_rate: ${fishingRate}`); }
        if (travelRate !== undefined) { world.travel_rate = travelRate; changes.push(`travel_rate: ${travelRate}`); }

        if (changes.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No rate changes specified. Provide at least one rate parameter to modify." }],
            isError: true,
          };
        }

        await writeConfig(config);

        const worldName = worldIndex < WORLD_NAMES.length ? WORLD_NAMES[worldIndex] : `World ${worldIndex}`;
        return {
          content: [{
            type: "text" as const,
            text: `Updated rates for ${worldName} (index ${worldIndex}):\n${changes.map(c => `  - ${c}`).join("\n")}`,
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error updating rates: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── set_server_property ─────────────────────────────────────────────
  server.tool(
    "set_server_property",
    "Modify any server-level property in config.yaml (boolean flags, numeric values, strings, etc.)",
    {
      property: z.string()
        .describe("The server property name to modify (e.g. 'USE_AUTOBAN', 'WORLDS', 'HOST')"),
      value: z.union([z.string(), z.number(), z.boolean()])
        .describe("The new value for the property"),
    },
    async ({ property, value }) => {
      try {
        const config = await readConfig();
        const serverSection = config.server;

        if (!serverSection || typeof serverSection !== "object") {
          return {
            content: [{ type: "text" as const, text: "Server section not found in config." }],
            isError: true,
          };
        }

        const oldValue = serverSection[property];
        const existed = property in serverSection;

        serverSection[property] = value;
        await writeConfig(config);

        const action = existed ? "Updated" : "Added";
        const oldValueStr = existed ? ` (was: ${JSON.stringify(oldValue)})` : "";
        return {
          content: [{
            type: "text" as const,
            text: `${action} server.${property} = ${JSON.stringify(value)}${oldValueStr}`,
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error updating server property: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── set_world_property ──────────────────────────────────────────────
  server.tool(
    "set_world_property",
    "Modify a property on a specific world entry in config.yaml",
    {
      worldIndex: z.number().int().min(0).max(20)
        .describe("Index of the world to modify (0 = Scania, 1 = Bera, etc.)"),
      property: z.string()
        .describe("The world property name to modify (e.g. 'flag', 'server_message', 'channels', 'exp_rate')"),
      value: z.union([z.string(), z.number(), z.boolean()])
        .describe("The new value for the property"),
    },
    async ({ worldIndex, property, value }) => {
      try {
        const config = await readConfig();
        const worlds = config.worlds;

        if (!Array.isArray(worlds) || worldIndex >= worlds.length) {
          return {
            content: [{ type: "text" as const, text: `World index ${worldIndex} is out of range. There are ${Array.isArray(worlds) ? worlds.length : 0} worlds configured.` }],
            isError: true,
          };
        }

        const world = worlds[worldIndex];
        const oldValue = world[property];
        const existed = property in world;

        world[property] = value;
        await writeConfig(config);

        const worldName = worldIndex < WORLD_NAMES.length ? WORLD_NAMES[worldIndex] : `World ${worldIndex}`;
        const action = existed ? "Updated" : "Added";
        const oldValueStr = existed ? ` (was: ${JSON.stringify(oldValue)})` : "";
        return {
          content: [{
            type: "text" as const,
            text: `${action} ${worldName}.${property} = ${JSON.stringify(value)}${oldValueStr}`,
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error updating world property: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── list_feature_flags ──────────────────────────────────────────────
  server.tool(
    "list_feature_flags",
    "List all boolean feature flags (USE_* and ENABLE_*) with their current values from the server config",
    {},
    async () => {
      try {
        const config = await readConfig();
        const serverSection = config.server;

        if (!serverSection || typeof serverSection !== "object") {
          return {
            content: [{ type: "text" as const, text: "Server section not found in config." }],
            isError: true,
          };
        }

        const flags: { name: string; value: boolean }[] = [];

        for (const [key, val] of Object.entries(serverSection)) {
          if ((key.startsWith("USE_") || key.startsWith("ENABLE_")) && typeof val === "boolean") {
            flags.push({ name: key, value: val });
          }
        }

        flags.sort((a, b) => a.name.localeCompare(b.name));

        if (flags.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No boolean feature flags found." }],
          };
        }

        const enabledCount = flags.filter(f => f.value).length;
        const disabledCount = flags.length - enabledCount;

        const lines = flags.map(f => {
          const status = f.value ? "ON " : "OFF";
          return `  [${status}] ${f.name}`;
        });

        const summary = `Feature Flags (${flags.length} total: ${enabledCount} enabled, ${disabledCount} disabled)\n${"─".repeat(60)}\n${lines.join("\n")}`;

        return {
          content: [{ type: "text" as const, text: summary }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error reading feature flags: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
