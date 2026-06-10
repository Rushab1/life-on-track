import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { toDateString, addDays } from "@/lib/dates";
import { syncOuraDaily } from "@/lib/oura/client";

/**
 * Pull the last 7 days of Oura data for the logged-in user. Called
 * fire-and-forget on app open and from the Settings "Sync now" button.
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

  const today = new Date();
  const result = await syncOuraDaily(
    admin,
    user.id,
    toDateString(addDays(today, -7)),
    toDateString(addDays(today, 1)),
  );
  return NextResponse.json(result);
}
