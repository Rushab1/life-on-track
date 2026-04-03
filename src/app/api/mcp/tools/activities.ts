import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVITY_LABELS } from "@/config/constants";
import { getActivitiesForDate } from "@/config/schedule";
import type { ActivityCompletion } from "@/lib/types";

export function registerActivityTools(server: McpServer, client: SupabaseClient, userId: string) {
  server.tool(
    "get_activities",
    "Get activity completions for a date, including what's scheduled by the plan. Returns both scheduled and ad-hoc activities with their completion status. Activities are independent of plans — plans define the schedule, but completions are tracked separately.",
    { date: z.string().describe("Date in YYYY-MM-DD format") },
    async ({ date }) => {
      const { data, error } = await client
        .from("activity_completions")
        .select("*")
        .eq("user_id", userId)
        .eq("date", date);

      if (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      }

      const scheduled = getActivitiesForDate(new Date(date + "T00:00:00"));
      const completions = (data ?? []) as ActivityCompletion[];
      const completionMap: Record<string, { completed: boolean; notes: string | null }> = {};
      for (const c of completions) {
        completionMap[c.activity_type] = { completed: c.completed, notes: c.notes };
      }

      const summary = scheduled.map((act) => {
        const status = completionMap[act];
        return {
          activity: act, label: ACTIVITY_LABELS[act] ?? act,
          scheduled: true, completed: status?.completed ?? false, notes: status?.notes ?? null,
        };
      });

      for (const c of completions) {
        if (!scheduled.includes(c.activity_type)) {
          summary.push({
            activity: c.activity_type, label: ACTIVITY_LABELS[c.activity_type] ?? c.activity_type,
            scheduled: false, completed: c.completed, notes: c.notes,
          });
        }
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
    }
  );

  server.tool(
    "toggle_activity",
    "Toggle an activity's completion status for a date",
    {
      date: z.string().describe("Date in YYYY-MM-DD format"),
      activity_type: z.string().describe("Activity type code. Gym types: psh (Push), pll (Pull), lgh (Legs Heavy), lgl (Legs Light), yga (Yoga), rst (Rest). Prep activities: lc (LeetCode), ml (ML/AI), sd (System Design), beh (Behavioral), oss (FastMCP), vln (Violin), dte (Date Night), mck (Mock Interview), out (Outdoor Activity). Users can also create custom codes."),
    },
    async ({ date, activity_type }) => {
      const { data: existing } = await client
        .from("activity_completions")
        .select("completed")
        .eq("user_id", userId)
        .eq("date", date)
        .eq("activity_type", activity_type)
        .single();

      const newVal = !(existing?.completed ?? false);
      const { error } = await client.from("activity_completions").upsert(
        { user_id: userId, date, activity_type, completed: newVal },
        { onConflict: "user_id,date,activity_type" }
      );

      if (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      }
      const label = ACTIVITY_LABELS[activity_type] ?? activity_type;
      return { content: [{ type: "text" as const, text: `${label} marked as ${newVal ? "completed" : "not completed"} for ${date}.` }] };
    }
  );

  server.tool(
    "complete_activities",
    "Mark multiple activities as completed for a date",
    {
      date: z.string().describe("Date in YYYY-MM-DD format"),
      activity_types: z.array(z.string()).describe("Activity type codes to mark complete. See toggle_activity for valid codes."),
    },
    async ({ date, activity_types }) => {
      const rows = activity_types.map((at) => ({
        user_id: userId, date, activity_type: at, completed: true,
      }));
      const { error } = await client.from("activity_completions").upsert(rows, {
        onConflict: "user_id,date,activity_type",
      });

      if (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      }
      const labels = activity_types.map((at) => ACTIVITY_LABELS[at] ?? at);
      return { content: [{ type: "text" as const, text: `Marked as completed for ${date}: ${labels.join(", ")}.` }] };
    }
  );

  server.tool(
    "set_activity_note",
    "Add or update a note on an activity for a date",
    {
      date: z.string().describe("Date in YYYY-MM-DD format"),
      activity_type: z.string().describe("Activity type code. See toggle_activity for valid codes."),
      note: z.string().describe("Note text"),
    },
    async ({ date, activity_type, note }) => {
      const { error } = await client.from("activity_completions").upsert(
        { user_id: userId, date, activity_type, completed: true, notes: note || null },
        { onConflict: "user_id,date,activity_type" }
      );

      if (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      }
      const label = ACTIVITY_LABELS[activity_type] ?? activity_type;
      return { content: [{ type: "text" as const, text: `Note saved for ${label} on ${date}: "${note}"` }] };
    }
  );
}
