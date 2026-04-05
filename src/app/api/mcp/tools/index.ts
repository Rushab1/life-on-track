import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerDailyLogTools } from "./daily-logs";
import { registerActivityTools } from "./activities";
import { registerWorkoutTools } from "./workouts";
import { registerPlanTools } from "./plans";
import { registerSummaryTools } from "./summary";
import { registerGoogleCalendarTools } from "./google-calendar";
import { registerLifeEventTools } from "./life-events";

export function registerAllTools(server: McpServer, client: SupabaseClient, userId: string) {
  registerDailyLogTools(server, client, userId);
  registerActivityTools(server, client, userId);
  registerWorkoutTools(server, client, userId);
  registerPlanTools(server, client, userId);
  registerSummaryTools(server, client, userId);
  registerGoogleCalendarTools(server, client, userId);
  registerLifeEventTools(server, client, userId);
}
