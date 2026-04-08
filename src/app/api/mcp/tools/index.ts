import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerReadTools } from "./reads";
import { registerSaveDayTool } from "./save-day";
import { registerWorkoutTools } from "./workouts";
import { registerPlanTool } from "./plans";
import { registerWidgetTools } from "./widgets";
import { registerLifeEventTool } from "./life-events";
import { registerCalendarTool } from "./google-calendar";
import { registerCatalogTools } from "./catalog";

/**
 * Consolidated tool surface. Replaces the old 34-tool layout with a compact
 * set organized around "one call per intent":
 *
 * Reads (2):     get_day, get_history
 * Writes (3):    save_day, log_workout, delete_workout
 * Admin (4):     manage_plan, manage_widget, manage_event, manage_exercise
 * Widget (2):    log_widget, delete_widget_value
 * Swap (1):      override_gym_day
 * Calendar (1):  sync_calendar
 *
 * Total: 13 tools.
 */
export function registerAllTools(
  server: McpServer,
  client: SupabaseClient,
  userId: string,
) {
  registerReadTools(server, client, userId);
  registerSaveDayTool(server, client, userId);
  registerWorkoutTools(server, client, userId);
  registerPlanTool(server, client, userId);
  registerWidgetTools(server, client, userId);
  registerLifeEventTool(server, client, userId);
  registerCalendarTool(server, client, userId);
  registerCatalogTools(server, client, userId);
}
