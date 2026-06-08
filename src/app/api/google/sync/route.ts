import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACTIVITY_LABELS } from "@/config/constants";
import { getActivitiesForDate } from "@/config/schedule";
import type { Plan } from "@/lib/types";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

function eventId(prefix: string, date: string): string {
  const raw = `lot${prefix}${date.replace(/-/g, "")}`;
  let hex = "";
  for (let i = 0; i < raw.length; i++) {
    hex += raw.charCodeAt(i).toString(16);
  }
  return hex.slice(0, 64);
}

async function upsertCalendarEvent(
  accessToken: string,
  calendarId: string,
  evtId: string,
  summary: string,
  date: string,
  description?: string,
): Promise<boolean> {
  const event = { summary, description, start: { date }, end: { date }, id: evtId };

  const updateRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${evtId}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
    },
  );
  if (updateRes.ok) return true;

  if (updateRes.status === 404) {
    const createRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      },
    );
    return createRes.ok;
  }
  return false;
}

export async function POST(): Promise<Response> {
  // Authenticate user
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service role for token access
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Get Google tokens
  const { data: tokenRow } = await admin
    .from("google_tokens")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!tokenRow) {
    return NextResponse.json({ error: "Google Calendar not connected" }, { status: 400 });
  }

  let accessToken = tokenRow.access_token as string;
  const refreshToken = tokenRow.refresh_token as string;
  const calendarId = (tokenRow.calendar_id as string) || "primary";

  // Refresh if expired
  if (new Date(tokenRow.expires_at as string).getTime() < Date.now() + 5 * 60 * 1000) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to refresh Google token" }, { status: 500 });
    }
    const refreshed = (await res.json()) as { access_token: string; expires_in: number };
    accessToken = refreshed.access_token;
    await admin
      .from("google_tokens")
      .update({
        access_token: accessToken,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
  }

  // Determine date range: today + 14 days
  const today = new Date();
  const startDate = today.toISOString().split("T")[0];
  const endDate = new Date(today.getTime() + 14 * 86400000).toISOString().split("T")[0];

  // Get active plan
  const { data: plan } = await admin
    .from("plans")
    .select("*")
    .eq("user_id", user.id)
    .lte("start_date", startDate)
    .gte("end_date", endDate)
    .limit(1)
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: "No active plan covers the next 2 weeks" }, { status: 400 });
  }

  // Get day overrides
  const { data: overridesData } = await admin
    .from("day_overrides")
    .select("date, gym_type")
    .eq("user_id", user.id)
    .gte("date", startDate)
    .lte("date", endDate);
  const overrideMap = new Map<string, string>();
  for (const o of overridesData ?? []) {
    overrideMap.set(o.date, o.gym_type);
  }

  const typedPlan = plan as Plan;
  let synced = 0;
  let failed = 0;

  const current = new Date(startDate + "T00:00:00");
  const last = new Date(endDate + "T00:00:00");

  while (current <= last) {
    const dateStr = current.toISOString().split("T")[0];
    const override = overrideMap.get(dateStr) ?? null;
    const activities = getActivitiesForDate(current, typedPlan, override);

    const gymType =
      override ??
      (typedPlan.gym_schedule?.[String(current.getDay())] as string | undefined);
    const gymLabel = gymType ? (ACTIVITY_LABELS[gymType] ?? gymType) : null;

    if (gymLabel && gymType !== "rst") {
      const ok = await upsertCalendarEvent(
        accessToken,
        calendarId,
        eventId("gym", dateStr),
        `🏋️ ${gymLabel}`,
        dateStr,
      );
      if (ok) synced++;
      else failed++;
    }

    const prepActivities = activities.filter(
      (a) => !["psh", "pll", "lgh", "lgl", "yga", "rst"].includes(a),
    );
    if (prepActivities.length > 0) {
      const labels = prepActivities.map((a) => ACTIVITY_LABELS[a] ?? a);
      const ok = await upsertCalendarEvent(
        accessToken,
        calendarId,
        eventId("prep", dateStr),
        `📋 ${labels.join(", ")}`,
        dateStr,
      );
      if (ok) synced++;
      else failed++;
    }

    current.setDate(current.getDate() + 1);
  }

  return NextResponse.json({ synced, failed, startDate, endDate });
}
