import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { toDateString, addDays } from "@/lib/dates";
import { verifyState } from "@/lib/oauthState";
import { syncOuraDaily } from "@/lib/oura/client";
import { OURA_TOKEN_URL } from "@/lib/oura/tokens";

const OURA_CLIENT_ID = process.env.OURA_CLIENT_ID!;
const OURA_CLIENT_SECRET = process.env.OURA_CLIENT_SECRET!;

function getRedirectUri(req: Request): string {
  const url = new URL(req.url);
  return `${url.origin}/api/oura/callback`;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const userId = verifyState(url.searchParams.get("state"));
  const error = url.searchParams.get("error");

  if (error || !code || !userId) {
    return NextResponse.redirect(new URL("/?oura=error", req.url));
  }

  const tokenRes = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: OURA_CLIENT_ID,
      client_secret: OURA_CLIENT_SECRET,
      redirect_uri: getRedirectUri(req),
    }),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    console.error("[Oura OAuth] Token exchange failed:", errBody);
    const errUrl = new URL("/?oura=error", req.url);
    errUrl.searchParams.set("detail", errBody.slice(0, 200));
    return NextResponse.redirect(errUrl);
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  if (!tokens.refresh_token) {
    console.error("[Oura OAuth] No refresh_token returned");
    return NextResponse.redirect(new URL("/?oura=error", req.url));
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error: dbError } = await admin.from("oura_tokens").upsert(
    {
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (dbError) {
    console.error("[Oura OAuth] DB error:", dbError);
    return NextResponse.redirect(new URL("/?oura=error", req.url));
  }

  // Best-effort initial backfill (last 30 days) so the UI has data right away.
  try {
    const today = new Date();
    await syncOuraDaily(
      admin,
      userId,
      toDateString(addDays(today, -30)),
      toDateString(addDays(today, 1)),
    );
  } catch (err) {
    console.error("[Oura OAuth] Initial sync failed", err);
  }

  return NextResponse.redirect(new URL("/?oura=connected", req.url));
}
