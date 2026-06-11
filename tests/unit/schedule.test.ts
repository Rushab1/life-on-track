import { describe, it, expect } from "vitest";
import {
  getGymType,
  getActivitiesForDate,
  isWorkoutDay,
  getGymLabel,
} from "@/config/schedule";
import { PLAN_TEMPLATES, topicCode } from "@/config/planTemplates";
import type { Plan } from "@/lib/types";

// Helpers — construct dates for specific days of week
function dateForDay(dayOfWeek: number): Date {
  // 0 = Sun, 1 = Mon ... 6 = Sat
  const d = new Date(2026, 0, 4); // Sunday Jan 4 2026
  d.setDate(d.getDate() + dayOfWeek);
  return d;
}

// Fixture plan (the old hardcoded default schedule is gone — plans now come
// from templates or are built from scratch).
const FULL_PLAN = {
  gym_schedule: {
    "0": "rst",
    "1": "psh",
    "2": "lgh",
    "3": "rst",
    "4": "lgl",
    "5": "pll",
    "6": "yga",
  },
  prep_schedule: {
    "1": ["vln", "lc"],
    "2": ["ml"],
  },
} as unknown as Plan;

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
    expect(activities).toContain("vln");
    expect(activities).toContain("lc");
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

describe("PLAN_TEMPLATES", () => {
  it("every template covers all 7 days of gym_schedule", () => {
    for (const t of PLAN_TEMPLATES) {
      for (let d = 0; d <= 6; d++) {
        expect(t.gym_schedule[String(d)], `${t.id} day ${d}`).toBeTruthy();
      }
    }
  });

  it("template ids are unique", () => {
    const ids = PLAN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("custom prep codes are covered by the template's topics", () => {
    for (const t of PLAN_TEMPLATES) {
      const provided = new Set(t.topics.map(topicCode));
      for (const codes of Object.values(t.prep_schedule)) {
        for (const code of codes) {
          if (code.startsWith("c_")) {
            expect(provided.has(code), `${t.id}: ${code}`).toBe(true);
          }
        }
      }
    }
  });

  it("topicCode matches the addTopic derivation", () => {
    expect(topicCode("Meal Planning")).toBe("c_meal_planning");
    expect(topicCode("Tidy Up")).toBe("c_tidy_up");
  });
});
