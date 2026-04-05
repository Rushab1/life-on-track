import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVITY_LABELS } from "@/config/constants";
import { getActivitiesForDate } from "@/config/schedule";
import type { Plan } from "@/lib/types";
import { dateSchema, safeErrorMessage } from "../validation";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  calendar_id: string;
}

/** Get and auto-refresh Google tokens for a user. */
async function getGoogleTokens(client: SupabaseClient, userId: string): Promise<GoogleTokens | null> {
  const { data } = await client.from("google_tokens").select("*").eq("user_id", userId).single();
  if (!data) return null;

  const tokens = data as GoogleTokens;

  // Refresh if expired or expiring within 5 minutes
  if (new Date(tokens.expires_at).getTime() < Date.now() + 5 * 60 * 1000) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: tokens.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) return null;

    const refreshed = (await res.json()) as { access_token: string; expires_in: number };
    tokens.access_token = refreshed.access_token;
    tokens.expires_at = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

    // Update stored token
    await client.from("google_tokens").update({
      access_token: tokens.access_token,
      expires_at: tokens.expires_at,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
  }

  return tokens;
}

/** Create or update a Google Calendar event. */
async function upsertCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  summary: string,
  date: string,
  description?: string,
): Promise<boolean> {
  const event = {
    summary,
    description,
    start: { date },
    end: { date },
    id: eventId,
  };

  // Try update first, then create
  const updateRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    },
  );

  if (updateRes.ok) return true;

  // If not found, create
  if (updateRes.status === 404) {
    const createRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      },
    );
    return createRes.ok;
  }

  return false;
}

/** Generate a stable event ID from components (Google requires lowercase hex, 5-1024 chars). */
function eventId(prefix: string, date: string): string {
  const raw = `lot${prefix}${date.replace(/-/g, "")}`;
  // Convert to hex to satisfy Google's event ID format
  let hex = "";
  for (let i = 0; i < raw.length; i++) {
    hex += raw.charCodeAt(i).toString(16);
  }
  return hex.slice(0, 64);
}

export function registerGoogleCalendarTools(server: McpServer, client: SupabaseClient, userId: string) {
  server.tool(
    "connect_google_calendar",
    "Check if Google Calendar is connected. If not, returns a link the user should visit to authorize access.",
    {},
    async () => {
      const tokens = await getGoogleTokens(client, userId);
      if (tokens) {
        return { content: [{ type: "text" as const, text: "Google Calendar is connected." }] };
      }
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000";
      return {
        content: [{
          type: "text" as const,
          text: `Google Calendar is not connected. Ask the user to visit: ${appUrl}/api/google/auth`,
        }],
      };
    }
  );

  server.tool(
    "sync_plan_to_calendar",
    "Sync the active plan's scheduled activities to Google Calendar for a date range. Creates all-day events for gym workouts and prep activities. Requires Google Calendar to be connected first (use connect_google_calendar to check).",
    {
      start_date: dateSchema.describe("Start date YYYY-MM-DD"),
      end_date: dateSchema.describe("End date YYYY-MM-DD"),
    },
    async ({ start_date, end_date }) => {
      if (start_date > end_date) {
        return { content: [{ type: "text" as const, text: "start_date must be on or before end_date." }] };
      }

      const tokens = await getGoogleTokens(client, userId);
      if (!tokens) {
        return { content: [{ type: "text" as const, text: "Google Calendar is not connected. Use connect_google_calendar first." }] };
      }

      // Get the active plan
      const { data: plan, error } = await client
        .from("plans").select("*").eq("user_id", userId)
        .lte("start_date", start_date).gte("end_date", end_date)
        .limit(1).single();

      if (error && error.code !== "PGRST116") {
        return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      }
      if (!plan) {
        return { content: [{ type: "text" as const, text: `No plan covers ${start_date} to ${end_date}.` }] };
      }

      const typedPlan = plan as Plan;
      let synced = 0;
      let failed = 0;

      // Iterate through each day in the range
      const current = new Date(start_date + "T00:00:00");
      const last = new Date(end_date + "T00:00:00");

      while (current <= last) {
        const dateStr = current.toISOString().split("T")[0];
        const activities = getActivitiesForDate(current, typedPlan);

        // Build event summary for this day
        const gymType = typedPlan.gym_schedule?.[String(current.getDay())] as string | undefined;
        const gymLabel = gymType ? (ACTIVITY_LABELS[gymType] ?? gymType) : null;

        // Sync gym event
        if (gymLabel && gymType !== "rst") {
          const ok = await upsertCalendarEvent(
            tokens.access_token,
            tokens.calendar_id,
            eventId("gym", dateStr),
            `🏋️ ${gymLabel}`,
            dateStr,
          );
          if (ok) synced++; else failed++;
        }

        // Sync prep activities as a single event
        const prepActivities = activities.filter((a) => !["psh", "pll", "lgh", "lgl", "yga", "rst"].includes(a));
        if (prepActivities.length > 0) {
          const labels = prepActivities.map((a) => ACTIVITY_LABELS[a] ?? a);
          const ok = await upsertCalendarEvent(
            tokens.access_token,
            tokens.calendar_id,
            eventId("prep", dateStr),
            `📋 ${labels.join(", ")}`,
            dateStr,
          );
          if (ok) synced++; else failed++;
        }

        current.setDate(current.getDate() + 1);
      }

      let msg = `Synced ${synced} events to Google Calendar for ${start_date} to ${end_date}.`;
      if (failed > 0) msg += ` ${failed} events failed.`;
      return { content: [{ type: "text" as const, text: msg }] };
    }
  );
}
