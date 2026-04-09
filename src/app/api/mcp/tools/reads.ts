import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVITY_LABELS } from "@/config/constants";
import { getActivitiesForDate } from "@/config/schedule";
import type {
  ActivityCompletion,
  DailyLog,
  Plan,
  WorkoutSet,
} from "@/lib/types";
import { dateSchema, safeErrorMessage } from "../validation";

/**
 * get_day — the one-stop read for a single date. Merges the old
 * get_day_summary, get_daily_log, get_activities, get_workout_sets,
 * get_widget_values, and get_events tools into a single call.
 *
 * get_history — merges get_week_summary (aggregated range) and
 * get_last_workout (progressive overload lookup) into a single tool.
 */
export function registerReadTools(
  server: McpServer,
  client: SupabaseClient,
  userId: string,
) {
  server.tool(
    "get_day",
    "Get everything for a single date in one call: pain level, notes, active plan (with exercise templates), any day override, scheduled + ad-hoc activities, workout sets grouped by exercise, widget values, and life events. This is the canonical starting tool — call it first when the user asks about a day.",
    { date: dateSchema.describe("Date in YYYY-MM-DD format") },
    async ({ date }) => {
      const [
        dailyLogRes,
        activitiesRes,
        workoutsRes,
        planRes,
        overrideRes,
        eventsRes,
        widgetRes,
      ] = await Promise.all([
        client
          .from("daily_logs")
          .select("*")
          .eq("user_id", userId)
          .eq("date", date)
          .maybeSingle(),
        client
          .from("activity_completions")
          .select("*")
          .eq("user_id", userId)
          .eq("date", date),
        client
          .from("workout_sets")
          .select("*")
          .eq("user_id", userId)
          .eq("date", date)
          .order("created_at", { ascending: true }),
        client
          .from("plans")
          .select("*")
          .eq("user_id", userId)
          .lte("start_date", date)
          .gte("end_date", date)
          .limit(1)
          .maybeSingle(),
        client
          .from("day_overrides")
          .select("gym_type")
          .eq("user_id", userId)
          .eq("date", date)
          .maybeSingle(),
        client
          .from("life_events")
          .select("id, title, notes")
          .eq("user_id", userId)
          .eq("date", date)
          .order("created_at"),
        client
          .from("widget_values")
          .select("widget_id, value, activity_type, widget_definitions(name, type)")
          .eq("user_id", userId)
          .eq("date", date),
      ]);

      const dailyLog = dailyLogRes.data as DailyLog | null;
      const completions = (activitiesRes.data ?? []) as ActivityCompletion[];
      const workouts = (workoutsRes.data ?? []) as WorkoutSet[];
      const plan = planRes.data as Plan | null;
      const overrideGym =
        (overrideRes.data as { gym_type: string } | null)?.gym_type ?? null;

      // Merge scheduled activities with completions, honoring overrides
      const scheduled = getActivitiesForDate(
        new Date(date + "T00:00:00"),
        plan,
        overrideGym,
      );
      const completionMap: Record<
        string,
        { completed: boolean; notes: string | null }
      > = {};
      for (const c of completions) {
        completionMap[c.activity_type] = {
          completed: c.completed,
          notes: c.notes,
        };
      }

      const activities = scheduled.map((act) => ({
        code: act,
        label: ACTIVITY_LABELS[act] ?? act,
        scheduled: true,
        completed: completionMap[act]?.completed ?? false,
        note: completionMap[act]?.notes ?? null,
      }));
      for (const c of completions) {
        if (!scheduled.includes(c.activity_type)) {
          activities.push({
            code: c.activity_type,
            label: ACTIVITY_LABELS[c.activity_type] ?? c.activity_type,
            scheduled: false,
            completed: c.completed,
            note: c.notes,
          });
        }
      }

      // Workouts grouped by exercise, preserving insertion order
      const sets = workouts.map((w) => ({
        id: w.id,
        exercise: w.exercise,
        reps: w.reps,
        weight_lbs: w.weight_lbs,
        duration_mins: w.duration_mins,
        notes: w.notes,
      }));
      const grouped: Record<string, typeof sets> = {};
      for (const s of sets) {
        if (!grouped[s.exercise]) grouped[s.exercise] = [];
        grouped[s.exercise].push(s);
      }

      const lifeEvents = (eventsRes.data ?? []).map(
        (e: { id: string; title: string; notes: string | null }) => ({
          id: e.id,
          title: e.title,
          notes: e.notes,
        }),
      );

      const widgetValues = (widgetRes.data ?? []).map(
        (v: Record<string, unknown>) => {
          const def = v.widget_definitions as Record<string, unknown> | null;
          return {
            widget_id: v.widget_id,
            widget_name: def?.name ?? "Unknown",
            widget_type: def?.type,
            activity_type: v.activity_type,
            value: v.value,
          };
        },
      );

      // Build active plan view including the exercise template for this day
      let planView: {
        id: string;
        name: string;
        gym_type: string;
        gym_type_label: string;
        override: boolean;
        warmup: string[];
        exercises: string[];
        cardio: string[];
      } | null = null;
      if (plan) {
        const dow = String(new Date(date + "T00:00:00").getDay());
        const planGym = plan.gym_schedule?.[dow] ?? "rst";
        const gymType = overrideGym ?? planGym;
        const templates = plan.workout_templates ?? {};
        const gymMeta = plan.workout_meta?.[gymType];
        planView = {
          id: plan.id,
          name: plan.name,
          gym_type: gymType,
          gym_type_label: ACTIVITY_LABELS[gymType] ?? gymType,
          override: overrideGym !== null,
          warmup: Array.isArray(gymMeta?.warmup) ? gymMeta.warmup : [],
          exercises: Array.isArray(templates[gymType]) ? templates[gymType] : [],
          cardio: Array.isArray(gymMeta?.cardio) ? gymMeta.cardio : [],
        };
      }

      const summary = {
        date,
        pain_level: dailyLog?.pain_level ?? null,
        notes: dailyLog?.notes ?? null,
        plan: planView,
        activities,
        workout_sets: sets,
        workout_sets_by_exercise: grouped,
        widget_values: widgetValues,
        events: lifeEvents,
      };
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(summary, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "get_history",
    "Get history across a date range. Mode A (range summary): provide start_date and/or end_date (default: last 7 days) — returns avg pain, activity completion rates, workout days, and total exercises. Mode B (progressive overload): provide exercises (and optionally before_date, default today) — returns the most recent session per exercise before that date.",
    {
      start_date: dateSchema
        .optional()
        .describe("Range start YYYY-MM-DD (Mode A). Defaults to 7 days ago."),
      end_date: dateSchema
        .optional()
        .describe("Range end YYYY-MM-DD (Mode A). Defaults to today."),
      exercises: z
        .array(z.string().max(200))
        .max(50)
        .optional()
        .describe("Exercise names (Mode B). Triggers progressive overload lookup."),
      before_date: dateSchema
        .optional()
        .describe("Only include sessions strictly before this date (Mode B). Defaults to today."),
    },
    async ({ start_date, end_date, exercises, before_date }) => {
      // Mode B: progressive overload lookup
      if (exercises && exercises.length > 0) {
        const cutoff =
          before_date ?? new Date().toISOString().split("T")[0];
        const { data, error } = await client
          .from("workout_sets")
          .select("exercise, reps, weight_lbs, duration_mins, date")
          .eq("user_id", userId)
          .lt("date", cutoff)
          .in("exercise", exercises)
          .order("date", { ascending: false })
          .order("created_at", { ascending: true });

        if (error) {
          return {
            content: [
              { type: "text" as const, text: safeErrorMessage(error) },
            ],
          };
        }
        if (!data || data.length === 0) {
          return {
            content: [
              { type: "text" as const, text: "No previous workout data found." },
            ],
          };
        }

        const latestDate: Record<string, string> = {};
        for (const row of data) {
          if (!latestDate[row.exercise]) latestDate[row.exercise] = row.date;
        }

        const result: Record<
          string,
          {
            reps: number | null;
            weight_lbs: number | null;
            duration_mins: number | null;
            date: string;
          }[]
        > = {};
        for (const row of data) {
          if (row.date === latestDate[row.exercise]) {
            if (!result[row.exercise]) result[row.exercise] = [];
            result[row.exercise].push({
              reps: row.reps,
              weight_lbs: row.weight_lbs,
              duration_mins: row.duration_mins,
              date: row.date,
            });
          }
        }
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      }

      // Mode A: aggregated range summary
      const endDate = end_date ?? new Date().toISOString().split("T")[0];
      const startDate =
        start_date ??
        new Date(Date.now() - 6 * 86400000).toISOString().split("T")[0];

      const [dailyLogsRes, activitiesRes, workoutsRes] = await Promise.all([
        client
          .from("daily_logs")
          .select("*")
          .eq("user_id", userId)
          .gte("date", startDate)
          .lte("date", endDate)
          .order("date"),
        client
          .from("activity_completions")
          .select("*")
          .eq("user_id", userId)
          .gte("date", startDate)
          .lte("date", endDate),
        client
          .from("workout_sets")
          .select("*")
          .eq("user_id", userId)
          .gte("date", startDate)
          .lte("date", endDate)
          .order("date"),
      ]);

      const dailyLogs = (dailyLogsRes.data ?? []) as DailyLog[];
      const activities = (activitiesRes.data ?? []) as ActivityCompletion[];
      const workouts = (workoutsRes.data ?? []) as WorkoutSet[];

      const painValues = dailyLogs
        .filter((d) => d.pain_level !== null)
        .map((d) => d.pain_level!);
      const avgPain =
        painValues.length > 0
          ? Math.round(
              (painValues.reduce((a, b) => a + b, 0) / painValues.length) * 10,
            ) / 10
          : null;

      const activityCounts: Record<
        string,
        { completed: number; total: number }
      > = {};
      for (const a of activities) {
        if (!activityCounts[a.activity_type]) {
          activityCounts[a.activity_type] = { completed: 0, total: 0 };
        }
        activityCounts[a.activity_type].total++;
        if (a.completed) activityCounts[a.activity_type].completed++;
      }

      const activityRates = Object.entries(activityCounts).map(
        ([type, counts]) => ({
          activity: type,
          label: ACTIVITY_LABELS[type] ?? type,
          completed: counts.completed,
          total: counts.total,
          rate: `${Math.round((counts.completed / counts.total) * 100)}%`,
        }),
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                range: { start: startDate, end: endDate },
                days_logged: dailyLogs.length,
                avg_pain_level: avgPain,
                activity_completion: activityRates,
                workout_days: new Set(workouts.map((w) => w.date)).size,
                total_exercises_logged: workouts.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
