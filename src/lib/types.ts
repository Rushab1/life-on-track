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
  activity_type: string;
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

// Widened to string to support user-defined custom topics
export type ActivityType = string;
export type GymType = string;

export interface Plan {
  id: string;
  user_id: string;
  name: string;
  start_date: string;
  end_date: string;
  gym_schedule: Record<string, GymType>;
  prep_schedule: Record<string, ActivityType[]>;
  /** Map of gym type code → ordered list of exercise names for that workout. */
  workout_templates: Record<string, string[]>;
  created_at: string;
  updated_at: string;
}

export interface DayOverride {
  id: string;
  user_id: string;
  date: string;
  gym_type: GymType;
  created_at: string;
}

export interface CustomTopic {
  id: string;
  user_id: string;
  category: "exercise" | "activity" | "gym_type";
  code: string;
  label: string;
  created_at: string;
}
