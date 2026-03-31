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

export interface WorkoutMeta {
  warmup: string[];
  cardio: string[];
}

/** Warmup and cardio exercises per workout type. */
export const WORKOUT_META: Record<string, WorkoutMeta> = {
  psh: { warmup: ["External Rotations", "Band Pull-Aparts"], cardio: ["Run"] },
  lgh: { warmup: ["Side Plank Leg Raises", "Hip Flexor Stretch"], cardio: ["Stairmaster"] },
  pll: { warmup: ["Woodchoppers", "Face Pulls"], cardio: ["Run"] },
  lgl: { warmup: ["Pushups", "IT Band Stretch"], cardio: ["Incline Walk"] },
  yga: { warmup: [], cardio: [] },
  rst: { warmup: [], cardio: [] },
};

/** Default exercises for each workout type. */
export const WORKOUT_EXERCISES: Record<GymType, string[]> = {
  psh: ["Incline Dumbbell Press", "Overhead Dumbbell Press", "Cable Pec Flies", "Lateral Raises", "Tricep Exercise"],
  lgh: ["Dumbbell Squats", "RDLs", "Calf Raises", "Wrist Curls", "Leg Raises", "Single Leg Bridges"],
  pll: ["Dumbbell Rows", "Pull-ups", "Seated Cable Row", "Bicep Exercise", "Wrist Curls"],
  lgl: ["Lunges", "Leg Extensions", "Leg Curls", "Calf Raises"],
  yga: [],
  rst: [],
};
