import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, writeFile, readdir, unlink, access } from "fs/promises";
import { resolve } from "path";
import { PATHS } from "../utils/paths.js";

const SCRIPT_TYPES = ["npc", "event", "portal", "quest", "map", "reactor", "item"] as const;
type ScriptType = (typeof SCRIPT_TYPES)[number];

const scriptTypeEnum = z.enum(SCRIPT_TYPES);

/**
 * Resolve the directory for a given script type.
 * Map scripts live under map/onUserEnter and map/onFirstUserEnter,
 * but we default to map/onUserEnter for listing and single-file ops.
 */
function scriptDir(type: ScriptType, subdir?: string): string {
  if (type === "map") {
    return resolve(PATHS.scripts, "map", subdir ?? "onUserEnter");
  }
  return resolve(PATHS.scripts, type);
}

/** Ensure a filename ends with .js */
function ensureJs(name: string): string {
  return name.endsWith(".js") ? name : `${name}.js`;
}

// ─── NPC Template generation ─────────────────────────────────────────────────

type NpcTemplate = "shop" | "dialogue" | "teleport" | "job_advance" | "quest_giver";

function generateNpcScript(
  npcId: string,
  template: NpcTemplate,
  options: {
    dialogueText?: string;
    shopItems?: string;
    teleportMaps?: string;
  },
): string {
  switch (template) {
    case "shop":
      return generateShopTemplate(npcId, options.shopItems);
    case "dialogue":
      return generateDialogueTemplate(npcId, options.dialogueText);
    case "teleport":
      return generateTeleportTemplate(npcId, options.teleportMaps);
    case "job_advance":
      return generateJobAdvanceTemplate(npcId);
    case "quest_giver":
      return generateQuestGiverTemplate(npcId, options.dialogueText);
  }
}

function generateShopTemplate(npcId: string, shopItems?: string): string {
  const itemLines = shopItems
    ? shopItems.split(",").map((id) => `//   Item ID: ${id.trim()}`).join("\n")
    : "//   (configure shop items in the server shop data)";

  return `/*
 * NPC: ${npcId}
 * Script: Shop NPC
 *
 * Shop items:
${itemLines}
 */
var status = 0;

function start() {
    status = -1;
    action(1, 0, 0);
}

function action(mode, type, selection) {
    if (mode == -1) {
        cm.dispose();
    } else {
        if (mode == 0 && type > 0) {
            cm.dispose();
            return;
        }
        if (mode == 1) {
            status++;
        } else {
            status--;
        }

        if (status == 0) {
            cm.sendNext("Welcome! Take a look at my wares.");
        } else if (status == 1) {
            cm.openShopNPC(${npcId});
            cm.dispose();
        }
    }
}
`;
}

function generateDialogueTemplate(npcId: string, dialogueText?: string): string {
  const text = dialogueText || "Hello there! How can I help you today?";
  return `/*
 * NPC: ${npcId}
 * Script: Dialogue NPC
 */
var status;

function start() {
    status = -1;
    action(1, 0, 0);
}

function action(mode, type, selection) {
    if (mode == -1) {
        cm.dispose();
    } else {
        if (mode == 0 && type > 0) {
            cm.dispose();
            return;
        }
        if (mode == 1) {
            status++;
        } else {
            status--;
        }

        if (status == 0) {
            cm.sendOk("${text.replace(/"/g, '\\"')}");
            cm.dispose();
        }
    }
}
`;
}

function generateTeleportTemplate(npcId: string, teleportMaps?: string): string {
  // Parse teleportMaps: "100000000:Henesys,101000000:Ellinia" or just "100000000,101000000"
  let mapIds: string[] = [];
  let mapNames: string[] = [];

  if (teleportMaps) {
    const entries = teleportMaps.split(",").map((e) => e.trim());
    for (const entry of entries) {
      if (entry.includes(":")) {
        const [id, name] = entry.split(":");
        mapIds.push(id.trim());
        mapNames.push(name.trim());
      } else {
        mapIds.push(entry);
        mapNames.push("");
      }
    }
  } else {
    mapIds = ["100000000", "101000000", "102000000"];
    mapNames = ["Henesys", "Ellinia", "Perion"];
  }

  const mapArrayStr = mapIds.map((id) => parseInt(id, 10)).join(", ");
  const costArrayStr = mapIds.map(() => 1000).join(", ");

  return `/*
 * NPC: ${npcId}
 * Script: Teleport NPC
 */
var status = 0;
var maps = [${mapArrayStr}];
var cost = [${costArrayStr}];
var selectedMap = -1;

function start() {
    cm.sendSimple("Where would you like to go?#b${mapIds.map((id, i) => `\\r\\n#L${i}##m${id}## (${costArrayStr.split(", ")[i]} mesos)#l`).join("")}");
}

function action(mode, type, selection) {
    if (mode != 1) {
        cm.dispose();
        return;
    }

    status++;

    if (status == 1) {
        selectedMap = selection;
        cm.sendYesNo("Do you want to go to #b#m" + maps[selectedMap] + "##k? It will cost you #b" + cost[selectedMap] + " mesos#k.");
    } else if (status == 2) {
        if (cm.getMeso() < cost[selectedMap]) {
            cm.sendOk("You don't have enough mesos.");
            cm.dispose();
            return;
        }
        cm.gainMeso(-cost[selectedMap]);
        cm.warp(maps[selectedMap], 0);
        cm.dispose();
    }
}
`;
}

function generateJobAdvanceTemplate(npcId: string): string {
  return `/*
 * NPC: ${npcId}
 * Script: Job Advancement NPC
 *
 * Customize the job IDs, level requirements, and stat
 * requirements below for your specific job advancement.
 */
var status;

function start() {
    status = -1;
    action(1, 0, 0);
}

function action(mode, type, selection) {
    if (mode == -1) {
        cm.dispose();
    } else {
        if (mode == 0 && type > 0) {
            cm.dispose();
            return;
        }
        if (mode == 1) {
            status++;
        } else {
            status--;
        }

        if (status == 0) {
            if (cm.getJobId() == 0) {
                // Beginner seeking 1st job
                if (cm.getLevel() >= 10) {
                    cm.sendNext("So you want to become a #bWarrior#k? You seem to have what it takes. Let me explain what a Warrior does.");
                } else {
                    cm.sendOk("You need to be at least #blevel 10#k to make the job advancement. Train a bit more and come back to me.");
                    cm.dispose();
                }
            } else {
                cm.sendOk("You have already made your job advancement.");
                cm.dispose();
            }
        } else if (status == 1) {
            cm.sendNextPrev("Warriors are strong melee fighters who excel in close combat. They have high HP and can take a lot of damage. Are you ready to become one?");
        } else if (status == 2) {
            cm.sendYesNo("Are you sure you want to become a #bWarrior#k? This decision is final and cannot be reversed.");
        } else if (status == 3) {
            if (cm.getJobId() == 0) {
                cm.changeJob(Packages.client.MapleJob.WARRIOR);
                cm.sendOk("You are now a #bWarrior#k! Go forth and show the world your strength.");
            }
            cm.dispose();
        }
    }
}
`;
}

function generateQuestGiverTemplate(npcId: string, dialogueText?: string): string {
  const questIntro = dialogueText || "I have a task for you, adventurer. Will you help me?";

  return `/*
 * NPC: ${npcId}
 * Script: Quest Giver NPC
 *
 * Customize the quest ID, required items, and rewards below.
 */
var status;
var QUEST_ID = 0; // TODO: Set your quest ID

function start() {
    status = -1;
    action(1, 0, 0);
}

function action(mode, type, selection) {
    if (mode == -1) {
        cm.dispose();
    } else {
        if (mode == 0 && type > 0) {
            cm.dispose();
            return;
        }
        if (mode == 1) {
            status++;
        } else {
            status--;
        }

        if (status == 0) {
            if (cm.isQuestCompleted(QUEST_ID)) {
                cm.sendOk("Thank you for your help, adventurer! You've already completed this quest.");
                cm.dispose();
            } else if (cm.isQuestStarted(QUEST_ID)) {
                // Check quest completion conditions
                if (cm.haveItem(4000000, 10)) { // TODO: Set required item ID and quantity
                    cm.sendNext("Excellent! You've gathered everything I need. Here is your reward!");
                } else {
                    cm.sendOk("You haven't finished the task yet. I need you to collect #b10 #t4000000##k for me.");
                    cm.dispose();
                }
            } else {
                cm.sendNext("${questIntro.replace(/"/g, '\\"')}");
            }
        } else if (status == 1) {
            if (cm.isQuestStarted(QUEST_ID)) {
                // Give rewards
                cm.gainItem(4000000, -10); // TODO: Remove required items
                cm.gainExp(1000);          // TODO: Set EXP reward
                cm.gainMeso(5000);         // TODO: Set meso reward
                cm.forceCompleteQuest(QUEST_ID);
                cm.sendOk("Quest complete! Thank you for your help.");
                cm.dispose();
            } else {
                cm.sendAcceptDecline("Will you help me collect #b10 #t4000000##k?");
            }
        } else if (status == 2) {
            cm.forceStartQuest(QUEST_ID);
            cm.sendOk("Thank you! Please collect #b10 #t4000000##k and bring them to me.");
            cm.dispose();
        }
    }
}
`;
}

// ─── Tool Registration ──────────────────────────────────────────────────────

export function registerScriptTools(server: McpServer): void {
  // ── list_scripts ────────────────────────────────────────────────────
  server.tool(
    "list_scripts",
    "List scripts by type (npc, event, portal, quest, map, reactor, item). Optionally filter by substring in filename.",
    {
      type: scriptTypeEnum
        .describe("Script category: npc, event, portal, quest, map, reactor, or item"),
      filter: z.string().optional()
        .describe("Optional substring to filter filenames (case-insensitive)"),
    },
    async ({ type, filter }) => {
      try {
        if (type === "map") {
          // Map scripts have two subdirectories
          const results: string[] = [];
          for (const subdir of ["onUserEnter", "onFirstUserEnter"]) {
            try {
              const dir = scriptDir(type, subdir);
              const files = await readdir(dir);
              const jsFiles = files.filter((f) => f.endsWith(".js"));
              for (const f of jsFiles) {
                results.push(`${subdir}/${f}`);
              }
            } catch {
              // subdirectory may not exist
            }
          }

          let filtered = results;
          if (filter) {
            const lower = filter.toLowerCase();
            filtered = results.filter((f) => f.toLowerCase().includes(lower));
          }

          filtered.sort();
          return {
            content: [{
              type: "text" as const,
              text: `Map scripts (${filtered.length} found):\n${filtered.join("\n")}`,
            }],
          };
        }

        const dir = scriptDir(type);
        const entries = await readdir(dir);
        let files = entries.filter((f) => f.endsWith(".js"));

        if (filter) {
          const lower = filter.toLowerCase();
          files = files.filter((f) => f.toLowerCase().includes(lower));
        }

        files.sort();
        return {
          content: [{
            type: "text" as const,
            text: `${type} scripts (${files.length} found):\n${files.join("\n")}`,
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error listing ${type} scripts: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── get_script ──────────────────────────────────────────────────────
  server.tool(
    "get_script",
    "Read the contents of a script file by type and name",
    {
      type: scriptTypeEnum
        .describe("Script category: npc, event, portal, quest, map, reactor, or item"),
      name: z.string()
        .describe("Script filename (with or without .js). For map scripts, use 'onUserEnter/filename' or 'onFirstUserEnter/filename'."),
    },
    async ({ type, name }) => {
      try {
        let filePath: string;

        if (type === "map" && (name.startsWith("onUserEnter/") || name.startsWith("onFirstUserEnter/"))) {
          // Full subdir path provided
          filePath = resolve(PATHS.scripts, "map", ensureJs(name));
        } else if (type === "map") {
          // Try onUserEnter first, then onFirstUserEnter
          const nameJs = ensureJs(name);
          const tryPath = resolve(PATHS.scripts, "map", "onUserEnter", nameJs);
          try {
            await access(tryPath);
            filePath = tryPath;
          } catch {
            filePath = resolve(PATHS.scripts, "map", "onFirstUserEnter", nameJs);
          }
        } else {
          filePath = resolve(scriptDir(type), ensureJs(name));
        }

        const content = await readFile(filePath, "utf-8");
        return {
          content: [{
            type: "text" as const,
            text: `── ${type}/${ensureJs(name)} ──\n${content}`,
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error reading script: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── create_script ───────────────────────────────────────────────────
  server.tool(
    "create_script",
    "Create a new script file. Fails if the file already exists unless overwrite is true.",
    {
      type: scriptTypeEnum
        .describe("Script category: npc, event, portal, quest, map, reactor, or item"),
      name: z.string()
        .describe("Script filename (with or without .js). For map scripts, prefix with 'onUserEnter/' or 'onFirstUserEnter/'."),
      content: z.string()
        .describe("The JavaScript content of the script"),
      overwrite: z.boolean().optional().default(false)
        .describe("If true, overwrite an existing file. Default: false."),
    },
    async ({ type, name, content, overwrite }) => {
      try {
        let filePath: string;

        if (type === "map" && (name.startsWith("onUserEnter/") || name.startsWith("onFirstUserEnter/"))) {
          filePath = resolve(PATHS.scripts, "map", ensureJs(name));
        } else if (type === "map") {
          filePath = resolve(PATHS.scripts, "map", "onUserEnter", ensureJs(name));
        } else {
          filePath = resolve(scriptDir(type), ensureJs(name));
        }

        if (!overwrite) {
          try {
            await access(filePath);
            return {
              content: [{
                type: "text" as const,
                text: `Script already exists: ${filePath}\nUse overwrite: true to replace it.`,
              }],
              isError: true,
            };
          } catch {
            // File doesn't exist, proceed
          }
        }

        await writeFile(filePath, content, "utf-8");
        return {
          content: [{
            type: "text" as const,
            text: `Created script: ${type}/${ensureJs(name)}`,
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error creating script: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── update_script ───────────────────────────────────────────────────
  server.tool(
    "update_script",
    "Update an existing script file with new content",
    {
      type: scriptTypeEnum
        .describe("Script category: npc, event, portal, quest, map, reactor, or item"),
      name: z.string()
        .describe("Script filename (with or without .js). For map scripts, prefix with 'onUserEnter/' or 'onFirstUserEnter/'."),
      content: z.string()
        .describe("The new JavaScript content of the script"),
    },
    async ({ type, name, content }) => {
      try {
        let filePath: string;

        if (type === "map" && (name.startsWith("onUserEnter/") || name.startsWith("onFirstUserEnter/"))) {
          filePath = resolve(PATHS.scripts, "map", ensureJs(name));
        } else if (type === "map") {
          // Try onUserEnter first, then onFirstUserEnter
          const nameJs = ensureJs(name);
          const tryPath = resolve(PATHS.scripts, "map", "onUserEnter", nameJs);
          try {
            await access(tryPath);
            filePath = tryPath;
          } catch {
            const altPath = resolve(PATHS.scripts, "map", "onFirstUserEnter", nameJs);
            try {
              await access(altPath);
              filePath = altPath;
            } catch {
              return {
                content: [{
                  type: "text" as const,
                  text: `Script not found in map/onUserEnter or map/onFirstUserEnter: ${nameJs}`,
                }],
                isError: true,
              };
            }
          }
        } else {
          filePath = resolve(scriptDir(type), ensureJs(name));
        }

        // Verify the file exists before overwriting
        try {
          await access(filePath);
        } catch {
          return {
            content: [{
              type: "text" as const,
              text: `Script not found: ${filePath}\nUse create_script to create a new script.`,
            }],
            isError: true,
          };
        }

        await writeFile(filePath, content, "utf-8");
        return {
          content: [{
            type: "text" as const,
            text: `Updated script: ${type}/${ensureJs(name)}`,
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error updating script: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── delete_script ───────────────────────────────────────────────────
  server.tool(
    "delete_script",
    "Delete a script file",
    {
      type: scriptTypeEnum
        .describe("Script category: npc, event, portal, quest, map, reactor, or item"),
      name: z.string()
        .describe("Script filename (with or without .js). For map scripts, prefix with 'onUserEnter/' or 'onFirstUserEnter/'."),
    },
    async ({ type, name }) => {
      try {
        let filePath: string;

        if (type === "map" && (name.startsWith("onUserEnter/") || name.startsWith("onFirstUserEnter/"))) {
          filePath = resolve(PATHS.scripts, "map", ensureJs(name));
        } else if (type === "map") {
          const nameJs = ensureJs(name);
          const tryPath = resolve(PATHS.scripts, "map", "onUserEnter", nameJs);
          try {
            await access(tryPath);
            filePath = tryPath;
          } catch {
            filePath = resolve(PATHS.scripts, "map", "onFirstUserEnter", nameJs);
          }
        } else {
          filePath = resolve(scriptDir(type), ensureJs(name));
        }

        // Verify the file exists
        try {
          await access(filePath);
        } catch {
          return {
            content: [{
              type: "text" as const,
              text: `Script not found: ${filePath}`,
            }],
            isError: true,
          };
        }

        await unlink(filePath);
        return {
          content: [{
            type: "text" as const,
            text: `Deleted script: ${type}/${ensureJs(name)}`,
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error deleting script: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── create_npc_script_from_template ─────────────────────────────────
  server.tool(
    "create_npc_script_from_template",
    "Generate a complete NPC script from a predefined template (shop, dialogue, teleport, job_advance, quest_giver) and save it to the npc scripts directory",
    {
      npcId: z.string()
        .describe("The NPC ID (used as the filename and referenced in the script)"),
      template: z.enum(["shop", "dialogue", "teleport", "job_advance", "quest_giver"])
        .describe("Template type: 'shop' (item seller), 'dialogue' (custom text), 'teleport' (map warper), 'job_advance' (job advancement), 'quest_giver' (quest start/complete)"),
      dialogueText: z.string().optional()
        .describe("Custom dialogue text for the NPC (used by dialogue and quest_giver templates)"),
      shopItems: z.string().optional()
        .describe("Comma-separated item IDs for the shop template (e.g. '2000000,2000001,2000002')"),
      teleportMaps: z.string().optional()
        .describe("Comma-separated map IDs with optional names for the teleport template (e.g. '100000000:Henesys,101000000:Ellinia')"),
    },
    async ({ npcId, template, dialogueText, shopItems, teleportMaps }) => {
      try {
        const filePath = resolve(scriptDir("npc"), ensureJs(npcId));

        // Check if file already exists
        try {
          await access(filePath);
          return {
            content: [{
              type: "text" as const,
              text: `NPC script already exists: npc/${ensureJs(npcId)}\nUse update_script to modify it, or delete_script to remove it first.`,
            }],
            isError: true,
          };
        } catch {
          // File doesn't exist, proceed
        }

        const content = generateNpcScript(npcId, template, {
          dialogueText,
          shopItems,
          teleportMaps,
        });

        await writeFile(filePath, content, "utf-8");
        return {
          content: [{
            type: "text" as const,
            text: `Created NPC script from '${template}' template: npc/${ensureJs(npcId)}\n\n${content}`,
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error creating NPC script from template: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
