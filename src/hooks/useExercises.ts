"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";

interface ExerciseRow {
  name: string;
  category: string | null;
  user_id: string | null;
}

/**
 * Fetches the exercise catalog (presets + the user's own) from the
 * `exercises` table. Replaces the hardcoded `EXERCISES` list that
 * `useCustomTopics` used to return.
 */
export function useExercises(userId: string) {
  const [rows, setRows] = useState<ExerciseRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("exercises")
      .select("name, category, user_id")
      .or(`user_id.is.null,user_id.eq.${userId}`);
    setRows((data as ExerciseRow[]) ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Deduplicate by name (a user override of a preset name should appear once)
  // and sort alphabetically, with "Other" pinned to the end so it stays the
  // catch-all option in dropdowns.
  const exercises = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const r of rows) {
      if (!seen.has(r.name)) {
        seen.add(r.name);
        names.push(r.name);
      }
    }
    names.sort((a, b) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
    return names;
  }, [rows]);

  const byCategory = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const r of rows) {
      const cat = r.category ?? "uncategorized";
      if (!map[cat]) map[cat] = [];
      if (!map[cat].includes(r.name)) map[cat].push(r.name);
    }
    for (const cat of Object.keys(map)) {
      map[cat].sort((a, b) => a.localeCompare(b));
    }
    return map;
  }, [rows]);

  const addExercise = useCallback(
    async (name: string, category?: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const { error } = await supabase.from("exercises").insert({
        user_id: userId,
        name: trimmed,
        category: category ?? null,
      });
      if (!error) await load();
    },
    [userId, load],
  );

  const removeExercise = useCallback(
    async (name: string) => {
      // Only deletes the user's own row — RLS prevents deleting presets.
      await supabase
        .from("exercises")
        .delete()
        .eq("user_id", userId)
        .eq("name", name);
      await load();
    },
    [userId, load],
  );

  return { exercises, byCategory, loading, addExercise, removeExercise };
}
