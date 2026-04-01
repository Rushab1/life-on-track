import { describe, it, expect } from "vitest";
import { toDateString, addDays, isSameDay } from "@/lib/dates";

describe("toDateString", () => {
  it("formats date as YYYY-MM-DD", () => {
    expect(toDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("pads month and day with leading zeros", () => {
    expect(toDateString(new Date(2026, 2, 1))).toBe("2026-03-01");
  });

  it("handles end of year", () => {
    expect(toDateString(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("addDays", () => {
  it("adds positive days", () => {
    const result = addDays(new Date(2026, 0, 1), 5);
    expect(toDateString(result)).toBe("2026-01-06");
  });

  it("subtracts days with negative n", () => {
    const result = addDays(new Date(2026, 0, 6), -5);
    expect(toDateString(result)).toBe("2026-01-01");
  });

  it("crosses month boundary", () => {
    const result = addDays(new Date(2026, 0, 31), 1);
    expect(toDateString(result)).toBe("2026-02-01");
  });

  it("does not mutate the original date", () => {
    const original = new Date(2026, 0, 1);
    addDays(original, 10);
    expect(toDateString(original)).toBe("2026-01-01");
  });
});

describe("isSameDay", () => {
  it("returns true for same calendar day", () => {
    expect(isSameDay(new Date(2026, 0, 1, 9, 0), new Date(2026, 0, 1, 23, 59))).toBe(true);
  });

  it("returns false for different days", () => {
    expect(isSameDay(new Date(2026, 0, 1), new Date(2026, 0, 2))).toBe(false);
  });

  it("returns false for same day different month", () => {
    expect(isSameDay(new Date(2026, 0, 1), new Date(2026, 1, 1))).toBe(false);
  });
});
