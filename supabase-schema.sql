create table daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  pain_level smallint check (pain_level between 0 and 10),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, date)
);

create table activity_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  activity_type text not null,
  completed boolean default true,
  notes text,
  created_at timestamptz default now(),
  unique (user_id, date, activity_type)
);

create table workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  exercise text not null,
  sets smallint,
  reps smallint,
  weight_lbs numeric(6,2),
  duration_mins numeric(5,1),
  notes text,
  created_at timestamptz default now()
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  gym_schedule jsonb not null default '{}',
  prep_schedule jsonb not null default '{}',
  workout_templates jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table daily_logs enable row level security;
alter table activity_completions enable row level security;
alter table workout_sets enable row level security;

create policy "own data" on daily_logs for all using (auth.uid() = user_id);
create policy "own data" on activity_completions for all using (auth.uid() = user_id);
alter table plans enable row level security;

create policy "own data" on workout_sets for all using (auth.uid() = user_id);
create policy "own data" on plans for all using (auth.uid() = user_id);

-- MCP token management
create table mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  token_hash text not null,
  last_used_at timestamptz,
  revoked boolean default false,
  created_at timestamptz default now()
);

alter table mcp_tokens enable row level security;
create policy "own tokens" on mcp_tokens for all using (auth.uid() = user_id);

create table custom_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  category text not null check (category in ('exercise', 'activity', 'gym_type')),
  code text not null,
  label text not null,
  created_at timestamptz default now(),
  unique(user_id, category, code)
);

alter table custom_topics enable row level security;
create policy "own data" on custom_topics for all using (auth.uid() = user_id);

-- Google Calendar OAuth tokens
create table google_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  calendar_id text not null default 'primary',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table google_tokens enable row level security;
create policy "own tokens" on google_tokens for all using (auth.uid() = user_id);
-- Ad-hoc life events (conferences, trips, appointments, etc.)
create table life_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  title text not null,
  notes text,
  created_at timestamptz default now()
);

create index idx_life_events_user_date on life_events(user_id, date);

alter table life_events enable row level security;
create policy "own events" on life_events for all using (auth.uid() = user_id);

-- Configurable widget system
create table widget_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('slider', 'counter', 'boolean', 'text', 'select')),
  config jsonb not null default '{}',
  scope text not null default 'daily' check (scope in ('daily', 'activity', 'global')),
  activity_filter text[],
  preset boolean default false,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table widget_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  widget_id uuid references widget_definitions(id) on delete cascade not null,
  date date not null,
  activity_type text,
  value jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Coalesce NULL activity_type for uniqueness (NULL != NULL in Postgres)
create unique index idx_widget_values_upsert
  on widget_values(user_id, widget_id, date, coalesce(activity_type, ''));

create index idx_widget_values_user_date on widget_values(user_id, date);
create index idx_widget_definitions_user on widget_definitions(user_id);

alter table widget_definitions enable row level security;
alter table widget_values enable row level security;

create policy "read presets or own" on widget_definitions for select
  using (user_id is null or auth.uid() = user_id);
create policy "manage own" on widget_definitions for insert
  with check (auth.uid() = user_id);
create policy "update own" on widget_definitions for update
  using (auth.uid() = user_id);
create policy "delete own" on widget_definitions for delete
  using (auth.uid() = user_id);

create policy "own values" on widget_values for all
  using (auth.uid() = user_id);

-- Canonical exercise catalog (replaces hardcoded list in app code).
-- Entries with user_id = null are preset/built-in; user-owned rows are personal.
create table exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  category text,
  created_at timestamptz default now(),
  unique (user_id, name)
);

create index idx_exercises_user on exercises(user_id);

alter table exercises enable row level security;
create policy "read presets or own exercises" on exercises for select
  using (user_id is null or auth.uid() = user_id);
create policy "insert own exercises" on exercises for insert
  with check (auth.uid() = user_id);
create policy "update own exercises" on exercises for update
  using (auth.uid() = user_id);
create policy "delete own exercises" on exercises for delete
  using (auth.uid() = user_id);

-- Preset seed data (user_id is null). Categories: push, pull, legs_heavy,
-- legs_light, shared, warmup, cardio. Safe to re-run.
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

-- Per-date override of the plan's gym type. Lets a user swap Monday's push to
-- Wednesday without mutating the recurring plan. Frontend and MCP tools check
-- overrides before falling back to plan.gym_schedule[day_of_week].
create table day_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  gym_type text not null,
  created_at timestamptz default now(),
  unique (user_id, date)
);

create index idx_day_overrides_user_date on day_overrides(user_id, date);

alter table day_overrides enable row level security;
create policy "own overrides" on day_overrides for all
  using (auth.uid() = user_id);
