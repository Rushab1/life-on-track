import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dateSchema, safeErrorMessage } from "../validation";
import { getKnownActivities, validateActivity } from "./activity-helpers";

/**
 * save_day — single write endpoint for all daily non-workout data:
 * daily log (pain/notes) + activity completions + activity notes + deletes.
 * All changes are applied in one call; per-activity validation is atomic
 * (any unknown code rejects the whole request).
 */
export function registerSaveDayTool(
  server: McpServer,
  client: SupabaseClient,
  userId: string,
) {
  server.tool(
    "save_day",
    "Upsert daily log + activity state for a date in one call. Set pain_level / notes (daily log). Notes default to append mode — new text is added after existing notes. Use notes_mode='write' to replace. Per activity: completed (bool, marks complete/incomplete), note (string, adds note — append by default, set note_mode='write' to replace), delete (bool, removes the completion row entirely). clear_log=true deletes the daily_logs row for the date. All activity codes are validated; if any are unknown the whole request is rejected.",
    {
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      pain_level: z
        .number()
        .min(0)
        .max(10)
        .optional()
        .describe("Pain level 0-10"),
      notes: z
        .string()
        .max(5000)
        .optional()
        .describe("Free-text daily notes"),
      notes_mode: z
        .enum(["append", "write"])
        .default("append")
        .optional()
        .describe("'append' (default) adds to existing notes; 'write' replaces them entirely."),
      activities: z
        .array(
          z.object({
            code: z
              .string()
              .max(50)
              .describe("Activity code. E.g. psh, pll, lgh, lgl, yga, rst, lc, ml, sd, vln, dte."),
            completed: z
              .boolean()
              .optional()
              .describe("True = mark complete, false = mark incomplete. Omit to leave unchanged."),
            note: z
              .string()
              .max(5000)
              .optional()
              .describe("Note to attach to this activity."),
            note_mode: z
              .enum(["append", "write"])
              .default("append")
              .optional()
              .describe("'append' (default) adds to existing note; 'write' replaces it entirely."),
            delete: z
              .boolean()
              .optional()
              .describe("True = delete the completion row entirely (activity still scheduled if in plan)."),
          }),
        )
        .max(50)
        .optional()
        .describe("Activity updates to apply."),
      clear_log: z
        .boolean()
        .optional()
        .describe("If true, delete the daily_logs row for this date."),
    },
    async ({ date, pain_level, notes, notes_mode, activities, clear_log }) => {
      const effectiveNotesMode = notes_mode ?? "append";
      const messages: string[] = [];

      // 1) Daily log clear
      if (clear_log) {
        const { error } = await client
          .from("daily_logs")
          .delete()
          .eq("user_id", userId)
          .eq("date", date);
        if (error) {
          return {
            content: [
              { type: "text" as const, text: safeErrorMessage(error) },
            ],
          };
        }
        messages.push(`Daily log cleared for ${date}.`);
      }

      // 2) Daily log upsert (only if any field was provided)
      if (!clear_log && (pain_level !== undefined || notes !== undefined)) {
        const upsertData: Record<string, unknown> = {
          user_id: userId,
          date,
          updated_at: new Date().toISOString(),
        };
        if (pain_level !== undefined) upsertData.pain_level = pain_level;
        if (notes !== undefined) {
          if (effectiveNotesMode === "append" && notes) {
            // Fetch existing notes to append to
            const { data: existing } = await client
              .from("daily_logs")
              .select("notes")
              .eq("user_id", userId)
              .eq("date", date)
              .maybeSingle();
            const prev = existing?.notes as string | null;
            upsertData.notes = prev ? `${prev}\n${notes}` : notes;
          } else {
            upsertData.notes = notes || null;
          }
        }

        const { error } = await client
          .from("daily_logs")
          .upsert(upsertData, { onConflict: "user_id,date" });
        if (error) {
          return {
            content: [
              { type: "text" as const, text: safeErrorMessage(error) },
            ],
          };
        }
        const parts: string[] = [];
        if (pain_level !== undefined) parts.push(`pain ${pain_level}/10`);
        if (notes !== undefined) parts.push(`notes updated`);
        messages.push(`Daily log saved for ${date}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}.`);
      }

      // 3) Activity updates
      if (activities && activities.length > 0) {
        const known = await getKnownActivities(client, userId);

        // Validate every code up-front — all-or-nothing
        const resolved: { code: string; orig: (typeof activities)[number] }[] = [];
        const errors: string[] = [];
        for (const a of activities) {
          const check = validateActivity(a.code, known);
          if (check.valid) {
            resolved.push({ code: check.code, orig: a });
          } else {
            errors.push(check.message);
          }
        }
        if (errors.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Activity validation failed. No activity changes were applied:\n${errors.join("\n")}`,
              },
            ],
          };
        }

        const upsertRows: Record<string, unknown>[] = [];
        const deleteCodes: string[] = [];

        // Pre-fetch existing activity notes for append mode
        const appendCodes = resolved
          .filter((r) => !r.orig.delete && r.orig.note && (r.orig.note_mode ?? "append") === "append")
          .map((r) => r.code);
        let existingActivityNotes: Record<string, string> = {};
        if (appendCodes.length > 0) {
          const { data: existingRows } = await client
            .from("activity_completions")
            .select("activity_type, notes")
            .eq("user_id", userId)
            .eq("date", date)
            .in("activity_type", appendCodes);
          if (existingRows) {
            for (const row of existingRows) {
              if (row.notes) existingActivityNotes[row.activity_type] = row.notes;
            }
          }
        }

        for (const r of resolved) {
          if (r.orig.delete) {
            deleteCodes.push(r.code);
            continue;
          }
          const row: Record<string, unknown> = {
            user_id: userId,
            date,
            activity_type: r.code,
          };
          if (r.orig.completed !== undefined) row.completed = r.orig.completed;
          else row.completed = true; // default: treat naked code as "completed"
          if (r.orig.note !== undefined) {
            const noteMode = r.orig.note_mode ?? "append";
            if (noteMode === "append" && r.orig.note) {
              const prev = existingActivityNotes[r.code];
              row.notes = prev ? `${prev}\n${r.orig.note}` : r.orig.note;
            } else {
              row.notes = r.orig.note || null;
            }
          }
          upsertRows.push(row);
        }

        if (upsertRows.length > 0) {
          const { error: upsertErr } = await client
            .from("activity_completions")
            .upsert(upsertRows, {
              onConflict: "user_id,date,activity_type",
            });
          if (upsertErr) {
            return {
              content: [
                { type: "text" as const, text: safeErrorMessage(upsertErr) },
              ],
            };
          }
        }

        if (deleteCodes.length > 0) {
          const { error: delErr } = await client
            .from("activity_completions")
            .delete()
            .eq("user_id", userId)
            .eq("date", date)
            .in("activity_type", deleteCodes);
          if (delErr) {
            return {
              content: [
                { type: "text" as const, text: safeErrorMessage(delErr) },
              ],
            };
          }
        }

        const summaryBits: string[] = [];
        if (upsertRows.length > 0) {
          summaryBits.push(
            `upserted ${upsertRows.length} activit${upsertRows.length === 1 ? "y" : "ies"}`,
          );
        }
        if (deleteCodes.length > 0) {
          summaryBits.push(
            `deleted ${deleteCodes.length} (${deleteCodes.join(", ")})`,
          );
        }
        messages.push(`Activities: ${summaryBits.join(", ")} for ${date}.`);
      }

      if (messages.length === 0) {
        messages.push(
          `Nothing to save for ${date} — no fields or activities provided.`,
        );
      }
      return {
        content: [{ type: "text" as const, text: messages.join("\n") }],
      };
    },
  );
}
