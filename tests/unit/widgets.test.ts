import { describe, it, expect } from "vitest";
import { expandWidgetRows, widgetSites } from "@/lib/widgets";
import type { WidgetDefinition } from "@/lib/types";

function widget(
  id: string,
  fields: Partial<WidgetDefinition> = {},
): WidgetDefinition {
  return {
    id,
    user_id: "u",
    name: id,
    type: "slider",
    config: {},
    scope: "daily",
    activity_filter: null,
    preset: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...fields,
  };
}

// --- widgetSites -----------------------------------------------------------

describe("widgetSites", () => {
  it("returns the configured sites for a sites-scoped widget", () => {
    expect(
      widgetSites(widget("pain", { scope: "sites", config: { sites: ["kneecap", "ankle"] } })),
    ).toEqual(["kneecap", "ankle"]);
  });

  it("ignores config.sites on every other scope", () => {
    expect(
      widgetSites(widget("pain", { scope: "daily", config: { sites: ["kneecap"] } })),
    ).toEqual([]);
  });

  it("drops non-string and blank entries rather than rendering empty rows", () => {
    expect(
      widgetSites(
        widget("pain", {
          scope: "sites",
          config: { sites: ["kneecap", "", "  ", 4, null, "ITB"] },
        }),
      ),
    ).toEqual(["kneecap", "ITB"]);
  });

  it("tolerates a missing or malformed sites list", () => {
    expect(widgetSites(widget("a", { scope: "sites" }))).toEqual([]);
    expect(
      widgetSites(widget("b", { scope: "sites", config: { sites: "kneecap" } })),
    ).toEqual([]);
  });
});

// --- expandWidgetRows ------------------------------------------------------

describe("expandWidgetRows", () => {
  it("emits one subject-less row for daily and global widgets", () => {
    const rows = expandWidgetRows(
      [widget("mood"), widget("weight", { scope: "global" })],
      ["psh"],
    );
    expect(rows.map((r) => [r.widget.id, r.subject])).toEqual([
      ["mood", null],
      ["weight", null],
    ]);
  });

  it("emits one row per matching activity for activity-scoped widgets", () => {
    const rows = expandWidgetRows(
      [widget("rpe", { scope: "activity", activity_filter: ["psh", "pll"] })],
      ["psh", "lc", "pll"],
    );
    expect(rows.map((r) => r.subject)).toEqual(["psh", "pll"]);
  });

  it("emits a row per scheduled activity when no filter is set", () => {
    const rows = expandWidgetRows([widget("rpe", { scope: "activity" })], [
      "psh",
      "lc",
    ]);
    expect(rows.map((r) => r.subject)).toEqual(["psh", "lc"]);
  });

  it("emits one row per site for sites-scoped widgets, ignoring activities", () => {
    const rows = expandWidgetRows(
      [
        widget("pain", {
          scope: "sites",
          config: { sites: ["kneecap", "ankle", "ITB"] },
        }),
      ],
      ["psh"],
    );
    expect(rows.map((r) => r.subject)).toEqual(["kneecap", "ankle", "ITB"]);
    // Every site row shares the one definition — same slider, same bounds.
    expect(new Set(rows.map((r) => r.widget.id))).toEqual(new Set(["pain"]));
  });

  it("emits nothing for a sites-scoped widget with no sites configured", () => {
    expect(expandWidgetRows([widget("pain", { scope: "sites" })], ["psh"])).toEqual(
      [],
    );
  });

  it("keeps rows uniquely keyed by widget and subject", () => {
    const rows = expandWidgetRows(
      [
        widget("pain", { scope: "sites", config: { sites: ["kneecap", "ankle"] } }),
        widget("rpe", { scope: "activity", activity_filter: ["psh"] }),
        widget("mood"),
      ],
      ["psh"],
    );
    const keys = rows.map((r) => `${r.widget.id}:${r.subject ?? ""}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(["pain:kneecap", "pain:ankle", "rpe:psh", "mood:"]);
  });
});
