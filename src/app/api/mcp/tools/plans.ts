import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Plan } from "@/lib/types";
import { dateSchema, uuidSchema, safeErrorMessage } from "../validation";

const gymScheduleSchema = z
  .record(z.string(), z.string().max(50))
  .describe(
    "Map of day-of-week to gym type. Keys are '0'-'6' (0=Sunday). Values: psh, pll, lgh, lgl, yga, rst.",
  );

const prepScheduleSchema = z
  .record(z.string(), z.array(z.string().max(50)).max(20))
  .describe(
    "Map of day-of-week to prep activity arrays. Keys are '0'-'6' (0=Sunday). Values: arrays of activity codes (lc, ml, sd, vln, dte, etc.).",
  );

const workoutTemplatesSchema = z
  .record(z.string(), z.array(z.string().max(200)).max(40))
  .describe(
    "Map of gym type code to exercise-name array. E.g. { psh: ['Incline Dumbbell Press', ...], pll: [...], lgh: [...], lgl: [...] }. Used so get_day can return 'what exercises does this workout include' without extra lookups.",
  );

export function registerPlanTool(
  server: McpServer,
  client: SupabaseClient,
  userId: string,
) {
  server.tool(
    "manage_plan",
    `Plan admin. action="list" returns all plans. "get" returns the plan covering a date. "create" requires name, start_date, end_date, gym_schedule, prep_schedule (workout_templates optional). "update" requires id + any field to change. "delete" requires id. workout_templates is a new field that maps gym_type codes (psh, lgh, etc.) to ordered exercise lists — populate it so get_day can return "what's today's push workout?".`,
    {
      action: z
        .enum(["list", "get", "create", "update", "delete"])
        .describe("Plan action"),
      id: uuidSchema.optional().describe("Plan ID (for get/update/delete)"),
      date: dateSchema
        .optional()
        .describe("YYYY-MM-DD (for action=get — finds the plan covering this date)"),
      name: z.string().max(200).optional(),
      start_date: dateSchema.optional(),
      end_date: dateSchema.optional(),
      gym_schedule: gymScheduleSchema.optional(),
      prep_schedule: prepScheduleSchema.optional(),
      workout_templates: workoutTemplatesSchema.optional(),
    },
    async ({
      action,
      id,
      date,
      name,
      start_date,
      end_date,
      gym_schedule,
      prep_schedule,
      workout_templates,
    }) => {
      if (action === "list") {
        const { data, error } = await client
          .from("plans")
          .select("*")
          .eq("user_id", userId)
          .order("start_date", { ascending: false });
        if (error) {
          return {
            content: [
              { type: "text" as const, text: safeErrorMessage(error) },
            ],
          };
        }
        if (!data || data.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No plans found." }],
          };
        }
        const plans = (data as Plan[]).map((p) => ({
          id: p.id,
          name: p.name,
          start_date: p.start_date,
          end_date: p.end_date,
          gym_schedule: p.gym_schedule,
          prep_schedule: p.prep_schedule,
          workout_templates: p.workout_templates ?? {},
        }));
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(plans, null, 2) },
          ],
        };
      }

      if (action === "get") {
        if (!date) {
          return {
            content: [
              {
                type: "text" as const,
                text: "action=get requires a date.",
              },
            ],
          };
        }
        const { data, error } = await client
          .from("plans")
          .select("*")
          .eq("user_id", userId)
          .lte("start_date", date)
          .gte("end_date", date)
          .limit(1)
          .maybeSingle();
        if (error) {
          return {
            content: [
              { type: "text" as const, text: safeErrorMessage(error) },
            ],
          };
        }
        if (!data) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No plan covers ${date}. Use manage_plan action=create to set one up.`,
              },
            ],
          };
        }
        const plan = data as Plan;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  id: plan.id,
                  name: plan.name,
                  start_date: plan.start_date,
                  end_date: plan.end_date,
                  gym_schedule: plan.gym_schedule,
                  prep_schedule: plan.prep_schedule,
                  workout_templates: plan.workout_templates ?? {},
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (action === "create") {
        if (!name || !start_date || !end_date || !gym_schedule || !prep_schedule) {
          return {
            content: [
              {
                type: "text" as const,
                text: "action=create requires name, start_date, end_date, gym_schedule, prep_schedule.",
              },
            ],
          };
        }
        if (start_date > end_date) {
          return {
            content: [
              {
                type: "text" as const,
                text: "start_date must be on or before end_date.",
              },
            ],
          };
        }
        const { error } = await client.from("plans").insert({
          user_id: userId,
          name,
          start_date,
          end_date,
          gym_schedule,
          prep_schedule,
          workout_templates: workout_templates ?? {},
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
              text: `Plan "${name}" created for ${start_date} to ${end_date}.`,
            },
          ],
        };
      }

      if (action === "update") {
        if (!id) {
          return {
            content: [
              {
                type: "text" as const,
                text: "action=update requires id.",
              },
            ],
          };
        }
        const patch: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (name !== undefined) patch.name = name;
        if (start_date !== undefined) patch.start_date = start_date;
        if (end_date !== undefined) patch.end_date = end_date;
        if (gym_schedule !== undefined) patch.gym_schedule = gym_schedule;
        if (prep_schedule !== undefined) patch.prep_schedule = prep_schedule;
        if (workout_templates !== undefined)
          patch.workout_templates = workout_templates;

        const { error } = await client
          .from("plans")
          .update(patch)
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
            { type: "text" as const, text: `Plan ${id} updated.` },
          ],
        };
      }

      if (action === "delete") {
        if (!id) {
          return {
            content: [
              {
                type: "text" as const,
                text: "action=delete requires id.",
              },
            ],
          };
        }
        const { error } = await client
          .from("plans")
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
            { type: "text" as const, text: `Plan ${id} deleted.` },
          ],
        };
      }

      return {
        content: [
          { type: "text" as const, text: `Unknown action: ${action}` },
        ],
      };
    },
  );
}
