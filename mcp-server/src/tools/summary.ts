import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../auth.js";
import { ACTIVITY_LABELS } from "../constants.js";
import type { ActivityType, ActivityCompletion, WorkoutSet, DailyLog } from "../types.js";

export function registerSummaryTools(server: McpServer) {
  server.tool(
    "get_day_summary",
    "Get a full summary of a day: pain level, activities, workout sets, and active plan",
    { date: z.string().describe("Date in YYYY-MM-DD format") },
    async ({ date }) => {
      const client = getClient();

      // Run all queries in parallel
      const [dailyLogRes, activitiesRes, workoutsRes, planRes, eventsRes] = await Promise.all([
        client.from("daily_logs").select("*").eq("date", date).single(),
        client.from("activity_completions").select("*").eq("date", date),
        client.from("workout_sets").select("*").eq("date", date).order("created_at", { ascending: true }),
        client.from("plans").select("*").lte("start_date", date).gte("end_date", date).limit(1).single(),
        client.from("life_events").select("id, title, notes").eq("date", date).order("created_at"),
      ]);

      const dailyLog = dailyLogRes.data as DailyLog | null;
      const activities = (activitiesRes.data ?? []) as ActivityCompletion[];
      const workouts = (workoutsRes.data ?? []) as WorkoutSet[];
      const plan = planRes.data;

      const summary: Record<string, unknown> = { date };

      // Daily log
      if (dailyLog) {
        summary.pain_level = dailyLog.pain_level;
        summary.notes = dailyLog.notes;
      } else {
        summary.pain_level = null;
        summary.notes = null;
      }

      // Activities
      summary.activities = activities.map((a) => ({
        type: a.activity_type,
        label: ACTIVITY_LABELS[a.activity_type],
        completed: a.completed,
        notes: a.notes,
      }));

      // Workouts
      summary.workout_sets = workouts.map((w) => ({
        exercise: w.exercise,
        sets: w.sets,
        reps: w.reps,
        weight_lbs: w.weight_lbs,
        duration_mins: w.duration_mins,
        notes: w.notes,
      }));

      // Life events
      summary.life_events = (eventsRes.data ?? []).map((e: { id: string; title: string; notes: string | null }) => ({
        id: e.id, title: e.title, notes: e.notes,
      }));

      // Plan
      if (plan) {
        summary.active_plan = { id: plan.id, name: plan.name };
      } else {
        summary.active_plan = null;
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
      };
    }
  );

  server.tool(
    "get_week_summary",
    "Get an aggregated summary for a date range (defaults to past 7 days)",
    {
      start_date: z.string().optional().describe("Start date YYYY-MM-DD (defaults to 7 days ago)"),
      end_date: z.string().optional().describe("End date YYYY-MM-DD (defaults to today)"),
    },
    async ({ start_date, end_date }) => {
      const endDate = end_date ?? new Date().toISOString().split("T")[0];
      const startDate = start_date ?? new Date(Date.now() - 6 * 86400000).toISOString().split("T")[0];

      const client = getClient();

      const [dailyLogsRes, activitiesRes, workoutsRes] = await Promise.all([
        client.from("daily_logs").select("*").gte("date", startDate).lte("date", endDate).order("date"),
        client.from("activity_completions").select("*").gte("date", startDate).lte("date", endDate),
        client.from("workout_sets").select("*").gte("date", startDate).lte("date", endDate).order("date"),
      ]);

      const dailyLogs = (dailyLogsRes.data ?? []) as DailyLog[];
      const activities = (activitiesRes.data ?? []) as ActivityCompletion[];
      const workouts = (workoutsRes.data ?? []) as WorkoutSet[];

      // Pain average
      const painValues = dailyLogs.filter((d) => d.pain_level !== null).map((d) => d.pain_level!);
      const avgPain = painValues.length > 0
        ? Math.round((painValues.reduce((a, b) => a + b, 0) / painValues.length) * 10) / 10
        : null;

      // Activity completion rates
      const activityCounts: Record<string, { completed: number; total: number }> = {};
      for (const a of activities) {
        if (!activityCounts[a.activity_type]) {
          activityCounts[a.activity_type] = { completed: 0, total: 0 };
        }
        activityCounts[a.activity_type].total++;
        if (a.completed) activityCounts[a.activity_type].completed++;
      }

      const activityRates = Object.entries(activityCounts).map(([type, counts]) => ({
        activity: type,
        label: ACTIVITY_LABELS[type as ActivityType],
        completed: counts.completed,
        total: counts.total,
        rate: `${Math.round((counts.completed / counts.total) * 100)}%`,
      }));

      // Workout stats
      const uniqueWorkoutDates = new Set(workouts.map((w) => w.date));
      const totalSets = workouts.reduce((sum, w) => sum + (w.sets ?? 1), 0);

      const summary = {
        range: { start: startDate, end: endDate },
        days_logged: dailyLogs.length,
        avg_pain_level: avgPain,
        activity_completion: activityRates,
        workout_days: uniqueWorkoutDates.size,
        total_sets: totalSets,
        total_exercises_logged: workouts.length,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
      };
    }
  );
}
