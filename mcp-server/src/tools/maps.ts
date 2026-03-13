import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, writeFile, access } from "fs/promises";
import { resolve } from "path";
import { PATHS } from "../utils/paths.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function getMapFilePath(mapId: number): string {
  const folder = Math.floor(mapId / 100000000);
  return resolve(PATHS.mapWz, `Map/Map${folder}/${mapId}.img.xml`);
}

async function readMapXml(mapId: number): Promise<string> {
  const filePath = getMapFilePath(mapId);
  try {
    await access(filePath);
  } catch {
    throw new Error(`Map file not found: ${filePath}`);
  }
  return readFile(filePath, "utf-8");
}

async function writeMapXml(mapId: number, content: string): Promise<void> {
  const filePath = getMapFilePath(mapId);
  await writeFile(filePath, content, "utf-8");
}

function lookupMapName(stringXml: string, mapId: number): { streetName?: string; mapName?: string } {
  const idStr = String(mapId);
  // Find the imgdir for this map ID and extract streetName + mapName
  const pattern = new RegExp(
    `<imgdir name="${idStr}">\\s*` +
    `(?:<string name="streetName" value="([^"]*)"\\s*/>\\s*)?` +
    `(?:<string name="mapName" value="([^"]*)"\\s*/>)?`,
    "s",
  );
  const match = stringXml.match(pattern);
  if (!match) return {};
  return {
    streetName: match[1] || undefined,
    mapName: match[2] || undefined,
  };
}

interface InfoProperty {
  name: string;
  type: string;
  value: string;
}

function parseInfoSection(xml: string): InfoProperty[] {
  const infoMatch = xml.match(/<imgdir name="info">([\s\S]*?)<\/imgdir>/);
  if (!infoMatch) return [];
  const props: InfoProperty[] = [];
  const propRegex = /<(int|string|float)\s+name="([^"]*)"\s+value="([^"]*)"\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = propRegex.exec(infoMatch[1])) !== null) {
    props.push({ type: m[1], name: m[2], value: m[3] });
  }
  return props;
}

interface LifeEntry {
  index: string;
  type: string; // "n" or "m"
  id: string;
  x: string;
  y: string;
  fh?: string;
  cy?: string;
  rx0?: string;
  rx1?: string;
  mobTime?: string;
  f?: string;
  hide?: string;
}

function parseLifeSection(xml: string): LifeEntry[] {
  const lifeMatch = xml.match(/<imgdir name="life">([\s\S]*?)\n  <\/imgdir>/);
  if (!lifeMatch) return [];
  const entries: LifeEntry[] = [];
  const entryRegex = /<imgdir name="(\d+)">([\s\S]*?)<\/imgdir>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRegex.exec(lifeMatch[1])) !== null) {
    const index = m[1];
    const block = m[2];
    const entry: LifeEntry = { index, type: "", id: "", x: "0", y: "0" };
    const valRegex = /<(?:int|string)\s+name="([^"]*)"\s+value="([^"]*)"\s*\/>/g;
    let v: RegExpExecArray | null;
    while ((v = valRegex.exec(block)) !== null) {
      const key = v[1] as keyof LifeEntry;
      (entry as any)[key] = v[2];
    }
    entries.push(entry);
  }
  return entries;
}

interface PortalEntry {
  index: string;
  pn: string;
  pt: string;
  x: string;
  y: string;
  tm: string;
  tn: string;
  image?: string;
}

function parsePortalSection(xml: string): PortalEntry[] {
  const portalMatch = xml.match(/<imgdir name="portal">([\s\S]*?)\n  <\/imgdir>/);
  if (!portalMatch) return [];
  const entries: PortalEntry[] = [];
  const entryRegex = /<imgdir name="(\d+)">([\s\S]*?)<\/imgdir>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRegex.exec(portalMatch[1])) !== null) {
    const index = m[1];
    const block = m[2];
    const entry: PortalEntry = { index, pn: "", pt: "0", x: "0", y: "0", tm: "999999999", tn: "" };
    const valRegex = /<(?:int|string)\s+name="([^"]*)"\s+value="([^"]*)"\s*\/>/g;
    let v: RegExpExecArray | null;
    while ((v = valRegex.exec(block)) !== null) {
      (entry as any)[v[1]] = v[2];
    }
    entries.push(entry);
  }
  return entries;
}

function getNextLifeIndex(xml: string): number {
  const lifeMatch = xml.match(/<imgdir name="life">([\s\S]*?)\n  <\/imgdir>/);
  if (!lifeMatch) return 0;
  const indices: number[] = [];
  const indexRegex = /<imgdir name="(\d+)">/g;
  let m: RegExpExecArray | null;
  while ((m = indexRegex.exec(lifeMatch[1])) !== null) {
    indices.push(parseInt(m[1], 10));
  }
  return indices.length > 0 ? Math.max(...indices) + 1 : 0;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true as const };
}

// ── Tool Registration ───────────────────────────────────────────────────────

export function registerMapTools(server: McpServer): void {

  // ── get_map_info ────────────────────────────────────────────────────────
  server.tool(
    "get_map_info",
    "Get map details including info properties, mob/NPC spawns, and portals for a MapleStory map",
    {
      mapId: z.number().int().describe("The map ID to look up (e.g. 100000000 for Henesys)"),
    },
    async ({ mapId }) => {
      try {
        const xml = await readMapXml(mapId);

        // Look up map name from String.wz
        let mapNameInfo: { streetName?: string; mapName?: string } = {};
        try {
          const stringXml = await readFile(resolve(PATHS.stringWz, "Map.img.xml"), "utf-8");
          mapNameInfo = lookupMapName(stringXml, mapId);
        } catch {
          // String.wz lookup is best-effort
        }

        const info = parseInfoSection(xml);
        const life = parseLifeSection(xml);
        const portals = parsePortalSection(xml);

        const npcs = life.filter(e => e.type === "n");
        const mobs = life.filter(e => e.type === "m");

        const lines: string[] = [];

        // Header
        lines.push(`Map ${mapId}`);
        if (mapNameInfo.streetName || mapNameInfo.mapName) {
          const parts = [mapNameInfo.streetName, mapNameInfo.mapName].filter(Boolean);
          lines.push(`Name: ${parts.join(" - ")}`);
        }
        lines.push("─".repeat(50));

        // Info properties
        lines.push("\nProperties:");
        for (const prop of info) {
          lines.push(`  ${prop.name}: ${prop.value}`);
        }

        // NPC spawns
        lines.push(`\nNPCs (${npcs.length}):`);
        if (npcs.length === 0) {
          lines.push("  (none)");
        } else {
          for (const npc of npcs) {
            lines.push(`  [${npc.index}] NPC ${npc.id} at (${npc.x}, ${npc.y}) fh=${npc.fh || "?"}`);
          }
        }

        // Mob spawns
        lines.push(`\nMobs (${mobs.length}):`);
        if (mobs.length === 0) {
          lines.push("  (none)");
        } else {
          for (const mob of mobs) {
            const respawn = mob.mobTime ? ` respawn=${mob.mobTime}s` : "";
            lines.push(`  [${mob.index}] Mob ${mob.id} at (${mob.x}, ${mob.y}) fh=${mob.fh || "?"}${respawn}`);
          }
        }

        // Portals
        lines.push(`\nPortals (${portals.length}):`);
        if (portals.length === 0) {
          lines.push("  (none)");
        } else {
          for (const portal of portals) {
            const target = portal.tm === "999999999" ? "(no target)" : `-> map ${portal.tm} portal "${portal.tn}"`;
            lines.push(`  [${portal.index}] "${portal.pn}" type=${portal.pt} at (${portal.x}, ${portal.y}) ${target}`);
          }
        }

        return textResult(lines.join("\n"));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Error reading map ${mapId}: ${message}`);
      }
    },
  );

  // ── add_mob_spawn ───────────────────────────────────────────────────────
  server.tool(
    "add_mob_spawn",
    "Add a mob spawn to a MapleStory map",
    {
      mapId: z.number().int().describe("The map ID to add the mob to"),
      mobId: z.number().int().describe("The mob ID to spawn"),
      x: z.number().int().describe("X coordinate for the spawn position"),
      y: z.number().int().describe("Y coordinate for the spawn position"),
      respawnTime: z.number().int().optional().default(0)
        .describe("Respawn time in seconds (0 = immediate respawn)"),
    },
    async ({ mapId, mobId, x, y, respawnTime }) => {
      try {
        let xml = await readMapXml(mapId);
        const nextIndex = getNextLifeIndex(xml);

        const newEntry = [
          `    <imgdir name="${nextIndex}">`,
          `      <string name="type" value="m"/>`,
          `      <string name="id" value="${mobId}"/>`,
          `      <int name="x" value="${x}"/>`,
          `      <int name="y" value="${y}"/>`,
          `      <int name="mobTime" value="${respawnTime}"/>`,
          `      <int name="f" value="0"/>`,
          `      <int name="fh" value="0"/>`,
          `      <int name="cy" value="${y}"/>`,
          `      <int name="rx0" value="${x - 50}"/>`,
          `      <int name="rx1" value="${x + 50}"/>`,
          `    </imgdir>`,
        ].join("\n");

        // Find the closing tag of the life section and insert before it
        const lifeClosePattern = /(<imgdir name="life">[\s\S]*?)\n  <\/imgdir>/;
        const lifeMatch = xml.match(lifeClosePattern);
        if (!lifeMatch) {
          return errorResult(`Map ${mapId} has no life section.`);
        }

        xml = xml.replace(lifeClosePattern, `${lifeMatch[1]}\n${newEntry}\n  </imgdir>`);
        await writeMapXml(mapId, xml);

        return textResult(
          `Added mob spawn to map ${mapId}:\n` +
          `  Index: ${nextIndex}\n` +
          `  Mob ID: ${mobId}\n` +
          `  Position: (${x}, ${y})\n` +
          `  Respawn time: ${respawnTime}s`,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Error adding mob spawn: ${message}`);
      }
    },
  );

  // ── remove_mob_spawn ────────────────────────────────────────────────────
  server.tool(
    "remove_mob_spawn",
    "Remove mob spawn(s) from a MapleStory map by mob ID",
    {
      mapId: z.number().int().describe("The map ID to remove the mob from"),
      mobId: z.number().int().describe("The mob ID to remove"),
    },
    async ({ mapId, mobId }) => {
      try {
        let xml = await readMapXml(mapId);

        // Find and remove all life entries with type "m" and matching mob ID
        const mobIdStr = String(mobId);
        const lifeMatch = xml.match(/<imgdir name="life">([\s\S]*?)\n  <\/imgdir>/);
        if (!lifeMatch) {
          return errorResult(`Map ${mapId} has no life section.`);
        }

        const lifeContent = lifeMatch[1];
        let removedCount = 0;

        // Match individual life entries within the life section
        const entryRegex = /\n    <imgdir name="(\d+)">([\s\S]*?)<\/imgdir>/g;
        const entriesToRemove: string[] = [];
        let m: RegExpExecArray | null;

        while ((m = entryRegex.exec(lifeContent)) !== null) {
          const block = m[2];
          const typeMatch = block.match(/<string name="type" value="m"\s*\/>/);
          const idMatch = block.match(/<string name="id" value="(\d+)"\s*\/>/);
          if (typeMatch && idMatch && idMatch[1] === mobIdStr) {
            entriesToRemove.push(m[0]);
            removedCount++;
          }
        }

        if (removedCount === 0) {
          return errorResult(`No mob spawns found for mob ID ${mobId} on map ${mapId}.`);
        }

        for (const entry of entriesToRemove) {
          xml = xml.replace(entry, "");
        }

        await writeMapXml(mapId, xml);

        return textResult(`Removed ${removedCount} mob spawn(s) of mob ${mobId} from map ${mapId}.`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Error removing mob spawn: ${message}`);
      }
    },
  );

  // ── add_npc_to_map ──────────────────────────────────────────────────────
  server.tool(
    "add_npc_to_map",
    "Place an NPC on a MapleStory map",
    {
      mapId: z.number().int().describe("The map ID to place the NPC on"),
      npcId: z.number().int().describe("The NPC ID to place"),
      x: z.number().int().describe("X coordinate for the NPC position"),
      y: z.number().int().describe("Y coordinate for the NPC position"),
    },
    async ({ mapId, npcId, x, y }) => {
      try {
        let xml = await readMapXml(mapId);
        const nextIndex = getNextLifeIndex(xml);

        const newEntry = [
          `    <imgdir name="${nextIndex}">`,
          `      <string name="type" value="n"/>`,
          `      <string name="id" value="${npcId}"/>`,
          `      <int name="x" value="${x}"/>`,
          `      <int name="y" value="${y}"/>`,
          `      <int name="fh" value="0"/>`,
          `      <int name="cy" value="${y}"/>`,
          `      <int name="rx0" value="${x - 50}"/>`,
          `      <int name="rx1" value="${x + 50}"/>`,
          `    </imgdir>`,
        ].join("\n");

        const lifeClosePattern = /(<imgdir name="life">[\s\S]*?)\n  <\/imgdir>/;
        const lifeMatch = xml.match(lifeClosePattern);
        if (!lifeMatch) {
          return errorResult(`Map ${mapId} has no life section.`);
        }

        xml = xml.replace(lifeClosePattern, `${lifeMatch[1]}\n${newEntry}\n  </imgdir>`);
        await writeMapXml(mapId, xml);

        return textResult(
          `Added NPC to map ${mapId}:\n` +
          `  Index: ${nextIndex}\n` +
          `  NPC ID: ${npcId}\n` +
          `  Position: (${x}, ${y})`,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Error adding NPC: ${message}`);
      }
    },
  );

  // ── remove_npc_from_map ─────────────────────────────────────────────────
  server.tool(
    "remove_npc_from_map",
    "Remove an NPC from a MapleStory map by NPC ID",
    {
      mapId: z.number().int().describe("The map ID to remove the NPC from"),
      npcId: z.number().int().describe("The NPC ID to remove"),
    },
    async ({ mapId, npcId }) => {
      try {
        let xml = await readMapXml(mapId);

        const npcIdStr = String(npcId);
        const lifeMatch = xml.match(/<imgdir name="life">([\s\S]*?)\n  <\/imgdir>/);
        if (!lifeMatch) {
          return errorResult(`Map ${mapId} has no life section.`);
        }

        const lifeContent = lifeMatch[1];
        let removedCount = 0;

        const entryRegex = /\n    <imgdir name="(\d+)">([\s\S]*?)<\/imgdir>/g;
        const entriesToRemove: string[] = [];
        let m: RegExpExecArray | null;

        while ((m = entryRegex.exec(lifeContent)) !== null) {
          const block = m[2];
          const typeMatch = block.match(/<string name="type" value="n"\s*\/>/);
          const idMatch = block.match(/<string name="id" value="(\d+)"\s*\/>/);
          if (typeMatch && idMatch && idMatch[1] === npcIdStr) {
            entriesToRemove.push(m[0]);
            removedCount++;
          }
        }

        if (removedCount === 0) {
          return errorResult(`No NPC spawns found for NPC ID ${npcId} on map ${mapId}.`);
        }

        for (const entry of entriesToRemove) {
          xml = xml.replace(entry, "");
        }

        await writeMapXml(mapId, xml);

        return textResult(`Removed ${removedCount} NPC spawn(s) of NPC ${npcId} from map ${mapId}.`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Error removing NPC: ${message}`);
      }
    },
  );

  // ── modify_portal ───────────────────────────────────────────────────────
  server.tool(
    "modify_portal",
    "Change the destination of a portal on a MapleStory map",
    {
      mapId: z.number().int().describe("The map ID containing the portal"),
      portalName: z.string().describe("The portal name (pn) to modify"),
      targetMapId: z.number().int().describe("The new target map ID"),
      targetPortalName: z.string().describe("The target portal name on the destination map"),
    },
    async ({ mapId, portalName, targetMapId, targetPortalName }) => {
      try {
        let xml = await readMapXml(mapId);

        const portalMatch = xml.match(/<imgdir name="portal">([\s\S]*?)\n  <\/imgdir>/);
        if (!portalMatch) {
          return errorResult(`Map ${mapId} has no portal section.`);
        }

        // Find portal entries within the section, match by pn value
        const entryRegex = /<imgdir name="(\d+)">([\s\S]*?)<\/imgdir>/g;
        let found = false;
        let m: RegExpExecArray | null;
        const portalContent = portalMatch[1];

        while ((m = entryRegex.exec(portalContent)) !== null) {
          const block = m[2];
          const pnMatch = block.match(/<string name="pn" value="([^"]*)"\s*\/>/);
          if (pnMatch && pnMatch[1] === portalName) {
            // Replace tm and tn values within this block
            let newBlock = block.replace(
              /<int name="tm" value="[^"]*"\s*\/>/,
              `<int name="tm" value="${targetMapId}"/>`,
            );
            newBlock = newBlock.replace(
              /<string name="tn" value="[^"]*"\s*\/>/,
              `<string name="tn" value="${targetPortalName}"/>`,
            );

            const fullOldEntry = `<imgdir name="${m[1]}">${block}</imgdir>`;
            const fullNewEntry = `<imgdir name="${m[1]}">${newBlock}</imgdir>`;
            xml = xml.replace(fullOldEntry, fullNewEntry);
            found = true;
            break;
          }
        }

        if (!found) {
          return errorResult(`Portal "${portalName}" not found on map ${mapId}.`);
        }

        await writeMapXml(mapId, xml);

        return textResult(
          `Modified portal "${portalName}" on map ${mapId}:\n` +
          `  Target map: ${targetMapId}\n` +
          `  Target portal: ${targetPortalName}`,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Error modifying portal: ${message}`);
      }
    },
  );

  // ── set_map_property ────────────────────────────────────────────────────
  server.tool(
    "set_map_property",
    "Modify an info property of a MapleStory map (e.g. mobRate, bgm, town, returnMap, fieldLimit)",
    {
      mapId: z.number().int().describe("The map ID to modify"),
      property: z.string().describe("The property name to set (e.g. 'mobRate', 'bgm', 'town', 'returnMap', 'fieldLimit')"),
      value: z.union([z.string(), z.number()]).describe("The new value for the property"),
    },
    async ({ mapId, property, value }) => {
      try {
        let xml = await readMapXml(mapId);

        const infoMatch = xml.match(/(<imgdir name="info">)([\s\S]*?)(<\/imgdir>)/);
        if (!infoMatch) {
          return errorResult(`Map ${mapId} has no info section.`);
        }

        const infoContent = infoMatch[2];
        const valueStr = String(value);

        // Check if the property already exists
        const existingPattern = new RegExp(
          `<(int|string|float)\\s+name="${escapeRegex(property)}"\\s+value="[^"]*"\\s*\\/>`,
        );
        const existingMatch = infoContent.match(existingPattern);

        let newInfoContent: string;
        let action: string;

        if (existingMatch) {
          // Update existing property - determine the type tag to use
          const existingType = existingMatch[1];
          let newType = existingType;

          // If changing to a different value type, update the tag
          if (typeof value === "number") {
            newType = Number.isInteger(value) ? "int" : "float";
          } else {
            newType = "string";
          }

          newInfoContent = infoContent.replace(
            existingPattern,
            `<${newType} name="${property}" value="${valueStr}"/>`,
          );
          action = "Updated";
        } else {
          // Add new property before the closing tag
          const indent = "    ";
          newInfoContent = infoContent + `${indent}<${typeof value === "number" ? (Number.isInteger(value) ? "int" : "float") : "string"} name="${property}" value="${valueStr}"/>\n  `;
          action = "Added";
        }

        xml = xml.replace(
          `${infoMatch[1]}${infoContent}${infoMatch[3]}`,
          `${infoMatch[1]}${newInfoContent}${infoMatch[3]}`,
        );

        await writeMapXml(mapId, xml);

        return textResult(`${action} property on map ${mapId}:\n  ${property} = ${valueStr}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Error setting map property: ${message}`);
      }
    },
  );
}

// ── Utilities ───────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
