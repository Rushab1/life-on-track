import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dateSchema, uuidSchema, safeErrorMessage } from "../validation";

export function registerLifeEventTools(server: McpServer, client: SupabaseClient, userId: string) {
  server.tool(
    "log_event",
    "Log an ad-hoc life event for a date. Use this for one-off activities that aren't part of the regular schedule — conferences, trips, doctor visits, social events, etc.",
    {
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      title: z.string().max(200).describe("Short title for the event (e.g. 'AWS re:Invent conference', 'Dentist appointment')"),
      notes: z.string().max(5000).optional().describe("Optional details or notes"),
    },
    async ({ date, title, notes }) => {
      const { error } = await client.from("life_events").insert({
        user_id: userId, date, title, notes: notes ?? null,
      });

      if (error) return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      return { content: [{ type: "text" as const, text: `Logged event for ${date}: "${title}"` }] };
    }
  );

  server.tool(
    "get_events",
    "Get all life events for a date or date range. Returns ad-hoc events like conferences, trips, appointments, etc.",
    {
      date: dateSchema.optional().describe("Single date YYYY-MM-DD. If provided, returns events for this date only."),
      start_date: dateSchema.optional().describe("Start of range YYYY-MM-DD (inclusive). Use with end_date."),
      end_date: dateSchema.optional().describe("End of range YYYY-MM-DD (inclusive). Use with start_date."),
    },
    async ({ date, start_date, end_date }) => {
      let query = client.from("life_events").select("*").eq("user_id", userId).order("date").order("created_at");

      if (date) {
        query = query.eq("date", date);
      } else if (start_date && end_date) {
        query = query.gte("date", start_date).lte("date", end_date);
      } else {
        // Default: last 30 days
        const end = new Date().toISOString().split("T")[0];
        const start = new Date(Date.now() - 29 * 86400000).toISOString().split("T")[0];
        query = query.gte("date", start).lte("date", end);
      }

      const { data, error } = await query;
      if (error) return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
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
    { id: uuidSchema.describe("Event ID (UUID from get_events)") },
    async ({ id }) => {
      const { error } = await client.from("life_events").delete().eq("user_id", userId).eq("id", id);
      if (error) return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      return { content: [{ type: "text" as const, text: `Event ${id} deleted.` }] };
    }
  );
}
