import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dateSchema, safeErrorMessage } from "../validation";

/**
 * Exercise catalog and day-swap management. Exercises are stored in the
 * `exercises` table (replaces the hardcoded list in @/config/exercises). Day
 * overrides let a user swap workout types without mutating the recurring
 * plan.
 */
export function registerCatalogTools(
  server: McpServer,
  client: SupabaseClient,
  userId: string,
) {
  server.tool(
    "manage_exercise",
    'Exercise catalog admin. action="list" returns all known exercises (presets + user-owned), optionally filtered by category. "add" creates a new exercise (user-owned) — name is required, category optional. "remove" deletes a user-owned exercise by name (presets cannot be removed). Categories: push, pull, legs_heavy, legs_light, shared, warmup, cardio.',
    {
      action: z.enum(["list", "add", "remove"]).describe("Catalog action"),
      name: z
        .string()
        .max(200)
        .optional()
        .describe("Exercise name (for add/remove)"),
      category: z
        .string()
        .max(50)
        .optional()
        .describe("Exercise category. For list: filter. For add: set."),
    },
    async ({ action, name, category }) => {
      if (action === "list") {
        let query = client
          .from("exercises")
          .select("name, category, user_id")
          .or(`user_id.is.null,user_id.eq.${userId}`)
          .order("category", { ascending: true })
          .order("name", { ascending: true });
        if (category) {
          query = query.eq("category", category);
        }
        const { data, error } = await query;
        if (error) {
          return {
            content: [
              { type: "text" as const, text: safeErrorMessage(error) },
            ],
          };
        }
        const rows = (data ?? []).map(
          (r: { name: string; category: string | null; user_id: string | null }) => ({
            name: r.name,
            category: r.category,
            preset: r.user_id === null,
          }),
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(rows, null, 2) },
          ],
        };
      }

      if (action === "add") {
        if (!name) {
          return {
            content: [
              { type: "text" as const, text: "action=add requires name." },
            ],
          };
        }
        const trimmed = name.trim();
        if (trimmed.length === 0) {
          return {
            content: [
              { type: "text" as const, text: "name cannot be empty." },
            ],
          };
        }

        // Check if a preset or user row already exists (case-insensitive)
        const { data: existing } = await client
          .from("exercises")
          .select("name, user_id")
          .or(`user_id.is.null,user_id.eq.${userId}`)
          .ilike("name", trimmed);
        if (existing && existing.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Exercise "${existing[0].name}" already exists (use the exact name).`,
              },
            ],
          };
        }

        const { error } = await client.from("exercises").insert({
          user_id: userId,
          name: trimmed,
          category: category ?? null,
        });
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
              text: `Added exercise "${trimmed}"${category ? ` (${category})` : ""}.`,
            },
          ],
        };
      }

      if (action === "remove") {
        if (!name) {
          return {
            content: [
              { type: "text" as const, text: "action=remove requires name." },
            ],
          };
        }
        const { data: existing } = await client
          .from("exercises")
          .select("id, user_id, name")
          .eq("user_id", userId)
          .ilike("name", name)
          .limit(1);
        if (!existing || existing.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No user-owned exercise "${name}" found. Preset exercises cannot be removed.`,
              },
            ],
          };
        }
        const { error } = await client
          .from("exercises")
          .delete()
          .eq("id", existing[0].id)
          .eq("user_id", userId);
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
              text: `Removed exercise "${existing[0].name}".`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text" as const, text: `Unknown action: ${action}` }],
      };
    },
  );

  server.tool(
    "override_gym_day",
    "Override the gym type for a specific date without mutating the recurring plan. Use when swapping workouts (e.g. moved Monday's push to Wednesday). Pass gym_type=null (or omit) to remove the override. Affects what activities appear on that date in get_day and sync_calendar, and what the frontend renders.",
    {
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      gym_type: z
        .string()
        .max(50)
        .nullable()
        .optional()
        .describe(
          "Gym type code to use for this date (psh, pll, lgh, lgl, yga, rst, or a custom code). Pass null / omit to remove any existing override.",
        ),
    },
    async ({ date, gym_type }) => {
      if (gym_type === null || gym_type === undefined) {
        const { error } = await client
          .from("day_overrides")
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
        return {
          content: [
            { type: "text" as const, text: `Cleared gym override for ${date}.` },
          ],
        };
      }

      const { error } = await client.from("day_overrides").upsert(
        {
          user_id: userId,
          date,
          gym_type,
        },
        { onConflict: "user_id,date" },
      );
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
            text: `Override set: ${date} → ${gym_type}.`,
          },
        ],
      };
    },
  );
}
