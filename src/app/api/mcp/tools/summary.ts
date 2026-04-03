import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVITY_LABELS } from "@/config/constants";
import type { ActivityCompletion, WorkoutSet, DailyLog } from "@/lib/types";

export function registerSummaryTools(server: McpServer, client: SupabaseClient, userId: string) {
  server.tool(
    "get_day_summary",
    "Get a full summary of a single day: pain level (0-10), all activity completions, all workout sets, and which plan is active. This is the best starting tool — call it first to understand the user's day before making changes.",
    { date: z.string().describe("Date in YYYY-MM-DD format") },
    async ({ date }) => {
      const [dailyLogRes, activitiesRes, workoutsRes, planRes] = await Promise.all([
        client.from("daily_logs").select("*").eq("user_id", userId).eq("date", date).single(),
        client.from("activity_completions").select("*").eq("user_id", userId).eq("date", date),
        client.from("workout_sets").select("*").eq("user_id", userId).eq("date", date).order("created_at", { ascending: true }),
        client.from("plans").select("*").eq("user_id", userId).lte("start_date", date).gte("end_date", date).limit(1).single(),
      ]);

      const dailyLog = dailyLogRes.data as DailyLog | null;
      const activities = (activitiesRes.data ?? []) as ActivityCompletion[];
      const workouts = (workoutsRes.data ?? []) as WorkoutSet[];

      const summary = {
        date,
        pain_level: dailyLog?.pain_level ?? null,
        notes: dailyLog?.notes ?? null,
        activities: activities.map((a) => ({
          type: a.activity_type, label: ACTIVITY_LABELS[a.activity_type] ?? a.activity_type,
          completed: a.completed, notes: a.notes,
        })),
        workout_sets: workouts.map((w) => ({
          exercise: w.exercise, reps: w.reps,
          weight_lbs: w.weight_lbs, duration_mins: w.duration_mins, notes: w.notes,
        })),
        active_plan: planRes.data ? { id: planRes.data.id, name: planRes.data.name } : null,
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
    }
  );

  server.tool(
    "get_week_summary",
    "Get an aggregated summary for a date range (defaults to past 7 days). Returns average pain level, activity completion rates by type, number of workout days, and total exercises logged.",
    {
      start_date: z.string().optional().describe("Start date YYYY-MM-DD (defaults to 7 days ago)"),
      end_date: z.string().optional().describe("End date YYYY-MM-DD (defaults to today)"),
    },
    async ({ start_date, end_date }) => {
      const endDate = end_date ?? new Date().toISOString().split("T")[0];
      const startDate = start_date ?? new Date(Date.now() - 6 * 86400000).toISOString().split("T")[0];

      const [dailyLogsRes, activitiesRes, workoutsRes] = await Promise.all([
        client.from("daily_logs").select("*").eq("user_id", userId).gte("date", startDate).lte("date", endDate).order("date"),
        client.from("activity_completions").select("*").eq("user_id", userId).gte("date", startDate).lte("date", endDate),
        client.from("workout_sets").select("*").eq("user_id", userId).gte("date", startDate).lte("date", endDate).order("date"),
      ]);

      const dailyLogs = (dailyLogsRes.data ?? []) as DailyLog[];
      const activities = (activitiesRes.data ?? []) as ActivityCompletion[];
      const workouts = (workoutsRes.data ?? []) as WorkoutSet[];

      const painValues = dailyLogs.filter((d) => d.pain_level !== null).map((d) => d.pain_level!);
      const avgPain = painValues.length > 0
        ? Math.round((painValues.reduce((a, b) => a + b, 0) / painValues.length) * 10) / 10
        : null;

      const activityCounts: Record<string, { completed: number; total: number }> = {};
      for (const a of activities) {
        if (!activityCounts[a.activity_type]) activityCounts[a.activity_type] = { completed: 0, total: 0 };
        activityCounts[a.activity_type].total++;
        if (a.completed) activityCounts[a.activity_type].completed++;
      }

      const activityRates = Object.entries(activityCounts).map(([type, counts]) => ({
        activity: type, label: ACTIVITY_LABELS[type] ?? type,
        completed: counts.completed, total: counts.total,
        rate: `${Math.round((counts.completed / counts.total) * 100)}%`,
      }));

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            range: { start: startDate, end: endDate },
            days_logged: dailyLogs.length,
            avg_pain_level: avgPain,
            activity_completion: activityRates,
            workout_days: new Set(workouts.map((w) => w.date)).size,
            total_exercises_logged: workouts.length,
          }, null, 2),
        }],
      };
    }
  );
}
