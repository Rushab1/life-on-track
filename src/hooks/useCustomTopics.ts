"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { ACTIVITY_LABELS } from "@/config/constants";
import type { CustomTopic } from "@/lib/types";

const DEFAULT_GYM_OPTIONS = [
  { value: "rst", label: "Rest" },
  { value: "psh", label: "Push" },
  { value: "lgh", label: "Legs Heavy" },
  { value: "pll", label: "Pull" },
  { value: "lgl", label: "Legs Light" },
  { value: "yga", label: "Yoga" },
];

const DEFAULT_PREP_OPTIONS = [
  { value: "lc", label: "LeetCode" },
  { value: "ml", label: "ML/AI" },
  { value: "sd", label: "System Design" },
  { value: "beh", label: "Behavioral" },
  { value: "oss", label: "FastMCP" },
  { value: "vln", label: "Violin" },
  { value: "dte", label: "Date Night" },
  { value: "mck", label: "Mock Interview" },
  { value: "out", label: "Outdoor Activity" },
];

export function useCustomTopics(userId: string) {
  const [topics, setTopics] = useState<CustomTopic[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("custom_topics")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (data) setTopics(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const activityLabels = useMemo(() => {
    const labels: Record<string, string> = { ...ACTIVITY_LABELS };
    for (const t of topics) {
      if (t.category === "activity" || t.category === "gym_type") {
        labels[t.code] = t.label;
      }
    }
    return labels;
  }, [topics]);

  const gymOptions = useMemo(() => {
    const custom = topics
      .filter((t) => t.category === "gym_type")
      .map((t) => ({ value: t.code, label: t.label }));
    return [...DEFAULT_GYM_OPTIONS, ...custom];
  }, [topics]);

  const prepOptions = useMemo(() => {
    const custom = topics
      .filter((t) => t.category === "activity")
      .map((t) => ({ value: t.code, label: t.label }));
    return [...DEFAULT_PREP_OPTIONS, ...custom];
  }, [topics]);

  async function addTopic(
    category: "activity" | "gym_type",
    label: string
  ) {
    const code =
      "c_" +
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");

    const { error } = await supabase.from("custom_topics").insert({
      user_id: userId,
      category,
      code,
      label,
    });

    if (!error) await load();
  }

  async function removeTopic(id: string) {
    await supabase.from("custom_topics").delete().eq("id", id);
    await load();
  }

  return {
    topics,
    loading,
    activityLabels,
    gymOptions,
    prepOptions,
    addTopic,
    removeTopic,
  };
}
