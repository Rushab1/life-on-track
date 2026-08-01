import { ACTIVITY_LABELS } from "@/config/constants";
import { getActivitiesForDate, getGymType } from "@/config/schedule";
import { addDays, toDateString } from "@/lib/dates";
import type {
  ActivityCompletion,
  DailyLog,
  Plan,
  WorkoutSet,
} from "@/lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Pure helpers backing get_history's per-day modes (range breakdown and
 * "recent N days"). Kept free of Supabase so the date/plan/aggregation logic
 * can be unit-tested without a database. reads.ts does the fetching and hands
 * the rows to these functions.
 */

/** Human-readable weekday ("Mon") for a YYYY-MM-DD string, using local time. */
export function weekdayLabel(date: string): string {
  return WEEKDAYS[new Date(date + "T00:00:00").getDay()];
}

/**
 * Inclusive list of YYYY-MM-DD dates from start to end (ascending). Returns []
 * if end precedes start. `cap` is a runaway guard, not a feature — callers that
 * expose a range should reject oversized spans with a clear message first.
 */
export function enumerateDates(start: string, end: string, cap = 400): string[] {
  const out: string[] = [];
  let cur = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  while (cur <= endDate && out.length < cap) {
    out.push(toDateString(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

/**
 * The plan covering a date, or null. When plans overlap (a rare but legal
 * state), the one with the latest start_date wins — mirroring get_day, which
 * treats the most recently started plan as active.
 */
export function planForDate(plans: Plan[], date: string): Plan | null {
  let best: Plan | null = null;
  for (const p of plans) {
    if (p.start_date <= date && p.end_date >= date) {
      if (!best || p.start_date > best.start_date) best = p;
    }
  }
  return best;
}

export interface DayWorkoutSummary {
  exercise: string;
  sets: number;
  top_weight_lbs: number | null;
  total_reps: number | null;
  total_duration_mins: number | null;
}

/**
 * Collapse a day's raw sets into one compact row per exercise: set count, top
 * weight, and total reps/duration. Exercise order follows first appearance
 * (callers should pass sets ordered by created_at).
 */
export function summarizeWorkouts(sets: WorkoutSet[]): DayWorkoutSummary[] {
  const order: string[] = [];
  const byExercise: Record<string, DayWorkoutSummary> = {};
  for (const s of sets) {
    let summary = byExercise[s.exercise];
    if (!summary) {
      summary = byExercise[s.exercise] = {
        exercise: s.exercise,
        sets: 0,
        top_weight_lbs: null,
        total_reps: null,
        total_duration_mins: null,
      };
      order.push(s.exercise);
    }
    summary.sets += 1;
    if (s.weight_lbs != null) {
      summary.top_weight_lbs =
        summary.top_weight_lbs == null
          ? s.weight_lbs
          : Math.max(summary.top_weight_lbs, s.weight_lbs);
    }
    if (s.reps != null) {
      summary.total_reps = (summary.total_reps ?? 0) + s.reps;
    }
    if (s.duration_mins != null) {
      summary.total_duration_mins =
        (summary.total_duration_mins ?? 0) + s.duration_mins;
    }
  }
  return order.map((e) => byExercise[e]);
}

export interface DayRow {
  date: string;
  weekday: string;
  /** Gym-type code for the day, honoring any override. "rst" when unplanned. */
  plan_code: string;
  plan_label: string;
  is_override: boolean;
  is_rest_day: boolean;
  pain_level: number | null;
  notes: string | null;
  activities: {
    scheduled: string[];
    completed: string[];
  };
  workouts: DayWorkoutSummary[];
  total_sets: number;
}

/** Build a single day's history row from its already-fetched pieces. Pure. */
export function buildDayRow(
  date: string,
  parts: {
    dailyLog: DailyLog | null;
    completions: ActivityCompletion[];
    workoutSets: WorkoutSet[];
    plan: Plan | null;
    override: string | null;
  },
): DayRow {
  const { dailyLog, completions, workoutSets, plan, override } = parts;
  const d = new Date(date + "T00:00:00");
  const planCode = getGymType(d, plan, override);
  return {
    date,
    weekday: weekdayLabel(date),
    plan_code: planCode,
    plan_label: ACTIVITY_LABELS[planCode] ?? planCode,
    is_override: override != null,
    is_rest_day: planCode === "rst",
    pain_level: dailyLog?.pain_level ?? null,
    notes: dailyLog?.notes ?? null,
    activities: {
      scheduled: getActivitiesForDate(d, plan, override),
      completed: completions.filter((c) => c.completed).map((c) => c.activity_type),
    },
    workouts: summarizeWorkouts(workoutSets),
    total_sets: workoutSets.length,
  };
}

/**
 * Map a list of dates to per-day rows, indexing the range-wide fetch results
 * by date so each day only sees its own rows. Missing days still get a row
 * (with the day's scheduled plan) so gaps are visible rather than dropped.
 */
export function computeDayRows(
  dates: string[],
  data: {
    dailyLogs: DailyLog[];
    activities: ActivityCompletion[];
    workouts: WorkoutSet[];
    plans: Plan[];
    overrides: { date: string; gym_type: string }[];
  },
): DayRow[] {
  const logByDate: Record<string, DailyLog> = {};
  for (const log of data.dailyLogs) logByDate[log.date] = log;

  const actByDate: Record<string, ActivityCompletion[]> = {};
  for (const a of data.activities) (actByDate[a.date] ??= []).push(a);

  const wsByDate: Record<string, WorkoutSet[]> = {};
  for (const w of data.workouts) (wsByDate[w.date] ??= []).push(w);

  const overrideByDate: Record<string, string> = {};
  for (const o of data.overrides) overrideByDate[o.date] = o.gym_type;

  return dates.map((date) =>
    buildDayRow(date, {
      dailyLog: logByDate[date] ?? null,
      completions: actByDate[date] ?? [],
      workoutSets: wsByDate[date] ?? [],
      plan: planForDate(data.plans, date),
      override: overrideByDate[date] ?? null,
    }),
  );
}

export interface RangeAggregate {
  range: { start: string; end: string };
  days_logged: number;
  avg_pain_level: number | null;
  activity_completion: {
    activity: string;
    label: string;
    completed: number;
    total: number;
    rate: string;
  }[];
  workout_days: number;
  total_exercises_logged: number;
}

/**
 * Aggregate stats for a date range: avg pain, per-activity completion rates,
 * distinct workout days, and total exercises logged. This is get_history's
 * Mode A payload, extracted here so per-day mode can reuse the same fetch.
 */
export function computeAggregate(
  dailyLogs: DailyLog[],
  activities: ActivityCompletion[],
  workouts: WorkoutSet[],
  startDate: string,
  endDate: string,
): RangeAggregate {
  const painValues = dailyLogs
    .filter((d) => d.pain_level !== null)
    .map((d) => d.pain_level!);
  const avgPain =
    painValues.length > 0
      ? Math.round(
          (painValues.reduce((a, b) => a + b, 0) / painValues.length) * 10,
        ) / 10
      : null;

  const activityCounts: Record<string, { completed: number; total: number }> =
    {};
  for (const a of activities) {
    if (!activityCounts[a.activity_type]) {
      activityCounts[a.activity_type] = { completed: 0, total: 0 };
    }
    activityCounts[a.activity_type].total++;
    if (a.completed) activityCounts[a.activity_type].completed++;
  }

  const activityRates = Object.entries(activityCounts).map(([type, counts]) => ({
    activity: type,
    label: ACTIVITY_LABELS[type] ?? type,
    completed: counts.completed,
    total: counts.total,
    rate: `${Math.round((counts.completed / counts.total) * 100)}%`,
  }));

  return {
    range: { start: startDate, end: endDate },
    days_logged: dailyLogs.length,
    avg_pain_level: avgPain,
    activity_completion: activityRates,
    workout_days: new Set(workouts.map((w) => w.date)).size,
    total_exercises_logged: workouts.length,
  };
}
