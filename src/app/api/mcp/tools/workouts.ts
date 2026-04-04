import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkoutSet } from "@/lib/types";
import { EXERCISES, WORKOUT_META } from "@/config/exercises";
import { dateSchema, uuidSchema, safeErrorMessage } from "../validation";

/** Get all known exercise names: built-in + warmup/cardio + custom topics + recent history (bounded). */
async function getKnownExercises(client: SupabaseClient, userId: string): Promise<string[]> {
  const builtIn = [
    ...EXERCISES,
    ...Object.values(WORKOUT_META).flatMap((m) => [...m.warmup, ...m.cardio]),
  ];

  const [customRes, historyRes] = await Promise.all([
    client.from("custom_topics").select("label").eq("user_id", userId).eq("category", "exercise"),
    // Bounded scan: only recent exercises, ordered newest-first, capped at 500 rows
    client.from("workout_sets").select("exercise").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(500),
  ]);

  const custom = (customRes.data ?? []).map((r: { label: string }) => r.label);
  const historical = Array.from(new Set((historyRes.data ?? []).map((r: { exercise: string }) => r.exercise)));

  return Array.from(new Set([...builtIn, ...custom, ...historical]));
}

/** Find similar exercises by case-insensitive substring matching. */
function findSimilar(input: string, known: string[]): string[] {
  const lower = input.toLowerCase();
  // Exact case-insensitive match
  const exact = known.find((k) => k.toLowerCase() === lower);
  if (exact) return [exact];

  // Substring matches — input is part of known name or vice versa
  const matches = known.filter((k) => {
    const kl = k.toLowerCase();
    return kl.includes(lower) || lower.includes(kl);
  });

  // Word overlap — split both into words and check for shared words
  if (matches.length === 0) {
    const inputWords = lower.split(/[\s\-]+/).filter((w) => w.length > 2);
    return known.filter((k) => {
      const kWords = k.toLowerCase().split(/[\s\-]+/);
      return inputWords.some((w) => kWords.some((kw) => kw.includes(w) || w.includes(kw)));
    });
  }

  return matches;
}

/** Validate an exercise name. Returns the matched name or an error message with suggestions. */
async function validateExercise(
  exercise: string,
  client: SupabaseClient,
  userId: string,
  known: string[]
): Promise<{ valid: true; name: string } | { valid: false; message: string }> {
  // Exact match (case-insensitive)
  const exactMatch = known.find((k) => k.toLowerCase() === exercise.toLowerCase());
  if (exactMatch) return { valid: true, name: exactMatch };

  const similar = findSimilar(exercise, known);
  if (similar.length > 0) {
    return {
      valid: false,
      message: `Unknown exercise "${exercise}". Did you mean: ${similar.map((s) => `"${s}"`).join(", ")}? Use the exact name to log.`,
    };
  }
  return {
    valid: false,
    message: `Unknown exercise "${exercise}". No similar exercises found. Known exercises: ${known.slice(0, 20).join(", ")}${known.length > 20 ? "..." : ""}`,
  };
}

export function registerWorkoutTools(server: McpServer, client: SupabaseClient, userId: string) {
  server.tool(
    "get_workout_sets",
    "Get all workout sets logged for a date. Each row is one set of one exercise (not grouped). Returns id, exercise name, reps, weight_lbs, duration_mins, and notes.",
    { date: dateSchema.describe("Date in YYYY-MM-DD format") },
    async ({ date }) => {
      const { data, error } = await client
        .from("workout_sets").select("*")
        .eq("user_id", userId).eq("date", date)
        .order("created_at", { ascending: true });

      if (error) return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
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
    "Log a single exercise set. The exercise name must match a known exercise (case-insensitive). If it doesn't match, the tool will reject the request and suggest similar exercises. Call get_workout_sets or get_active_plan first to see valid exercise names.",
    {
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      exercise: z.string().max(200).describe("Exercise name — must match a known exercise. Examples: 'Incline Dumbbell Press', 'RDLs', 'Pull-ups', 'Lunges', 'Calf Raises', 'Run', 'Incline Walk'."),
      reps: z.number().int().min(0).max(9999).optional().describe("Reps for this set"),
      weight_lbs: z.number().min(0).max(9999).optional().describe("Weight in pounds for this set"),
      duration_mins: z.number().min(0).max(1440).optional().describe("Duration in decimal minutes (e.g. 0.5 = 30 seconds, 1.5 = 1 min 30 sec). Used for static holds and cardio."),
      notes: z.string().max(5000).optional().describe("Notes for this set"),
    },
    async ({ date, exercise, reps, weight_lbs, duration_mins, notes }) => {
      const known = await getKnownExercises(client, userId);
      const check = await validateExercise(exercise, client, userId, known);
      if (!check.valid) {
        return { content: [{ type: "text" as const, text: check.message }] };
      }

      const { error } = await client.from("workout_sets").insert({
        user_id: userId, date, exercise: check.name,
        reps: reps ?? null, weight_lbs: weight_lbs ?? null,
        duration_mins: duration_mins ?? null, notes: notes ?? null,
      });

      if (error) return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      let desc = `Logged ${check.name} for ${date}`;
      if (reps) desc += ` — ${reps} reps`;
      if (weight_lbs) desc += ` @ ${weight_lbs} lbs`;
      if (duration_mins) desc += ` for ${duration_mins} min`;
      return { content: [{ type: "text" as const, text: desc }] };
    }
  );

  server.tool(
    "log_workout",
    "Log a full workout with multiple exercises at once. All exercise names must match known exercises (case-insensitive). If any don't match, the entire request is rejected with suggestions for the unmatched names.",
    {
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      exercises: z.array(z.object({
        exercise: z.string().max(200), reps: z.number().int().min(0).max(9999).optional(),
        weight_lbs: z.number().min(0).max(9999).optional(), duration_mins: z.number().min(0).max(1440).optional(),
        notes: z.string().max(5000).optional(),
      })).max(100).describe("Array of exercises to log"),
    },
    async ({ date, exercises }) => {
      const known = await getKnownExercises(client, userId);

      // Validate all exercise names first
      const resolved: { name: string; orig: typeof exercises[0] }[] = [];
      const errors: string[] = [];
      for (const e of exercises) {
        const check = await validateExercise(e.exercise, client, userId, known);
        if (check.valid) {
          resolved.push({ name: check.name, orig: e });
        } else {
          errors.push(check.message);
        }
      }

      if (errors.length > 0) {
        return { content: [{ type: "text" as const, text: `Some exercises not recognized:\n${errors.join("\n")}\n\nFix the exercise names and retry. No sets were logged.` }] };
      }

      const rows = resolved.map((r) => ({
        user_id: userId, date, exercise: r.name,
        reps: r.orig.reps ?? null, weight_lbs: r.orig.weight_lbs ?? null,
        duration_mins: r.orig.duration_mins ?? null, notes: r.orig.notes ?? null,
      }));

      const { error } = await client.from("workout_sets").insert(rows);
      if (error) return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };

      const lines = resolved.map((r) => {
        let desc = `  - ${r.name}`;
        if (r.orig.reps) desc += ` ${r.orig.reps} reps`;
        if (r.orig.weight_lbs) desc += ` @ ${r.orig.weight_lbs} lbs`;
        return desc;
      });
      return { content: [{ type: "text" as const, text: `Logged ${resolved.length} exercises for ${date}:\n${lines.join("\n")}` }] };
    }
  );

  server.tool(
    "delete_workout_set",
    "Delete a logged workout set by ID. Get the ID from get_workout_sets.",
    { id: uuidSchema.describe("The workout set UUID (from get_workout_sets response)") },
    async ({ id }) => {
      const { error } = await client.from("workout_sets").delete().eq("user_id", userId).eq("id", id);
      if (error) return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      return { content: [{ type: "text" as const, text: `Workout set ${id} deleted.` }] };
    }
  );

  server.tool(
    "get_last_workout",
    "Get the most recent workout sets for given exercises before a date. Useful for progressive overload — shows what weight/reps were used last time. Groups by exercise, returns only the most recent session per exercise.",
    {
      date: dateSchema.describe("Date in YYYY-MM-DD — look for sessions before this date"),
      exercises: z.array(z.string().max(200)).max(50).describe("Exercise names to look up"),
    },
    async ({ date, exercises }) => {
      if (exercises.length === 0) return { content: [{ type: "text" as const, text: "No exercises specified." }] };

      const { data, error } = await client
        .from("workout_sets")
        .select("exercise, reps, weight_lbs, duration_mins, date")
        .eq("user_id", userId).lt("date", date).in("exercise", exercises)
        .order("date", { ascending: false }).order("created_at", { ascending: true });

      if (error) return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
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
