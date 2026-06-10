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
  const { daily, loading } = useOuraDaily(userId, dateStr, refresh);

  if (loading || !daily) return null;

  const vitals: { label: string; value: string | null }[] = [
    { label: "Sleep", value: fmtSleep(daily.total_sleep_minutes) },
    {
      label: "Resting HR",
      value: daily.resting_hr != null ? `${Math.round(daily.resting_hr)} bpm` : null,
    },
    {
      label: "HRV",
      value: daily.avg_hrv != null ? `${Math.round(daily.avg_hrv)} ms` : null,
    },
    {
      label: "Steps",
      value: daily.steps != null ? daily.steps.toLocaleString() : null,
    },
  ].filter((v) => v.value !== null);

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-stone-900 mb-3">
        Oura · {dateStr}
      </h3>
      <div className="flex gap-2 mb-3">
        <Score label="Readiness" value={daily.readiness_score} />
        <Score label="Sleep" value={daily.sleep_score} />
        <Score label="Activity" value={daily.activity_score} />
      </div>
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
    </div>
  );
}
