import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Get all known exercise names for a user: preset rows, user-owned rows, and
 * recent history (bounded). Sourced from the exercises table plus a capped
 * scan of workout_sets.
 */
export async function getKnownExercises(
  client: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const [catalogRes, historyRes] = await Promise.all([
    client
      .from("exercises")
      .select("name")
      .or(`user_id.is.null,user_id.eq.${userId}`),
    client
      .from("workout_sets")
      .select("exercise")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const catalog = (catalogRes.data ?? []).map((r: { name: string }) => r.name);
  const historical = Array.from(
    new Set(
      (historyRes.data ?? []).map((r: { exercise: string }) => r.exercise),
    ),
  );

  return Array.from(new Set([...catalog, ...historical]));
}

/** Find similar exercises by case-insensitive substring / word matching. */
export function findSimilar(input: string, known: string[]): string[] {
  const lower = input.toLowerCase();
  const exact = known.find((k) => k.toLowerCase() === lower);
  if (exact) return [exact];

  const matches = known.filter((k) => {
    const kl = k.toLowerCase();
    return kl.includes(lower) || lower.includes(kl);
  });
  if (matches.length > 0) return matches;

  const inputWords = lower.split(/[\s\-]+/).filter((w) => w.length > 2);
  return known.filter((k) => {
    const kWords = k.toLowerCase().split(/[\s\-]+/);
    return inputWords.some((w) =>
      kWords.some((kw) => kw.includes(w) || w.includes(kw)),
    );
  });
}

/** Validate an exercise name against the known list. */
export function validateExercise(
  exercise: string,
  known: string[],
): { valid: true; name: string } | { valid: false; message: string } {
  const exactMatch = known.find(
    (k) => k.toLowerCase() === exercise.toLowerCase(),
  );
  if (exactMatch) return { valid: true, name: exactMatch };

  const similar = findSimilar(exercise, known);
  if (similar.length > 0) {
    return {
      valid: false,
      message: `Unknown exercise "${exercise}". Did you mean: ${similar
        .map((s) => `"${s}"`)
        .join(", ")}? Use manage_exercise with action="add" to create a new one, or retry with the exact name.`,
    };
  }
  return {
    valid: false,
    message: `Unknown exercise "${exercise}". No similar exercises found. Call manage_exercise with action="list" to see all known exercises, or action="add" to create this one.`,
  };
}
