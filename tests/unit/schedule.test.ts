import { describe, it, expect } from "vitest";
import {
  getGymType,
  getActivitiesForDate,
  isWorkoutDay,
  getGymLabel,
  DEFAULT_GYM_SCHEDULE,
  DEFAULT_PREP_SCHEDULE,
} from "@/config/schedule";
import type { Plan } from "@/lib/types";

// Helpers — construct dates for specific days of week
function dateForDay(dayOfWeek: number): Date {
  // 0 = Sun, 1 = Mon ... 6 = Sat
  const d = new Date(2026, 0, 4); // Sunday Jan 4 2026
  d.setDate(d.getDate() + dayOfWeek);
  return d;
}

const FULL_PLAN = {
  gym_schedule: DEFAULT_GYM_SCHEDULE,
  prep_schedule: DEFAULT_PREP_SCHEDULE,
} as unknown as Plan;

describe("DEFAULT_GYM_SCHEDULE", () => {
  it("Sunday is rest", () => expect(DEFAULT_GYM_SCHEDULE["0"]).toBe("rst"));
  it("Monday is push", () => expect(DEFAULT_GYM_SCHEDULE["1"]).toBe("psh"));
  it("Tuesday is legs heavy", () => expect(DEFAULT_GYM_SCHEDULE["2"]).toBe("lgh"));
  it("Wednesday is rest", () => expect(DEFAULT_GYM_SCHEDULE["3"]).toBe("rst"));
  it("Thursday is legs light", () => expect(DEFAULT_GYM_SCHEDULE["4"]).toBe("lgl"));
  it("Friday is pull", () => expect(DEFAULT_GYM_SCHEDULE["5"]).toBe("pll"));
  it("Saturday is yoga", () => expect(DEFAULT_GYM_SCHEDULE["6"]).toBe("yga"));
});

describe("getGymType", () => {
  it("returns rst when no plan", () => {
    expect(getGymType(dateForDay(1))).toBe("rst");
    expect(getGymType(dateForDay(5))).toBe("rst");
  });

  it("returns correct type with a plan", () => {
    expect(getGymType(dateForDay(0), FULL_PLAN)).toBe("rst");
    expect(getGymType(dateForDay(1), FULL_PLAN)).toBe("psh");
    expect(getGymType(dateForDay(2), FULL_PLAN)).toBe("lgh");
    expect(getGymType(dateForDay(5), FULL_PLAN)).toBe("pll");
  });

  it("uses plan gym_schedule when provided", () => {
    const plan = { gym_schedule: { "1": "lgh", "2": "psh" } } as unknown as Plan;
    expect(getGymType(dateForDay(1), plan)).toBe("lgh");
    expect(getGymType(dateForDay(2), plan)).toBe("psh");
  });

  it("falls back to rst for missing day in plan", () => {
    const plan = { gym_schedule: {} } as unknown as Plan;
    expect(getGymType(dateForDay(1), plan)).toBe("rst");
  });
});

describe("isWorkoutDay", () => {
  it("returns false when no plan", () => {
    expect(isWorkoutDay(dateForDay(0))).toBe(false);
    expect(isWorkoutDay(dateForDay(1))).toBe(false);
    expect(isWorkoutDay(dateForDay(5))).toBe(false);
  });

  it("rest days return false with a plan", () => {
    expect(isWorkoutDay(dateForDay(0), FULL_PLAN)).toBe(false);
    expect(isWorkoutDay(dateForDay(3), FULL_PLAN)).toBe(false);
  });

  it("active days return true with a plan", () => {
    expect(isWorkoutDay(dateForDay(1), FULL_PLAN)).toBe(true);
    expect(isWorkoutDay(dateForDay(2), FULL_PLAN)).toBe(true);
    expect(isWorkoutDay(dateForDay(5), FULL_PLAN)).toBe(true);
    expect(isWorkoutDay(dateForDay(6), FULL_PLAN)).toBe(true);
  });
});

describe("getActivitiesForDate", () => {
  it("returns empty when no plan", () => {
    expect(getActivitiesForDate(dateForDay(1))).toEqual([]);
  });

  it("includes gym type as first activity with a plan", () => {
    const activities = getActivitiesForDate(dateForDay(1), FULL_PLAN);
    expect(activities[0]).toBe("psh");
  });

  it("includes prep activities with a plan", () => {
    const activities = getActivitiesForDate(dateForDay(1), FULL_PLAN);
    const prep = DEFAULT_PREP_SCHEDULE["1"];
    for (const p of prep) {
      expect(activities).toContain(p);
    }
  });

  it("uses plan schedules when provided", () => {
    const plan = {
      gym_schedule: { "1": "lgh" },
      prep_schedule: { "1": ["oss"] },
    } as unknown as Plan;
    const activities = getActivitiesForDate(dateForDay(1), plan);
    expect(activities[0]).toBe("lgh");
    expect(activities).toContain("oss");
  });
});

describe("getGymLabel", () => {
  it("returns Rest when no plan", () => {
    const label = getGymLabel(dateForDay(1));
    expect(label).toBe("Rest");
  });

  it("returns human-readable label with a plan", () => {
    const label = getGymLabel(dateForDay(1), FULL_PLAN);
    expect(label).toBe("Push");
  });

  it("uses custom labels when provided", () => {
    const label = getGymLabel(dateForDay(1), FULL_PLAN, { psh: "Push Day" });
    expect(label).toBe("Push Day");
  });
});
