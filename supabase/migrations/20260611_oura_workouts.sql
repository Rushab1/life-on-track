-- Oura expansion: workout sessions + activity intensity breakdown.
--
-- Idempotent: IF NOT EXISTS / additive guards, safe to re-run.

begin;

-- 1) Intensity minutes on the daily row (from daily_activity).
alter table oura_daily
  add column if not exists high_activity_minutes int,
  add column if not exists medium_activity_minutes int,
  add column if not exists low_activity_minutes int;

-- 2) Workout sessions detected/logged by the ring (one row per session).
create table if not exists oura_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  oura_workout_id text not null,
  date date not null,
  activity text,
  intensity text,          -- easy / moderate / hard
  calories numeric,
  distance numeric,        -- meters
  start_time timestamptz,
  end_time timestamptz,
  source text,             -- autodetected / manual / confirmed / workout_heart_rate
  label text,
  last_synced_at timestamptz not null default now(),
  unique (user_id, oura_workout_id)
);

create index if not exists idx_oura_workouts_user_date
  on oura_workouts(user_id, date);

alter table oura_workouts enable row level security;

drop policy if exists "own oura workouts" on oura_workouts;
create policy "own oura workouts" on oura_workouts
  for all using (auth.uid() = user_id);

commit;
