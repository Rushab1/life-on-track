import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../auth.js";
import { ACTIVITY_LABELS, getActivitiesForDate } from "../constants.js";
import type { ActivityType, ActivityCompletion } from "../types.js";

const ACTIVITY_TYPES = [
  "lc", "ml", "sd", "beh", "oss", "vln", "dte", "mck", "out",
  "psh", "lgh", "rst", "pll", "lgl", "yga",
] as const;

export function registerActivityTools(server: McpServer) {
  server.tool(
    "get_activities",
    "Get activity completions for a date, including what's scheduled",
    { date: z.string().describe("Date in YYYY-MM-DD format") },
    async ({ date }) => {
      const { data, error } = await getClient()
        .from("activity_completions")
        .select("*")
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
          activity: act,
          label: ACTIVITY_LABELS[act],
          scheduled: true,
          completed: status?.completed ?? false,
          notes: status?.notes ?? null,
        };
      });

      // Include any completions for non-scheduled activities
      for (const c of completions) {
        if (!scheduled.includes(c.activity_type)) {
          summary.push({
            activity: c.activity_type,
            label: ACTIVITY_LABELS[c.activity_type],
            scheduled: false,
            completed: c.completed,
            notes: c.notes,
          });
        }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
      };
    }
  );

  server.tool(
    "toggle_activity",
    "Toggle an activity's completion status for a date",
    {
      date: z.string().describe("Date in YYYY-MM-DD format"),
      activity_type: z.enum(ACTIVITY_TYPES).describe("Activity type code"),
    },
    async ({ date, activity_type }) => {
      const client = getClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        return { content: [{ type: "text" as const, text: "Error: Not authenticated" }] };
      }

      // Get current state
      const { data: existing } = await client
        .from("activity_completions")
        .select("completed")
        .eq("date", date)
        .eq("activity_type", activity_type)
        .single();

      const newVal = !(existing?.completed ?? false);

      const { error } = await client.from("activity_completions").upsert(
        {
          user_id: user.id,
          date,
          activity_type,
          completed: newVal,
        },
        { onConflict: "user_id,date,activity_type" }
      );

      if (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      }

      const label = ACTIVITY_LABELS[activity_type as ActivityType];
      return {
        content: [{
          type: "text" as const,
          text: `${label} marked as ${newVal ? "completed" : "not completed"} for ${date}.`,
        }],
      };
    }
  );

  server.tool(
    "complete_activities",
    "Mark multiple activities as completed for a date",
    {
      date: z.string().describe("Date in YYYY-MM-DD format"),
      activity_types: z.array(z.enum(ACTIVITY_TYPES)).describe("Activity type codes to mark complete"),
    },
    async ({ date, activity_types }) => {
      const client = getClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        return { content: [{ type: "text" as const, text: "Error: Not authenticated" }] };
      }

      const rows = activity_types.map((at) => ({
        user_id: user.id,
        date,
        activity_type: at,
        completed: true,
      }));

      const { error } = await client.from("activity_completions").upsert(rows, {
        onConflict: "user_id,date,activity_type",
      });

      if (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      }

      const labels = activity_types.map((at) => ACTIVITY_LABELS[at as ActivityType]);
      return {
        content: [{
          type: "text" as const,
          text: `Marked as completed for ${date}: ${labels.join(", ")}.`,
        }],
      };
    }
  );

  server.tool(
    "set_activity_note",
    "Add or update a note on an activity for a date",
    {
      date: z.string().describe("Date in YYYY-MM-DD format"),
      activity_type: z.enum(ACTIVITY_TYPES).describe("Activity type code"),
      note: z.string().describe("Note text"),
    },
    async ({ date, activity_type, note }) => {
      const client = getClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        return { content: [{ type: "text" as const, text: "Error: Not authenticated" }] };
      }

      const { error } = await client.from("activity_completions").upsert(
        {
          user_id: user.id,
          date,
          activity_type,
          completed: true,
          notes: note || null,
        },
        { onConflict: "user_id,date,activity_type" }
      );

      if (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      }

      const label = ACTIVITY_LABELS[activity_type as ActivityType];
      return {
        content: [{
          type: "text" as const,
          text: `Note saved for ${label} on ${date}: "${note}"`,
        }],
      };
    }
  );
}
