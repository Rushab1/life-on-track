import { describe, it, expect } from "vitest";

// These helpers live inside WorkoutLogger.tsx — extracted here for testing.
// If they're ever moved to a shared util, update this import.
function minsToMinSec(mins: number | null): [string, string] {
  if (mins === null) return ["", ""];
  const m = Math.floor(mins);
  const s = Math.round((mins - m) * 60);
  return [m > 0 ? String(m) : "", s > 0 ? String(s) : ""];
}

function minSecToMins(min: string, sec: string): number | null {
  const m = min ? Number(min) : 0;
  const s = sec ? Number(sec) : 0;
  if (m === 0 && s === 0) return null;
  return m + s / 60;
}

describe("minsToMinSec", () => {
  it("returns empty strings for null", () => {
    expect(minsToMinSec(null)).toEqual(["", ""]);
  });

  it("converts whole minutes", () => {
    expect(minsToMinSec(2)).toEqual(["2", ""]);
  });

  it("converts seconds only (< 1 min)", () => {
    expect(minsToMinSec(0.5)).toEqual(["", "30"]);
  });

  it("converts 45 seconds", () => {
    expect(minsToMinSec(0.75)).toEqual(["", "45"]);
  });

  it("converts 1 min 30 sec", () => {
    expect(minsToMinSec(1.5)).toEqual(["1", "30"]);
  });

  it("converts 0 minutes to empty strings", () => {
    expect(minsToMinSec(0)).toEqual(["", ""]);
  });
});

describe("minSecToMins", () => {
  it("returns null for empty inputs", () => {
    expect(minSecToMins("", "")).toBeNull();
  });

  it("returns null for zero inputs", () => {
    expect(minSecToMins("0", "0")).toBeNull();
  });

  it("converts seconds only", () => {
    expect(minSecToMins("", "30")).toBeCloseTo(0.5);
  });

  it("converts minutes only", () => {
    expect(minSecToMins("2", "")).toBe(2);
  });

  it("converts 1 min 30 sec", () => {
    expect(minSecToMins("1", "30")).toBeCloseTo(1.5);
  });

  it("converts 45 seconds", () => {
    expect(minSecToMins("", "45")).toBeCloseTo(0.75);
  });
});

describe("minsToMinSec / minSecToMins roundtrip", () => {
  const cases = [0.5, 0.75, 1, 1.5, 2, 3.25];

  for (const mins of cases) {
    it(`roundtrips ${mins} mins`, () => {
      const [m, s] = minsToMinSec(mins);
      const result = minSecToMins(m, s);
      expect(result).toBeCloseTo(mins, 5);
    });
  }
});
