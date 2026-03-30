"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

/** Fetches which dates in a given month have daily_logs entries. */
export function useLoggedDays(userId: string, year: number, month: number) {
  const [loggedDates, setLoggedDates] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const { data } = await supabase
      .from("daily_logs")
      .select("date")
      .eq("user_id", userId)
      .gte("date", startDate)
      .lte("date", endDate);

    if (data) {
      setLoggedDates(new Set(data.map((d) => d.date)));
    }
  }, [userId, year, month]);

  useEffect(() => {
    load();
  }, [load]);

  return { loggedDates, reload: load };
}
