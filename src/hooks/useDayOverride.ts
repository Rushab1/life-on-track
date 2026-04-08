"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

/** Fetch the day_overrides row for (user, date). Returns the gym_type string or null. */
export function useDayOverride(userId: string, dateStr: string) {
  const [override, setOverride] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("day_overrides")
      .select("gym_type")
      .eq("user_id", userId)
      .eq("date", dateStr)
      .maybeSingle();
    setOverride(data?.gym_type ?? null);
    setLoading(false);
  }, [userId, dateStr]);

  useEffect(() => {
    load();
  }, [load]);

  return { override, loading, reload: load };
}
