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
  "4": "pll", // Thu
  "5": "lgl", // Fri
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

export const WORKOUT_DAYS: GymType[] = ["psh", "lgh", "pll", "lgl", "yga"];

/** Get gym + prep activities for a date, using the active plan or defaults. */
export function getActivitiesForDate(
  date: Date,
  plan?: Plan | null
): ActivityType[] {
  const day = String(date.getDay());

  const gymSchedule = plan?.gym_schedule ?? DEFAULT_GYM_SCHEDULE;
  const prepSchedule = plan?.prep_schedule ?? DEFAULT_PREP_SCHEDULE;

  const gym = gymSchedule[day] ?? "rst";
  const prep = prepSchedule[day] ?? [];

  return [gym as ActivityType, ...prep];
}

/** Whether this date is a workout day. */
export function isWorkoutDay(date: Date, plan?: Plan | null): boolean {
  const gymSchedule = plan?.gym_schedule ?? DEFAULT_GYM_SCHEDULE;
  const gym = gymSchedule[String(date.getDay())] ?? "rst";
  return WORKOUT_DAYS.includes(gym);
}

/** Get the gym type key for this date. */
export function getGymType(date: Date, plan?: Plan | null): GymType {
  const gymSchedule = plan?.gym_schedule ?? DEFAULT_GYM_SCHEDULE;
  return (gymSchedule[String(date.getDay())] ?? "rst") as GymType;
}

/** Human-readable gym label for this date. */
export function getGymLabel(date: Date, plan?: Plan | null): string {
  return ACTIVITY_LABELS[getGymType(date, plan)];
}
