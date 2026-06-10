import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidOuraToken } from "./tokens";

const API = "https://api.ouraring.com/v2/usercollection";

interface OuraPage<T> {
  data?: T[];
  next_token?: string | null;
}

interface DailyScore {
  day: string;
  score?: number | null;
}

interface DailyReadiness extends DailyScore {
  temperature_deviation?: number | null;
}

interface DailyActivity extends DailyScore {
  steps?: number | null;
  active_calories?: number | null;
  total_calories?: number | null;
}

interface SleepPeriod {
  day: string;
  type?: string;
  total_sleep_duration?: number | null; // seconds
  efficiency?: number | null;
  average_hrv?: number | null;
  lowest_heart_rate?: number | null;
}

/** Fetch every page of an Oura collection for [startDate, endDate]. */
async function fetchAll<T>(
  accessToken: string,
  collection: string,
  startDate: string,
  endDate: string,
): Promise<T[]> {
  const items: T[] = [];
  let nextToken: string | null | undefined;
  do {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    if (nextToken) params.set("next_token", nextToken);
    const res = await fetch(`${API}/${collection}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error(`Oura ${collection} fetch failed (${res.status})`);
      return items;
    }
    const body = (await res.json()) as OuraPage<T>;
    items.push(...(body.data ?? []));
    nextToken = body.next_token;
  } while (nextToken);
  return items;
}

/**
 * Pull daily sleep / readiness / activity scores plus key sleep vitals from
 * the Oura API v2 into oura_daily for [startDate, endDate]. Read-only mirror,
 * one row per day, upserted on (user_id, date). No-op when the user isn't
 * connected.
 */
export async function syncOuraDaily(
  client: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<{ synced: number }> {
  const accessToken = await getValidOuraToken(client, userId);
  if (!accessToken) return { synced: 0 };

  const [sleepScores, readiness, activity, sleepPeriods] = await Promise.all([
    fetchAll<DailyScore>(accessToken, "daily_sleep", startDate, endDate),
    fetchAll<DailyReadiness>(accessToken, "daily_readiness", startDate, endDate),
    fetchAll<DailyActivity>(accessToken, "daily_activity", startDate, endDate),
    fetchAll<SleepPeriod>(accessToken, "sleep", startDate, endDate),
  ]);

  const byDay = new Map<string, Record<string, unknown>>();
  const row = (day: string) => {
    let r = byDay.get(day);
    if (!r) {
      r = { user_id: userId, date: day };
      byDay.set(day, r);
    }
    return r;
  };

  for (const s of sleepScores) {
    row(s.day).sleep_score = s.score ?? null;
  }
  for (const r of readiness) {
    Object.assign(row(r.day), {
      readiness_score: r.score ?? null,
      temperature_deviation: r.temperature_deviation ?? null,
    });
  }
  for (const a of activity) {
    Object.assign(row(a.day), {
      activity_score: a.score ?? null,
      steps: a.steps ?? null,
      active_calories: a.active_calories ?? null,
      total_calories: a.total_calories ?? null,
    });
  }

  // Sleep vitals come from sleep periods; use the longest period per day
  // (the main sleep, not naps).
  const longestByDay = new Map<string, SleepPeriod>();
  for (const p of sleepPeriods) {
    const cur = longestByDay.get(p.day);
    if (!cur || (p.total_sleep_duration ?? 0) > (cur.total_sleep_duration ?? 0)) {
      longestByDay.set(p.day, p);
    }
  }
  for (const [day, p] of Array.from(longestByDay.entries())) {
    Object.assign(row(day), {
      total_sleep_minutes:
        p.total_sleep_duration != null
          ? Math.round(p.total_sleep_duration / 60)
          : null,
      sleep_efficiency: p.efficiency ?? null,
      avg_hrv: p.average_hrv ?? null,
      resting_hr: p.lowest_heart_rate ?? null,
    });
  }

  const rows = Array.from(byDay.values()).map((r) => ({
    ...r,
    last_synced_at: new Date().toISOString(),
  }));
  if (rows.length > 0) {
    const { error } = await client
      .from("oura_daily")
      .upsert(rows, { onConflict: "user_id,date" });
    if (error) {
      console.error("syncOuraDaily: upsert failed", error);
      return { synced: 0 };
    }
  }
  return { synced: rows.length };
}
