import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query, execute } from "../utils/db.js";

export function registerAccountTools(server: McpServer) {
  server.tool(
    "list_accounts",
    "List all accounts with basic info (id, name, banned status, creation date)",
    {
      limit: z.number().min(1).max(500).default(50).describe("Maximum number of accounts to return (default 50)"),
    },
    async ({ limit }) => {
      try {
        const rows = await query(
          `SELECT id, \`name\`, banned, banreason, createdat, lastlogin, characterslots, gender, nxCredit, maplePoint, nxPrepaid, rewardpoints, votepoints, webadmin, mute, email, language
           FROM accounts
           ORDER BY id ASC
           LIMIT ?`,
          [limit]
        );

        return {
          content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error listing accounts: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_account",
    "Get detailed information about a specific account by name or ID",
    {
      name: z.string().optional().describe("Account name"),
      id: z.number().optional().describe("Account ID"),
    },
    async ({ name, id }) => {
      try {
        if (!name && id === undefined) {
          return {
            content: [{ type: "text", text: "Either name or id must be provided" }],
            isError: true,
          };
        }

        let sql = `SELECT id, \`name\`, loggedin, lastlogin, createdat, birthday, banned, banreason,
          nxCredit, maplePoint, nxPrepaid, characterslots, gender, tempban, greason, tos,
          webadmin, nick, mute, email, rewardpoints, votepoints, language
          FROM accounts`;

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
            content: [{ type: "text", text: `Account not found` }],
            isError: true,
          };
        }

        // Also fetch characters belonging to this account
        const account = rows[0] as any;
        const characters = await query(
          `SELECT id, \`name\`, level, job, gm, world FROM characters WHERE accountid = ? ORDER BY level DESC`,
          [account.id]
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({ ...account, characters }, null, 2),
          }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error getting account: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "ban_account",
    "Ban an account by name, optionally providing a reason",
    {
      name: z.string().describe("Account name to ban"),
      reason: z.string().optional().describe("Ban reason"),
    },
    async ({ name, reason }) => {
      try {
        const sql = reason
          ? "UPDATE accounts SET banned = 1, banreason = ? WHERE `name` = ?"
          : "UPDATE accounts SET banned = 1 WHERE `name` = ?";
        const params = reason ? [reason, name] : [name];

        const result = await execute(sql, params);

        if (result.affectedRows === 0) {
          return {
            content: [{ type: "text", text: `Account '${name}' not found` }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              message: `Account '${name}' has been banned`,
              reason: reason || "No reason provided",
            }, null, 2),
          }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error banning account: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "unban_account",
    "Unban an account by name",
    {
      name: z.string().describe("Account name to unban"),
    },
    async ({ name }) => {
      try {
        const result = await execute(
          "UPDATE accounts SET banned = 0, banreason = NULL WHERE `name` = ?",
          [name]
        );

        if (result.affectedRows === 0) {
          return {
            content: [{ type: "text", text: `Account '${name}' not found` }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              message: `Account '${name}' has been unbanned`,
            }, null, 2),
          }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error unbanning account: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
