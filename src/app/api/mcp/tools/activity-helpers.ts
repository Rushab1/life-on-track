import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVITY_LABELS } from "@/config/constants";

/** Plan fields that define activity/gym codes (a subset of the Plan row). */
interface PlanCodeSource {
  gym_schedule?: Record<string, string> | null;
  prep_schedule?: Record<string, string[]> | null;
  workout_templates?: Record<string, unknown> | null;
  workout_meta?: Record<string, unknown> | null;
}

/**
 * Every activity/gym code referenced by a set of plans: gym types from the
 * weekly schedule and workout catalogs, plus prep activities. These are the
 * codes get_day schedules, so save_day must accept them too. Pure — unit
 * testable without a database.
 */
export function planActivityCodes(plans: PlanCodeSource[]): string[] {
  const codes = new Set<string>();
  for (const p of plans) {
    for (const code of Object.values(p.gym_schedule ?? {})) {
      if (typeof code === "string" && code) codes.add(code);
    }
    for (const arr of Object.values(p.prep_schedule ?? {})) {
      if (Array.isArray(arr)) {
        for (const code of arr) if (typeof code === "string" && code) codes.add(code);
      }
    }
    for (const code of Object.keys(p.workout_templates ?? {})) codes.add(code);
    for (const code of Object.keys(p.workout_meta ?? {})) codes.add(code);
  }
  return Array.from(codes);
}

/** Built-in + custom + plan-defined activity codes mapped to human labels. */
export async function getKnownActivities(
  client: SupabaseClient,
  userId: string,
): Promise<Record<string, string>> {
  const base: Record<string, string> = { ...ACTIVITY_LABELS };
  const { data } = await client
    .from("custom_topics")
    .select("code, label")
    .eq("user_id", userId)
    .in("category", ["activity", "gym_type"]);
  for (const t of data ?? []) {
    base[t.code] = t.label;
  }

  // Gym types and prep codes introduced by the user's plans (e.g. an
  // Upper/Lower split's "up2") live only on the plan row, not in
  // ACTIVITY_LABELS or custom_topics — but get_day schedules them, so they
  // must be writable. Label falls back to the code when none is defined.
  const { data: plans } = await client
    .from("plans")
    .select("gym_schedule, prep_schedule, workout_templates, workout_meta")
    .eq("user_id", userId);
  for (const code of planActivityCodes((plans ?? []) as PlanCodeSource[])) {
    if (!base[code]) base[code] = code;
  }

  return base;
}

/** Validate an activity code. Returns matched code or an error message. */
export function validateActivity(
  code: string,
  known: Record<string, string>,
): { valid: true; code: string } | { valid: false; message: string } {
  if (known[code]) return { valid: true, code };

  const lowerCode = code.toLowerCase();
  const exactKey = Object.keys(known).find(
    (k) => k.toLowerCase() === lowerCode,
  );
  if (exactKey) return { valid: true, code: exactKey };

  const byLabel = Object.entries(known).find(
    ([, label]) =>
      label.toLowerCase() === lowerCode ||
      label
        .toLowerCase()
        .replace(/[\/\s]+/g, "")
        .includes(lowerCode.replace(/[\/\s]+/g, "")),
  );
  if (byLabel) return { valid: true, code: byLabel[0] };

  const suggestions = Object.entries(known)
    .filter(([k, v]) => {
      const kl = k.toLowerCase();
      const vl = v.toLowerCase();
      return (
        kl.includes(lowerCode) ||
        lowerCode.includes(kl) ||
        vl.includes(lowerCode) ||
        lowerCode.includes(vl)
      );
    })
    .map(([k, v]) => `${k} (${v})`);

  if (suggestions.length > 0) {
    return {
      valid: false,
      message: `Unknown activity "${code}". Did you mean: ${suggestions.join(", ")}?`,
    };
  }
  const allCodes = Object.entries(known)
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");
  return {
    valid: false,
    message: `Unknown activity "${code}". Valid codes: ${allCodes}`,
  };
}
