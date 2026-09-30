-- Per-site widget scope.
--
-- A single daily "Pain Level" slider can't distinguish a 4 at the kneecap from
-- a 4 at the ankle. scope='sites' widgets list their sites in config.sites and
-- store one widget_values row per site per day, reusing the activity_type
-- column as the site. The existing unique index on
-- (user_id, widget_id, date, coalesce(activity_type, '')) already keeps that
-- one-row-per-site guarantee, so no index change is needed here.

alter table widget_definitions
  drop constraint if exists widget_definitions_scope_check;

alter table widget_definitions
  add constraint widget_definitions_scope_check
  check (scope in ('daily', 'activity', 'global', 'sites'));
