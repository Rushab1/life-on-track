"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Plan } from "@/lib/types";

export function usePlans(userId: string) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("plans")
      .select("*")
      .eq("user_id", userId)
      .order("start_date", { ascending: false });

    if (data) setPlans(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(plan: {
    name: string;
    start_date: string;
    end_date: string;
    gym_schedule: Record<string, string>;
    prep_schedule: Record<string, string[]>;
  }) {
    await supabase.from("plans").insert({
      user_id: userId,
      ...plan,
    });
    await load();
  }

  async function update(
    id: string,
    updates: Partial<{
      name: string;
      start_date: string;
      end_date: string;
      gym_schedule: Record<string, string>;
      prep_schedule: Record<string, string[]>;
    }>
  ) {
    await supabase
      .from("plans")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);
    await load();
  }

  async function remove(id: string) {
    await supabase.from("plans").delete().eq("id", id);
    await load();
  }

  return { plans, loading, create, update, remove, reload: load };
}

/** Find the plan that covers a given date string (YYYY-MM-DD). */
export function getActivePlan(plans: Plan[], dateStr: string): Plan | null {
  return (
    plans.find((p) => dateStr >= p.start_date && dateStr <= p.end_date) ?? null
  );
}
