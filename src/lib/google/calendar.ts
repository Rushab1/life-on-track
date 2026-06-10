import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVITY_LABELS } from "@/config/constants";
import { getActivitiesForDate } from "@/config/schedule";
import { toDateString, addDays } from "@/lib/dates";
import type { Plan } from "@/lib/types";
import { getValidAccessToken } from "./tokens";

const CAL = "https://www.googleapis.com/calendar/v3/calendars";

/** Gym-type codes — prep events are activities that are NOT one of these. */
const GYM_CODES = ["psh", "pll", "lgh", "lgl", "yga", "rst"];

/** Hex of "lot" — every app-pushed event id starts with this. */
const APP_PREFIX = "6c6f74";

/**
 * Deterministic Google event id from a short prefix + a key (a date or other
 * stable string). Hex-encodes `lot<prefix><key sans dashes>`, capped at 64
 * chars (Google ids must be base32hex, 5-1024 chars — hex qualifies).
 */
export function eventId(prefix: string, key: string): string {
  const raw = `lot${prefix}${key.replace(/-/g, "")}`;
  let hex = "";
  for (let i = 0; i < raw.length; i++) {
    hex += raw.charCodeAt(i).toString(16);
  }
  return hex.slice(0, 64);
}

/** Create or update an all-day event by deterministic id (PUT, POST on 404). */
export async function upsertCalendarEvent(
  accessToken: string,
  calendarId: string,
  evtId: string,
  summary: string,
  date: string,
  description?: string,
): Promise<boolean> {
  const event = { summary, description, start: { date }, end: { date }, id: evtId };
  const base = `${CAL}/${encodeURIComponent(calendarId)}/events`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const updateRes = await fetch(`${base}/${evtId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(event),
  });
  if (updateRes.ok) return true;

  if (updateRes.status === 404) {
    const createRes = await fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify(event),
    });
    return createRes.ok;
  }
  return false;
}

/** Delete an event by id. Treats already-gone (404/410) as success. */
export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  evtId: string,
): Promise<boolean> {
  const res = await fetch(
    `${CAL}/${encodeURIComponent(calendarId)}/events/${evtId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  return res.ok || res.status === 404 || res.status === 410;
}

/**
 * OUTBOUND: push the app's plan to Google for [startDate, endDate].
 *
 * For each date there are up to three deterministic all-day events — gym
 * (🏋️), prep (📋), and life events (📅). Each is upserted when present and
 * DELETED when absent, so swapping a day to rest / removing prep / deleting a
 * life event removes the stale Google event. App-owned ids are deterministic,
 * so reconciliation needs no listing.
 *
 * `client` may be RLS-scoped (route/MCP) or service-role (cron). No-op when
 * the user isn't connected.
 */
export async function pushToCalendar(
  client: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<{ synced: number; failed: number; deleted: number }> {
  const token = await getValidAccessToken(client, userId);
  if (!token) return { synced: 0, failed: 0, deleted: 0 };
  const { accessToken, calendarId } = token;

  // All plans overlapping the window (pick the covering one per date), plus
  // overrides and life events batched for the whole window.
  const [plansRes, overridesRes, eventsRes] = await Promise.all([
    client
      .from("plans")
      .select("*")
      .eq("user_id", userId)
      .lte("start_date", endDate)
      .gte("end_date", startDate),
    client
      .from("day_overrides")
      .select("date, gym_type")
      .eq("user_id", userId)
      .gte("date", startDate)
      .lte("date", endDate),
    client
      .from("life_events")
      .select("date, title")
      .eq("user_id", userId)
      .gte("date", startDate)
      .lte("date", endDate),
  ]);

  const plans = (plansRes.data ?? []) as Plan[];
  const overrideMap = new Map<string, string>();
  for (const o of overridesRes.data ?? []) overrideMap.set(o.date, o.gym_type);
  const lifeByDate = new Map<string, string[]>();
  for (const e of eventsRes.data ?? []) {
    const list = lifeByDate.get(e.date) ?? [];
    list.push(e.title);
    lifeByDate.set(e.date, list);
  }

  let synced = 0;
  let failed = 0;
  let deleted = 0;

  // Desired-or-delete for one event kind on one date.
  const reconcile = async (
    desired: boolean,
    prefix: string,
    dateStr: string,
    summary: string,
  ) => {
    const evtId = eventId(prefix, dateStr);
    if (desired) {
      const ok = await upsertCalendarEvent(accessToken, calendarId, evtId, summary, dateStr);
      if (ok) synced++;
      else failed++;
    } else {
      const ok = await deleteCalendarEvent(accessToken, calendarId, evtId);
      // Count only real deletions, not "was already absent" — but the Google
      // API can't distinguish cheaply, so count any successful DELETE call.
      if (ok) deleted++;
    }
  };

  const current = new Date(startDate + "T00:00:00");
  const last = new Date(endDate + "T00:00:00");

  while (current <= last) {
    const dateStr = toDateString(current);
    const plan = plans.find((p) => dateStr >= p.start_date && dateStr <= p.end_date) ?? null;
    const override = overrideMap.get(dateStr) ?? null;
    const activities = getActivitiesForDate(current, plan, override);

    const gymType =
      override ?? (plan?.gym_schedule?.[String(current.getDay())] as string | undefined);
    const gymLabel = gymType ? (ACTIVITY_LABELS[gymType] ?? gymType) : null;

    await reconcile(
      Boolean(gymLabel && gymType !== "rst"),
      "gym",
      dateStr,
      `🏋️ ${gymLabel}`,
    );

    const prep = activities.filter((a) => !GYM_CODES.includes(a));
    await reconcile(
      prep.length > 0,
      "prep",
      dateStr,
      `📋 ${prep.map((a) => ACTIVITY_LABELS[a] ?? a).join(", ")}`,
    );

    const titles = lifeByDate.get(dateStr) ?? [];
    await reconcile(titles.length > 0, "evt", dateStr, `📅 ${titles.join(", ")}`);

    current.setDate(current.getDate() + 1);
  }

  return { synced, failed, deleted };
}

interface GoogleApiEvent {
  id?: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

/**
 * INBOUND: import the user's Google Calendar events for [startDate, endDate]
 * into google_events (read-only mirror). Skips the app's own pushed events
 * (ids starting with the hex of "lot") and reflects Google-side deletions by
 * removing local rows in the window no longer present upstream.
 */
export async function pullFromCalendar(
  client: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<{ imported: number; removed: number }> {
  const token = await getValidAccessToken(client, userId);
  if (!token) return { imported: 0, removed: 0 };
  const { accessToken, calendarId } = token;

  const params = new URLSearchParams({
    timeMin: `${startDate}T00:00:00Z`,
    timeMax: `${endDate}T23:59:59Z`,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "2500",
  });
  const res = await fetch(
    `${CAL}/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return { imported: 0, removed: 0 };

  const body = (await res.json()) as { items?: GoogleApiEvent[] };
  const items = body.items ?? [];

  const seen: string[] = [];
  const rows: Record<string, unknown>[] = [];
  const nowIso = new Date().toISOString();

  for (const it of items) {
    if (!it.id || it.id.startsWith(APP_PREFIX)) continue; // skip app-owned
    if (it.status === "cancelled") continue;

    const allDay = Boolean(it.start?.date);
    let date: string;
    let startTime: string | null = null;
    let endTime: string | null = null;

    if (allDay) {
      date = it.start!.date!;
    } else if (it.start?.dateTime) {
      date = toDateString(new Date(it.start.dateTime));
      startTime = it.start.dateTime;
      endTime = it.end?.dateTime ?? null;
    } else {
      continue;
    }

    seen.push(it.id);
    rows.push({
      user_id: userId,
      google_event_id: it.id,
      date,
      title: it.summary ?? "(no title)",
      start_time: startTime,
      end_time: endTime,
      all_day: allDay,
      html_link: it.htmlLink ?? null,
      last_synced_at: nowIso,
    });
  }

  if (rows.length > 0) {
    await client
      .from("google_events")
      .upsert(rows, { onConflict: "user_id,google_event_id" });
  }

  // Reflect deletions: drop window rows that Google no longer returns.
  const { data: existing } = await client
    .from("google_events")
    .select("id, google_event_id")
    .eq("user_id", userId)
    .gte("date", startDate)
    .lte("date", endDate);

  const seenSet = new Set(seen);
  const toDelete = (existing ?? [])
    .filter((r) => !seenSet.has(r.google_event_id as string))
    .map((r) => r.id as string);

  let removed = 0;
  if (toDelete.length > 0) {
    await client.from("google_events").delete().in("id", toDelete);
    removed = toDelete.length;
  }

  return { imported: rows.length, removed };
}

/**
 * Fire-and-forget outbound push for the standard today..+14 window after an
 * app mutation. Swallows all errors and no-ops when the user isn't connected,
 * so it never affects the triggering operation. Call with `void`.
 */
export async function maybePushAfterMutation(
  client: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    const today = new Date();
    await pushToCalendar(client, userId, toDateString(today), toDateString(addDays(today, 14)));
  } catch {
    // best-effort
  }
}
