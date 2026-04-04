import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dateSchema, safeErrorMessage } from "../validation";

export function registerDailyLogTools(server: McpServer, client: SupabaseClient, userId: string) {
  server.tool(
    "get_daily_log",
    "Get pain level and notes for a specific date",
    { date: dateSchema.describe("Date in YYYY-MM-DD format") },
    async ({ date }) => {
      const { data, error } = await client
        .from("daily_logs")
        .select("*")
        .eq("user_id", userId)
        .eq("date", date)
        .single();

      if (error && error.code !== "PGRST116") {
        return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      }
      if (!data) {
        return { content: [{ type: "text" as const, text: `No daily log found for ${date}.` }] };
      }
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ date: data.date, pain_level: data.pain_level, notes: data.notes, updated_at: data.updated_at }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "save_daily_log",
    "Save or update pain level and/or notes for a date. Upserts — safe to call repeatedly. Only provided fields are updated; omitted fields are left unchanged.",
    {
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      pain_level: z.number().min(0).max(10).optional().describe("Pain level 0-10"),
      notes: z.string().max(5000).optional().describe("Free-text notes"),
    },
    async ({ date, pain_level, notes }) => {
      const upsertData: Record<string, unknown> = {
        user_id: userId,
        date,
        updated_at: new Date().toISOString(),
      };
      if (pain_level !== undefined) upsertData.pain_level = pain_level;
      if (notes !== undefined) upsertData.notes = notes || null;

      const { error } = await client
        .from("daily_logs")
        .upsert(upsertData, { onConflict: "user_id,date" });

      if (error) {
        return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
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
    { date: dateSchema.describe("Date in YYYY-MM-DD format") },
    async ({ date }) => {
      const { error } = await client.from("daily_logs").delete().eq("user_id", userId).eq("date", date);
      if (error) {
        return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      }
      return { content: [{ type: "text" as const, text: `Daily log deleted for ${date}.` }] };
    }
  );
}
