"use client";

import { useOuraDaily } from "@/hooks/useOura";

function ringColor(score: number | null): string {
  if (score == null) return "#44403c";
  if (score >= 85) return "#34d399"; // emerald-400
  if (score >= 70) return "#fbbf24"; // amber-400
  return "#fb7185"; // rose-400
}

/** Oura-style circular progress ring with a soft glow. */
function Ring({ label, value }: { label: string; value: number | null }) {
  const R = 30;
  const C = 2 * Math.PI * R;
  const pct = value != null ? Math.min(Math.max(value, 0), 100) / 100 : 0;
  const color = ringColor(value);
  return (
    <div className="flex flex-col items-center flex-1 gap-1.5">
      <div className="relative w-[78px] h-[78px]">
        <svg viewBox="0 0 78 78" className="w-full h-full -rotate-90">
          <circle
            cx="39"
            cy="39"
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="6"
          />
          {value != null && (
            <circle
              cx="39"
              cy="39"
              r={R}
              fill="none"
              stroke={color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct)}
              className="transition-[stroke-dashoffset] duration-700 ease-out"
              style={{ filter: `drop-shadow(0 0 6px ${color}99)` }}
            />
          )}
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center text-xl font-bold tabular-nums"
          style={{ color: value != null ? color : "#78716c" }}
        >
          {value ?? "–"}
        </div>
      </div>
      <span className="text-[10px] uppercase tracking-[0.14em] text-stone-500">
        {label}
      </span>
    </div>
  );
}

function fmtSleep(mins: number | null): string | null {
  if (mins == null) return null;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function fmtDuration(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const mins = Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 60000,
  );
  if (mins <= 0) return null;
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

function fmtMins(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

// Oura's six activity-intensity zones (0-5), highest intensity first.
const ACTIVITY_ZONES: {
  zone: number;
  label: string;
  field: keyof Pick<
    OuraDailyZones,
    | "high_activity_minutes"
    | "medium_activity_minutes"
    | "low_activity_minutes"
    | "sedentary_minutes"
    | "rest_minutes"
    | "non_wear_minutes"
  >;
  color: string;
}[] = [
  { zone: 5, label: "High", field: "high_activity_minutes", color: "text-rose-300" },
  { zone: 4, label: "Medium", field: "medium_activity_minutes", color: "text-amber-300" },
  { zone: 3, label: "Low", field: "low_activity_minutes", color: "text-emerald-300" },
  { zone: 2, label: "Inactive", field: "sedentary_minutes", color: "text-sky-300" },
  { zone: 1, label: "Rest", field: "rest_minutes", color: "text-indigo-300" },
  { zone: 0, label: "Non-wear", field: "non_wear_minutes", color: "text-stone-400" },
];

type OuraDailyZones = {
  high_activity_minutes: number | null;
  medium_activity_minutes: number | null;
  low_activity_minutes: number | null;
  sedentary_minutes: number | null;
  rest_minutes: number | null;
  non_wear_minutes: number | null;
};

const INTENSITY_BADGE: Record<string, string> = {
  easy: "bg-emerald-500/15 text-emerald-300",
  moderate: "bg-amber-500/15 text-amber-300",
  hard: "bg-rose-500/15 text-rose-300",
};

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Oura metrics for the selected day. Renders nothing when there's no synced
 * row for the date (not connected, or the ring hasn't synced yet).
 */
export default function OuraPanel({
  userId,
  dateStr,
  refresh = 0,
}: {
  userId: string;
  dateStr: string;
  refresh?: number;
}) {
  const { daily, workouts, loading } = useOuraDaily(userId, dateStr, refresh);

  if (loading || (!daily && workouts.length === 0)) return null;

  const vitals: { label: string; value: string | null }[] = daily
    ? [
        { label: "Sleep", value: fmtSleep(daily.total_sleep_minutes) },
        {
          label: "Resting HR",
          value:
            daily.resting_hr != null ? `${Math.round(daily.resting_hr)} bpm` : null,
        },
        {
          label: "HRV",
          value: daily.avg_hrv != null ? `${Math.round(daily.avg_hrv)} ms` : null,
        },
        {
          label: "Steps",
          value: daily.steps != null ? daily.steps.toLocaleString() : null,
        },
      ].filter((v) => v.value !== null)
    : [];

  const hasIntensity =
    daily != null &&
    ACTIVITY_ZONES.some((z) => daily[z.field] != null);

  return (
    <div className="card p-5">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 mb-4">
        Oura
      </h3>
      {daily && (
        <div className="flex gap-2 mb-4">
          <Ring label="Readiness" value={daily.readiness_score} />
          <Ring label="Sleep" value={daily.sleep_score} />
          <Ring label="Activity" value={daily.activity_score} />
        </div>
      )}
      {vitals.length > 0 && (
        <div className="grid grid-cols-4 gap-2 border-t border-white/[0.06] pt-3">
          {vitals.map((v) => (
            <div key={v.label} className="text-center">
              <p className="text-sm font-semibold text-stone-200 tabular-nums">
                {v.value}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-stone-500 mt-0.5">
                {v.label}
              </p>
            </div>
          ))}
        </div>
      )}
      {hasIntensity && daily && (
        <div className="border-t border-white/[0.06] mt-3 pt-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500 mb-2">
            Activity Zones
          </p>
          <div className="grid grid-cols-3 gap-x-3 gap-y-2">
            {ACTIVITY_ZONES.map((z) => {
              const mins = daily[z.field];
              return (
                <div key={z.zone} className="flex items-baseline gap-1.5">
                  <span className="text-[10px] tabular-nums text-stone-600">
                    {z.zone}
                  </span>
                  <span className={`text-sm font-semibold tabular-nums ${z.color}`}>
                    {mins != null ? fmtMins(mins) : "–"}
                  </span>
                  <span className="text-[10px] text-stone-500">{z.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {workouts.length > 0 && (
        <div className="border-t border-white/[0.06] mt-3 pt-3 space-y-2">
          {workouts.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-stone-200 truncate">
                  {w.label || (w.activity ? titleCase(w.activity) : "Workout")}
                </span>
                {w.intensity && (
                  <span className={`badge ${INTENSITY_BADGE[w.intensity] ?? "bg-white/[0.06] text-stone-400"}`}>
                    {w.intensity}
                  </span>
                )}
              </div>
              <span className="text-stone-500 flex-shrink-0">
                {[
                  fmtDuration(w.start_time, w.end_time),
                  w.calories != null ? `${Math.round(w.calories)} cal` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
