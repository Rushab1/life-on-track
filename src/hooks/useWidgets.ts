"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { WidgetDefinition } from "@/lib/types";

export function useWidgets(userId: string) {
  const [widgets, setWidgets] = useState<WidgetDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("widget_definitions")
      .select("*")
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .order("sort_order");

    if (data) setWidgets(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(widget: {
    name: string;
    type: WidgetDefinition["type"];
    config?: Record<string, unknown>;
    scope?: WidgetDefinition["scope"];
    activity_filter?: string[];
  }) {
    await supabase.from("widget_definitions").insert({
      user_id: userId,
      name: widget.name,
      type: widget.type,
      config: widget.config ?? {},
      scope: widget.scope ?? "daily",
      activity_filter: widget.activity_filter ?? null,
    });
    await load();
  }

  async function remove(id: string) {
    await supabase
      .from("widget_definitions")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    await load();
  }

  async function update(id: string, updates: Partial<Pick<WidgetDefinition, "name" | "config" | "scope" | "activity_filter">>) {
    await supabase
      .from("widget_definitions")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId);
    await load();
  }

  return { widgets, loading, create, remove, update };
}
