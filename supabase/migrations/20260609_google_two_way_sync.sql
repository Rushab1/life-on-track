-- Migration: two-way Google Calendar sync.
--
-- Adds inbound import storage (google_events) so events created in the user's
-- Google Calendar can be displayed read-only in the app, and a
-- life_events.google_event_id column so outbound-pushed life events can be
-- reconciled (deleted in Google when deleted in the app).
--
-- Idempotent: IF NOT EXISTS / additive guards, safe to re-run.

begin;

-- 1) Inbound: events imported from the user's Google Calendar (read-only).
create table if not exists google_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  google_event_id text not null,
  date date not null,
  title text not null,
  start_time timestamptz,        -- null for all-day events
  end_time timestamptz,          -- null for all-day events
  all_day boolean not null default false,
  html_link text,
  last_synced_at timestamptz not null default now(),
  unique (user_id, google_event_id)
);

create index if not exists idx_google_events_user_date
  on google_events(user_id, date);

alter table google_events enable row level security;

drop policy if exists "own google events" on google_events;
create policy "own google events" on google_events
  for all using (auth.uid() = user_id);

-- 2) Outbound reconciliation: remember the Google event id we pushed for each
-- life event so deletions in the app remove the matching Google event.
alter table life_events
  add column if not exists google_event_id text;

commit;
