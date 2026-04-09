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
