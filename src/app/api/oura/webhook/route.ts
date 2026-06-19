import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { toDateString, addDays } from "@/lib/dates";
import { syncOuraDaily } from "@/lib/oura/client";
import { OURA_WEBHOOK_TOKEN } from "@/lib/oura/webhooks";

export const dynamic = "force-dynamic";

/**
 * Subscription verification handshake. When a subscription is created, Oura
 * GETs this URL with the verification_token we registered plus a challenge,
 * and expects the challenge echoed back as JSON.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("verification_token");
  const challenge = url.searchParams.get("challenge");

  if (!OURA_WEBHOOK_TOKEN || token !== OURA_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "Invalid verification token" }, { status: 403 });
  }
  return NextResponse.json({ challenge });
}

/** Constant-time check that the request carries our callback-URL secret. */
function tokenValid(req: Request): boolean {
  if (!OURA_WEBHOOK_TOKEN) return false;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const a = Buffer.from(token);
  const b = Buffer.from(OURA_WEBHOOK_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Best-effort HMAC check — logs on mismatch but doesn't reject (see POST). */
function signatureLooksValid(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
): boolean {
  const secret = process.env.OURA_CLIENT_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp ?? ""}${rawBody}`)
    .digest("hex");
  try {
    return (
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    );
  } catch {
    return false;
  }
}

interface WebhookEvent {
  event_type?: string;
  data_type?: string;
  object_id?: string;
  event_time?: string;
  user_id?: string; // Oura's user id
}

/**
 * Receive a webhook event. Oura POSTs ~30s after a phone sync, to the exact
 * callback URL we registered — which embeds ?token=OURA_WEBHOOK_TOKEN — so the
 * token gates forged requests. Beyond that we treat the payload only as a
 * hint: map the Oura user_id to our user and re-pull the recent window from
 * Oura's authenticated API (we never trust body data).
 */
export async function POST(req: Request): Promise<Response> {
  if (!tokenValid(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const rawBody = await req.text();

  if (
    !signatureLooksValid(
      rawBody,
      req.headers.get("x-oura-signature"),
      req.headers.get("x-oura-timestamp"),
    )
  ) {
    // Don't reject: the exact signing scheme can change and we re-fetch from
    // the authenticated API anyway. Surface it for monitoring.
    console.warn("Oura webhook: signature missing or mismatched");
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody) as WebhookEvent;
  } catch {
    return NextResponse.json({ ok: true }); // ack malformed payloads
  }

  const ouraUserId = event.user_id;
  if (!ouraUserId) return NextResponse.json({ ok: true });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: tokenRow } = await admin
    .from("oura_tokens")
    .select("user_id")
    .eq("oura_user_id", ouraUserId)
    .maybeSingle();

  // Unknown Oura user (not connected here, or oura_user_id not yet backfilled).
  if (!tokenRow) return NextResponse.json({ ok: true });

  // Re-pull a small recent window so we catch both the new day and any
  // overnight revisions, regardless of which data_type fired.
  const today = new Date();
  try {
    await syncOuraDaily(
      admin,
      tokenRow.user_id as string,
      toDateString(addDays(today, -2)),
      toDateString(addDays(today, 1)),
    );
  } catch (err) {
    console.error("Oura webhook sync failed", err);
  }

  return NextResponse.json({ ok: true });
}
