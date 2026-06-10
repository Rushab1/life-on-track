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

/** Oura metrics for one date (null when not synced / not connected). */
export function useOuraDaily(userId: string, dateStr: string, refresh = 0) {
  const [daily, setDaily] = useState<OuraDaily | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("oura_daily")
      .select("*")
      .eq("user_id", userId)
      .eq("date", dateStr)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setDaily((data as OuraDaily | null) ?? null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, dateStr, refresh]);

  return { daily, loading };
}
