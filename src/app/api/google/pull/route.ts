import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { toDateString, addDays } from "@/lib/dates";
import { pullFromCalendar } from "@/lib/google/calendar";

/**
 * Inbound pull for the logged-in user (today..+14). Called fire-and-forget by
 * the day view on open so Google → app stays fresh between daily cron runs.
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
  const result = await pullFromCalendar(
    admin,
    user.id,
    toDateString(today),
    toDateString(addDays(today, 14)),
  );
  return NextResponse.json(result);
}
