import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../auth.js";

export function registerLifeEventTools(server: McpServer) {
  server.tool(
    "log_event",
    "Log an ad-hoc life event for a date. Use this for one-off activities that aren't part of the regular schedule — conferences, trips, doctor visits, social events, etc.",
    {
      date: z.string().describe("Date in YYYY-MM-DD format"),
      title: z.string().describe("Short title for the event"),
      notes: z.string().optional().describe("Optional details or notes"),
    },
    async ({ date, title, notes }) => {
      const client = getClient();
      const { data: userData } = await client.auth.getUser();
      const userId = userData.user?.id;

      const { error } = await client.from("life_events").insert({
        user_id: userId, date, title, notes: notes ?? null,
      });

      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      return { content: [{ type: "text" as const, text: `Logged event for ${date}: "${title}"` }] };
    }
  );

  server.tool(
    "get_events",
    "Get all life events for a date or date range. Returns ad-hoc events like conferences, trips, appointments, etc.",
    {
      date: z.string().optional().describe("Single date YYYY-MM-DD"),
      start_date: z.string().optional().describe("Start of range YYYY-MM-DD (inclusive). Must be used with end_date."),
      end_date: z.string().optional().describe("End of range YYYY-MM-DD (inclusive). Must be used with start_date."),
    },
    async ({ date, start_date, end_date }) => {
      const client = getClient();
      let query = client.from("life_events").select("*").order("date").order("created_at");

      if (date) {
        query = query.eq("date", date);
      } else if (start_date && end_date) {
        query = query.gte("date", start_date).lte("date", end_date);
      } else if (start_date || end_date) {
        return { content: [{ type: "text" as const, text: "Both start_date and end_date are required for a range query. Use date for a single date." }] };
      } else {
        const end = new Date().toISOString().split("T")[0];
        const start = new Date(Date.now() - 29 * 86400000).toISOString().split("T")[0];
        query = query.gte("date", start).lte("date", end);
      }

      const { data, error } = await query;
      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      if (!data || data.length === 0) return { content: [{ type: "text" as const, text: "No events found." }] };

      const events = data.map((e: { id: string; date: string; title: string; notes: string | null }) => ({
        id: e.id, date: e.date, title: e.title, notes: e.notes,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(events, null, 2) }] };
    }
  );

  server.tool(
    "delete_event",
    "Delete a life event by ID. Get the ID from get_events.",
    { id: z.string().describe("Event ID (UUID from get_events)") },
    async ({ id }) => {
      const client = getClient();
      const { error } = await client.from("life_events").delete().eq("id", id);
      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      return { content: [{ type: "text" as const, text: `Event ${id} deleted.` }] };
    }
  );
}
