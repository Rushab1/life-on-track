-- Oura push notifications (webhooks) + full activity-zone breakdown.
--
-- Webhooks let Oura notify us ~30s after the phone app syncs, so data lands
-- without the user opening this app. The daily cron stays as a backstop.
--
-- Idempotent: IF NOT EXISTS / additive guards, safe to re-run.

begin;

-- 1) Map Oura's user id (from /v2/usercollection/personal_info) to our user,
--    so incoming webhook events (which carry the Oura user_id) can be routed
--    to the right account.
alter table oura_tokens
  add column if not exists oura_user_id text;

create index if not exists idx_oura_tokens_oura_user_id
  on oura_tokens(oura_user_id);

-- 2) App-level webhook subscriptions (one per data_type + event_type for the
--    whole Oura client, NOT per user). Tracked so we can renew before expiry
--    and avoid creating duplicates. Service-role only.
create table if not exists oura_webhook_subscriptions (
  id text primary key,             -- Oura's subscription id
  event_type text not null,        -- create / update / delete
  data_type text not null,         -- daily_activity / sleep / workout / ...
  callback_url text,
  expiration_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_type, data_type)
);

alter table oura_webhook_subscriptions enable row level security;
-- No policy: only the service role (which bypasses RLS) touches this table.

-- 3) Remaining activity-intensity zones so the full Oura 0-5 breakdown is
--    stored. low/medium/high already exist (zones 3/4/5); add 0/1/2.
alter table oura_daily
  add column if not exists non_wear_minutes int,   -- zone 0: ring off
  add column if not exists rest_minutes int,       -- zone 1: resting
  add column if not exists sedentary_minutes int;  -- zone 2: inactive

commit;
