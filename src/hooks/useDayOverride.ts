"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

/** Fetch (and mutate) the day_overrides row for (user, date). */
export function useDayOverride(userId: string, dateStr: string) {
  const [override, setOverrideState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("day_overrides")
      .select("gym_type")
      .eq("user_id", userId)
      .eq("date", dateStr)
      .maybeSingle();
    setOverrideState(data?.gym_type ?? null);
    setLoading(false);
  }, [userId, dateStr]);

  useEffect(() => {
    load();
  }, [load]);

  const setOverride = useCallback(
    async (gymType: string | null) => {
      if (gymType === null) {
        await supabase
          .from("day_overrides")
          .delete()
          .eq("user_id", userId)
          .eq("date", dateStr);
      } else {
        await supabase
          .from("day_overrides")
          .upsert(
            { user_id: userId, date: dateStr, gym_type: gymType },
            { onConflict: "user_id,date" },
          );
      }
      await load();
    },
    [userId, dateStr, load],
  );

  return { override, loading, setOverride, reload: load };
}
