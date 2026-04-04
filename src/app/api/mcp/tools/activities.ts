import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVITY_LABELS } from "@/config/constants";
import { getActivitiesForDate } from "@/config/schedule";
import type { ActivityCompletion, Plan } from "@/lib/types";
import { dateSchema, safeErrorMessage } from "../validation";

/** Get all known activity codes: built-in + custom topics. */
async function getKnownActivities(client: SupabaseClient, userId: string): Promise<Record<string, string>> {
  const base = { ...ACTIVITY_LABELS };
  const { data } = await client.from("custom_topics")
    .select("code, label")
    .eq("user_id", userId)
    .in("category", ["activity", "gym_type"]);
  for (const t of data ?? []) {
    base[t.code] = t.label;
  }
  return base;
}

/** Validate an activity code. Returns matched code or error with suggestions. */
function validateActivity(
  code: string,
  known: Record<string, string>
): { valid: true; code: string } | { valid: false; message: string } {
  // Exact match
  if (known[code]) return { valid: true, code };

  // Case-insensitive match on code
  const lowerCode = code.toLowerCase();
  const exactKey = Object.keys(known).find((k) => k.toLowerCase() === lowerCode);
  if (exactKey) return { valid: true, code: exactKey };

  // Match by label (user says "leetcode" instead of "lc")
  const byLabel = Object.entries(known).find(([, label]) =>
    label.toLowerCase() === lowerCode || label.toLowerCase().replace(/[\/\s]+/g, "").includes(lowerCode.replace(/[\/\s]+/g, ""))
  );
  if (byLabel) return { valid: true, code: byLabel[0] };

  // Suggest similar
  const suggestions = Object.entries(known)
    .filter(([k, v]) => {
      const kl = k.toLowerCase();
      const vl = v.toLowerCase();
      return kl.includes(lowerCode) || lowerCode.includes(kl) || vl.includes(lowerCode) || lowerCode.includes(vl);
    })
    .map(([k, v]) => `${k} (${v})`);

  if (suggestions.length > 0) {
    return { valid: false, message: `Unknown activity "${code}". Did you mean: ${suggestions.join(", ")}?` };
  }
  const allCodes = Object.entries(known).map(([k, v]) => `${k} (${v})`).join(", ");
  return { valid: false, message: `Unknown activity "${code}". Valid codes: ${allCodes}` };
}

export function registerActivityTools(server: McpServer, client: SupabaseClient, userId: string) {
  server.tool(
    "get_activities",
    "Get activity completions for a date, including what's scheduled by the plan. Returns both scheduled and ad-hoc activities with their completion status. Activities are independent of plans — plans define the schedule, but completions are tracked separately.",
    { date: dateSchema.describe("Date in YYYY-MM-DD format") },
    async ({ date }) => {
      const [completionsRes, planRes] = await Promise.all([
        client.from("activity_completions").select("*").eq("user_id", userId).eq("date", date),
        client.from("plans").select("*").eq("user_id", userId).lte("start_date", date).gte("end_date", date).limit(1).single(),
      ]);

      const { data, error } = completionsRes;
      if (error) {
        return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      }

      const plan = planRes.data as Plan | null;
      const scheduled = getActivitiesForDate(new Date(date + "T00:00:00"), plan);
      const completions = (data ?? []) as ActivityCompletion[];
      const completionMap: Record<string, { completed: boolean; notes: string | null }> = {};
      for (const c of completions) {
        completionMap[c.activity_type] = { completed: c.completed, notes: c.notes };
      }

      const summary = scheduled.map((act) => {
        const status = completionMap[act];
        return {
          activity: act, label: ACTIVITY_LABELS[act] ?? act,
          scheduled: true, completed: status?.completed ?? false, notes: status?.notes ?? null,
        };
      });

      for (const c of completions) {
        if (!scheduled.includes(c.activity_type)) {
          summary.push({
            activity: c.activity_type, label: ACTIVITY_LABELS[c.activity_type] ?? c.activity_type,
            scheduled: false, completed: c.completed, notes: c.notes,
          });
        }
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
    }
  );

  server.tool(
    "toggle_activity",
    "Toggle an activity's completion status for a date",
    {
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      activity_type: z.string().max(50).describe("Activity type code. Gym types: psh (Push), pll (Pull), lgh (Legs Heavy), lgl (Legs Light), yga (Yoga), rst (Rest). Prep activities: lc (LeetCode), ml (ML/AI), sd (System Design), beh (Behavioral), oss (FastMCP), vln (Violin), dte (Date Night), mck (Mock Interview), out (Outdoor Activity). Users can also create custom codes."),
    },
    async ({ date, activity_type }) => {
      const known = await getKnownActivities(client, userId);
      const check = validateActivity(activity_type, known);
      if (!check.valid) return { content: [{ type: "text" as const, text: check.message }] };

      const { data: existing } = await client
        .from("activity_completions")
        .select("completed")
        .eq("user_id", userId)
        .eq("date", date)
        .eq("activity_type", check.code)
        .single();

      const newVal = !(existing?.completed ?? false);
      const { error } = await client.from("activity_completions").upsert(
        { user_id: userId, date, activity_type: check.code, completed: newVal },
        { onConflict: "user_id,date,activity_type" }
      );

      if (error) return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      const label = known[check.code] ?? check.code;
      return { content: [{ type: "text" as const, text: `${label} marked as ${newVal ? "completed" : "not completed"} for ${date}.` }] };
    }
  );

  server.tool(
    "complete_activities",
    "Mark multiple activities as completed for a date. All activity codes must be valid — if any are unknown, the entire request is rejected with suggestions.",
    {
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      activity_types: z.array(z.string().max(50)).max(50).describe("Activity type codes to mark complete. See toggle_activity for valid codes."),
    },
    async ({ date, activity_types }) => {
      const known = await getKnownActivities(client, userId);
      const resolved: string[] = [];
      const errors: string[] = [];
      for (const at of activity_types) {
        const check = validateActivity(at, known);
        if (check.valid) resolved.push(check.code);
        else errors.push(check.message);
      }
      if (errors.length > 0) {
        return { content: [{ type: "text" as const, text: errors.join("\n") }] };
      }

      const rows = resolved.map((at) => ({
        user_id: userId, date, activity_type: at, completed: true,
      }));
      const { error } = await client.from("activity_completions").upsert(rows, {
        onConflict: "user_id,date,activity_type",
      });

      if (error) return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      const labels = resolved.map((at) => known[at] ?? at);
      return { content: [{ type: "text" as const, text: `Marked as completed for ${date}: ${labels.join(", ")}.` }] };
    }
  );

  server.tool(
    "set_activity_note",
    "Add or update a note on an activity for a date",
    {
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      activity_type: z.string().max(50).describe("Activity type code. See toggle_activity for valid codes."),
      note: z.string().max(5000).describe("Note text"),
    },
    async ({ date, activity_type, note }) => {
      const known = await getKnownActivities(client, userId);
      const check = validateActivity(activity_type, known);
      if (!check.valid) return { content: [{ type: "text" as const, text: check.message }] };

      const { error } = await client.from("activity_completions").upsert(
        { user_id: userId, date, activity_type: check.code, completed: true, notes: note || null },
        { onConflict: "user_id,date,activity_type" }
      );

      if (error) return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      const label = known[check.code] ?? check.code;
      return { content: [{ type: "text" as const, text: `Note saved for ${label} on ${date}: "${note}"` }] };
    }
  );

  server.tool(
    "delete_activity",
    "Delete an activity completion for a date. Removes the completion record entirely — the activity will show as not completed if it's still scheduled by the plan. Also works to remove ad-hoc activities that were added outside the plan.",
    {
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      activity_type: z.string().max(50).describe("Activity type code to delete. See toggle_activity for valid codes."),
    },
    async ({ date, activity_type }) => {
      const { error } = await client
        .from("activity_completions")
        .delete()
        .eq("user_id", userId)
        .eq("date", date)
        .eq("activity_type", activity_type);

      if (error) {
        return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      }
      const label = ACTIVITY_LABELS[activity_type] ?? activity_type;
      return { content: [{ type: "text" as const, text: `Deleted ${label} completion for ${date}.` }] };
    }
  );

  server.tool(
    "delete_all_exercises",
    "Delete ALL workout sets for a specific exercise on a date. Use this to remove an entire exercise from the day's log (e.g. all sets of 'Pull-ups' on 2026-04-03).",
    {
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      exercise: z.string().max(200).describe("Exercise name to delete all sets for"),
    },
    async ({ date, exercise }) => {
      const { error } = await client
        .from("workout_sets")
        .delete()
        .eq("user_id", userId)
        .eq("date", date)
        .eq("exercise", exercise);

      if (error) {
        return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      }
      return { content: [{ type: "text" as const, text: `Deleted ${exercise} sets for ${date}.` }] };
    }
  );
}
