"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { ActivityType, ActivityCompletion } from "@/lib/types";

export function useActivities(userId: string, dateStr: string) {
  const [completions, setCompletions] = useState<Record<ActivityType, boolean>>(
    {} as Record<ActivityType, boolean>
  );
  const [activityNotes, setActivityNotes] = useState<
    Record<ActivityType, string>
  >({} as Record<ActivityType, string>);

  const load = useCallback(async () => {
    setCompletions({} as Record<ActivityType, boolean>);
    setActivityNotes({} as Record<ActivityType, string>);

    const { data } = await supabase
      .from("activity_completions")
      .select("*")
      .eq("user_id", userId)
      .eq("date", dateStr);

    if (data) {
      const compMap: Record<string, boolean> = {};
      const noteMap: Record<string, string> = {};
      data.forEach((c: ActivityCompletion) => {
        compMap[c.activity_type] = c.completed;
        if (c.notes) noteMap[c.activity_type] = c.notes;
      });
      setCompletions(compMap as Record<ActivityType, boolean>);
      setActivityNotes(noteMap as Record<ActivityType, string>);
    }
  }, [userId, dateStr]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(activity: ActivityType) {
    const newVal = !completions[activity];
    setCompletions((prev) => ({ ...prev, [activity]: newVal }));

    await supabase.from("activity_completions").upsert(
      {
        user_id: userId,
        date: dateStr,
        activity_type: activity,
        completed: newVal,
      },
      { onConflict: "user_id,date,activity_type" }
    );
  }

  async function saveNote(activity: ActivityType) {
    await supabase.from("activity_completions").upsert(
      {
        user_id: userId,
        date: dateStr,
        activity_type: activity,
        completed: completions[activity] ?? false,
        notes: activityNotes[activity] || null,
      },
      { onConflict: "user_id,date,activity_type" }
    );
  }

  function setNote(activity: ActivityType, text: string) {
    setActivityNotes((prev) => ({ ...prev, [activity]: text }));
  }

  async function clearAll() {
    await supabase
      .from("activity_completions")
      .delete()
      .eq("user_id", userId)
      .eq("date", dateStr);
    setCompletions({} as Record<ActivityType, boolean>);
    setActivityNotes({} as Record<ActivityType, string>);
  }

  return { completions, activityNotes, toggle, saveNote, setNote, clearAll };
}
