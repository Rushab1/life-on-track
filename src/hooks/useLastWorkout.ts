"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";

export interface LastSetRow {
  reps: number | null;
  weight_lbs: number | null;
  duration_mins: number | null;
}

/**
 * For each exercise, fetches all sets from the most recent session
 * (the latest date before `dateStr` where that exercise was logged).
 */
export function useLastWorkout(
  userId: string,
  dateStr: string,
  exercises: string[]
) {
  const [lastSets, setLastSets] = useState<Record<string, LastSetRow[]>>({});

  const exerciseKey = useMemo(() => exercises.join(","), [exercises]);

  const load = useCallback(async () => {
    if (exercises.length === 0) {
      setLastSets({});
      return;
    }

    const { data } = await supabase
      .from("workout_sets")
      .select("exercise, reps, weight_lbs, duration_mins, date")
      .eq("user_id", userId)
      .lt("date", dateStr)
      .in("exercise", exercises)
      .order("date", { ascending: false })
      .order("created_at", { ascending: true });

    if (data) {
      const result: Record<string, LastSetRow[]> = {};
      // For each exercise, find the most recent date, then collect all sets from that date
      const latestDate: Record<string, string> = {};

      for (const row of data) {
        if (!latestDate[row.exercise]) {
          latestDate[row.exercise] = row.date;
        }
      }

      for (const row of data) {
        if (row.date === latestDate[row.exercise]) {
          if (!result[row.exercise]) result[row.exercise] = [];
          result[row.exercise].push({
            reps: row.reps,
            weight_lbs: row.weight_lbs,
            duration_mins: row.duration_mins,
          });
        }
      }
      setLastSets(result);
    }
  }, [userId, dateStr, exerciseKey]);

  useEffect(() => {
    load();
  }, [load]);

  return lastSets;
}
