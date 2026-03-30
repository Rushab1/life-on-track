import type { GymType } from "@/lib/types";

export const EXERCISES = [
  "Bench Press",
  "Incline Press",
  "Shoulder Press",
  "Lateral Raise",
  "Tricep Pushdown",
  "Squat",
  "Leg Press",
  "Romanian Deadlift",
  "Leg Curl",
  "Leg Extension",
  "Calf Raise",
  "Deadlift",
  "Pull-up",
  "Barbell Row",
  "Cable Row",
  "Lat Pulldown",
  "Bicep Curl",
  "Other",
] as const;

/** Default exercises for each workout type. */
export const WORKOUT_EXERCISES: Record<GymType, string[]> = {
  psh: ["Bench Press", "Incline Press", "Shoulder Press", "Lateral Raise", "Tricep Pushdown"],
  lgh: ["Squat", "Leg Press", "Romanian Deadlift", "Leg Curl", "Leg Extension", "Calf Raise"],
  pll: ["Deadlift", "Pull-up", "Barbell Row", "Cable Row", "Lat Pulldown", "Bicep Curl"],
  lgl: ["Squat", "Leg Press", "Leg Curl", "Leg Extension", "Calf Raise"],
  yga: [],
  rst: [],
};
