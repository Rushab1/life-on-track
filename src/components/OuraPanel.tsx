"use client";

import { useOuraDaily } from "@/hooks/useOura";

function scoreColor(score: number | null): string {
  if (score == null) return "text-stone-400";
  if (score >= 85) return "text-emerald-600";
  if (score >= 70) return "text-amber-600";
  return "text-rose-600";
}

function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col items-center flex-1">
      <span className={`text-2xl font-bold tabular-nums ${scoreColor(value)}`}>
        {value ?? "–"}
      </span>
      <span className="text-xs text-stone-500">{label}</span>
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

const INTENSITY_BADGE: Record<string, string> = {
  easy: "bg-emerald-100 text-emerald-700",
  moderate: "bg-amber-100 text-amber-700",
  hard: "bg-rose-100 text-rose-700",
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
    (daily.high_activity_minutes != null ||
      daily.medium_activity_minutes != null ||
      daily.low_activity_minutes != null);

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-stone-900 mb-3">
        Oura · {dateStr}
      </h3>
      {daily && (
        <div className="flex gap-2 mb-3">
          <Score label="Readiness" value={daily.readiness_score} />
          <Score label="Sleep" value={daily.sleep_score} />
          <Score label="Activity" value={daily.activity_score} />
        </div>
      )}
      {vitals.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600 border-t border-stone-100 pt-3">
          {vitals.map((v) => (
            <span key={v.label}>
              <span className="text-stone-400">{v.label}</span>{" "}
              <span className="font-medium text-stone-700">{v.value}</span>
            </span>
          ))}
        </div>
      )}
      {hasIntensity && daily && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600 mt-2">
          <span className="text-stone-400">Activity</span>
          <span>
            <span className="font-medium text-rose-600">{daily.high_activity_minutes ?? 0}m</span>{" "}
            <span className="text-stone-400">high</span>
          </span>
          <span>
            <span className="font-medium text-amber-600">{daily.medium_activity_minutes ?? 0}m</span>{" "}
            <span className="text-stone-400">med</span>
          </span>
          <span>
            <span className="font-medium text-emerald-600">{daily.low_activity_minutes ?? 0}m</span>{" "}
            <span className="text-stone-400">low</span>
          </span>
        </div>
      )}
      {workouts.length > 0 && (
        <div className="border-t border-stone-100 mt-3 pt-3 space-y-2">
          {workouts.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-stone-800 truncate">
                  {w.label || (w.activity ? titleCase(w.activity) : "Workout")}
                </span>
                {w.intensity && (
                  <span className={`badge ${INTENSITY_BADGE[w.intensity] ?? "bg-stone-100 text-stone-600"}`}>
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
