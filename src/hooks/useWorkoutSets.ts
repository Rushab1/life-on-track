"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { WorkoutSet } from "@/lib/types";

export function useWorkoutSets(userId: string, dateStr: string) {
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("workout_sets")
      .select("*")
      .eq("user_id", userId)
      .eq("date", dateStr)
      .order("created_at", { ascending: true });

    if (data) setSets(data);
  }, [userId, dateStr]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(entry: {
    exercise: string;
    sets: number | null;
    reps: number | null;
    weight_lbs: number | null;
    duration_mins: number | null;
  }) {
    setLoading(true);
    await supabase.from("workout_sets").insert({
      user_id: userId,
      date: dateStr,
      ...entry,
    });
    await load();
    setLoading(false);
  }

  async function update(
    id: string,
    entry: Partial<{
      reps: number | null;
      weight_lbs: number | null;
      duration_mins: number | null;
    }>
  ) {
    await supabase.from("workout_sets").update(entry).eq("id", id);
    await load();
  }

  async function remove(id: string) {
    await supabase.from("workout_sets").delete().eq("id", id);
    setSets((prev) => prev.filter((s) => s.id !== id));
  }

  return { sets, loading, add, update, remove };
}
