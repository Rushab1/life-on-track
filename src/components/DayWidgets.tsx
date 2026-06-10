"use client";

import { useWidgets } from "@/hooks/useWidgets";
import { useWidgetValues } from "@/hooks/useWidgetValues";
import type { WidgetDefinition } from "@/lib/types";

interface DayWidgetsProps {
  userId: string;
  dateStr: string;
  /** Activity codes scheduled/logged for this date (for activity-scoped widgets). */
  activities: string[];
  activityLabels: Record<string, string>;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function WidgetControl({
  widget,
  value,
  onChange,
}: {
  widget: WidgetDefinition;
  value: number | string | boolean | null;
  onChange: (v: number | string | boolean, debounceMs?: number) => void;
}) {
  const cfg = (widget.config ?? {}) as Record<string, unknown>;

  switch (widget.type) {
    case "slider": {
      const min = num(cfg.min, 0);
      const max = num(cfg.max, 10);
      const step = num(cfg.step, 1);
      const v = typeof value === "number" ? value : min;
      return (
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={v}
            aria-label={widget.name}
            onChange={(e) => onChange(Number(e.target.value), 600)}
            className="flex-1 accent-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 rounded"
          />
          <span className="text-sm font-semibold text-stone-200 tabular-nums w-12 text-right flex-shrink-0">
            {value != null ? String(value) : "–"}
            {typeof cfg.unit === "string" && cfg.unit ? (
              <span className="text-stone-500 font-normal text-xs"> {cfg.unit}</span>
            ) : null}
          </span>
        </div>
      );
    }
    case "counter": {
      const min = num(cfg.min, 0);
      const max = num(cfg.max, Infinity);
      const step = num(cfg.step, 1);
      const v = typeof value === "number" ? value : 0;
      return (
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            aria-label={`Decrease ${widget.name}`}
            onClick={() => onChange(Math.max(min, v - step), 600)}
            className="w-7 h-7 rounded-full bg-white/[0.06] text-stone-300 hover:bg-white/10
                       flex items-center justify-center text-base leading-none
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
          >
            −
          </button>
          <span className="text-sm font-semibold text-stone-200 tabular-nums min-w-[2.5rem] text-center">
            {value != null ? String(value) : 0}
            {typeof cfg.unit === "string" && cfg.unit ? (
              <span className="text-stone-500 font-normal text-xs"> {cfg.unit}</span>
            ) : null}
          </span>
          <button
            type="button"
            aria-label={`Increase ${widget.name}`}
            onClick={() => onChange(Math.min(max, v + step), 600)}
            className="w-7 h-7 rounded-full bg-white/[0.06] text-stone-300 hover:bg-white/10
                       flex items-center justify-center text-base leading-none
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
          >
            +
          </button>
        </div>
      );
    }
    case "boolean": {
      const on = value === true;
      return (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={widget.name}
          onClick={() => onChange(!on)}
          className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 ${
                        on
                          ? "bg-indigo-500 shadow-[0_0_10px_rgb(99_102_241_/_0.5)]"
                          : "bg-white/10"
                      }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
              on ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
      );
    }
    case "text":
      return (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          placeholder={typeof cfg.placeholder === "string" ? cfg.placeholder : "..."}
          aria-label={widget.name}
          onChange={(e) => onChange(e.target.value, 800)}
          className="input text-sm py-1.5 flex-1 min-w-0"
        />
      );
    case "select": {
      const options = Array.isArray(cfg.options) ? (cfg.options as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1.5 justify-end flex-1 min-w-0">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 ${
                            value === opt
                              ? "bg-indigo-500 text-white"
                              : "bg-white/[0.06] text-stone-400 hover:bg-white/10 hover:text-stone-200"
                          }`}
            >
              {opt}
            </button>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}

/**
 * Renders the user's configured widgets for the day: daily/global-scoped ones
 * always, activity-scoped ones once per matching scheduled activity. This is
 * the read/write surface for widget_values that the Plans-tab configurator
 * creates definitions for.
 */
export default function DayWidgets({
  userId,
  dateStr,
  activities,
  activityLabels,
}: DayWidgetsProps) {
  const { widgets, loading: defsLoading } = useWidgets(userId);
  const { getValue, setValue, loading: valuesLoading } = useWidgetValues(
    userId,
    dateStr,
  );

  if (defsLoading || valuesLoading) return null;

  const rows: { widget: WidgetDefinition; activityType: string | null }[] = [];
  for (const w of widgets) {
    if (w.scope === "activity") {
      const filter = Array.isArray(w.activity_filter) ? w.activity_filter : [];
      const matching =
        filter.length > 0
          ? activities.filter((a) => filter.includes(a))
          : activities;
      for (const act of matching) rows.push({ widget: w, activityType: act });
    } else {
      rows.push({ widget: w, activityType: null });
    }
  }

  if (rows.length === 0) return null;

  return (
    <div className="card p-4">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 mb-3">
        Trackers
      </h3>
      <div className="space-y-3">
        {rows.map(({ widget, activityType }) => (
          <div
            key={`${widget.id}:${activityType ?? ""}`}
            className="flex items-center justify-between gap-3"
          >
            <span className="text-sm text-stone-300 flex-shrink-0">
              {widget.name}
              {activityType && (
                <span className="text-stone-500 text-xs">
                  {" "}
                  · {activityLabels[activityType] ?? activityType}
                </span>
              )}
            </span>
            <WidgetControl
              widget={widget}
              value={getValue(widget.id, activityType)}
              onChange={(v, debounceMs) =>
                setValue(widget.id, v, activityType, debounceMs)
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
