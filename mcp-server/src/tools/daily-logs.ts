import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../auth.js";

export function registerDailyLogTools(server: McpServer) {
  server.tool(
    "get_daily_log",
    "Get pain level and notes for a specific date",
    { date: z.string().describe("Date in YYYY-MM-DD format") },
    async ({ date }) => {
      const { data, error } = await getClient()
        .from("daily_logs")
        .select("*")
        .eq("date", date)
        .single();

      if (error && error.code !== "PGRST116") {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      }

      if (!data) {
        return { content: [{ type: "text" as const, text: `No daily log found for ${date}.` }] };
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            date: data.date,
            pain_level: data.pain_level,
            notes: data.notes,
            updated_at: data.updated_at,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "save_daily_log",
    "Save or update pain level and/or notes for a date",
    {
      date: z.string().describe("Date in YYYY-MM-DD format"),
      pain_level: z.number().min(0).max(10).optional().describe("Pain level 0-10"),
      notes: z.string().optional().describe("Free-text notes"),
    },
    async ({ date, pain_level, notes }) => {
      const upsertData: Record<string, unknown> = {
        date,
        updated_at: new Date().toISOString(),
      };
      if (pain_level !== undefined) upsertData.pain_level = pain_level;
      if (notes !== undefined) upsertData.notes = notes || null;

      // We need the user_id for the upsert. Get it from any existing row or from the JWT.
      // Since RLS is active, we can read the user_id from the token's sub claim.
      // The simplest approach: do a select first, or rely on the DB default.
      // Actually, Supabase RLS with upsert requires user_id in the payload.
      // We'll get user_id from a quick auth check.
      const { data: { user } } = await getClient().auth.getUser();
      if (!user) {
        return { content: [{ type: "text" as const, text: "Error: Not authenticated" }] };
      }

      upsertData.user_id = user.id;

      const { error } = await getClient()
        .from("daily_logs")
        .upsert(upsertData, { onConflict: "user_id,date" });

      if (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      }

      return {
        content: [{
          type: "text" as const,
          text: `Daily log saved for ${date}.${pain_level !== undefined ? ` Pain: ${pain_level}/10.` : ""}${notes ? ` Notes: "${notes}"` : ""}`,
        }],
      };
    }
  );

  server.tool(
    "delete_daily_log",
    "Delete the daily log entry for a date",
    { date: z.string().describe("Date in YYYY-MM-DD format") },
    async ({ date }) => {
      const { error } = await getClient()
        .from("daily_logs")
        .delete()
        .eq("date", date);

      if (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      }

      return { content: [{ type: "text" as const, text: `Daily log deleted for ${date}.` }] };
    }
  );
}
