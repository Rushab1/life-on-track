import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dateSchema, uuidSchema, safeErrorMessage } from "../validation";
import { getKnownExercises, validateExercise } from "./exercise-helpers";

/**
 * log_workout — unified workout write. Always takes an array of sets.
 * Each set can optionally include an `id` to update an existing row.
 * delete_workout — unified delete. Either by id (single set) or by
 * { date, exercise } (delete all sets of that exercise on that date).
 */
export function registerWorkoutTools(
  server: McpServer,
  client: SupabaseClient,
  userId: string,
) {
  server.tool(
    "log_workout",
    "Log or update workout sets for a date. Always batch — pass an array of sets. Each set may be an INSERT (no id) or an UPDATE (id = existing workout_set.id). Exercise names are validated against the exercises table; if any are unknown the entire request is rejected with suggestions. Use manage_exercise to add new exercise names to the catalog.",
    {
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      sets: z
        .array(
          z.object({
            id: uuidSchema
              .optional()
              .describe("If provided, updates the existing workout_set with this id instead of inserting a new one."),
            exercise: z
              .string()
              .max(200)
              .describe("Exercise name — must match a known exercise (case-insensitive)."),
            reps: z
              .number()
              .int()
              .min(0)
              .max(9999)
              .nullable()
              .optional()
              .describe("Reps for this set. Pass null to clear."),
            weight_lbs: z
              .number()
              .min(0)
              .max(9999)
              .nullable()
              .optional()
              .describe("Weight in pounds for this set. Pass null to clear."),
            duration_mins: z
              .number()
              .min(0)
              .max(1440)
              .nullable()
              .optional()
              .describe("Duration in decimal minutes (0.5 = 30s). Pass null to clear."),
            notes: z
              .string()
              .max(5000)
              .nullable()
              .optional()
              .describe("Notes for this set. Pass null to clear."),
          }),
        )
        .min(1)
        .max(100)
        .describe("Array of sets to insert or update. Each set can be a new insert or an update to an existing row by id."),
    },
    async ({ date, sets }) => {
      const known = await getKnownExercises(client, userId);

      // Validate all exercise names up-front
      const resolved: { name: string; orig: (typeof sets)[number] }[] = [];
      const errors: string[] = [];
      for (const s of sets) {
        const check = validateExercise(s.exercise, known);
        if (check.valid) {
          resolved.push({ name: check.name, orig: s });
        } else {
          errors.push(check.message);
        }
      }
      if (errors.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Some exercises not recognized:\n${errors.join("\n")}\n\nFix the exercise names and retry. No sets were logged.`,
            },
          ],
        };
      }

      // Split inserts vs updates
      const inserts: Record<string, unknown>[] = [];
      const updates: { id: string; patch: Record<string, unknown> }[] = [];
      for (const r of resolved) {
        if (r.orig.id) {
          const patch: Record<string, unknown> = { exercise: r.name };
          if (r.orig.reps !== undefined) patch.reps = r.orig.reps;
          if (r.orig.weight_lbs !== undefined) patch.weight_lbs = r.orig.weight_lbs;
          if (r.orig.duration_mins !== undefined) patch.duration_mins = r.orig.duration_mins;
          if (r.orig.notes !== undefined) patch.notes = r.orig.notes;
          updates.push({ id: r.orig.id, patch });
        } else {
          inserts.push({
            user_id: userId,
            date,
            exercise: r.name,
            reps: r.orig.reps ?? null,
            weight_lbs: r.orig.weight_lbs ?? null,
            duration_mins: r.orig.duration_mins ?? null,
            notes: r.orig.notes ?? null,
          });
        }
      }

      // Run inserts
      if (inserts.length > 0) {
        const { error } = await client.from("workout_sets").insert(inserts);
        if (error) {
          return {
            content: [
              { type: "text" as const, text: safeErrorMessage(error) },
            ],
          };
        }
      }

      // Run updates (sequential — Supabase has no bulk update by id)
      for (const u of updates) {
        const { error } = await client
          .from("workout_sets")
          .update(u.patch)
          .eq("user_id", userId)
          .eq("id", u.id);
        if (error) {
          return {
            content: [
              { type: "text" as const, text: safeErrorMessage(error) },
            ],
          };
        }
      }

      const lines = resolved.map((r) => {
        let desc = r.orig.id ? `  * ${r.name}` : `  - ${r.name}`;
        if (r.orig.reps != null) desc += ` ${r.orig.reps} reps`;
        if (r.orig.weight_lbs != null) desc += ` @ ${r.orig.weight_lbs} lbs`;
        if (r.orig.duration_mins != null)
          desc += ` for ${r.orig.duration_mins} min`;
        return desc;
      });

      const parts: string[] = [];
      if (inserts.length > 0) parts.push(`inserted ${inserts.length}`);
      if (updates.length > 0) parts.push(`updated ${updates.length}`);
      return {
        content: [
          {
            type: "text" as const,
            text: `Workout saved for ${date} (${parts.join(", ")}):\n${lines.join("\n")}`,
          },
        ],
      };
    },
  );

  server.tool(
    "delete_workout",
    "Delete workout sets. Provide either { id } to delete a single set, or { date, exercise } to delete ALL sets of an exercise on that date.",
    {
      id: uuidSchema
        .optional()
        .describe("Single workout_set UUID to delete."),
      date: dateSchema
        .optional()
        .describe("Date YYYY-MM-DD — use with exercise to bulk-delete."),
      exercise: z
        .string()
        .max(200)
        .optional()
        .describe("Exercise name — use with date to bulk-delete."),
    },
    async ({ id, date, exercise }) => {
      if (id) {
        const { error } = await client
          .from("workout_sets")
          .delete()
          .eq("user_id", userId)
          .eq("id", id);
        if (error) {
          return {
            content: [
              { type: "text" as const, text: safeErrorMessage(error) },
            ],
          };
        }
        return {
          content: [
            { type: "text" as const, text: `Workout set ${id} deleted.` },
          ],
        };
      }

      if (date && exercise) {
        const { error } = await client
          .from("workout_sets")
          .delete()
          .eq("user_id", userId)
          .eq("date", date)
          .eq("exercise", exercise);
        if (error) {
          return {
            content: [
              { type: "text" as const, text: safeErrorMessage(error) },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Deleted all "${exercise}" sets for ${date}.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: "Provide either { id } or { date, exercise } to delete_workout.",
          },
        ],
      };
    },
  );
}
