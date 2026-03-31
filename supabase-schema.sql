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
