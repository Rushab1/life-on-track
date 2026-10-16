import { describe, it, expect } from "vitest";
import { getOtherExercises } from "@/lib/workout";

describe("getOtherExercises", () => {
  it("shows logged exercises when the plan has none", () => {
    const logged = [
      { exercise: "Dumbbell Squats" },
      { exercise: "Pull-ups" },
      { exercise: "Dumbbell Squats" },
      { exercise: "Box Step Ups" },
    ];
    expect(getOtherExercises([], logged, [])).toEqual(["Dumbbell Squats", "Pull-ups", "Box Step Ups"]);
  });

  it("skips exercises already in the plan", () => {
    const logged = [{ exercise: "Bench" }, { exercise: "Flutter Kicks" }];
    expect(getOtherExercises(["Bench"], logged, [])).toEqual(["Flutter Kicks"]);
  });

  it("appends picked exercises after logged ones without duplicates", () => {
    const logged = [{ exercise: "Lunges" }];
    expect(getOtherExercises(["Bench"], logged, ["Lunges", "Bench", "Pushups"])).toEqual(["Lunges", "Pushups"]);
  });
});
