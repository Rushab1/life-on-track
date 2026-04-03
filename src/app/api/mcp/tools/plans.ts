import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVITY_LABELS } from "@/config/constants";
import { DEFAULT_GYM_SCHEDULE, DEFAULT_PREP_SCHEDULE } from "@/config/schedule";
import type { Plan } from "@/lib/types";

export function registerPlanTools(server: McpServer, client: SupabaseClient, userId: string) {
  server.tool(
    "get_plans",
    "List all plans, ordered by start date (newest first)",
    {},
    async () => {
      const { data, error } = await client
        .from("plans").select("*").eq("user_id", userId)
        .order("start_date", { ascending: false });

      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      if (!data || data.length === 0) return { content: [{ type: "text" as const, text: "No plans found." }] };
      const plans = (data as Plan[]).map((p) => ({
        id: p.id, name: p.name, start_date: p.start_date, end_date: p.end_date,
        gym_schedule: p.gym_schedule, prep_schedule: p.prep_schedule,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(plans, null, 2) }] };
    }
  );

  server.tool(
    "get_active_plan",
    "Get the plan that covers a specific date",
    { date: z.string().describe("Date in YYYY-MM-DD format") },
    async ({ date }) => {
      const { data, error } = await client
        .from("plans").select("*").eq("user_id", userId)
        .lte("start_date", date).gte("end_date", date)
        .limit(1).single();

      if (error && error.code !== "PGRST116") return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      if (!data) {
        const day = String(new Date(date + "T00:00:00").getDay());
        const gym = DEFAULT_GYM_SCHEDULE[day] ?? "rst";
        const prep = DEFAULT_PREP_SCHEDULE[day] ?? [];
        return {
          content: [{
            type: "text" as const,
            text: `No plan covers ${date}. Using defaults:\n  Gym: ${ACTIVITY_LABELS[gym] ?? gym}\n  Prep: ${prep.map((a) => ACTIVITY_LABELS[a] ?? a).join(", ") || "None"}`,
          }],
        };
      }
      const plan = data as Plan;
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            id: plan.id, name: plan.name, start_date: plan.start_date, end_date: plan.end_date,
            gym_schedule: plan.gym_schedule, prep_schedule: plan.prep_schedule,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "create_plan",
    "Create a new plan with gym and prep schedules",
    {
      name: z.string().describe("Plan name"),
      start_date: z.string().describe("Start date YYYY-MM-DD"),
      end_date: z.string().describe("End date YYYY-MM-DD"),
      gym_schedule: z.record(z.string(), z.string()).optional().describe("Day-of-week (0-6) to gym type mapping"),
      prep_schedule: z.record(z.string(), z.array(z.string())).optional().describe("Day-of-week (0-6) to activity type array"),
    },
    async ({ name, start_date, end_date, gym_schedule, prep_schedule }) => {
      const { error } = await client.from("plans").insert({
        user_id: userId, name, start_date, end_date,
        gym_schedule: gym_schedule ?? DEFAULT_GYM_SCHEDULE,
        prep_schedule: prep_schedule ?? DEFAULT_PREP_SCHEDULE,
      });

      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      return { content: [{ type: "text" as const, text: `Plan "${name}" created for ${start_date} to ${end_date}.` }] };
    }
  );

  server.tool(
    "update_plan",
    "Update an existing plan",
    {
      id: z.string().describe("Plan ID"),
      name: z.string().optional(), start_date: z.string().optional(),
      end_date: z.string().optional(),
      gym_schedule: z.record(z.string(), z.string()).optional(),
      prep_schedule: z.record(z.string(), z.array(z.string())).optional(),
    },
    async ({ id, ...updates }) => {
      const cleanUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (updates.name !== undefined) cleanUpdates.name = updates.name;
      if (updates.start_date !== undefined) cleanUpdates.start_date = updates.start_date;
      if (updates.end_date !== undefined) cleanUpdates.end_date = updates.end_date;
      if (updates.gym_schedule !== undefined) cleanUpdates.gym_schedule = updates.gym_schedule;
      if (updates.prep_schedule !== undefined) cleanUpdates.prep_schedule = updates.prep_schedule;

      const { error } = await client.from("plans").update(cleanUpdates).eq("user_id", userId).eq("id", id);
      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      return { content: [{ type: "text" as const, text: `Plan ${id} updated.` }] };
    }
  );

  server.tool(
    "delete_plan",
    "Delete a plan",
    { id: z.string().describe("Plan ID to delete") },
    async ({ id }) => {
      const { error } = await client.from("plans").delete().eq("user_id", userId).eq("id", id);
      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
      return { content: [{ type: "text" as const, text: `Plan ${id} deleted.` }] };
    }
  );
}
