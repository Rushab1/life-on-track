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
  it("returns correct type for each day without a plan", () => {
    expect(getGymType(dateForDay(0))).toBe("rst");
    expect(getGymType(dateForDay(1))).toBe("psh");
    expect(getGymType(dateForDay(2))).toBe("lgh");
    expect(getGymType(dateForDay(3))).toBe("rst");
    expect(getGymType(dateForDay(4))).toBe("lgl");
    expect(getGymType(dateForDay(5))).toBe("pll");
    expect(getGymType(dateForDay(6))).toBe("yga");
  });

  it("uses plan gym_schedule when provided", () => {
    const plan: Partial<Plan> = {
      gym_schedule: { "1": "lgh", "2": "psh" },
    } as Plan;
    expect(getGymType(dateForDay(1), plan as Plan)).toBe("lgh");
    expect(getGymType(dateForDay(2), plan as Plan)).toBe("psh");
  });

  it("falls back to rst for missing day in plan", () => {
    const plan: Partial<Plan> = { gym_schedule: {} } as Plan;
    expect(getGymType(dateForDay(1), plan as Plan)).toBe("rst");
  });
});

describe("isWorkoutDay", () => {
  it("rest days return false", () => {
    expect(isWorkoutDay(dateForDay(0))).toBe(false); // Sun
    expect(isWorkoutDay(dateForDay(3))).toBe(false); // Wed
  });

  it("active days return true", () => {
    expect(isWorkoutDay(dateForDay(1))).toBe(true); // Mon push
    expect(isWorkoutDay(dateForDay(2))).toBe(true); // Tue legs heavy
    expect(isWorkoutDay(dateForDay(4))).toBe(true); // Thu legs light
    expect(isWorkoutDay(dateForDay(5))).toBe(true); // Fri pull
    expect(isWorkoutDay(dateForDay(6))).toBe(true); // Sat yoga
  });
});

describe("getActivitiesForDate", () => {
  it("includes gym type as first activity", () => {
    const activities = getActivitiesForDate(dateForDay(1));
    expect(activities[0]).toBe("psh");
  });

  it("includes prep activities", () => {
    const activities = getActivitiesForDate(dateForDay(1)); // Mon
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
  it("returns human-readable label", () => {
    const label = getGymLabel(dateForDay(1));
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });

  it("uses custom labels when provided", () => {
    const label = getGymLabel(dateForDay(1), undefined, { psh: "Push Day" });
    expect(label).toBe("Push Day");
  });
});
