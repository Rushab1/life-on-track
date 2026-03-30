"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface LastSet {
  sets: number | null;
  reps: number | null;
  weight_lbs: number | null;
  duration_mins: number | null;
}

/**
 * For each exercise in the list, fetches the most recent workout_set
 * logged by the user (on any date before the given date).
 */
export function useLastWorkout(
  userId: string,
  dateStr: string,
  exercises: string[]
) {
  const [lastSets, setLastSets] = useState<Record<string, LastSet>>({});

  const load = useCallback(async () => {
    if (exercises.length === 0) return;

    // Fetch the most recent set for each exercise before this date
    const { data } = await supabase
      .from("workout_sets")
      .select("exercise, sets, reps, weight_lbs, duration_mins, date")
      .eq("user_id", userId)
      .lt("date", dateStr)
      .in("exercise", exercises)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (data) {
      const result: Record<string, LastSet> = {};
      for (const row of data) {
        // Keep only the first (most recent) for each exercise
        if (!result[row.exercise]) {
          result[row.exercise] = {
            sets: row.sets,
            reps: row.reps,
            weight_lbs: row.weight_lbs,
            duration_mins: row.duration_mins,
          };
        }
      }
      setLastSets(result);
    }
  }, [userId, dateStr, exercises.join(",")]);

  useEffect(() => {
    load();
  }, [load]);

  return lastSets;
}
