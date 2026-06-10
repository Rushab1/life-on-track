-- Oura Ring integration: OAuth token storage + read-only daily metrics mirror
-- (sleep / readiness / activity scores and key vitals per day).
--
-- Idempotent: IF NOT EXISTS / additive guards, safe to re-run.

begin;

-- 1) OAuth tokens (Oura deprecated personal access tokens in Dec 2025 —
--    OAuth2 is the only auth path). One row per connected user.
create table if not exists oura_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table oura_tokens enable row level security;

drop policy if exists "own oura tokens" on oura_tokens;
create policy "own oura tokens" on oura_tokens
  for all using (auth.uid() = user_id);

-- 2) Daily metrics pulled from the Oura API v2 (one row per user per day).
create table if not exists oura_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  sleep_score int,
  readiness_score int,
  activity_score int,
  total_sleep_minutes int,
  sleep_efficiency int,
  avg_hrv numeric,
  resting_hr numeric,
  temperature_deviation numeric,
  steps int,
  active_calories int,
  total_calories int,
  last_synced_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists idx_oura_daily_user_date
  on oura_daily(user_id, date);

alter table oura_daily enable row level security;

drop policy if exists "own oura daily" on oura_daily;
create policy "own oura daily" on oura_daily
  for all using (auth.uid() = user_id);

commit;
