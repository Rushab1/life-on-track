/**
 * Exercises to show outside the plan's warmup/main/cardio lists: anything
 * logged for the day (in first-logged order) plus any the user picked from
 * the "add other" menu, skipping ones the plan already shows.
 */
export function getOtherExercises(
  planned: string[],
  logged: { exercise: string }[],
  picked: string[]
): string[] {
  const seen = new Set(planned);
  const result: string[] = [];
  for (const name of [...logged.map((s) => s.exercise), ...picked]) {
    if (seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}
