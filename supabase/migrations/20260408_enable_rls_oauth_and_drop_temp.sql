-- Enable RLS on admin-only OAuth tables and drop leftover temp export table.
--
-- Context: Supabase's database linter flagged four tables in the `public`
-- schema as having RLS disabled while being exposed to PostgREST:
--
--   - public.oauth_clients
--   - public.oauth_codes
--   - public.oauth_refresh_tokens
--   - public._temp_workout_export
--
-- The three oauth_* tables back the MCP OAuth2 Dynamic Client Registration
-- flow (see src/app/register/route.ts, src/app/token/route.ts,
-- src/app/revoke/route.ts, src/app/api/oauth/authorize/route.ts). Every
-- query against them goes through adminClient() in
-- src/app/api/mcp/oauth/lib.ts, which uses SUPABASE_SERVICE_ROLE_KEY. The
-- service role bypasses RLS, so enabling RLS with no policies gives us
-- default-deny for the anon/authenticated roles without breaking the app.
--
-- We also revoke PostgREST role privileges as defense-in-depth so the
-- tables are not exposed in the OpenAPI schema.
--
-- _temp_workout_export is an unreferenced leftover from an ad-hoc export
-- and is dropped entirely.

-- 1. Lock down OAuth tables (service role bypasses RLS, so app is unaffected)
alter table public.oauth_clients        enable row level security;
alter table public.oauth_codes          enable row level security;
alter table public.oauth_refresh_tokens enable row level security;

revoke all on public.oauth_clients        from anon, authenticated;
revoke all on public.oauth_codes          from anon, authenticated;
revoke all on public.oauth_refresh_tokens from anon, authenticated;

-- 2. Drop unreferenced temp export table
drop table if exists public._temp_workout_export;
