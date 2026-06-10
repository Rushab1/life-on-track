import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Disconnect Google Calendar: revoke the grant at Google (so the tokens are
 * dead, not just forgotten), then delete the stored row. Revocation is
 * best-effort — the row is deleted either way.
 */
export async function POST(): Promise<Response> {
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

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: row } = await admin
    .from("google_tokens")
    .select("access_token, refresh_token")
    .eq("user_id", user.id)
    .maybeSingle();

  if (row) {
    // Revoking either token kills the whole grant.
    const token = (row.refresh_token as string) || (row.access_token as string);
    if (token) {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      }).catch((err) => console.error("Google revoke failed", err));
    }
  }

  await admin.from("google_tokens").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
