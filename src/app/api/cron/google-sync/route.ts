import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { toDateString, addDays } from "@/lib/dates";
import { pushToCalendar, pullFromCalendar } from "@/lib/google/calendar";
import { syncOuraDaily } from "@/lib/oura/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily cron (configured in vercel.json) — runs both directions for every
 * connected user: pushes their plan to Google and pulls Google events back
 * into the app. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request): Promise<Response> {
  if (!process.env.CRON_SECRET) {
    console.error("google-sync cron: CRON_SECRET env var is not set");
    return NextResponse.json({ error: "Misconfigured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: tokenRows, error: tokenErr } = await admin
    .from("google_tokens")
    .select("user_id");
  if (tokenErr) {
    console.error("google-sync cron: failed to list connected users", tokenErr);
    return NextResponse.json({ error: tokenErr.message }, { status: 500 });
  }

  const today = new Date();
  const startDate = toDateString(today);
  const endDate = toDateString(addDays(today, 14));

  const results: { userId: string; ok: boolean; error?: string }[] = [];
  for (const row of tokenRows ?? []) {
    const userId = row.user_id as string;
    try {
      await pushToCalendar(admin, userId, startDate, endDate);
      await pullFromCalendar(admin, userId, startDate, endDate);
      results.push({ userId, ok: true });
    } catch (err) {
      results.push({
        userId,
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // Oura: refresh the last week of metrics for every connected ring. The
  // user sets aren't necessarily the same as the Google ones, so iterate
  // oura_tokens separately. Best-effort per user.
  const { data: ouraRows, error: ouraErr } = await admin
    .from("oura_tokens")
    .select("user_id");
  if (ouraErr) {
    console.error("google-sync cron: failed to list Oura users", ouraErr);
  }
  const ouraResults: { userId: string; ok: boolean; error?: string }[] = [];
  const ouraStart = toDateString(addDays(today, -7));
  const ouraEnd = toDateString(addDays(today, 1));
  for (const row of ouraRows ?? []) {
    const userId = row.user_id as string;
    try {
      await syncOuraDaily(admin, userId, ouraStart, ouraEnd);
      ouraResults.push({ userId, ok: true });
    } catch (err) {
      ouraResults.push({
        userId,
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json({
    ran: results.length,
    startDate,
    endDate,
    results,
    oura: { ran: ouraResults.length, results: ouraResults },
  });
}
