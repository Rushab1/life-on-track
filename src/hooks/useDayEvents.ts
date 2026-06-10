"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { triggerCalendarSync } from "@/lib/google/triggerSync";

export interface LifeEvent {
  id: string;
  title: string;
  notes: string | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  html_link: string | null;
}

/**
 * Events for a single date: editable life_events (app-native) and read-only
 * calendar events imported from Google. `refreshKey` lets a parent force a
 * reload (e.g. after a pull-on-open completes).
 */
export function useDayEvents(userId: string, dateStr: string, refreshKey = 0) {
  const [lifeEvents, setLifeEvents] = useState<LifeEvent[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    void refreshKey; // reload trigger: bumping refreshKey re-runs this callback
    setLoading(true);
    const [le, ge] = await Promise.all([
      supabase
        .from("life_events")
        .select("id, title, notes")
        .eq("user_id", userId)
        .eq("date", dateStr)
        .order("created_at"),
      supabase
        .from("google_events")
        .select("id, title, all_day, start_time, end_time, html_link")
        .eq("user_id", userId)
        .eq("date", dateStr)
        .order("all_day", { ascending: false })
        .order("start_time"),
    ]);
    setLifeEvents((le.data as LifeEvent[]) ?? []);
    setCalendarEvents((ge.data as CalendarEvent[]) ?? []);
    setLoading(false);
  }, [userId, dateStr, refreshKey]);

  useEffect(() => {
    load();
  }, [load]);

  const createLifeEvent = useCallback(
    async (title: string, notes?: string) => {
      await supabase.from("life_events").insert({
        user_id: userId,
        date: dateStr,
        title,
        notes: notes ?? null,
      });
      await load();
      triggerCalendarSync();
    },
    [userId, dateStr, load],
  );

  const deleteLifeEvent = useCallback(
    async (id: string) => {
      await supabase.from("life_events").delete().eq("user_id", userId).eq("id", id);
      await load();
      triggerCalendarSync();
    },
    [userId, load],
  );

  return {
    lifeEvents,
    calendarEvents,
    loading,
    reload: load,
    createLifeEvent,
    deleteLifeEvent,
  };
}
