import type { SupabaseClient } from "@supabase/supabase-js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

export interface ValidToken {
  accessToken: string;
  calendarId: string;
}

/**
 * Read the user's Google tokens and return a valid access token, refreshing
 * (and persisting the new token) if it's within 5 minutes of expiry.
 *
 * `client` may be RLS-scoped (own row, for route/MCP contexts) or a
 * service-role client (for the cron, which iterates all users). Returns null
 * when the user isn't connected or the refresh fails (e.g. revoked grant).
 */
export async function getValidAccessToken(
  client: SupabaseClient,
  userId: string,
): Promise<ValidToken | null> {
  const { data } = await client
    .from("google_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;

  let accessToken = data.access_token as string;
  const calendarId = (data.calendar_id as string) || "primary";

  if (
    new Date(data.expires_at as string).getTime() <
    Date.now() + 5 * 60 * 1000
  ) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: data.refresh_token as string,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) return null;

    const refreshed = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    accessToken = refreshed.access_token;
    await client
      .from("google_tokens")
      .update({
        access_token: accessToken,
        expires_at: new Date(
          Date.now() + refreshed.expires_in * 1000,
        ).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }

  return { accessToken, calendarId };
}
