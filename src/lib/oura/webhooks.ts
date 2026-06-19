import type { SupabaseClient } from "@supabase/supabase-js";

const WEBHOOK_API = "https://api.ouraring.com/v2/webhook/subscription";

const OURA_CLIENT_ID = process.env.OURA_CLIENT_ID;
const OURA_CLIENT_SECRET = process.env.OURA_CLIENT_SECRET;

/**
 * Secret that authenticates Oura's calls to our webhook endpoint. It's both
 * the verification-handshake token AND embedded in the registered callback URL
 * (?token=...), so every event POST carries it — that's how we reject forged
 * requests in a multi-user setup. Must be set explicitly; we deliberately do
 * NOT fall back to the client secret (it would end up in a URL).
 */
export const OURA_WEBHOOK_TOKEN = process.env.OURA_WEBHOOK_TOKEN ?? "";

// Data types we mirror today. Each gets create + update subscriptions so we're
// notified both when a day first appears and when Oura revises it overnight.
const DATA_TYPES = [
  "daily_activity",
  "daily_sleep",
  "daily_readiness",
  "sleep",
  "workout",
] as const;
const EVENT_TYPES = ["create", "update"] as const;

interface OuraSubscription {
  id: string;
  callback_url: string;
  event_type: string;
  data_type: string;
  expiration_time?: string | null;
}

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-client-id": OURA_CLIENT_ID ?? "",
    "x-client-secret": OURA_CLIENT_SECRET ?? "",
  };
}

async function listSubscriptions(): Promise<OuraSubscription[]> {
  const res = await fetch(WEBHOOK_API, { headers: headers() });
  if (!res.ok) {
    console.error(`Oura webhook list failed (${res.status})`);
    return [];
  }
  const body = await res.json();
  // Tolerate either a bare array or a { data: [...] } envelope.
  if (Array.isArray(body)) return body as OuraSubscription[];
  if (Array.isArray(body?.data)) return body.data as OuraSubscription[];
  return [];
}

async function createSubscription(
  callbackUrl: string,
  eventType: string,
  dataType: string,
): Promise<OuraSubscription | null> {
  // Creating a subscription triggers Oura to GET callbackUrl for the
  // verification handshake (handled by /api/oura/webhook), so this only
  // succeeds against a live, correctly-configured callback.
  const res = await fetch(WEBHOOK_API, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      callback_url: callbackUrl,
      verification_token: OURA_WEBHOOK_TOKEN,
      event_type: eventType,
      data_type: dataType,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(
      `Oura webhook create failed for ${eventType}/${dataType} (${res.status}): ${detail}`,
    );
    return null;
  }
  return (await res.json()) as OuraSubscription;
}

async function renewSubscription(id: string): Promise<OuraSubscription | null> {
  const res = await fetch(`${WEBHOOK_API}/renew/${id}`, {
    method: "PUT",
    headers: headers(),
  });
  if (!res.ok) {
    console.error(`Oura webhook renew failed for ${id} (${res.status})`);
    return null;
  }
  return (await res.json()) as OuraSubscription;
}

async function deleteSubscription(client: SupabaseClient, id: string): Promise<void> {
  const res = await fetch(`${WEBHOOK_API}/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok && res.status !== 404) {
    console.error(`Oura webhook delete failed for ${id} (${res.status})`);
  }
  await client.from("oura_webhook_subscriptions").delete().eq("id", id);
}

/** Append the auth token to the callback URL as a query param. */
function withToken(callbackUrl: string): string {
  const u = new URL(callbackUrl);
  u.searchParams.set("token", OURA_WEBHOOK_TOKEN);
  return u.toString();
}

async function persist(
  client: SupabaseClient,
  sub: OuraSubscription,
): Promise<void> {
  const { error } = await client.from("oura_webhook_subscriptions").upsert(
    {
      id: sub.id,
      event_type: sub.event_type,
      data_type: sub.data_type,
      callback_url: sub.callback_url,
      expiration_time: sub.expiration_time ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) console.error("oura webhook persist failed", error);
}

/**
 * Make sure a webhook subscription exists for every data_type/event_type we
 * care about, and renew any that expire within a week. App-level (one set for
 * the whole Oura client), so this is safe to call repeatedly — typically from
 * the daily cron. No-op unless the client credentials are configured.
 */
export async function ensureOuraSubscriptions(
  client: SupabaseClient,
  callbackUrl: string,
): Promise<{ created: number; renewed: number; total: number }> {
  if (!OURA_CLIENT_ID || !OURA_CLIENT_SECRET || !OURA_WEBHOOK_TOKEN) {
    return { created: 0, renewed: 0, total: 0 };
  }

  const callbackWithToken = withToken(callbackUrl);
  const existing = await listSubscriptions();
  const byKey = new Map(
    existing.map((s) => [`${s.event_type}:${s.data_type}`, s]),
  );

  const renewBefore = Date.now() + 7 * 24 * 60 * 60 * 1000;
  let created = 0;
  let renewed = 0;

  for (const dataType of DATA_TYPES) {
    for (const eventType of EVENT_TYPES) {
      let found = byKey.get(`${eventType}:${dataType}`);

      // If an existing subscription points somewhere else (e.g. an old URL or
      // a rotated token), drop it so we recreate it with the current callback.
      if (found && found.callback_url !== callbackWithToken) {
        await deleteSubscription(client, found.id);
        found = undefined;
      }

      if (!found) {
        const sub = await createSubscription(callbackWithToken, eventType, dataType);
        if (sub) {
          await persist(client, sub);
          created++;
        }
        continue;
      }
      // Renew if expiring soon (or expiration unknown).
      const exp = found.expiration_time
        ? new Date(found.expiration_time).getTime()
        : 0;
      if (exp < renewBefore) {
        const sub = await renewSubscription(found.id);
        if (sub) {
          await persist(client, sub);
          renewed++;
        }
      } else {
        await persist(client, found);
      }
    }
  }

  return {
    created,
    renewed,
    total: DATA_TYPES.length * EVENT_TYPES.length,
  };
}

/** Map an Oura webhook data_type to whether it lands in our oura_daily mirror. */
export const WEBHOOK_DATA_TYPES = DATA_TYPES;
