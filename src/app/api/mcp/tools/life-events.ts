import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dateSchema, uuidSchema, safeErrorMessage } from "../validation";

/**
 * manage_event — list / create / delete ad-hoc life events (conferences,
 * trips, appointments). Replaces the old log_event, get_events, delete_event
 * trio.
 */
export function registerLifeEventTool(
  server: McpServer,
  client: SupabaseClient,
  userId: string,
) {
  server.tool(
    "manage_event",
    'Manage ad-hoc life events (conferences, trips, appointments). action="list" returns events for a date, a range (start_date+end_date), or the last 30 days by default. "create" requires date + title (notes optional). "delete" requires id.',
    {
      action: z.enum(["list", "create", "delete"]).describe("Event action"),
      id: uuidSchema.optional().describe("Event id (for delete)"),
      date: dateSchema
        .optional()
        .describe("Single date (list: filter; create: event date)"),
      start_date: dateSchema
        .optional()
        .describe("Range start YYYY-MM-DD (list only, use with end_date)"),
      end_date: dateSchema
        .optional()
        .describe("Range end YYYY-MM-DD (list only, use with start_date)"),
      title: z
        .string()
        .max(200)
        .optional()
        .describe("Event title (create)"),
      notes: z
        .string()
        .max(5000)
        .optional()
        .describe("Event notes (create)"),
    },
    async ({ action, id, date, start_date, end_date, title, notes }) => {
      if (action === "list") {
        let query = client
          .from("life_events")
          .select("*")
          .eq("user_id", userId)
          .order("date")
          .order("created_at");

        if (date) {
          query = query.eq("date", date);
        } else if (start_date && end_date) {
          query = query.gte("date", start_date).lte("date", end_date);
        } else if (start_date || end_date) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Both start_date and end_date are required for a range query.",
              },
            ],
          };
        } else {
          const end = new Date().toISOString().split("T")[0];
          const start = new Date(Date.now() - 29 * 86400000)
            .toISOString()
            .split("T")[0];
          query = query.gte("date", start).lte("date", end);
        }

        const { data, error } = await query;
        if (error) {
          return {
            content: [{ type: "text" as const, text: safeErrorMessage(error) }],
          };
        }
        if (!data || data.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No events found." }],
          };
        }
        const events = data.map(
          (e: {
            id: string;
            date: string;
            title: string;
            notes: string | null;
          }) => ({
            id: e.id,
            date: e.date,
            title: e.title,
            notes: e.notes,
          }),
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(events, null, 2) },
          ],
        };
      }

      if (action === "create") {
        if (!date || !title) {
          return {
            content: [
              {
                type: "text" as const,
                text: "action=create requires date and title.",
              },
            ],
          };
        }
        const { error } = await client.from("life_events").insert({
          user_id: userId,
          date,
          title,
          notes: notes ?? null,
        });
        if (error) {
          return {
            content: [{ type: "text" as const, text: safeErrorMessage(error) }],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Logged event for ${date}: "${title}"`,
            },
          ],
        };
      }

      if (action === "delete") {
        if (!id) {
          return {
            content: [
              { type: "text" as const, text: "action=delete requires id." },
            ],
          };
        }
        const { error } = await client
          .from("life_events")
          .delete()
          .eq("user_id", userId)
          .eq("id", id);
        if (error) {
          return {
            content: [{ type: "text" as const, text: safeErrorMessage(error) }],
          };
        }
        return {
          content: [
            { type: "text" as const, text: `Event ${id} deleted.` },
          ],
        };
      }

      return {
        content: [{ type: "text" as const, text: `Unknown action: ${action}` }],
      };
    },
  );
}
