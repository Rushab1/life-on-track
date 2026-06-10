import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "@/lib/google/tokens";
import { pushToCalendar } from "@/lib/google/calendar";
import { dateSchema } from "../validation";

/**
 * sync_calendar — push the active plan's gym/prep activities (and life events)
 * to Google Calendar for a date range. Auto-checks connection first; if not
 * connected, returns an auth link for the user to visit. Day overrides are
 * honored, and stale events (e.g. a swapped-to-rest day) are removed.
 */
export function registerCalendarTool(
  server: McpServer,
  client: SupabaseClient,
  userId: string,
) {
  server.tool(
    "sync_calendar",
    "Sync the active plan's activities to Google Calendar for a date range. Auto-checks connection first; if not connected, returns an auth link for the user to visit. Day overrides are honored — a gym swap shows up on the correct day.",
    {
      start_date: dateSchema.describe("Start date YYYY-MM-DD"),
      end_date: dateSchema.describe("End date YYYY-MM-DD"),
    },
    async ({ start_date, end_date }) => {
      if (start_date > end_date) {
        return {
          content: [
            {
              type: "text" as const,
              text: "start_date must be on or before end_date.",
            },
          ],
        };
      }

      const token = await getValidAccessToken(client, userId);
      if (!token) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL
          ? process.env.NEXT_PUBLIC_APP_URL
          : process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
            : "http://localhost:3000";
        return {
          content: [
            {
              type: "text" as const,
              text: `Google Calendar is not connected. Ask the user to visit: ${appUrl}/api/google/auth and then retry sync_calendar.`,
            },
          ],
        };
      }

      const { synced, failed, deleted } = await pushToCalendar(
        client,
        userId,
        start_date,
        end_date,
      );

      let msg = `Synced ${synced} events to Google Calendar for ${start_date} to ${end_date}.`;
      if (deleted > 0) msg += ` Removed ${deleted} stale events.`;
      if (failed > 0) msg += ` ${failed} events failed.`;
      return { content: [{ type: "text" as const, text: msg }] };
    },
  );
}
