import { describe, it, expect } from "vitest";
import {
  planActivityCodes,
  validateActivity,
} from "@/app/api/mcp/tools/activity-helpers";

describe("planActivityCodes", () => {
  it("collects gym types, prep codes, and workout-catalog keys from plans", () => {
    // An Upper/Lower split — none of these codes are in the legacy enum.
    const plan = {
      gym_schedule: { "1": "up1", "2": "lgh", "4": "up2", "5": "lgl", "0": "rst" },
      prep_schedule: { "3": ["yga"], "6": ["yga"] },
      workout_templates: { up1: ["Bench"], up2: ["OHP"], lgh: ["Squat"] },
      workout_meta: { up1: { warmup: [], cardio: [] } },
    };
    const codes = planActivityCodes([plan]);
    expect(codes).toContain("up1");
    expect(codes).toContain("up2");
    expect(codes).toContain("lgh");
    expect(codes).toContain("lgl");
    expect(codes).toContain("yga");
    expect(codes).toContain("rst");
  });

  it("unions across multiple plans and tolerates missing/empty fields", () => {
    const codes = planActivityCodes([
      { gym_schedule: { "1": "up2" } },
      { workout_templates: { cst: [] } },
      {},
    ]);
    expect(new Set(codes)).toEqual(new Set(["up2", "cst"]));
  });
});

describe("validateActivity", () => {
  it("accepts a plan-defined gym type once it's in the known map", () => {
    // Regression: 'up2' came back from get_day but save_day rejected it
    // because the catalog was hardcoded. Now planActivityCodes feeds the map.
    const known: Record<string, string> = { rst: "Rest", up2: "up2" };
    const res = validateActivity("up2", known);
    expect(res).toEqual({ valid: true, code: "up2" });
  });

  it("rejects a code that is in no plan and no catalog", () => {
    const res = validateActivity("zzz", { rst: "Rest", up2: "up2" });
    expect(res.valid).toBe(false);
  });
});
