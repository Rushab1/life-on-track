"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function useDailyLog(userId: string, dateStr: string) {
  const [painLevel, setPainLevel] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("daily_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("date", dateStr)
      .single();

    if (data) {
      setPainLevel(data.pain_level ?? 0);
      setNotes(data.notes ?? "");
    }
  }, [userId, dateStr]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    await supabase.from("daily_logs").upsert(
      {
        user_id: userId,
        date: dateStr,
        pain_level: painLevel,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" }
    );
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return { painLevel, setPainLevel, notes, setNotes, saving, saved, save };
}
