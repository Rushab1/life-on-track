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
import { syncOuraIfStale } from "@/lib/oura/client";
import { addDays, toDateString } from "@/lib/dates";
import { dateSchema, safeErrorMessage } from "../validation";
import {
  computeAggregate,
  computeDayRows,
  enumerateDates,
  type DayRow,
} from "./history-helpers";

/**
 * Fetch and assemble per-day history rows for an inclusive date range. Backs
 * get_history's per-day (Mode A) and recent-days (Mode C) paths. Every table
 * is scoped to the range so one round-trip each covers the whole span.
 */
async function fetchDayRows(
  client: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<{ rows: DayRow[]; error: { message: string; code?: string } | null }> {
  const dates = enumerateDates(startDate, endDate);
  if (dates.length === 0) return { rows: [], error: null };

  const [logsRes, actsRes, wsRes, plansRes, overridesRes] = await Promise.all([
    client
      .from("daily_logs")
      .select("*")
      .eq("user_id", userId)
      .gte("date", startDate)
      .lte("date", endDate),
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
      .order("created_at", { ascending: true }),
    client
      .from("plans")
      .select("*")
      .eq("user_id", userId)
      .lte("start_date", endDate)
      .gte("end_date", startDate),
    client
      .from("day_overrides")
      .select("date, gym_type")
      .eq("user_id", userId)
      .gte("date", startDate)
      .lte("date", endDate),
  ]);

  const error =
    logsRes.error ??
    actsRes.error ??
    wsRes.error ??
    plansRes.error ??
    overridesRes.error ??
    null;
  if (error) return { rows: [], error };

  const rows = computeDayRows(dates, {
    dailyLogs: (logsRes.data ?? []) as DailyLog[],
    activities: (actsRes.data ?? []) as ActivityCompletion[],
    workouts: (wsRes.data ?? []) as WorkoutSet[],
    plans: (plansRes.data ?? []) as Plan[],
    overrides: (overridesRes.data ?? []) as { date: string; gym_type: string }[],
  });
  return { rows, error: null };
}

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
    'Get everything for a single date in one call: pain level, notes, active plan (with exercise templates), any day override, scheduled + ad-hoc activities, workout sets grouped by exercise, widget values, life events, Google Calendar events, and Oura Ring metrics (sleep/readiness/activity scores, HRV, resting HR, steps). This is the canonical starting tool — call it first when the user asks about a day. WORKOUT LOGGING PROTOCOL — call this FIRST. After showing notes + plan, collect a baseline pain panel (multiple-choice body parts drawn from the last 7 days of logs and today\'s notes) BEFORE any sets are discussed, and persist it with save_day. Then follow the per-set protocol described on log_workout. Follow the workout-logging prompt for the full session protocol.',
    { date: dateSchema.describe("Date in YYYY-MM-DD format") },
    async ({ date }) => {
      // Self-sufficient Oura: pull fresh data on demand so the MCP doesn't
      // depend on the website (or a webhook) having synced first. Best-effort.
      await syncOuraIfStale(client, userId, date).catch((err) =>
        console.error("get_day: oura on-demand sync failed", err),
      );

      const [
        dailyLogRes,
        activitiesRes,
        workoutsRes,
        planRes,
        overrideRes,
        eventsRes,
        widgetRes,
        calendarRes,
        ouraRes,
        ouraWorkoutsRes,
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
        client
          .from("google_events")
          .select("id, title, all_day, start_time, end_time, html_link")
          .eq("user_id", userId)
          .eq("date", date)
          .order("all_day", { ascending: false })
          .order("start_time"),
        client
          .from("oura_daily")
          .select(
            "sleep_score, readiness_score, activity_score, total_sleep_minutes, sleep_efficiency, avg_hrv, resting_hr, temperature_deviation, steps, active_calories, total_calories, high_activity_minutes, medium_activity_minutes, low_activity_minutes, sedentary_minutes, rest_minutes, non_wear_minutes",
          )
          .eq("user_id", userId)
          .eq("date", date)
          .maybeSingle(),
        client
          .from("oura_workouts")
          .select(
            "activity, intensity, calories, distance, start_time, end_time, source, label",
          )
          .eq("user_id", userId)
          .eq("date", date)
          .order("start_time"),
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

      const calendarEvents = (calendarRes.data ?? []).map(
        (e: {
          id: string;
          title: string;
          all_day: boolean;
          start_time: string | null;
          end_time: string | null;
          html_link: string | null;
        }) => ({
          id: e.id,
          title: e.title,
          all_day: e.all_day,
          start_time: e.start_time,
          end_time: e.end_time,
          html_link: e.html_link,
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
        calendar_events: calendarEvents,
        oura: ouraRes.data ?? null,
        oura_workouts: ouraWorkoutsRes.data ?? [],
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
    "Get history across a date range, a count of recent days, or recent sessions per exercise. Mode A (range summary): provide start_date and/or end_date (default: last 7 days) — returns avg pain, activity completion rates, workout days, and total exercises; add per_day:true to also get a day-by-day breakdown (each day's plan code, pain, notes, activities, and per-exercise set summary, max 92 days). Mode B (progressive overload / recent instances): provide exercises (and optionally before_date, default today) — returns the most recent sessions per exercise before that date; pass a single exercise name to get just its recent N instances. Use `sessions` to control how many recent sessions per exercise are returned (default 3). Mode C (recent N days): provide recent_days:N — returns the last N calendar days (ending today or at end_date), newest first, each with its plan code, pain, notes, activities, and workout summary. PROTOCOL: use Mode B (per-exercise recent sessions) BEFORE offering set options, so options reflect the user's actual prior numbers. Also use at session end to compare today's cardio/HR-zone work against the most recent session of the same activity. Follow the workout-logging prompt for the full session protocol.",
    {
      start_date: dateSchema
        .optional()
        .describe("Range start YYYY-MM-DD (Mode A). Defaults to 7 days ago."),
      end_date: dateSchema
        .optional()
        .describe(
          "Range end YYYY-MM-DD (Mode A). Also the anchor date for recent_days (Mode C). Defaults to today.",
        ),
      per_day: z
        .boolean()
        .optional()
        .describe(
          "Mode A: also return a day-by-day breakdown (each day's plan code, pain, notes, activities, and per-exercise set summary). Range capped at 92 days.",
        ),
      recent_days: z
        .number()
        .int()
        .min(1)
        .max(90)
        .optional()
        .describe(
          "Mode C: return the last N calendar days (ending today or at end_date), newest first, each with its plan code and day summary.",
        ),
      exercises: z
        .array(z.string().max(200))
        .max(50)
        .optional()
        .describe("Exercise names (Mode B). Triggers progressive overload lookup."),
      before_date: dateSchema
        .optional()
        .describe("Only include sessions strictly before this date (Mode B). Defaults to today."),
      sessions: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe(
          "Mode B: number of most recent sessions (distinct dates) to return per exercise. Defaults to 3.",
        ),
    },
    async ({
      start_date,
      end_date,
      per_day,
      recent_days,
      exercises,
      before_date,
      sessions,
    }) => {
      // Mode B: progressive overload lookup (recent instances per exercise)
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

        const maxSessions = sessions ?? 3;

        // data is ordered date desc, created_at asc, so each exercise's rows
        // arrive in descending contiguous date groups. Keep rows until we've
        // collected maxSessions distinct dates for that exercise.
        const datesSeen: Record<string, string[]> = {};
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
          const dates = datesSeen[row.exercise] ?? (datesSeen[row.exercise] = []);
          if (!dates.includes(row.date)) {
            if (dates.length >= maxSessions) continue;
            dates.push(row.date);
          }
          if (!result[row.exercise]) result[row.exercise] = [];
          result[row.exercise].push({
            reps: row.reps,
            weight_lbs: row.weight_lbs,
            duration_mins: row.duration_mins,
            date: row.date,
          });
        }
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      }

      // Mode C: recent N calendar days, each tagged with its plan code
      if (recent_days && recent_days > 0) {
        const anchor = end_date ?? new Date().toISOString().split("T")[0];
        const startD = toDateString(
          addDays(new Date(anchor + "T00:00:00"), -(recent_days - 1)),
        );
        const { rows, error } = await fetchDayRows(
          client,
          userId,
          startD,
          anchor,
        );
        if (error) {
          return {
            content: [{ type: "text" as const, text: safeErrorMessage(error) }],
          };
        }
        rows.reverse(); // newest first — "recent" reads best most-recent-first
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { range: { start: startD, end: anchor }, count: rows.length, days: rows },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Mode A: aggregated range summary (+ optional per-day breakdown)
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
          .order("created_at", { ascending: true }),
      ]);

      const dailyLogs = (dailyLogsRes.data ?? []) as DailyLog[];
      const activities = (activitiesRes.data ?? []) as ActivityCompletion[];
      const workouts = (workoutsRes.data ?? []) as WorkoutSet[];

      const aggregate = computeAggregate(
        dailyLogs,
        activities,
        workouts,
        startDate,
        endDate,
      );

      if (!per_day) {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(aggregate, null, 2) },
          ],
        };
      }

      // per_day: bound the span first, then reuse the range fetch above plus a
      // plans + overrides lookup to attach each day's plan code and summary.
      const dates = enumerateDates(startDate, endDate);
      if (dates.length > 92) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Per-day mode is limited to 92 days. Narrow the range, or omit per_day for an aggregate summary.",
            },
          ],
        };
      }

      const [plansRes, overridesRes] = await Promise.all([
        client
          .from("plans")
          .select("*")
          .eq("user_id", userId)
          .lte("start_date", endDate)
          .gte("end_date", startDate),
        client
          .from("day_overrides")
          .select("date, gym_type")
          .eq("user_id", userId)
          .gte("date", startDate)
          .lte("date", endDate),
      ]);

      const days = computeDayRows(dates, {
        dailyLogs,
        activities,
        workouts,
        plans: (plansRes.data ?? []) as Plan[],
        overrides: (overridesRes.data ?? []) as {
          date: string;
          gym_type: string;
        }[],
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ...aggregate, days }, null, 2),
          },
        ],
      };
    },
  );
}
