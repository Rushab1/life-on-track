import { describe, it, expect } from "vitest";
import {
  buildDayRow,
  computeAggregate,
  computeDayRows,
  enumerateDates,
  planForDate,
  summarizeWorkouts,
  weekdayLabel,
} from "@/app/api/mcp/tools/history-helpers";
import type {
  ActivityCompletion,
  DailyLog,
  Plan,
  WorkoutSet,
} from "@/lib/types";

// --- Fixture factories -----------------------------------------------------

function log(date: string, pain: number | null, notes: string | null = null): DailyLog {
  return {
    id: `log-${date}`,
    user_id: "u",
    date,
    pain_level: pain,
    notes,
    created_at: `${date}T00:00:00Z`,
    updated_at: `${date}T00:00:00Z`,
  };
}

function completion(
  date: string,
  activity_type: string,
  completed: boolean,
): ActivityCompletion {
  return {
    id: `${date}-${activity_type}`,
    user_id: "u",
    date,
    activity_type,
    completed,
    notes: null,
    created_at: `${date}T00:00:00Z`,
  };
}

function set(
  date: string,
  exercise: string,
  fields: Partial<WorkoutSet> = {},
): WorkoutSet {
  return {
    id: `${date}-${exercise}-${Math.random()}`,
    user_id: "u",
    date,
    exercise,
    sets: null,
    reps: null,
    weight_lbs: null,
    duration_mins: null,
    notes: null,
    created_at: `${date}T00:00:00Z`,
    ...fields,
  };
}

const PLAN: Plan = {
  id: "plan-1",
  user_id: "u",
  name: "Test Plan",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  gym_schedule: { "0": "rst", "1": "psh", "5": "pll" },
  prep_schedule: { "1": ["lc", "vln"] },
  workout_templates: {},
  workout_meta: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

// --- enumerateDates --------------------------------------------------------

describe("enumerateDates", () => {
  it("lists an inclusive ascending range", () => {
    expect(enumerateDates("2026-01-05", "2026-01-08")).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
    ]);
  });

  it("returns a single day when start === end", () => {
    expect(enumerateDates("2026-03-15", "2026-03-15")).toEqual(["2026-03-15"]);
  });

  it("returns [] when end precedes start", () => {
    expect(enumerateDates("2026-01-08", "2026-01-05")).toEqual([]);
  });

  it("crosses month boundaries correctly", () => {
    expect(enumerateDates("2026-01-30", "2026-02-02")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
  });

  it("respects the runaway cap", () => {
    expect(enumerateDates("2026-01-01", "2026-12-31", 5)).toHaveLength(5);
  });
});

// --- weekdayLabel ----------------------------------------------------------

describe("weekdayLabel", () => {
  it("maps dates to weekday abbreviations", () => {
    // Jan 4 2026 is a Sunday (matches schedule.test.ts fixtures).
    expect(weekdayLabel("2026-01-04")).toBe("Sun");
    expect(weekdayLabel("2026-01-05")).toBe("Mon");
    expect(weekdayLabel("2026-01-09")).toBe("Fri");
  });
});

// --- planForDate -----------------------------------------------------------

describe("planForDate", () => {
  it("returns the plan covering the date", () => {
    expect(planForDate([PLAN], "2026-06-15")).toBe(PLAN);
  });

  it("returns null when no plan covers the date", () => {
    expect(planForDate([PLAN], "2025-12-31")).toBeNull();
    expect(planForDate([], "2026-06-15")).toBeNull();
  });

  it("prefers the plan with the latest start_date when ranges overlap", () => {
    const older: Plan = { ...PLAN, id: "older", start_date: "2026-01-01" };
    const newer: Plan = { ...PLAN, id: "newer", start_date: "2026-06-01" };
    expect(planForDate([older, newer], "2026-06-15")?.id).toBe("newer");
    // order of the input array should not matter
    expect(planForDate([newer, older], "2026-06-15")?.id).toBe("newer");
  });
});

// --- summarizeWorkouts -----------------------------------------------------

describe("summarizeWorkouts", () => {
  it("aggregates sets, top weight, and totals per exercise", () => {
    const sets = [
      set("2026-01-05", "Bench", { reps: 5, weight_lbs: 135 }),
      set("2026-01-05", "Bench", { reps: 5, weight_lbs: 145 }),
      set("2026-01-05", "Bench", { reps: 3, weight_lbs: 155 }),
      set("2026-01-05", "Run", { duration_mins: 20 }),
    ];
    expect(summarizeWorkouts(sets)).toEqual([
      {
        exercise: "Bench",
        sets: 3,
        top_weight_lbs: 155,
        total_reps: 13,
        total_duration_mins: null,
      },
      {
        exercise: "Run",
        sets: 1,
        top_weight_lbs: null,
        total_reps: null,
        total_duration_mins: 20,
      },
    ]);
  });

  it("preserves first-appearance order across interleaved exercises", () => {
    const sets = [
      set("d", "A"),
      set("d", "B"),
      set("d", "A"),
    ];
    expect(summarizeWorkouts(sets).map((s) => s.exercise)).toEqual(["A", "B"]);
  });

  it("returns [] for no sets", () => {
    expect(summarizeWorkouts([])).toEqual([]);
  });
});

// --- buildDayRow -----------------------------------------------------------

describe("buildDayRow", () => {
  it("derives the plan code and label from the active plan", () => {
    const row = buildDayRow("2026-01-05", {
      dailyLog: log("2026-01-05", 3, "sore"),
      completions: [
        completion("2026-01-05", "psh", true),
        completion("2026-01-05", "lc", false),
      ],
      workoutSets: [set("2026-01-05", "Bench", { reps: 5, weight_lbs: 135 })],
      plan: PLAN,
      override: null,
    });
    expect(row.plan_code).toBe("psh");
    expect(row.plan_label).toBe("Push");
    expect(row.weekday).toBe("Mon");
    expect(row.is_override).toBe(false);
    expect(row.is_rest_day).toBe(false);
    expect(row.pain_level).toBe(3);
    expect(row.notes).toBe("sore");
    expect(row.activities.scheduled).toEqual(["psh", "lc", "vln"]);
    expect(row.activities.completed).toEqual(["psh"]);
    expect(row.total_sets).toBe(1);
    expect(row.workouts).toHaveLength(1);
  });

  it("honors a per-day override for the plan code", () => {
    const row = buildDayRow("2026-01-05", {
      dailyLog: null,
      completions: [],
      workoutSets: [],
      plan: PLAN,
      override: "lgh",
    });
    expect(row.plan_code).toBe("lgh");
    expect(row.plan_label).toBe("Legs Heavy");
    expect(row.is_override).toBe(true);
  });

  it("marks rest days and tolerates a missing daily log", () => {
    const row = buildDayRow("2026-01-04", {
      dailyLog: null,
      completions: [],
      workoutSets: [],
      plan: PLAN,
      override: null,
    });
    expect(row.plan_code).toBe("rst");
    expect(row.is_rest_day).toBe(true);
    expect(row.pain_level).toBeNull();
    expect(row.notes).toBeNull();
    expect(row.workouts).toEqual([]);
  });

  it("falls back to rst with no plan", () => {
    const row = buildDayRow("2026-01-05", {
      dailyLog: null,
      completions: [],
      workoutSets: [],
      plan: null,
      override: null,
    });
    expect(row.plan_code).toBe("rst");
    expect(row.activities.scheduled).toEqual([]);
  });
});

// --- computeDayRows --------------------------------------------------------

describe("computeDayRows", () => {
  it("routes each date's data to its own row and fills gaps", () => {
    const rows = computeDayRows(["2026-01-05", "2026-01-06", "2026-01-07"], {
      dailyLogs: [log("2026-01-05", 2), log("2026-01-07", 6)],
      activities: [completion("2026-01-05", "psh", true)],
      workouts: [
        set("2026-01-05", "Bench", { reps: 5, weight_lbs: 135 }),
        set("2026-01-07", "Squat", { reps: 5, weight_lbs: 225 }),
      ],
      plans: [PLAN],
      overrides: [{ date: "2026-01-06", gym_type: "yga" }],
    });

    expect(rows).toHaveLength(3);
    expect(rows[0].date).toBe("2026-01-05");
    expect(rows[0].pain_level).toBe(2);
    expect(rows[0].workouts[0].exercise).toBe("Bench");

    // Middle day has no log/workout but still appears, with its override.
    expect(rows[1].date).toBe("2026-01-06");
    expect(rows[1].plan_code).toBe("yga");
    expect(rows[1].is_override).toBe(true);
    expect(rows[1].pain_level).toBeNull();
    expect(rows[1].workouts).toEqual([]);

    expect(rows[2].date).toBe("2026-01-07");
    expect(rows[2].pain_level).toBe(6);
    expect(rows[2].workouts[0].exercise).toBe("Squat");
  });
});

// --- computeAggregate ------------------------------------------------------

describe("computeAggregate", () => {
  it("computes averages, rates, and workout totals", () => {
    const agg = computeAggregate(
      [log("2026-01-05", 2), log("2026-01-06", 4), log("2026-01-07", 5), log("2026-01-08", null)],
      [
        completion("2026-01-05", "psh", true),
        completion("2026-01-06", "psh", false),
        completion("2026-01-05", "lc", true),
      ],
      [
        set("2026-01-05", "Bench"),
        set("2026-01-05", "Row"),
        set("2026-01-07", "Squat"),
      ],
      "2026-01-05",
      "2026-01-08",
    );

    expect(agg.range).toEqual({ start: "2026-01-05", end: "2026-01-08" });
    expect(agg.days_logged).toBe(4);
    // (2 + 4 + 5) / 3 = 3.666… → 3.7; the null-pain day is excluded.
    expect(agg.avg_pain_level).toBe(3.7);
    expect(agg.workout_days).toBe(2);
    expect(agg.total_exercises_logged).toBe(3);

    const psh = agg.activity_completion.find((a) => a.activity === "psh");
    const lc = agg.activity_completion.find((a) => a.activity === "lc");
    expect(psh).toMatchObject({ label: "Push", completed: 1, total: 2, rate: "50%" });
    expect(lc).toMatchObject({ label: "LeetCode", completed: 1, total: 1, rate: "100%" });
  });

  it("returns null avg pain when nothing is logged", () => {
    const agg = computeAggregate([], [], [], "2026-01-01", "2026-01-07");
    expect(agg.avg_pain_level).toBeNull();
    expect(agg.days_logged).toBe(0);
    expect(agg.activity_completion).toEqual([]);
  });
});
