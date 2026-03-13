import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query, execute } from "../utils/db.js";

interface DropEntry {
  id: number;
  dropperid: number;
  itemid: number;
  minimum_quantity: number;
  maximum_quantity: number;
  questid: number;
  chance: number;
}

interface GlobalDropEntry {
  id: number;
  continent: number;
  itemid: number;
  minimum_quantity: number;
  maximum_quantity: number;
  questid: number;
  chance: number;
  comments: string | null;
}

function formatDropChance(chance: number): string {
  // Cosmic uses a chance value where 1000000 = 100%
  const percent = (chance / 1000000) * 100;
  if (percent >= 1) {
    return `${percent.toFixed(2)}%`;
  }
  return `${percent.toFixed(4)}%`;
}

function formatDropEntry(drop: DropEntry): string {
  const qty = drop.minimum_quantity === drop.maximum_quantity
    ? `${drop.minimum_quantity}`
    : `${drop.minimum_quantity}-${drop.maximum_quantity}`;
  const questNote = drop.questid > 0 ? ` (quest: ${drop.questid})` : "";
  return `  Item ${drop.itemid}: chance ${drop.chance} (${formatDropChance(drop.chance)}), qty ${qty}${questNote}`;
}

function formatGlobalDropEntry(drop: GlobalDropEntry): string {
  const qty = drop.minimum_quantity === drop.maximum_quantity
    ? `${drop.minimum_quantity}`
    : `${drop.minimum_quantity}-${drop.maximum_quantity}`;
  const questNote = drop.questid > 0 ? ` (quest: ${drop.questid})` : "";
  const continentNote = drop.continent >= 0 ? ` [continent: ${drop.continent}]` : " [all continents]";
  const comment = drop.comments ? ` -- ${drop.comments}` : "";
  return `  Item ${drop.itemid}: chance ${drop.chance} (${formatDropChance(drop.chance)}), qty ${qty}${continentNote}${questNote}${comment}`;
}

export function registerDropTools(server: McpServer): void {
  // ── get_mob_drops ───────────────────────────────────────────────────
  server.tool(
    "get_mob_drops",
    "Get the drop table for a specific mob from the database. Returns all items the mob can drop with their chances and quantities.",
    {
      mobId: z.number().int().positive()
        .describe("The mob/monster ID to look up drops for"),
    },
    async ({ mobId }) => {
      try {
        const drops = await query<DropEntry>(
          "SELECT id, dropperid, itemid, minimum_quantity, maximum_quantity, questid, chance FROM drop_data WHERE dropperid = ? ORDER BY chance DESC",
          [mobId],
        );

        if (drops.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No drops found for mob ${mobId}.` }],
          };
        }

        const lines = drops.map(formatDropEntry);
        const header = `Drops for mob ${mobId} (${drops.length} entries):\n${"─".repeat(60)}`;
        return {
          content: [{ type: "text" as const, text: `${header}\n${lines.join("\n")}` }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error fetching mob drops: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── add_mob_drop ────────────────────────────────────────────────────
  server.tool(
    "add_mob_drop",
    "Add a new drop entry to a mob's drop table in the database. The chance value uses Cosmic's scale where 1000000 = 100%.",
    {
      mobId: z.number().int().positive()
        .describe("The mob/monster ID to add the drop to"),
      itemId: z.number().int()
        .describe("The item ID to drop. Use 0 for meso drops."),
      chance: z.number().int().positive()
        .describe("Drop chance on Cosmic's scale (1000000 = 100%, 100000 = 10%, 10000 = 1%)"),
      minQuantity: z.number().int().min(1).default(1)
        .describe("Minimum quantity to drop (default: 1)"),
      maxQuantity: z.number().int().min(1).default(1)
        .describe("Maximum quantity to drop (default: 1)"),
      questId: z.number().int().default(0)
        .describe("Quest ID requirement (0 = no quest requirement)"),
    },
    async ({ mobId, itemId, chance, minQuantity, maxQuantity, questId }) => {
      try {
        // Check if this drop already exists
        const existing = await query<DropEntry>(
          "SELECT id FROM drop_data WHERE dropperid = ? AND itemid = ?",
          [mobId, itemId],
        );

        if (existing.length > 0) {
          return {
            content: [{ type: "text" as const, text: `Drop already exists for mob ${mobId} -> item ${itemId} (id: ${existing[0].id}). Remove it first or modify directly.` }],
            isError: true,
          };
        }

        const result = await execute(
          "INSERT INTO drop_data (dropperid, itemid, chance, minimum_quantity, maximum_quantity, questid) VALUES (?, ?, ?, ?, ?, ?)",
          [mobId, itemId, chance, minQuantity, maxQuantity, questId],
        );

        const qty = minQuantity === maxQuantity ? `${minQuantity}` : `${minQuantity}-${maxQuantity}`;
        return {
          content: [{
            type: "text" as const,
            text: `Added drop entry (id: ${result.insertId}):\n  Mob ${mobId} -> Item ${itemId}, chance ${chance} (${formatDropChance(chance)}), qty ${qty}\n\nNote: The server caches drop data in memory. A server restart is required for changes to take effect.`,
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error adding mob drop: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── remove_mob_drop ─────────────────────────────────────────────────
  server.tool(
    "remove_mob_drop",
    "Remove a drop entry from a mob's drop table in the database.",
    {
      mobId: z.number().int().positive()
        .describe("The mob/monster ID to remove the drop from"),
      itemId: z.number().int()
        .describe("The item ID to remove from the mob's drop table"),
    },
    async ({ mobId, itemId }) => {
      try {
        // Check if the drop exists first
        const existing = await query<DropEntry>(
          "SELECT id, chance, minimum_quantity, maximum_quantity FROM drop_data WHERE dropperid = ? AND itemid = ?",
          [mobId, itemId],
        );

        if (existing.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No drop entry found for mob ${mobId} -> item ${itemId}.` }],
            isError: true,
          };
        }

        const result = await execute(
          "DELETE FROM drop_data WHERE dropperid = ? AND itemid = ?",
          [mobId, itemId],
        );

        return {
          content: [{
            type: "text" as const,
            text: `Removed ${result.affectedRows} drop entry(s) for mob ${mobId} -> item ${itemId}.\n\nNote: The server caches drop data in memory. A server restart is required for changes to take effect.`,
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error removing mob drop: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── get_global_drops ────────────────────────────────────────────────
  server.tool(
    "get_global_drops",
    "Get the global drop table (items that can drop from all mobs). These are stored in drop_data_global and can be filtered by continent.",
    {},
    async () => {
      try {
        const drops = await query<GlobalDropEntry>(
          "SELECT id, continent, itemid, minimum_quantity, maximum_quantity, questid, chance, comments FROM drop_data_global WHERE chance > 0 ORDER BY chance DESC",
        );

        if (drops.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No global drops configured." }],
          };
        }

        const lines = drops.map(formatGlobalDropEntry);
        const header = `Global drops (${drops.length} entries):\n${"─".repeat(60)}`;
        return {
          content: [{ type: "text" as const, text: `${header}\n${lines.join("\n")}` }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error fetching global drops: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
