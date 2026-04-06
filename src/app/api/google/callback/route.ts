import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

function getRedirectUri(req: Request): string {
  const url = new URL(req.url);
  return `${url.origin}/api/google/callback`;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const userId = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code || !userId) {
    return NextResponse.redirect(new URL("/?google=error", req.url));
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: getRedirectUri(req),
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    console.error("[Google OAuth] Token exchange failed:", errBody);
    console.error("[Google OAuth] redirect_uri used:", getRedirectUri(req));
    return NextResponse.redirect(new URL("/?google=error", req.url));
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  if (!tokens.refresh_token) {
    console.error("[Google OAuth] No refresh_token returned");
    return NextResponse.redirect(new URL("/?google=error", req.url));
  }

  // Store tokens using service role (we verified the user via the state param)
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error: dbError } = await adminClient.from("google_tokens").upsert(
    {
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (dbError) {
    console.error("[Google OAuth] DB error:", dbError);
    return NextResponse.redirect(new URL("/?google=error", req.url));
  }

  return NextResponse.redirect(new URL("/?google=connected", req.url));
}
