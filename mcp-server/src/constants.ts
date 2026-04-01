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

export const WORKOUT_EXERCISES: Record<GymType, string[]> = {
  psh: ["Incline Dumbbell Press", "Overhead Dumbbell Press", "Cable Pec Flies", "Lateral Raises", "Tricep Exercise"],
  lgh: ["Dumbbell Squats", "RDLs", "Calf Raises", "Wrist Curls", "Leg Raises", "Single Leg Bridges"],
  pll: ["Dumbbell Rows", "Pull-ups", "Seated Cable Row", "Bicep Exercise", "Wrist Curls"],
  lgl: ["Lunges", "Leg Extensions", "Leg Curls", "Calf Raises"],
  yga: [],
  rst: [],
};

export const DEFAULT_GYM_SCHEDULE: Record<string, GymType> = {
  "0": "rst",
  "1": "psh",
  "2": "lgh",
  "3": "rst",
  "4": "lgl",
  "5": "pll",
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
  return gym !== "rst";
}

export function getGymType(date: Date, plan?: Plan | null): GymType {
  const gymSchedule = plan?.gym_schedule ?? DEFAULT_GYM_SCHEDULE;
  return (gymSchedule[String(date.getDay())] ?? "rst") as GymType;
}
