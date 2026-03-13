import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerConfigTools } from "./tools/config.js";
import { registerItemTools } from "./tools/items.js";
import { registerMobTools } from "./tools/mobs.js";
import { registerMapTools } from "./tools/maps.js";
import { registerCharacterTools } from "./tools/characters.js";
import { registerAccountTools } from "./tools/accounts.js";
import { registerScriptTools } from "./tools/scripts.js";
import { registerDropTools } from "./tools/drops.js";
import { registerServerTools } from "./tools/server.js";

const server = new McpServer({
  name: "cosmic-mcp",
  version: "1.0.0",
  description: "MCP server for managing the Cosmic MapleStory server emulator. Provides tools for configuration, items, mobs, maps, characters, accounts, scripts, drops, and server management.",
});

// Register all tool modules
registerConfigTools(server);
registerItemTools(server);
registerMobTools(server);
registerMapTools(server);
registerCharacterTools(server);
registerAccountTools(server);
registerScriptTools(server);
registerDropTools(server);
registerServerTools(server);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Cosmic MCP server started");
}

main().catch((error) => {
  console.error("Failed to start Cosmic MCP server:", error);
  process.exit(1);
});
