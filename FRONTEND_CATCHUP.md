# Life on Track — MCP Refactor Follow-up

**Context:** The 34 → 13 MCP tool consolidation (PR #9) is merged to `main`.
The schema delta is in `supabase/migrations/20260408_mcp_consolidation.sql`
(branch `claude/mcp-consolidation-migration`, not yet applied to Supabase).

This doc covers the remaining work: one DB step + four frontend gaps that
were intentionally deferred from the backend refactor.

---

## 0. Apply the Supabase migration (manual, blocking)

Nothing else in this doc works until the schema is live.

Run `supabase/migrations/20260408_mcp_consolidation.sql` against the project
database. Two ways:

- **Dashboard:** Supabase → SQL Editor → paste the file → run.
- **CLI:** `supabase db execute --file supabase/migrations/20260408_mcp_consolidation.sql`

The file is idempotent (wrapped in a transaction, `IF NOT EXISTS` guards,
seed uses `ON CONFLICT DO NOTHING`). Verify with:

```sql
select column_name from information_schema.columns
  where table_name = 'plans' and column_name = 'workout_templates';
select count(*) from exercises where user_id is null;  -- expect 33
select * from day_overrides limit 1;                   -- table exists
```

---

## 1. Frontend: stop reading exercises from hardcoded config

**Problem.** The backend now validates exercise names against the `exercises`
table, but the frontend dropdown in `WorkoutLogger` still reads from
`src/config/exercises.ts` via `src/hooks/useCustomTopics.ts`. New exercises
added via `manage_exercise` won't show up in the UI.

**Fix.** Add a new hook `src/hooks/useExercises.ts` that fetches from the
`exercises` table (presets + user-owned) and returns the same shape
`useCustomTopics` currently exposes for exercise data:

```ts
// Signature to match
{
  exercises: string[];          // all names, sorted
  byCategory: Record<string, string[]>;
  loading: boolean;
  addExercise: (name: string, category?: string) => Promise<void>;
  removeExercise: (name: string) => Promise<void>;
}
```

Query: `from("exercises").select("name, category, user_id").or("user_id.is.null,user_id.eq.<userId>")`.

**Wire it up in these files:**

- `src/hooks/useCustomTopics.ts` — remove `exercises` and `workoutExercises`
  from the return shape. Leave `activityLabels`, `gymOptions`, `prepOptions`
  alone (those still come from `custom_topics`).
- `src/components/DayLogger.tsx` — replace the destructured `exercises` /
  `workoutExercises` from `useCustomTopics` with values from the new
  `useExercises` hook. The `workoutExercises` map (gym_type → exercise list)
  should now come from `activePlan.workout_templates`, falling back to
  `WORKOUT_EXERCISES` from `@/config/exercises` only if the plan has no
  template for that gym type.
- `src/components/WorkoutLogger.tsx` — already reads `plan.workout_templates`
  (added in PR #9), so the main change is threading the new exercise list
  prop through correctly.
- **Delete** `EXERCISES` and `WORKOUT_EXERCISES` exports from
  `src/config/exercises.ts` once nothing references them. Keep `WORKOUT_META`
  (warmup/cardio per gym type) — that mapping isn't in the DB yet and
  shouldn't be changed in this pass.

**Tests.** Update `tests/unit/` only if anything breaks. Don't add DB-backed
tests for the new hook; the existing RLS tests cover the table.

---

## 2. Frontend: PlanManager UI for `workout_templates`

**Problem.** The plan schema now has a `workout_templates` jsonb column, but
`PlanManager.tsx` only edits `gym_schedule` and `prep_schedule`. Users have
to set templates via the MCP tool, which defeats the purpose of having a UI.

**Fix.** In `src/components/PlanManager.tsx`:

- Add a "Workout templates" section below the existing gym schedule editor.
- For each gym_type present in the plan's `gym_schedule` values (dedupe, skip
  `rst`), render an ordered, editable list of exercise names.
- Reuse the exercise list from the new `useExercises` hook (section 1) as
  the source for an add-exercise dropdown, with a "create new" option that
  calls `addExercise`.
- On save, include `workout_templates` in the `update` / `create` payload.
  `usePlans.ts` already accepts this field (added in PR #9) — no hook
  changes needed.

**UI shape.** Match the existing gym/prep schedule visual style (same card,
same spacing). Drag-to-reorder is not required — up/down arrows or a plain
reorderable list is fine.

---

## 3. Frontend: day override UI (swap-a-day button)

**Problem.** The `day_overrides` table exists and `override_gym_day` MCP
tool works, but there's no UI to trigger it. The frontend already reads
overrides via `useDayOverride` hook (added in PR #9) and renders the correct
workout panel when an override exists, but the user can't actually set one
from the app.

**Fix.** In `src/components/DayLogger.tsx`, next to the date/gym label area:

- Add a small "Swap workout" button, visible on any day.
- Clicking opens a dropdown of gym types (reuse `gymOptions` from
  `useCustomTopics`) plus a "Clear override" option.
- Selecting a value calls a new `setOverride(gymType | null)` method added
  to `useDayOverride`:
  ```ts
  async function setOverride(gymType: string | null) {
    if (gymType === null) {
      await supabase.from("day_overrides").delete()
        .eq("user_id", userId).eq("date", dateStr);
    } else {
      await supabase.from("day_overrides").upsert(
        { user_id: userId, date: dateStr, gym_type: gymType },
        { onConflict: "user_id,date" },
      );
    }
    await load();
  }
  ```
- Show a visual marker (e.g. small badge) when an override is active so the
  user knows this day differs from the recurring plan.

No backend changes — `day_overrides` is already wired through
`getActivitiesForDate`, `getGymType`, `isWorkoutDay`, and `WorkoutLogger`.

---

## 4. Cleanup: `src/config/exercises.ts`

After sections 1 and 2 land, this file should contain only `WORKOUT_META`
(warmup/cardio mapping by gym type). The `EXERCISES` const and
`WORKOUT_EXERCISES` const should be deleted along with their imports.

Grep to confirm nothing references them:

```bash
grep -rn "EXERCISES\|WORKOUT_EXERCISES" src/ tests/
```

Any remaining references belong to `WORKOUT_META` (different symbol) or
need to be updated.

---

## Verification checklist

Before opening the PR:

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run test` — 49+ tests pass
- [ ] `npm run lint` — no new warnings
- [ ] `npm run build` — clean
- [ ] Manual: create a new plan with workout templates via the UI, then
      call `get_day` via MCP and confirm `plan.exercises` returns the
      template.
- [ ] Manual: add a custom exercise via the UI (section 1), confirm it
      appears in a fresh `manage_exercise` list call.
- [ ] Manual: swap Wednesday's workout to "Push" via the new UI, confirm
      `get_day` for that date returns `plan.override: true` and the push
      template exercises.

---

## Out of scope (do not touch)

- `WORKOUT_META` (warmup/cardio) — stays hardcoded for now. Moving it to
  the DB is a separate piece of work.
- `custom_topics` table — activities and gym_types still live here; only
  the `exercise` category is being migrated out.
- MCP tool definitions — all 13 tools are stable and live on main.
- Widget system — unrelated to this refactor.
