import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { PATHS } from "../utils/paths.js";

const execAsync = promisify(exec);

const COSMIC_DIR = PATHS.root;

async function runDockerCompose(args: string, timeoutMs = 120_000): Promise<{ stdout: string; stderr: string }> {
  return execAsync(`docker compose ${args}`, {
    cwd: COSMIC_DIR,
    timeout: timeoutMs,
  });
}

async function isPortListening(port: number): Promise<boolean> {
  try {
    // Use lsof to check if a port is in use (works on macOS and Linux)
    await execAsync(`lsof -i :${port} -sTCP:LISTEN`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export function registerServerTools(server: McpServer): void {
  // ── server_status ───────────────────────────────────────────────────
  server.tool(
    "server_status",
    "Check the status of the Cosmic MapleStory server and database Docker containers, and verify that game ports are listening.",
    {},
    async () => {
      try {
        const sections: string[] = [];

        // Check Docker containers
        let dockerStatus: string;
        try {
          const { stdout } = await runDockerCompose("ps", 10_000);
          dockerStatus = stdout.trim() || "No containers found.";
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          dockerStatus = `Docker Compose error: ${message}`;
        }
        sections.push(`Docker Containers:\n${dockerStatus}`);

        // Check key ports
        const portChecks = [
          { port: 3307, label: "MySQL (3307)" },
          { port: 8484, label: "Login Server (8484)" },
          { port: 7575, label: "Channel 1 (7575)" },
          { port: 7576, label: "Channel 2 (7576)" },
          { port: 7577, label: "Channel 3 (7577)" },
        ];

        const portResults = await Promise.all(
          portChecks.map(async ({ port, label }) => {
            const listening = await isPortListening(port);
            return `  ${listening ? "UP" : "DOWN"} - ${label}`;
          }),
        );

        sections.push(`Port Status:\n${portResults.join("\n")}`);

        return {
          content: [{ type: "text" as const, text: sections.join("\n\n") }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error checking server status: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── server_start ────────────────────────────────────────────────────
  server.tool(
    "server_start",
    "Start the Cosmic MapleStory server and database using Docker Compose. This runs 'docker compose up -d' in the Cosmic directory.",
    {},
    async () => {
      try {
        const { stdout, stderr } = await runDockerCompose("up -d", 300_000);
        const output = [stdout, stderr].filter(Boolean).join("\n").trim();
        return {
          content: [{ type: "text" as const, text: `Server start initiated.\n\n${output || "Containers starting in background."}` }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error starting server: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── server_stop ─────────────────────────────────────────────────────
  server.tool(
    "server_stop",
    "Stop the Cosmic MapleStory server and database using Docker Compose. This runs 'docker compose down' in the Cosmic directory.",
    {},
    async () => {
      try {
        const { stdout, stderr } = await runDockerCompose("down", 60_000);
        const output = [stdout, stderr].filter(Boolean).join("\n").trim();
        return {
          content: [{ type: "text" as const, text: `Server stopped.\n\n${output || "All containers stopped."}` }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error stopping server: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── server_restart ──────────────────────────────────────────────────
  server.tool(
    "server_restart",
    "Restart the Cosmic MapleStory server and database containers. This runs 'docker compose restart' in the Cosmic directory.",
    {},
    async () => {
      try {
        const { stdout, stderr } = await runDockerCompose("restart", 120_000);
        const output = [stdout, stderr].filter(Boolean).join("\n").trim();
        return {
          content: [{ type: "text" as const, text: `Server restarted.\n\n${output || "All containers restarted."}` }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error restarting server: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── server_logs ─────────────────────────────────────────────────────
  server.tool(
    "server_logs",
    "Get recent logs from the Cosmic MapleStory server or database Docker containers.",
    {
      lines: z.number().int().min(1).max(5000).default(100)
        .describe("Number of log lines to retrieve (default: 100, max: 5000)"),
      service: z.enum(["maplestory", "db"]).optional()
        .describe("Specific service to get logs from: 'maplestory' (game server) or 'db' (MySQL). Omit for all services."),
    },
    async ({ lines, service }) => {
      try {
        const serviceArg = service ? ` ${service}` : "";
        const { stdout, stderr } = await runDockerCompose(`logs --tail=${lines}${serviceArg}`, 30_000);
        const output = stdout.trim() || stderr.trim() || "No logs available.";
        return {
          content: [{ type: "text" as const, text: output }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error fetching logs: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── server_rebuild ──────────────────────────────────────────────────
  server.tool(
    "server_rebuild",
    "Rebuild and restart the Cosmic MapleStory server. This runs 'docker compose up --build -d' to recompile the Java source and redeploy. Use after making code changes.",
    {},
    async () => {
      try {
        const { stdout, stderr } = await runDockerCompose("up --build -d", 600_000);
        const output = [stdout, stderr].filter(Boolean).join("\n").trim();
        return {
          content: [{ type: "text" as const, text: `Server rebuild initiated.\n\n${output || "Rebuild and restart in progress."}` }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error rebuilding server: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
