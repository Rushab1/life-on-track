"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

export function useDailyLog(userId: string, dateStr: string) {
  const [painLevel, setPainLevel] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasLog, setHasLog] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    setLoaded(false);
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
    setLoaded(true);
  }, [userId, dateStr]);

  useEffect(() => {
    load();
  }, [load]);

  const autosave = useCallback(
    (newPain: number, newNotes: string) => {
      if (!loaded) return;
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSaving(true);
        await supabase.from("daily_logs").upsert(
          {
            user_id: userId,
            date: dateStr,
            pain_level: newPain,
            notes: newNotes || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,date" }
        );
        setSaving(false);
        setSaved(true);
        setHasLog(true);
        setTimeout(() => setSaved(false), 2000);
      }, 1500);
    },
    [userId, dateStr, loaded]
  );

  function updatePainLevel(value: number) {
    setPainLevel(value);
    autosave(value, notes);
  }

  function updateNotes(value: string) {
    setNotes(value);
    autosave(painLevel, value);
  }

  async function deleteLog() {
    clearTimeout(debounceRef.current);
    await supabase
      .from("daily_logs")
      .delete()
      .eq("user_id", userId)
      .eq("date", dateStr);
    setPainLevel(0);
    setNotes("");
    setHasLog(false);
  }

  // Cleanup debounce on unmount or date change
  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, [dateStr]);

  return {
    painLevel,
    setPainLevel: updatePainLevel,
    notes,
    setNotes: updateNotes,
    saving,
    saved,
    hasLog,
    deleteLog,
  };
}
