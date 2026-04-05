#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { authenticate } from "./auth.js";
import { registerDailyLogTools } from "./tools/daily-logs.js";
import { registerActivityTools } from "./tools/activities.js";
import { registerWorkoutTools } from "./tools/workouts.js";
import { registerPlanTools } from "./tools/plans.js";
import { registerSummaryTools } from "./tools/summary.js";
import { registerLifeEventTools } from "./tools/life-events.js";

async function main() {
  // Authenticate with Supabase via MCP token
  await authenticate();

  // Create the MCP server
  const server = new McpServer({
    name: "life-on-track",
    version: "0.1.0",
  });

  // Register all tools
  registerDailyLogTools(server);
  registerActivityTools(server);
  registerWorkoutTools(server);
  registerPlanTools(server);
  registerSummaryTools(server);
  registerLifeEventTools(server);

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start Life on Track MCP server:", err);
  process.exit(1);
});
