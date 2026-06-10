import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Disconnect Oura: revoke the access token at Oura (best-effort), then
 * delete the stored row. Synced oura_daily rows are kept — they're the
 * user's history.
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
    .from("oura_tokens")
    .select("access_token")
    .eq("user_id", user.id)
    .maybeSingle();

  if (row?.access_token) {
    await fetch(
      `https://api.ouraring.com/oauth/revoke?access_token=${encodeURIComponent(
        row.access_token as string,
      )}`,
      { method: "POST" },
    ).catch((err) => console.error("Oura revoke failed", err));
  }

  await admin.from("oura_tokens").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
