# Security Review: Enable RLS on OAuth tables + drop leftover temp table

**Branch:** `claude/enable-rls-public-tables-Z2ugH`
**Commit:** `d33b797`
**Changed files:** `supabase/migrations/20260408_enable_rls_oauth_and_drop_temp.sql` (new, only file)

## Context

Supabase's database linter flagged four `public` tables with RLS disabled and
exposed to PostgREST:

| Table | Linter key |
| --- | --- |
| `public.oauth_clients` | `rls_disabled_in_public` (ERROR) |
| `public.oauth_codes` | `rls_disabled_in_public` (ERROR) |
| `public.oauth_refresh_tokens` | `rls_disabled_in_public` (ERROR) |
| `public._temp_workout_export` | `rls_disabled_in_public` (ERROR) |

Before this change, anyone with the `NEXT_PUBLIC_SUPABASE_ANON_KEY` (shipped
to every browser) could `SELECT` every row in those tables via PostgREST.

## The change

The migration does exactly three things:

1. `alter table … enable row level security` on the three oauth_* tables.
2. `revoke all on …  from anon, authenticated` on the same three tables.
3. `drop table if exists public._temp_workout_export`.

No policies are added. No application (TypeScript) code is changed.

## Review checklist

### 1. Verify the "no app code changes needed" claim

The claim rests on every caller of these tables using the Supabase service
role, which bypasses RLS. Confirm by grepping for every read/write to the
three tables and verifying each call goes through `adminClient()` in
`src/app/api/mcp/oauth/lib.ts:166` (which instantiates with
`SUPABASE_SERVICE_ROLE_KEY`).

Expected call sites (confirm nothing else appears):

- `src/app/register/route.ts:37` — insert into `oauth_clients`
- `src/app/token/route.ts:24` — select from `oauth_clients`
- `src/app/token/route.ts:64, 80` — select/update `oauth_codes`
- `src/app/token/route.ts:87, 118, 129, 134` — select/update/insert `oauth_refresh_tokens`
- `src/app/revoke/route.ts:22` — update `oauth_refresh_tokens`
- `src/app/api/oauth/authorize/route.ts:47` — select `oauth_clients`
- `src/app/api/oauth/authorize/route.ts:65` — insert `oauth_codes`

**Fail the review if:** any call site uses a non-admin client (user-scoped
client, anon client, or a client built from `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

Command to run:

```
rg -n 'oauth_clients|oauth_codes|oauth_refresh_tokens' src/ supabase/functions/
```

Then verify each result resolves to `adminClient()` from `@/app/api/mcp/oauth/lib`.

### 2. Verify `_temp_workout_export` is truly unreferenced

The table is dropped, not locked down. Confirm it's unused before approving.

```
rg -i 'temp_workout_export|workout_export' .
```

**Fail the review if:** any TypeScript/edge function/test references it. The
only match should be the migration file itself. If a match is found, the safer
fix is `enable row level security` instead of `drop table`.

### 3. Verify RLS default-deny is the right semantics

The migration enables RLS with no policies. This gives:

- Service role: full access (bypasses RLS) — app continues to work.
- `anon` role: zero rows returned, no errors (PostgREST returns an empty
  array). Writes fail with a PostgREST error.
- `authenticated` role: same as anon.

This is the intended behavior. Confirm by reasoning about the three OAuth
flows:

- **`/register`** — pre-auth (no Supabase session exists when the client
  registers). Uses service role. ✅
- **`/token` with `grant_type=authorization_code`** — the caller is a
  client app proving identity with client_secret + PKCE, not a Supabase
  user. No `auth.uid()` available. Uses service role. ✅
- **`/token` with `grant_type=refresh_token`** — same: no Supabase session,
  only a refresh token. Uses service role. ✅
- **`/authorize`** — user *does* have a Supabase session but it's verified
  manually via `Authorization: Bearer` header at
  `src/app/api/oauth/authorize/route.ts:39`. The subsequent insert into
  `oauth_codes` uses service role. ✅

**Fail the review if:** any flow legitimately needs a non-service-role
caller to read/write these tables. (It shouldn't — these are pre-auth /
auth-bootstrap tables by definition.)

### 4. Verify the revokes are correct

```sql
revoke all on public.oauth_clients        from anon, authenticated;
revoke all on public.oauth_codes          from anon, authenticated;
revoke all on public.oauth_refresh_tokens from anon, authenticated;
```

These are defense-in-depth: RLS already denies anon/authenticated, but the
revokes also remove the tables from PostgREST's exposed OpenAPI schema.

**Fail the review if:** the revokes target `service_role`, `postgres`, or
`supabase_admin`. They should only target `anon` and `authenticated`.

### 5. Verify the drop is safe

```sql
drop table if exists public._temp_workout_export;
```

- `if exists` — safe re-run.
- No `cascade` — if a view or foreign key depends on it, the migration will
  fail loudly, which is what we want. Confirm no dependencies exist via:
  ```sql
  select * from pg_depend where refobjid = 'public._temp_workout_export'::regclass;
  ```
  Expected: zero rows (or only internal dependencies).

### 6. Confirm service role key hygiene

Not part of this change, but worth a spot-check since the fix leans on the
service role being the only privileged caller:

- `SUPABASE_SERVICE_ROLE_KEY` is **not** prefixed with `NEXT_PUBLIC_`.
- It is only referenced in server-side code:
  ```
  rg -n 'SUPABASE_SERVICE_ROLE_KEY' src/ supabase/
  ```
  Expected locations: `src/app/api/mcp/oauth/lib.ts`, `tests/integration/helpers.ts`,
  edge functions under `supabase/functions/`. No references from client
  components or `NEXT_PUBLIC_*` env vars.

**Fail the review if:** the key appears in a client component, is re-exported
through a `NEXT_PUBLIC_*` var, or is logged anywhere.

### 7. Confirm no secrets in the migration file

The migration contains no credentials, connection strings, or PII.
`rg -n '(secret|password|key|token)' supabase/migrations/20260408_enable_rls_oauth_and_drop_temp.sql`
should only match benign text in the comment header.

## Post-merge validation (for whoever applies the migration)

After running the migration against a Supabase project:

1. Re-run the Supabase database linter. The four `rls_disabled_in_public`
   errors should be gone.
2. Run `npm run test:integration` — in particular
   `tests/integration/mcp/oauth-flow.test.ts` and
   `tests/integration/mcp/token-flow.test.ts`. They exercise the full
   register → authorize → token → refresh → revoke cycle and will fail if
   the service-role assumption is wrong anywhere.
3. Manual smoke test via anon key (should return an empty array, not data):
   ```ts
   const anon = createClient(url, ANON_KEY);
   console.log(await anon.from("oauth_clients").select("*"));
   // expected: { data: [], error: null }  OR  a 404/permission error from revoke
   ```
4. Verify `_temp_workout_export` is gone:
   ```sql
   select to_regclass('public._temp_workout_export');  -- expected: null
   ```

## Known non-goals / follow-ups (not in this PR)

These are intentionally out of scope. Don't fail the review for their absence,
but flag them as follow-up work:

- Adding the oauth_* table definitions to `supabase-schema.sql`. They were
  created out-of-band and are still missing from the canonical snapshot.
- Adding an automated regression test that asserts the anon client is
  denied on these tables.
- Adding an explanatory comment inline on each `enable row level security`
  statement so a future developer doesn't "helpfully" add a permissive
  policy and reopen the hole.
- Scoping DB access to a dedicated `oauth_admin` role instead of the full
  service role.

## Reviewer sign-off criteria

Approve if **all** of the following hold:

- [ ] Every query against `oauth_clients`/`oauth_codes`/`oauth_refresh_tokens`
      in the codebase goes through `adminClient()`.
- [ ] `_temp_workout_export` has zero references in code, tests, functions.
- [ ] The migration SQL is idempotent-safe and doesn't revoke from
      `service_role`.
- [ ] No TypeScript changes are needed (and none were made).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is not exposed to the client.
