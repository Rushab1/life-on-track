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
    "Upsert daily log + activity state for a date in one call. Set pain_level / notes (daily log). Per activity: completed (bool, marks complete/incomplete), note (string, adds note), delete (bool, removes the completion row entirely). clear_log=true deletes the daily_logs row for the date. All activity codes are validated; if any are unknown the whole request is rejected.",
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
    async ({ date, pain_level, notes, activities, clear_log }) => {
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
        if (notes !== undefined) upsertData.notes = notes || null;

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
        for (const r of resolved) {
          if (r.orig.delete) {
            deleteCodes.push(r.code);
            continue;
          }
          // Fetch existing only if we need to preserve unchanged fields.
          // Upsert row only includes fields we want to change: completed, notes,
          // plus identity (user_id, date, activity_type).
          // When both completed and note are omitted we still touch the row so
          // caller can confirm existence.
          const row: Record<string, unknown> = {
            user_id: userId,
            date,
            activity_type: r.code,
          };
          if (r.orig.completed !== undefined) row.completed = r.orig.completed;
          else row.completed = true; // default: treat naked code as "completed"
          if (r.orig.note !== undefined) row.notes = r.orig.note || null;
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
