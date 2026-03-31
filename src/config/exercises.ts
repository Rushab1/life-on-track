import type { GymType } from "@/lib/types";

export const EXERCISES = [
  // Push
  "Incline Dumbbell Press",
  "Overhead Dumbbell Press",
  "Cable Pec Flies",
  "Lateral Raises",
  "Tricep Exercise",
  // Legs Heavy
  "Dumbbell Squats",
  "RDLs",
  "Wrist Curls",
  "Leg Raises",
  // Pull
  "Dumbbell Rows",
  "Pull-ups",
  "Seated Cable Row",
  "Bicep Exercise",
  // Legs Light
  "Lunges",
  "Leg Extensions",
  "Leg Curls",
  "Single Leg Bridges",
  // Shared
  "Calf Raises",
  "Other",
] as const;

/** Default exercises for each workout type. */
export const WORKOUT_EXERCISES: Record<GymType, string[]> = {
  psh: ["Incline Dumbbell Press", "Overhead Dumbbell Press", "Cable Pec Flies", "Lateral Raises", "Tricep Exercise"],
  lgh: ["Dumbbell Squats", "RDLs", "Calf Raises", "Wrist Curls", "Leg Raises"],
  pll: ["Dumbbell Rows", "Pull-ups", "Seated Cable Row", "Bicep Exercise", "Wrist Curls"],
  lgl: ["Lunges", "Leg Extensions", "Leg Curls", "Single Leg Bridges", "Calf Raises"],
  yga: [],
  rst: [],
};
