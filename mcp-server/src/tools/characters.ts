import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query, execute } from "../utils/db.js";

export function registerCharacterTools(server: McpServer) {
  server.tool(
    "list_characters",
    "List all characters, optionally filtered by account ID or world ID",
    {
      accountId: z.number().optional().describe("Filter by account ID"),
      worldId: z.number().optional().describe("Filter by world ID"),
    },
    async ({ accountId, worldId }) => {
      try {
        let sql = `SELECT id, \`name\`, level, job, str, dex, \`int\`, luk, hp, mp, maxhp, maxmp, meso, map, gm, accountid, world FROM characters`;
        const conditions: string[] = [];
        const params: any[] = [];

        if (accountId !== undefined) {
          conditions.push("accountid = ?");
          params.push(accountId);
        }
        if (worldId !== undefined) {
          conditions.push("world = ?");
          params.push(worldId);
        }

        if (conditions.length > 0) {
          sql += " WHERE " + conditions.join(" AND ");
        }

        sql += " ORDER BY level DESC, id ASC";

        const rows = await query(sql, params);
        return {
          content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error listing characters: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_character",
    "Get detailed information about a specific character by name or ID",
    {
      name: z.string().optional().describe("Character name"),
      id: z.number().optional().describe("Character ID"),
    },
    async ({ name, id }) => {
      try {
        if (!name && id === undefined) {
          return {
            content: [{ type: "text", text: "Either name or id must be provided" }],
            isError: true,
          };
        }

        let sql = `SELECT id, accountid, world, \`name\`, level, exp, gachaexp, str, dex, \`int\`, luk,
          hp, mp, maxhp, maxmp, meso, hpMpUsed, job, skincolor, gender, fame, fquest, hair, face,
          ap, sp, map, spawnpoint, gm, party, buddyCapacity, createdate,
          \`rank\`, rankMove, jobRank, jobRankMove, guildid, guildrank,
          equipslots, useslots, setupslots, etcslots,
          monsterbookcover, dojoPoints, lastDojoStage, reborns, PQPoints,
          lastLogoutTime, lastExpGainTime, jailexpire
          FROM characters`;

        const params: any[] = [];
        if (name) {
          sql += " WHERE `name` = ?";
          params.push(name);
        } else {
          sql += " WHERE id = ?";
          params.push(id);
        }

        const rows = await query(sql, params);
        if (rows.length === 0) {
          return {
            content: [{ type: "text", text: `Character not found` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(rows[0], null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error getting character: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "modify_character",
    "Modify a character's stats (level, str, dex, int, luk, maxhp, maxmp, meso, fame, ap, sp, job, map)",
    {
      name: z.string().describe("Character name"),
      level: z.number().min(1).max(200).optional().describe("Character level (1-200)"),
      str: z.number().min(0).optional().describe("STR stat"),
      dex: z.number().min(0).optional().describe("DEX stat"),
      int_stat: z.number().min(0).optional().describe("INT stat"),
      luk: z.number().min(0).optional().describe("LUK stat"),
      maxhp: z.number().min(1).optional().describe("Max HP"),
      maxmp: z.number().min(1).optional().describe("Max MP"),
      meso: z.number().min(0).optional().describe("Meso amount"),
      fame: z.number().optional().describe("Fame"),
      ap: z.number().min(0).optional().describe("Available AP"),
      sp: z.number().min(0).optional().describe("Available SP (sets first SP slot)"),
      job: z.number().min(0).optional().describe("Job ID"),
      map: z.number().optional().describe("Map ID"),
    },
    async ({ name, level, str, dex, int_stat, luk, maxhp, maxmp, meso, fame, ap, sp, job, map }) => {
      try {
        const updates: string[] = [];
        const params: any[] = [];

        if (level !== undefined) {
          updates.push("level = ?");
          params.push(level);
        }
        if (str !== undefined) {
          updates.push("str = ?");
          params.push(str);
        }
        if (dex !== undefined) {
          updates.push("dex = ?");
          params.push(dex);
        }
        if (int_stat !== undefined) {
          updates.push("`int` = ?");
          params.push(int_stat);
        }
        if (luk !== undefined) {
          updates.push("luk = ?");
          params.push(luk);
        }
        if (maxhp !== undefined) {
          updates.push("maxhp = ?, hp = ?");
          params.push(maxhp, maxhp);
        }
        if (maxmp !== undefined) {
          updates.push("maxmp = ?, mp = ?");
          params.push(maxmp, maxmp);
        }
        if (meso !== undefined) {
          updates.push("meso = ?");
          params.push(meso);
        }
        if (fame !== undefined) {
          updates.push("fame = ?");
          params.push(fame);
        }
        if (ap !== undefined) {
          updates.push("ap = ?");
          params.push(ap);
        }
        if (sp !== undefined) {
          // SP is stored as comma-separated string "0,0,0,0,0,0,0,0,0,0"
          // Setting sp updates the first slot value
          updates.push("sp = CONCAT(?, SUBSTRING(sp, LOCATE(',', sp)))");
          params.push(sp);
        }
        if (job !== undefined) {
          updates.push("job = ?");
          params.push(job);
        }
        if (map !== undefined) {
          updates.push("map = ?");
          params.push(map);
        }

        if (updates.length === 0) {
          return {
            content: [{ type: "text", text: "No fields to update were provided" }],
            isError: true,
          };
        }

        params.push(name);
        const sql = `UPDATE characters SET ${updates.join(", ")} WHERE \`name\` = ?`;
        const result = await execute(sql, params);

        if (result.affectedRows === 0) {
          return {
            content: [{ type: "text", text: `Character '${name}' not found` }],
            isError: true,
          };
        }

        // Fetch updated character to confirm changes
        const updated = await query(
          `SELECT id, \`name\`, level, job, str, dex, \`int\`, luk, hp, mp, maxhp, maxmp, meso, fame, ap, sp, map, gm FROM characters WHERE \`name\` = ?`,
          [name]
        );

        return {
          content: [{ type: "text", text: JSON.stringify({ message: `Character '${name}' updated successfully`, character: updated[0] }, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error modifying character: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "give_item",
    "Give an item to a character by inserting it into their inventory",
    {
      characterName: z.string().describe("Character name"),
      itemId: z.number().describe("Item ID to give"),
      quantity: z.number().min(1).default(1).describe("Quantity (default 1, ignored for equips)"),
    },
    async ({ characterName, itemId, quantity }) => {
      try {
        // Look up character
        const chars = await query<{ id: number; accountid: number }>(
          "SELECT id, accountid FROM characters WHERE `name` = ?",
          [characterName]
        );

        if (chars.length === 0) {
          return {
            content: [{ type: "text", text: `Character '${characterName}' not found` }],
            isError: true,
          };
        }

        const character = chars[0];

        // Determine inventory type from item ID range
        let inventoryType: number;
        if (itemId >= 1000000 && itemId < 2000000) {
          inventoryType = 1; // equip
        } else if (itemId >= 2000000 && itemId < 3000000) {
          inventoryType = 2; // use
        } else if (itemId >= 3000000 && itemId < 4000000) {
          inventoryType = 3; // setup
        } else if (itemId >= 4000000 && itemId < 5000000) {
          inventoryType = 4; // etc
        } else if (itemId >= 5000000 && itemId < 6000000) {
          inventoryType = 5; // cash
        } else {
          return {
            content: [{ type: "text", text: `Invalid item ID range: ${itemId}. Expected 1000000-5999999.` }],
            isError: true,
          };
        }

        const isEquip = inventoryType === 1;

        // Find the next available position in the inventory
        const posResult = await query<{ nextPos: number }>(
          `SELECT COALESCE(MAX(position), 0) + 1 AS nextPos FROM inventoryitems WHERE characterid = ? AND inventorytype = ? AND position > 0`,
          [character.id, inventoryType]
        );
        const nextPosition = posResult[0]?.nextPos || 1;

        // The 'type' column: 1 = regular item stored by characterid, 2 = equipped item
        // For giving items, we use type = 1
        const itemType = 1;
        const effectiveQuantity = isEquip ? 1 : quantity;

        const insertResult = await execute(
          `INSERT INTO inventoryitems (type, characterid, accountid, itemid, inventorytype, position, quantity, owner, petid, flag, expiration, giftFrom)
           VALUES (?, ?, ?, ?, ?, ?, ?, '', -1, 0, -1, '')`,
          [itemType, character.id, character.accountid, itemId, inventoryType, nextPosition, effectiveQuantity]
        );

        // If it's an equip, also insert a default row into inventoryequipment
        if (isEquip) {
          await execute(
            `INSERT INTO inventoryequipment (inventoryitemid, upgradeslots, level, str, dex, \`int\`, luk, hp, mp, watk, matk, wdef, mdef, acc, avoid, hands, speed, jump, locked, vicious, itemlevel, itemexp, ringid)
             VALUES (?, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, -1)`,
            [insertResult.insertId]
          );
        }

        const inventoryNames: Record<number, string> = {
          1: "Equip",
          2: "Use",
          3: "Setup",
          4: "Etc",
          5: "Cash",
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              message: `Gave item ${itemId} (x${effectiveQuantity}) to '${characterName}'`,
              inventoryType: inventoryNames[inventoryType],
              position: nextPosition,
              inventoryItemId: insertResult.insertId,
            }, null, 2),
          }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error giving item: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "set_gm_level",
    "Set the GM level for a character (0 = normal player, 1-6 = GM levels). Updates the gm column on the characters table.",
    {
      characterName: z.string().describe("Character name"),
      gmLevel: z.number().min(0).max(6).describe("GM level (0 = normal, 1-6 = GM)"),
    },
    async ({ characterName, gmLevel }) => {
      try {
        // The gm column is on the characters table, not accounts
        const result = await execute(
          "UPDATE characters SET gm = ? WHERE `name` = ?",
          [gmLevel, characterName]
        );

        if (result.affectedRows === 0) {
          return {
            content: [{ type: "text", text: `Character '${characterName}' not found` }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              message: `Set GM level to ${gmLevel} for character '${characterName}'`,
              characterName,
              gmLevel,
            }, null, 2),
          }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error setting GM level: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
