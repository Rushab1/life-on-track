import type { SupabaseClient } from "@supabase/supabase-js";

const OURA_CLIENT_ID = process.env.OURA_CLIENT_ID!;
const OURA_CLIENT_SECRET = process.env.OURA_CLIENT_SECRET!;

export const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";

/**
 * Read the user's Oura tokens and return a valid access token, refreshing
 * (and persisting) when within 5 minutes of expiry. Mirrors
 * src/lib/google/tokens.ts. Returns null when not connected or the grant was
 * revoked (in which case the stale row is removed so the UI shows
 * disconnected).
 */
export async function getValidOuraToken(
  client: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await client
    .from("oura_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;

  let accessToken = data.access_token as string;

  if (
    new Date(data.expires_at as string).getTime() <
    Date.now() + 5 * 60 * 1000
  ) {
    const res = await fetch(OURA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: data.refresh_token as string,
        client_id: OURA_CLIENT_ID,
        client_secret: OURA_CLIENT_SECRET,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`Oura token refresh failed (${res.status}): ${errBody}`);
      if (res.status === 400 || res.status === 401) {
        await client.from("oura_tokens").delete().eq("user_id", userId);
      }
      return null;
    }

    const refreshed = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    accessToken = refreshed.access_token;
    const { error: updateError } = await client
      .from("oura_tokens")
      .update({
        access_token: accessToken,
        // Oura rotates refresh tokens on every refresh — keep the new one.
        ...(refreshed.refresh_token
          ? { refresh_token: refreshed.refresh_token }
          : {}),
        expires_at: new Date(
          Date.now() + refreshed.expires_in * 1000,
        ).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    if (updateError) {
      console.error("Oura token refresh: failed to persist new token", updateError);
    }
  }

  return accessToken;
}
