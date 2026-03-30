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
