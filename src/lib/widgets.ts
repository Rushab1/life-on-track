import type { WidgetDefinition } from "./types";

/**
 * Sites-scoped widgets record one value per body site per day, so a 4 at the
 * kneecap stays distinguishable from a 4 at the ankle. The site is stored in
 * widget_values.activity_type — the same column activity-scoped widgets use
 * for their activity code — which means the existing uniqueness index on
 * (user_id, widget_id, date, coalesce(activity_type, '')) already keeps one
 * row per site per day. The widget's `scope` is what tells a reader whether
 * that string is a site or an activity code.
 */

/** The site list for a sites-scoped widget; [] for every other scope. */
export function widgetSites(
  widget: Pick<WidgetDefinition, "scope" | "config">,
): string[] {
  if (widget.scope !== "sites") return [];
  const sites = (widget.config ?? {}).sites;
  if (!Array.isArray(sites)) return [];
  return sites.filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0,
  );
}

export interface WidgetRow {
  widget: WidgetDefinition;
  /**
   * The activity_type value this row reads and writes: a site for
   * scope=sites, an activity code for scope=activity, null otherwise.
   */
  subject: string | null;
}

/**
 * The widget rows to show for one day: daily/global-scoped widgets once,
 * activity-scoped ones once per matching scheduled activity, sites-scoped
 * ones once per configured site. A sites-scoped widget with no sites
 * configured yet contributes nothing — there is no meaningful row to log.
 */
export function expandWidgetRows(
  widgets: WidgetDefinition[],
  activities: string[],
): WidgetRow[] {
  const rows: WidgetRow[] = [];
  for (const widget of widgets) {
    if (widget.scope === "activity") {
      const filter = Array.isArray(widget.activity_filter)
        ? widget.activity_filter
        : [];
      const matching =
        filter.length > 0
          ? activities.filter((a) => filter.includes(a))
          : activities;
      for (const activity of matching) rows.push({ widget, subject: activity });
    } else if (widget.scope === "sites") {
      for (const site of widgetSites(widget)) rows.push({ widget, subject: site });
    } else {
      rows.push({ widget, subject: null });
    }
  }
  return rows;
}
