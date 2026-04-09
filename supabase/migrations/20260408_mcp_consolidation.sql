-- Migration: consolidate MCP tools + add exercise catalog + day overrides
--
-- Apply to Supabase via the SQL editor, or via `supabase db execute`.
-- Safe to re-run: additive only, uses IF NOT EXISTS / ON CONFLICT DO NOTHING
-- guards where possible.
--
-- Ships with the 34 → 13 MCP tool refactor. See supabase-schema.sql for the
-- canonical full schema — this file is the delta from the pre-refactor state.

begin;

-- 1) Add workout_templates column to plans.
-- Lets `get_day` return "what exercises make up today's workout" without a
-- second call. Defaults to {} so existing plans need no backfill.
alter table plans
  add column if not exists workout_templates jsonb not null default '{}';

-- 2) Exercise catalog. Replaces the hardcoded list in src/config/exercises.ts
-- so new exercises can be added via the manage_exercise MCP tool without a
-- code deploy. Rows with user_id = null are preset/built-in.
create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  category text,
  created_at timestamptz default now(),
  unique (user_id, name)
);

create index if not exists idx_exercises_user on exercises(user_id);

alter table exercises enable row level security;

-- RLS: anyone can read presets and their own; users can only write their own.
drop policy if exists "read presets or own exercises" on exercises;
create policy "read presets or own exercises" on exercises for select
  using (user_id is null or auth.uid() = user_id);

drop policy if exists "insert own exercises" on exercises;
create policy "insert own exercises" on exercises for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own exercises" on exercises;
create policy "update own exercises" on exercises for update
  using (auth.uid() = user_id);

drop policy if exists "delete own exercises" on exercises;
create policy "delete own exercises" on exercises for delete
  using (auth.uid() = user_id);

-- Preset seed. Categories: push, pull, legs_heavy, legs_light, shared,
-- warmup, cardio. Safe to re-run because of the unique (user_id, name)
-- constraint + ON CONFLICT DO NOTHING.
insert into exercises (user_id, name, category) values
  (null, 'Incline Dumbbell Press', 'push'),
  (null, 'Overhead Dumbbell Press', 'push'),
  (null, 'Cable Pec Flies', 'push'),
  (null, 'Lateral Raises', 'push'),
  (null, 'Tricep Exercise', 'push'),
  (null, 'Cable Tricep Extension', 'push'),
  (null, 'Overhead Cable Tricep Extension', 'push'),
  (null, 'Cable Tricep Pushdown', 'push'),
  (null, 'Dumbbell Rows', 'pull'),
  (null, 'Pull-ups', 'pull'),
  (null, 'Seated Cable Row', 'pull'),
  (null, 'Bicep Exercise', 'pull'),
  (null, 'Dumbbell Squats', 'legs_heavy'),
  (null, 'RDLs', 'legs_heavy'),
  (null, 'Wrist Curls', 'legs_heavy'),
  (null, 'Leg Raises', 'legs_heavy'),
  (null, 'Lunges', 'legs_light'),
  (null, 'Leg Extensions', 'legs_light'),
  (null, 'Leg Curls', 'legs_light'),
  (null, 'Single Leg Bridges', 'legs_light'),
  (null, 'Calf Raises', 'shared'),
  (null, 'Other', 'shared'),
  (null, 'External Rotations', 'warmup'),
  (null, 'Band Pull-Aparts', 'warmup'),
  (null, 'Side Plank Leg Raises', 'warmup'),
  (null, 'Hip Flexor Stretch', 'warmup'),
  (null, 'Woodchoppers', 'warmup'),
  (null, 'Face Pulls', 'warmup'),
  (null, 'Pushups', 'warmup'),
  (null, 'IT Band Stretch', 'warmup'),
  (null, 'Run', 'cardio'),
  (null, 'Stairmaster', 'cardio'),
  (null, 'Incline Walk', 'cardio')
on conflict do nothing;

-- 3) Day overrides. Per-date gym-type swap without touching plan.gym_schedule.
-- Lets the user swap Monday's push to Wednesday without breaking the
-- recurring schedule. Frontend + MCP tools check overrides first.
create table if not exists day_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  gym_type text not null,
  created_at timestamptz default now(),
  unique (user_id, date)
);

create index if not exists idx_day_overrides_user_date on day_overrides(user_id, date);

alter table day_overrides enable row level security;

drop policy if exists "own overrides" on day_overrides;
create policy "own overrides" on day_overrides for all
  using (auth.uid() = user_id);

commit;

-- Optional post-migration data step: populate workout_templates on an
-- existing plan. Skip if you'd rather set it via `manage_plan` action=update.
--
-- update plans
-- set workout_templates = '{
--   "psh": ["Incline Dumbbell Press", "Overhead Dumbbell Press", "Cable Pec Flies", "Lateral Raises", "Cable Tricep Extension"],
--   "pll": ["Pull-ups", "Seated Cable Row", "Face Pulls", "Bicep Exercise"],
--   "lgh": ["Dumbbell Squats", "RDLs", "Leg Raises", "Calf Raises"],
--   "lgl": ["Lunges", "Leg Extensions", "Leg Curls", "Calf Raises"],
--   "yga": []
-- }'::jsonb
-- where id = '<your-plan-id>';
