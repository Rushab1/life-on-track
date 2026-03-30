"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function useDailyLog(userId: string, dateStr: string) {
  const [painLevel, setPainLevel] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasLog, setHasLog] = useState(false);

  const load = useCallback(async () => {
    setPainLevel(0);
    setNotes("");
    setHasLog(false);

    const { data } = await supabase
      .from("daily_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("date", dateStr)
      .single();

    if (data) {
      setPainLevel(data.pain_level ?? 0);
      setNotes(data.notes ?? "");
      setHasLog(true);
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
    setHasLog(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function deleteLog() {
    await supabase
      .from("daily_logs")
      .delete()
      .eq("user_id", userId)
      .eq("date", dateStr);
    setPainLevel(0);
    setNotes("");
    setHasLog(false);
  }

  return {
    painLevel,
    setPainLevel,
    notes,
    setNotes,
    saving,
    saved,
    hasLog,
    save,
    deleteLog,
  };
}
