import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVITY_LABELS } from "@/config/constants";

/** Built-in + custom activity codes mapped to human labels. */
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
