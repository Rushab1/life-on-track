"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export interface OuraDaily {
  date: string;
  sleep_score: number | null;
  readiness_score: number | null;
  activity_score: number | null;
  total_sleep_minutes: number | null;
  sleep_efficiency: number | null;
  avg_hrv: number | null;
  resting_hr: number | null;
  temperature_deviation: number | null;
  steps: number | null;
  active_calories: number | null;
  total_calories: number | null;
  high_activity_minutes: number | null;
  medium_activity_minutes: number | null;
  low_activity_minutes: number | null;
}

export interface OuraWorkout {
  id: string;
  activity: string | null;
  intensity: string | null;
  calories: number | null;
  distance: number | null;
  start_time: string | null;
  end_time: string | null;
  source: string | null;
  label: string | null;
}

export function useOuraConnection(userId: string) {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("oura_tokens")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    setConnected(!!data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function disconnect() {
    try {
      const res = await fetch("/api/oura/disconnect", { method: "POST" });
      if (!res.ok) throw new Error(`disconnect failed: ${res.status}`);
    } catch {
      await supabase.from("oura_tokens").delete().eq("user_id", userId);
    }
    setConnected(false);
  }

  return { connected, loading, disconnect, reload: load };
}

/** Oura metrics + workout sessions for one date (null/empty when not synced). */
export function useOuraDaily(userId: string, dateStr: string, refresh = 0) {
  const [daily, setDaily] = useState<OuraDaily | null>(null);
  const [workouts, setWorkouts] = useState<OuraWorkout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase
        .from("oura_daily")
        .select("*")
        .eq("user_id", userId)
        .eq("date", dateStr)
        .maybeSingle(),
      supabase
        .from("oura_workouts")
        .select("id, activity, intensity, calories, distance, start_time, end_time, source, label")
        .eq("user_id", userId)
        .eq("date", dateStr)
        .order("start_time"),
    ]).then(([dailyRes, workoutsRes]) => {
      if (cancelled) return;
      setDaily((dailyRes.data as OuraDaily | null) ?? null);
      setWorkouts((workoutsRes.data as OuraWorkout[] | null) ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, dateStr, refresh]);

  return { daily, workouts, loading };
}
