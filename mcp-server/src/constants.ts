import type { ActivityType, GymType, Plan } from "./types.js";

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  lc: "LeetCode",
  ml: "ML/AI",
  sd: "System Design",
  beh: "Behavioral",
  oss: "FastMCP",
  vln: "Violin",
  dte: "Date Night",
  mck: "Mock Interview",
  out: "Outdoor Activity",
  psh: "Push",
  lgh: "Legs Heavy",
  rst: "Rest",
  pll: "Pull",
  lgl: "Legs Light",
  yga: "Yoga",
};

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
  "Single Arm Row",
  "Pull-up",
  "Cable Row",
  "Face Pull",
  "Bicep Curl",
  "Hammer Curl",
  "Other",
] as const;

export const WORKOUT_EXERCISES: Record<GymType, string[]> = {
  psh: ["Bench Press", "Incline Press", "Shoulder Press", "Lateral Raise", "Tricep Pushdown"],
  lgh: ["Squat", "Leg Press", "Romanian Deadlift", "Leg Curl", "Leg Extension", "Calf Raise"],
  pll: ["Single Arm Row", "Pull-up", "Cable Row", "Face Pull", "Bicep Curl", "Hammer Curl"],
  lgl: ["Squat", "Leg Press", "Leg Curl", "Leg Extension", "Calf Raise"],
  yga: [],
  rst: [],
};

export const DEFAULT_GYM_SCHEDULE: Record<string, GymType> = {
  "0": "rst",
  "1": "psh",
  "2": "lgh",
  "3": "rst",
  "4": "pll",
  "5": "lgl",
  "6": "yga",
};

export const DEFAULT_PREP_SCHEDULE: Record<string, ActivityType[]> = {
  "0": ["oss"],
  "1": ["vln", "lc"],
  "2": ["ml"],
  "3": ["ml", "lc"],
  "4": ["lc"],
  "5": ["dte"],
  "6": ["sd"],
};

export const WORKOUT_DAYS: GymType[] = ["psh", "lgh", "pll", "lgl", "yga"];

export function getActivitiesForDate(date: Date, plan?: Plan | null): ActivityType[] {
  const day = String(date.getDay());
  const gymSchedule = plan?.gym_schedule ?? DEFAULT_GYM_SCHEDULE;
  const prepSchedule = plan?.prep_schedule ?? DEFAULT_PREP_SCHEDULE;
  const gym = gymSchedule[day] ?? "rst";
  const prep = prepSchedule[day] ?? [];
  return [gym as ActivityType, ...prep];
}

export function isWorkoutDay(date: Date, plan?: Plan | null): boolean {
  const gymSchedule = plan?.gym_schedule ?? DEFAULT_GYM_SCHEDULE;
  const gym = gymSchedule[String(date.getDay())] ?? "rst";
  return WORKOUT_DAYS.includes(gym as GymType);
}

export function getGymType(date: Date, plan?: Plan | null): GymType {
  const gymSchedule = plan?.gym_schedule ?? DEFAULT_GYM_SCHEDULE;
  return (gymSchedule[String(date.getDay())] ?? "rst") as GymType;
}
