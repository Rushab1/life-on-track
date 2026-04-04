import type { ActivityType, GymType, Plan } from "@/lib/types";
import { ACTIVITY_LABELS } from "@/config/constants";

/**
 * Default schedule used when no plan covers the date.
 * These also serve as the seed values when creating a new plan.
 */

export const DEFAULT_GYM_SCHEDULE: Record<string, GymType> = {
  "0": "rst", // Sun
  "1": "psh", // Mon
  "2": "lgh", // Tue
  "3": "rst", // Wed
  "4": "lgl", // Thu
  "5": "pll", // Fri
  "6": "yga", // Sat
};

export const DEFAULT_PREP_SCHEDULE: Record<string, ActivityType[]> = {
  "0": ["oss"],         // Sun
  "1": ["vln", "lc"],   // Mon
  "2": ["ml"],           // Tue
  "3": ["ml", "lc"],     // Wed
  "4": ["lc"],           // Thu
  "5": ["dte"],          // Fri
  "6": ["sd"],           // Sat
};

/** Get gym + prep activities for a date, using the active plan. Returns empty if no plan. */
export function getActivitiesForDate(
  date: Date,
  plan?: Plan | null
): ActivityType[] {
  if (!plan) return [];
  const day = String(date.getDay());

  const gym = plan.gym_schedule[day] ?? "rst";
  const prep = plan.prep_schedule[day] ?? [];

  return [gym as ActivityType, ...prep];
}

/** Whether this date is a workout day. Returns false if no plan. */
export function isWorkoutDay(date: Date, plan?: Plan | null): boolean {
  if (!plan) return false;
  const gym = plan.gym_schedule[String(date.getDay())] ?? "rst";
  return gym !== "rst";
}

/** Get the gym type key for this date. Returns "rst" if no plan. */
export function getGymType(date: Date, plan?: Plan | null): GymType {
  if (!plan) return "rst" as GymType;
  return (plan.gym_schedule[String(date.getDay())] ?? "rst") as GymType;
}

/** Human-readable gym label for this date. */
export function getGymLabel(
  date: Date,
  plan?: Plan | null,
  labels?: Record<string, string>
): string {
  const gymType = getGymType(date, plan);
  const merged = labels ? { ...ACTIVITY_LABELS, ...labels } : ACTIVITY_LABELS;
  return merged[gymType] ?? gymType;
}
