"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type WidgetValue = number | string | boolean | null;

const keyOf = (widgetId: string, activityType: string | null) =>
  `${widgetId}:${activityType ?? ""}`;

/**
 * Logged widget values for one date, keyed by `${widget_id}:${activity_type}`.
 * Writes use update-then-insert (the table's uniqueness is an expression
 * index over coalesce(activity_type,''), which PostgREST upsert can't
 * target). Saves are optimistic and debounced per widget.
 */
export function useWidgetValues(userId: string, dateStr: string) {
  const [values, setValues] = useState<Record<string, WidgetValue>>({});
  const [loading, setLoading] = useState(true);
  const debounces = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("widget_values")
      .select("widget_id, activity_type, value")
      .eq("user_id", userId)
      .eq("date", dateStr);
    const map: Record<string, WidgetValue> = {};
    for (const row of data ?? []) {
      map[keyOf(row.widget_id as string, row.activity_type as string | null)] =
        row.value as WidgetValue;
    }
    setValues(map);
    setLoading(false);
  }, [userId, dateStr]);

  useEffect(() => {
    load();
    const timers = debounces.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, [load]);

  async function persist(
    widgetId: string,
    value: WidgetValue,
    activityType: string | null,
  ) {
    let update = supabase
      .from("widget_values")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("widget_id", widgetId)
      .eq("date", dateStr);
    update = activityType
      ? update.eq("activity_type", activityType)
      : update.is("activity_type", null);
    const { data: updated } = await update.select("id");

    if (!updated || updated.length === 0) {
      await supabase.from("widget_values").insert({
        user_id: userId,
        widget_id: widgetId,
        date: dateStr,
        activity_type: activityType,
        value,
        updated_at: new Date().toISOString(),
      });
    }
  }

  function setValue(
    widgetId: string,
    value: WidgetValue,
    activityType: string | null = null,
    debounceMs = 0,
  ) {
    const key = keyOf(widgetId, activityType);
    setValues((prev) => ({ ...prev, [key]: value }));
    clearTimeout(debounces.current[key]);
    if (debounceMs > 0) {
      debounces.current[key] = setTimeout(
        () => void persist(widgetId, value, activityType),
        debounceMs,
      );
    } else {
      void persist(widgetId, value, activityType);
    }
  }

  function getValue(widgetId: string, activityType: string | null = null) {
    return values[keyOf(widgetId, activityType)] ?? null;
  }

  return { values, getValue, setValue, loading, reload: load };
}
