import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { toDateString, addDays } from "@/lib/dates";
import { syncOuraDaily, ensureOuraUserId } from "@/lib/oura/client";
import {
  ensureOuraSubscriptions,
  subscriptionsHealthy,
  OURA_WEBHOOK_TOKEN,
} from "@/lib/oura/webhooks";

/**
 * Pull the last 7 days of Oura data for the logged-in user. Called
 * fire-and-forget on app open and from the Settings "Sync now" button. Also
 * bootstraps push-notification (webhook) subscriptions so the integration
 * keeps itself fresh without waiting for the daily cron.
 */
export async function POST(req: Request): Promise<Response> {
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

  // Make sure this user's events can be routed back to them.
  await ensureOuraUserId(admin, user.id).catch((err) =>
    console.error("oura sync: ensureOuraUserId failed", err),
  );

  const today = new Date();
  const result = await syncOuraDaily(
    admin,
    user.id,
    toDateString(addDays(today, -7)),
    toDateString(addDays(today, 1)),
  );

  // Bootstrap/refresh app-level webhook subscriptions. The local health check
  // short-circuits in the common case, so we only hit Oura's API when they're
  // missing or about to expire.
  if (OURA_WEBHOOK_TOKEN && !(await subscriptionsHealthy(admin))) {
    const callbackUrl = `${new URL(req.url).origin}/api/oura/webhook`;
    await ensureOuraSubscriptions(admin, callbackUrl).catch((err) =>
      console.error("oura sync: ensureOuraSubscriptions failed", err),
    );
  }

  return NextResponse.json(result);
}
