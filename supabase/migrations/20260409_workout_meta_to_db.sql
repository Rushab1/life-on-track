-- Migration: move WORKOUT_META (warmup + cardio per gym type) into the DB.
--
-- Removes the last hardcoded exercise data in the codebase
-- (src/config/exercises.ts WORKOUT_META). The mapping now lives on
-- plans.workout_meta as jsonb so users can edit it via the PlanManager UI
-- and MCP clients (e.g. Claude Desktop) can read warmup + cardio via
-- get_day / manage_plan instead of being blind to it.
--
-- Idempotent: additive only, ON CONFLICT / IF NOT EXISTS guards.

begin;

-- 1) workout_meta column on plans.
alter table plans
  add column if not exists workout_meta jsonb not null default '{}';

-- 2) Backfill any existing plan that still has the default empty value with
-- the old WORKOUT_META content. Skips plans that already set their own.
update plans
set workout_meta = '{
  "psh": {"warmup": ["External Rotations", "Band Pull-Aparts"], "cardio": ["Run"]},
  "lgh": {"warmup": ["Side Plank Leg Raises", "Hip Flexor Stretch"], "cardio": ["Stairmaster"]},
  "pll": {"warmup": ["Woodchoppers", "Face Pulls"], "cardio": ["Run"]},
  "lgl": {"warmup": ["Pushups", "IT Band Stretch"], "cardio": ["Incline Walk"]},
  "yga": {"warmup": [], "cardio": []},
  "rst": {"warmup": [], "cardio": []}
}'::jsonb
where workout_meta is null or workout_meta = '{}'::jsonb;

commit;
