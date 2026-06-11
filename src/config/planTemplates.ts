/**
 * Plan templates offered when creating a new plan. These replace the old
 * hardcoded default schedule — a new plan starts from one of these (or
 * blank), not from any baked-in personal routine.
 *
 * Custom activity topics a template needs are listed by label; codes are
 * derived with topicCode() (identical to useCustomTopics.addTopic) and the
 * topics are created for the user when the template is selected.
 */

export interface PlanTemplate {
  id: string;
  emoji: string;
  name: string;
  description: string;
  /** Day-of-week (0=Sun) → gym type code. All 7 days present. */
  gym_schedule: Record<string, string>;
  /** Day-of-week (0=Sun) → activity codes. */
  prep_schedule: Record<string, string[]>;
  /** Gym type → ordered exercise names (preset catalog names). */
  workout_templates: Record<string, string[]>;
  /** Activity topics to ensure exist for the user (labels; codes derived). */
  topics: string[];
}

/** Same derivation as useCustomTopics.addTopic — keep in sync. */
export function topicCode(label: string): string {
  return (
    "c_" +
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
  );
}

const REST_WEEK: Record<string, string> = {
  "0": "rst", "1": "rst", "2": "rst", "3": "rst", "4": "rst", "5": "rst", "6": "rst",
};

/** Preset-catalog exercise lists per gym type (names match the exercises table). */
const PUSH = [
  "Incline Dumbbell Press",
  "Overhead Dumbbell Press",
  "Cable Pec Flies",
  "Lateral Raises",
  "Cable Tricep Pushdown",
];
const PULL = ["Pull-ups", "Seated Cable Row", "Dumbbell Rows", "Bicep Exercise"];
const LEGS_HEAVY = ["Dumbbell Squats", "RDLs", "Calf Raises", "Leg Raises"];
const LEGS_LIGHT = ["Leg Extensions", "Leg Curls", "Lunges", "Single Leg Bridges"];

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: "ppl6",
    emoji: "🏋️",
    name: "Push / Pull / Legs · 6-day",
    description: "Classic PPL split run twice a week, Sunday off.",
    gym_schedule: {
      "0": "rst", "1": "psh", "2": "pll", "3": "lgh",
      "4": "psh", "5": "pll", "6": "lgl",
    },
    prep_schedule: {},
    workout_templates: { psh: PUSH, pll: PULL, lgh: LEGS_HEAVY, lgl: LEGS_LIGHT },
    topics: [],
  },
  {
    id: "ppl4",
    emoji: "💪",
    name: "Push / Pull / Legs · 4-day",
    description: "Four lifting days with a yoga day and two rest days.",
    gym_schedule: {
      "0": "rst", "1": "psh", "2": "lgh", "3": "rst",
      "4": "pll", "5": "lgl", "6": "yga",
    },
    prep_schedule: {},
    workout_templates: { psh: PUSH, pll: PULL, lgh: LEGS_HEAVY, lgl: LEGS_LIGHT },
    topics: [],
  },
  {
    id: "yoga3",
    emoji: "🧘",
    name: "Yoga & Recovery",
    description: "Three yoga sessions a week, everything else restful.",
    gym_schedule: {
      "0": "rst", "1": "rst", "2": "yga", "3": "rst",
      "4": "yga", "5": "rst", "6": "yga",
    },
    prep_schedule: {},
    workout_templates: {},
    topics: [],
  },
  {
    id: "swe-prep",
    emoji: "💻",
    name: "SWE Interview Prep",
    description:
      "LeetCode through the week, system design, behavioral, weekend mock.",
    gym_schedule: { ...REST_WEEK },
    prep_schedule: {
      "1": ["lc"],
      "2": ["sd"],
      "3": ["lc"],
      "4": ["beh"],
      "5": ["lc", "sd"],
      "6": ["mck"],
    },
    workout_templates: {},
    topics: [],
  },
  {
    id: "ml-prep",
    emoji: "🧠",
    name: "ML Interview Prep",
    description:
      "ML depth most days, LeetCode upkeep, ML system design, weekend mock.",
    gym_schedule: { ...REST_WEEK },
    prep_schedule: {
      "1": ["ml"],
      "2": ["lc"],
      "3": ["ml", "sd"],
      "4": ["lc"],
      "5": ["ml"],
      "6": ["mck"],
    },
    workout_templates: {},
    topics: [],
  },
  {
    id: "chores",
    emoji: "🧹",
    name: "Chores",
    description: "Keep the home running: laundry, cleaning, groceries, tidying.",
    gym_schedule: { ...REST_WEEK },
    prep_schedule: {
      "0": [topicCode("Tidy Up")],
      "1": [topicCode("Tidy Up")],
      "3": [topicCode("Laundry")],
      "5": [topicCode("Cleaning")],
      "6": [topicCode("Groceries")],
    },
    workout_templates: {},
    topics: ["Tidy Up", "Laundry", "Cleaning", "Groceries"],
  },
  {
    id: "meal-prep",
    emoji: "🥗",
    name: "Meal Prep",
    description:
      "Plan and shop on Saturday, batch-cook Sunday, midweek top-up.",
    gym_schedule: { ...REST_WEEK },
    prep_schedule: {
      "0": [topicCode("Meal Prep")],
      "3": [topicCode("Meal Prep")],
      "6": [topicCode("Meal Planning"), topicCode("Groceries")],
    },
    workout_templates: {},
    topics: ["Meal Planning", "Groceries", "Meal Prep"],
  },
];
