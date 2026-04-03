import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkoutSet } from "@/lib/types";

export function registerWorkoutTools(server: McpServer, client: SupabaseClient, userId: string) {
  server.tool(
    "get_workout_sets",
    "Get all workout sets logged for a date. Each row is one set of one exercise (not grouped). Returns id, exercise name, reps, weight_lbs, duration_mins, and notes.",
    { date: z.string().describe("Date in YYYY-MM-DD format") },
    async ({ date }) => {
      const { data, error } = await client
        .from("workout_sets").select("*")
        .eq("user_id", userId).eq("date", date)
        .order("created_at", { ascending: true });

      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      if (!data || data.length === 0) return { content: [{ type: "text" as const, text: `No workout sets logged for ${date}.` }] };

      const sets = (data as WorkoutSet[]).map((s) => ({
        id: s.id, exercise: s.exercise, reps: s.reps,
        weight_lbs: s.weight_lbs, duration_mins: s.duration_mins, notes: s.notes,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(sets, null, 2) }] };
    }
  );

  server.tool(
    "log_workout_set",
    "Log a single exercise set",
    {
      date: z.string().describe("Date in YYYY-MM-DD format"),
      exercise: z.string().describe("Exercise name, e.g. 'Incline Dumbbell Press', 'RDLs', 'Pull-ups', 'Run'. Free text — any string is valid."),
      reps: z.number().optional().describe("Reps for this set"),
      weight_lbs: z.number().optional().describe("Weight in pounds for this set"),
      duration_mins: z.number().optional().describe("Duration in decimal minutes (e.g. 0.5 = 30 seconds, 1.5 = 1 min 30 sec). Used for static holds and cardio."),
      notes: z.string().optional().describe("Notes for this set"),
    },
    async ({ date, exercise, reps, weight_lbs, duration_mins, notes }) => {
      const { error } = await client.from("workout_sets").insert({
        user_id: userId, date, exercise,
        reps: reps ?? null, weight_lbs: weight_lbs ?? null,
        duration_mins: duration_mins ?? null, notes: notes ?? null,
      });

      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      let desc = `Logged ${exercise} for ${date}`;
      if (reps) desc += ` — ${reps} reps`;
      if (weight_lbs) desc += ` @ ${weight_lbs} lbs`;
      if (duration_mins) desc += ` for ${duration_mins} min`;
      return { content: [{ type: "text" as const, text: desc }] };
    }
  );

  server.tool(
    "log_workout",
    "Log a full workout with multiple exercises at once",
    {
      date: z.string().describe("Date in YYYY-MM-DD format"),
      exercises: z.array(z.object({
        exercise: z.string(), reps: z.number().optional(),
        weight_lbs: z.number().optional(), duration_mins: z.number().optional(),
        notes: z.string().optional(),
      })).describe("Array of exercises to log"),
    },
    async ({ date, exercises }) => {
      const rows = exercises.map((e) => ({
        user_id: userId, date, exercise: e.exercise,
        reps: e.reps ?? null, weight_lbs: e.weight_lbs ?? null,
        duration_mins: e.duration_mins ?? null, notes: e.notes ?? null,
      }));

      const { error } = await client.from("workout_sets").insert(rows);
      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };

      const lines = exercises.map((e) => {
        let desc = `  - ${e.exercise}`;
        if (e.reps) desc += ` ${e.reps} reps`;
        if (e.weight_lbs) desc += ` @ ${e.weight_lbs} lbs`;
        return desc;
      });
      return { content: [{ type: "text" as const, text: `Logged ${exercises.length} exercises for ${date}:\n${lines.join("\n")}` }] };
    }
  );

  server.tool(
    "delete_workout_set",
    "Delete a logged workout set by ID. Get the ID from get_workout_sets.",
    { id: z.string().describe("The workout set UUID (from get_workout_sets response)") },
    async ({ id }) => {
      const { error } = await client.from("workout_sets").delete().eq("user_id", userId).eq("id", id);
      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      return { content: [{ type: "text" as const, text: `Workout set ${id} deleted.` }] };
    }
  );

  server.tool(
    "get_last_workout",
    "Get the most recent workout sets for given exercises before a date. Useful for progressive overload — shows what weight/reps were used last time. Groups by exercise, returns only the most recent session per exercise.",
    {
      date: z.string().describe("Date in YYYY-MM-DD — look for sessions before this date"),
      exercises: z.array(z.string()).describe("Exercise names to look up"),
    },
    async ({ date, exercises }) => {
      if (exercises.length === 0) return { content: [{ type: "text" as const, text: "No exercises specified." }] };

      const { data, error } = await client
        .from("workout_sets")
        .select("exercise, reps, weight_lbs, duration_mins, date")
        .eq("user_id", userId).lt("date", date).in("exercise", exercises)
        .order("date", { ascending: false }).order("created_at", { ascending: true });

      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      if (!data || data.length === 0) return { content: [{ type: "text" as const, text: "No previous workout data found." }] };

      const latestDate: Record<string, string> = {};
      for (const row of data) {
        if (!latestDate[row.exercise]) latestDate[row.exercise] = row.date;
      }

      const result: Record<string, { reps: number | null; weight_lbs: number | null; duration_mins: number | null; date: string }[]> = {};
      for (const row of data) {
        if (row.date === latestDate[row.exercise]) {
          if (!result[row.exercise]) result[row.exercise] = [];
          result[row.exercise].push({ reps: row.reps, weight_lbs: row.weight_lbs, duration_mins: row.duration_mins, date: row.date });
        }
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
