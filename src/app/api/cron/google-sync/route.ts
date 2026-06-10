import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { toDateString, addDays } from "@/lib/dates";
import { pushToCalendar, pullFromCalendar } from "@/lib/google/calendar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily cron (configured in vercel.json) — runs both directions for every
 * connected user: pushes their plan to Google and pulls Google events back
 * into the app. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request): Promise<Response> {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: tokenRows } = await admin
    .from("google_tokens")
    .select("user_id");

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

  return NextResponse.json({ ran: results.length, startDate, endDate, results });
}
