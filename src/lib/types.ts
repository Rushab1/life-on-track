export interface DailyLog {
  id: string;
  user_id: string;
  date: string;
  pain_level: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityCompletion {
  id: string;
  user_id: string;
  date: string;
  activity_type: ActivityType;
  completed: boolean;
  notes: string | null;
  created_at: string;
}

export interface WorkoutSet {
  id: string;
  user_id: string;
  date: string;
  exercise: string;
  sets: number | null;
  reps: number | null;
  weight_lbs: number | null;
  duration_mins: number | null;
  notes: string | null;
  created_at: string;
}

export type ActivityType =
  | "lc"
  | "ml"
  | "sd"
  | "beh"
  | "oss"
  | "vln"
  | "dte"
  | "mck"
  | "out"
  | "psh"
  | "lgh"
  | "rst"
  | "pll"
  | "lgl"
  | "yga";

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
  "Deadlift",
  "Pull-up",
  "Barbell Row",
  "Cable Row",
  "Lat Pulldown",
  "Bicep Curl",
  "Other",
];

export const PAIN_COLORS = [
  "#22c55e",
  "#4ade80",
  "#86efac",
  "#bef264",
  "#fde047",
  "#fb923c",
  "#f97316",
  "#ef4444",
  "#dc2626",
  "#b91c1c",
  "#7f1d1d",
];

type GymDay = "psh" | "lgh" | "rst" | "pll" | "lgl" | "yga";

const GYM_SCHEDULE: GymDay[] = ["rst", "psh", "lgh", "rst", "pll", "lgl", "yga"];

const WORKOUT_DAYS: GymDay[] = ["psh", "lgh", "pll", "lgl", "yga"];

export function getLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getActivitiesForDate(date: Date): ActivityType[] {
  const dayOfWeek = date.getDay(); // 0=Sun
  const month = date.getMonth(); // 0=Jan

  const gym = GYM_SCHEDULE[dayOfWeek];
  const activities: ActivityType[] = [gym];

  // Phase 1 = Apr(3)–May(4), Phase 2 = Jun(5)–Aug(7)
  const isPhase1 = month >= 3 && month <= 4;
  const isPhase2 = month >= 5 && month <= 7;

  switch (dayOfWeek) {
    case 0: // Sun
      activities.push("oss");
      break;
    case 1: // Mon
      activities.push("vln", "lc");
      break;
    case 2: // Tue
      activities.push("ml");
      break;
    case 3: // Wed
      if (isPhase1) {
        activities.push("ml", "lc");
      } else if (isPhase2) {
        activities.push("lc");
      } else {
        activities.push("ml", "lc");
      }
      break;
    case 4: // Thu
      activities.push("lc");
      break;
    case 5: // Fri
      activities.push("dte");
      break;
    case 6: // Sat
      if (isPhase1) {
        activities.push("sd");
      } else if (isPhase2) {
        activities.push("sd", "mck");
      } else {
        activities.push("sd");
      }
      break;
  }

  return activities;
}

export function isWorkoutDay(date: Date): boolean {
  const gym = GYM_SCHEDULE[date.getDay()];
  return WORKOUT_DAYS.includes(gym);
}

export function getGymType(date: Date): string {
  return ACTIVITY_LABELS[GYM_SCHEDULE[date.getDay()]];
}
