import type { ActivityType } from "@/lib/types";
import { ACTIVITY_LABELS } from "@/config/constants";

/**
 * To change the schedule, edit these tables — no logic changes needed.
 *
 * GYM_SCHEDULE: index 0 = Sunday, 6 = Saturday
 * PREP_SCHEDULE: keyed by day-of-week, with optional phase overrides
 */

export const GYM_SCHEDULE: ActivityType[] = [
  "rst", // Sun
  "psh", // Mon
  "lgh", // Tue
  "rst", // Wed
  "pll", // Thu
  "lgl", // Fri
  "yga", // Sat
];

export const WORKOUT_DAYS: ActivityType[] = ["psh", "lgh", "pll", "lgl", "yga"];

interface DaySchedule {
  /** Activities shown regardless of phase */
  default: ActivityType[];
  /** Override for phase 1 (Apr–May). Falls back to `default` if omitted. */
  phase1?: ActivityType[];
  /** Override for phase 2 (Jun–Aug). Falls back to `default` if omitted. */
  phase2?: ActivityType[];
}

export const PREP_SCHEDULE: Record<number, DaySchedule> = {
  0: { default: ["oss"] },                              // Sun
  1: { default: ["vln", "lc"] },                        // Mon
  2: { default: ["ml"] },                               // Tue
  3: { default: ["ml", "lc"], phase2: ["lc"] },          // Wed
  4: { default: ["lc"] },                                // Thu
  5: { default: ["dte"] },                               // Fri
  6: { default: ["sd"], phase2: ["sd", "mck"] },         // Sat
};

/** Returns which phase applies to a given month (0-indexed). */
function getPhase(month: number): "phase1" | "phase2" | null {
  if (month >= 3 && month <= 4) return "phase1";
  if (month >= 5 && month <= 7) return "phase2";
  return null;
}

/** Get all activities for a given date (gym + prep). */
export function getActivitiesForDate(date: Date): ActivityType[] {
  const day = date.getDay();
  const phase = getPhase(date.getMonth());

  const gym = GYM_SCHEDULE[day];
  const prep = PREP_SCHEDULE[day];

  const prepActivities =
    (phase && prep?.[phase]) ?? prep?.default ?? [];

  return [gym, ...prepActivities];
}

/** Whether this date is a workout day (not rest). */
export function isWorkoutDay(date: Date): boolean {
  return WORKOUT_DAYS.includes(GYM_SCHEDULE[date.getDay()]);
}

/** Human-readable gym type for this date. */
export function getGymLabel(date: Date): string {
  return ACTIVITY_LABELS[GYM_SCHEDULE[date.getDay()]];
}
