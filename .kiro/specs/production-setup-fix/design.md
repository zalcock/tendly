# Production Setup Fix — Bugfix Design

## Overview

Eight discrete configuration and code bugs prevent the Tendly production environment from functioning. The bugs span: missing Next.js middleware, a missing database seed row for Apify, a CI pipeline that never runs tests, absent/wrong environment variables in Vercel and Netlify configs, a duplicate env var in `.env.local`, a PL/pgSQL dollar-quote syntax error in migration 006, and two admin pages using the wrong Supabase client. Each fix is surgical — no business logic changes, no schema redesign. The strategy is to correct each defect in isolation so that existing passing tests continue to pass and the production environment becomes fully operational.

---

## Glossary

- **Bug_Condition (C)**: The set of runtime or build-time conditions under which a defect manifests.
- **Property (P)**: The correct observable behavior that must hold after the fix is applied.
- **Preservation**: All existing behaviors not touched by a fix that must remain identical before and after.
- **middleware.ts**: The Next.js edge middleware file that must live at the project root for the framework to load it automatically.
- **proxy/route.ts**: The current (misplaced) file that contains the correct middleware implementation but is never loaded by Next.js.
- **opportunity_sources**: The Supabase table that maps a `source_id` UUID to an ingestion source type (`SAM`, `APIFY`, etc.).
- **migration 006**: `supabase/migrations/006_auto_create_profile.sql` — creates the `handle_new_user` trigger.
- **dollar-quote delimiter**: PL/pgSQL syntax `$$...$$` used to delimit function bodies; the file currently uses a single `$` which is invalid.
- **createServerClient**: The `@supabase/ssr` factory that correctly handles SSR cookie propagation; the correct client for all server components.
- **createClient**: The raw `@supabase/supabase-js` factory; acceptable for service-role API routes but inconsistent when used in server-rendered page components.

---

## Bug Details

### Bug 1 — middleware.ts missing from project root

The middleware implementation exists in `proxy/route.ts` and exports `middleware` and `config` correctly, but Next.js only auto-loads edge middleware from a file named `middleware.ts` (or `middleware.js`) at the project root. Because that file does not exist, every authenticated route (`/dashboard`, `/onboard`, `/admin/*`, etc.) is served without any auth, onboarding, trial-expiry, or role check.

**Formal Specification:**
```
FUNCTION isBugCondition_1(request)
  INPUT: request of type NextRequest
  OUTPUT: boolean

  RETURN fileExistsAtProjectRoot('middleware.ts') = false
         AND request.pathname NOT IN ['/login', '/signup', '/paywall', '/api/*']
END FUNCTION
```

**Examples:**
- `GET /dashboard` with no session → should redirect to `/login`, instead renders the page.
- `GET /admin/users` with a non-OWNER session → should redirect to `/dashboard`, instead renders the page.
- `GET /onboard` with a session but no company row → should stay on `/onboard`, currently no redirect logic runs at all.

---

### Bug 2 — Missing APIFY row in opportunity_sources

Migration 001 inserts only a `SAM` row into `opportunity_sources`. The Apify webhook and run routes query for `type = 'APIFY'` to resolve `source_id`. No such row exists, so every query returns `null`, every upsert uses a `null` conflict key, and ingestion run records are orphaned.

**Formal Specification:**
```
FUNCTION isBugCondition_2(db)
  INPUT: db — current database state
  OUTPUT: boolean

  RETURN COUNT(SELECT * FROM opportunity_sources WHERE type = 'APIFY') = 0
END FUNCTION
```

**Examples:**
- Apify webhook fires → `source_id = null` → `opportunities.upsert` conflict key is `(external_id, null)` → duplicate rows created.
- `ingestion_runs` row is inserted with `source_id = null` → admin ingestion page shows no source association.

---

### Bug 3 — CI never runs vitest

`.github/workflows/ci.yml` has an Install step, a Lint step, and a Build step. There is no Test step. All unit and property-based tests are silently skipped on every push and pull request.

**Formal Specification:**
```
FUNCTION isBugCondition_3(workflow)
  INPUT: workflow — parsed CI YAML
  OUTPUT: boolean

  RETURN 'pnpm vitest --run' NOT IN workflow.jobs.build.steps[*].run
END FUNCTION
```

**Examples:**
- A PR that breaks `lib/__tests__/scoring.test.ts` merges without CI catching it.
- Property-based tests in `app/api/feed/my/__tests__/` never execute in CI.

---

### Bug 4 — NEXT_PUBLIC_BASE_URL not set for Vercel

The login and signup pages already reference `process.env.NEXT_PUBLIC_BASE_URL` for the Supabase `redirectTo` parameter. The variable is not set in Vercel's environment, so `redirectTo` resolves to `undefined` and Supabase auth redirects fail after login/signup.

**Formal Specification:**
```
FUNCTION isBugCondition_4(env)
  INPUT: env — Vercel environment variables
  OUTPUT: boolean

  RETURN env['NEXT_PUBLIC_BASE_URL'] = undefined OR env['NEXT_PUBLIC_BASE_URL'] = ''
END FUNCTION
```

**Examples:**
- User signs up on production → Supabase sends confirmation email with `redirectTo=undefined` → confirmation link is broken.
- User logs in → `redirectTo` is `undefined` → post-login redirect fails.

---

### Bug 5 — netlify.toml uses npm and missing env var declarations

`netlify.toml` specifies `command = "npm run build"`. The project uses pnpm exclusively (lockfile is `pnpm-lock.yaml`). Netlify will either fail to find npm scripts or use a mismatched package manager. Additionally, no `[build.environment]` section declares the required env var keys, so Netlify's UI does not surface them for the operator to fill in.

**Formal Specification:**
```
FUNCTION isBugCondition_5(toml)
  INPUT: toml — parsed netlify.toml
  OUTPUT: boolean

  RETURN toml.build.command = 'npm run build'
         OR 'NEXT_PUBLIC_SUPABASE_URL' NOT IN toml.build.environment
END FUNCTION
```

**Examples:**
- Netlify build runs `npm run build` → fails because `pnpm-lock.yaml` is present and npm is not the configured package manager.
- Operator opens Netlify UI → no env var fields shown → required secrets are never set.

---

### Bug 6 — .env.local has duplicate RESEND_API_KEY and wrong base URL key

`.env.local` declares `RESEND_API_KEY` twice: first as an empty string, then later with the real value. Depending on the dotenv parser's behavior, the empty value may win. Additionally, the base URL key is `NEXT_PUBLIC_APP_URL` but the codebase references `NEXT_PUBLIC_BASE_URL` everywhere.

**Formal Specification:**
```
FUNCTION isBugCondition_6(envFile)
  INPUT: envFile — parsed .env.local key-value pairs
  OUTPUT: boolean

  RETURN occurrences(envFile, 'RESEND_API_KEY') > 1
         OR 'NEXT_PUBLIC_APP_URL' IN envFile.keys
            AND 'NEXT_PUBLIC_BASE_URL' NOT IN envFile.keys
END FUNCTION
```

**Examples:**
- Digest email route reads `RESEND_API_KEY` → gets `''` (empty first declaration) → Resend API call fails with auth error.
- Auth redirect reads `NEXT_PUBLIC_BASE_URL` → `undefined` because only `NEXT_PUBLIC_APP_URL` is set locally.

---

### Bug 7 — Migration 006 uses wrong dollar-quote delimiter

`supabase/migrations/006_auto_create_profile.sql` uses a single `$` as the PL/pgSQL dollar-quote delimiter (`$ ... $ language plpgsql`). The correct delimiter is `$$`. PostgreSQL cannot parse the function body and raises a syntax error, so the `handle_new_user` trigger is never created and new users never get a `profiles` row.

**Formal Specification:**
```
FUNCTION isBugCondition_7(migration)
  INPUT: migration — SQL text of 006_auto_create_profile.sql
  OUTPUT: boolean

  RETURN migration MATCHES PATTERN 'returns trigger as \$\n'
         AND migration NOT MATCHES PATTERN 'returns trigger as \$\$'
END FUNCTION
```

**Examples:**
- New user signs up → `handle_new_user` trigger does not exist → no `profiles` row inserted → middleware profile query returns `null` → every subsequent request redirects incorrectly.
- Running `supabase db push` locally prints a PostgreSQL syntax error on migration 006.

---

### Bug 8 — Admin pages use raw createClient instead of @supabase/ssr createServerClient

`app/admin/ingestion/page.tsx` and `app/admin/digest/page.tsx` both instantiate `createClient` from `@supabase/supabase-js` directly. The correct pattern for Next.js App Router server components is `createServerClient` from `@supabase/ssr` with empty cookie stubs (the service-role pattern already used in `app/admin/users/page.tsx`). Using the raw client bypasses SSR cookie handling and creates an inconsistent pattern across admin pages.

**Formal Specification:**
```
FUNCTION isBugCondition_8(file)
  INPUT: file — source text of an admin page component
  OUTPUT: boolean

  RETURN file IMPORTS 'createClient' FROM '@supabase/supabase-js'
         AND file IS UNDER 'app/admin/'
END FUNCTION
```

**Examples:**
- `app/admin/ingestion/page.tsx` uses `createClient(url, serviceKey)` → inconsistent with `app/admin/users/page.tsx`.
- Future page-level auth checks using SSR cookies would silently fail on the raw-client pages.

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- User login and signup flows via Supabase Auth must continue to work exactly as before.
- SAM.gov ingestion (`/api/ingest/sam/run`) must continue to upsert opportunities and compute match scores.
- `/api/feed/my` must continue to return filtered matches for active-trial users and HTTP 403 for expired-trial users.
- The digest route (`/api/digest/run`) must continue to send emails to eligible users.
- The Apify scraper webhook (`/api/ingest/scraper/webhook`) must continue to upsert opportunities.
- All existing property-based and unit tests must continue to pass with `pnpm vitest --run`.
- The `app/admin/users/page.tsx` implementation must remain unchanged (it is already correct).

**Scope:**
All application logic — matching, scoring, onboarding, billing, email sending — is completely unaffected by these fixes. Every change is limited to: one file move, one SQL migration addition, one CI YAML edit, one env file edit, one TOML edit, one SQL file edit, and two page component edits.

---

## Hypothesized Root Cause

1. **Bug 1 — Wrong file location**: The middleware was placed in `proxy/route.ts`, likely following an API route naming convention rather than the Next.js middleware convention. Next.js only loads `middleware.ts` from the project root.

2. **Bug 2 — Incomplete seed data**: Migration 001 seeded only the SAM source. When Apify ingestion was added later, the corresponding `opportunity_sources` seed row was not added in a new migration.

3. **Bug 3 — CI template omission**: The CI workflow was scaffolded with lint and build steps but the test step was never added, possibly because tests were added after the initial CI setup.

4. **Bug 4 — Env var not provisioned**: `NEXT_PUBLIC_BASE_URL` is referenced in code but was never added to the Vercel project's environment variable settings.

5. **Bug 5 — Package manager mismatch**: `netlify.toml` was written before the project switched to pnpm, or was copied from a template that used npm. The env var section was never added.

6. **Bug 6 — Incremental env file editing**: `RESEND_API_KEY` was first added as a placeholder, then the real value was appended later without removing the placeholder. `NEXT_PUBLIC_APP_URL` was the original key name before the codebase standardized on `NEXT_PUBLIC_BASE_URL`.

7. **Bug 7 — Dollar-quote typo**: The PL/pgSQL function body delimiter was written as a single `$` instead of the standard `$$`. This is a common typo; PostgreSQL requires the delimiter to be at least two characters (`$$`) or a tagged form (`$tag$`).

8. **Bug 8 — Inconsistent client usage**: The ingestion and digest admin pages were written before the `@supabase/ssr` pattern was established in the project, or were copied from a non-SSR example.

---

## Correctness Properties

Property 1: Bug Condition — Auth Routing Enforced by Middleware

_For any_ HTTP request to a protected route (not `/login`, `/signup`, `/paywall`, or `/api/*`) where `middleware.ts` exists at the project root, the middleware SHALL evaluate session, onboarding, trial-expiry, and role rules and redirect or pass through accordingly.

**Validates: Requirements 2.1**

Property 2: Bug Condition — Apify Source ID Resolves

_For any_ invocation of the Apify webhook or run route after migration 007 is applied, the system SHALL resolve a non-null `source_id` from `opportunity_sources` where `type = 'APIFY'`, and all upserted opportunities SHALL carry that `source_id`.

**Validates: Requirements 2.2**

Property 3: Bug Condition — CI Runs Tests

_For any_ push or pull request to `main`/`master`, the CI workflow SHALL execute `pnpm vitest --run` and fail the build if any test fails.

**Validates: Requirements 2.3**

Property 4: Bug Condition — Base URL Resolves in Auth Redirects

_For any_ Vercel deployment where `NEXT_PUBLIC_BASE_URL` is set to the production domain, the login and signup pages SHALL pass a non-empty, non-undefined `redirectTo` value to Supabase Auth.

**Validates: Requirements 2.4**

Property 5: Bug Condition — Netlify Builds with pnpm

_For any_ Netlify build triggered after the `netlify.toml` fix, the build command SHALL be `pnpm build` and the required env var keys SHALL be declared in the TOML.

**Validates: Requirements 2.5**

Property 6: Bug Condition — Single Canonical Env Vars

_For any_ read of `.env.local`, `RESEND_API_KEY` SHALL appear exactly once (with the real value) and `NEXT_PUBLIC_BASE_URL` SHALL be the canonical base URL key (no `NEXT_PUBLIC_APP_URL`).

**Validates: Requirements 2.6**

Property 7: Bug Condition — Migration 006 Parses Without Error

_For any_ execution of `supabase/migrations/006_auto_create_profile.sql` against a PostgreSQL instance, the migration SHALL complete without syntax errors and the `on_auth_user_created` trigger SHALL exist on `auth.users`.

**Validates: Requirements 2.7**

Property 8: Preservation — Admin Pages Use Consistent SSR Client

_For any_ render of an admin page component, the Supabase client SHALL be instantiated via `createServerClient` from `@supabase/ssr` with empty cookie stubs, consistent with `app/admin/users/page.tsx`.

**Validates: Requirements 2.8**

Property 9: Preservation — Existing Behaviors Unchanged

_For any_ input where none of the eight bug conditions hold (non-admin pages, SAM ingestion, feed API, digest API, scraper webhook, existing tests), the fixed codebase SHALL produce exactly the same result as the original codebase.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

---

## Fix Implementation

### Fix 1 — Create middleware.ts at project root

**File**: `middleware.ts` (new file at project root)

**Specific Changes**:
1. Create `middleware.ts` at the project root by copying the full contents of `proxy/route.ts` verbatim — the implementation is already correct.
2. The file must export `middleware` (the async function) and `config` (the matcher object) at the top level.
3. `proxy/route.ts` can be left in place or deleted; it is never loaded by Next.js so it causes no harm either way. For clarity, it should be deleted to avoid confusion.

---

### Fix 2 — Add migration 007 to seed APIFY source row

**File**: `supabase/migrations/007_apify_source.sql` (new file)

**Specific Changes**:
1. First, alter the `opportunity_sources.type` check constraint to include `'APIFY'` as a valid value (currently the constraint is `check (type in ('SAM','STATE','LOCAL'))`).
2. Insert a row: `type = 'APIFY'`, `name = 'Apify SAM Scraper'`, `base_url = 'https://apify.com'`.

```sql
-- Allow APIFY as a valid source type
alter table public.opportunity_sources
  drop constraint opportunity_sources_type_check;

alter table public.opportunity_sources
  add constraint opportunity_sources_type_check
  check (type in ('SAM','STATE','LOCAL','APIFY'));

-- Seed the Apify source row
insert into public.opportunity_sources (type, name, base_url)
values ('APIFY', 'Apify SAM Scraper', 'https://apify.com');
```

---

### Fix 3 — Add vitest step to CI workflow

**File**: `.github/workflows/ci.yml`

**Specific Changes**:
1. Add a `Test` step between the `Install dependencies` step and the `Lint` step.
2. The step runs `pnpm vitest --run` with the same env vars already present on the Build step.

```yaml
- name: Test
  run: pnpm vitest --run
  env:
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
    CRON_SECRET: ${{ secrets.CRON_SECRET }}
    NEXT_PUBLIC_BASE_URL: ${{ secrets.NEXT_PUBLIC_BASE_URL }}
```

---

### Fix 4 — Set NEXT_PUBLIC_BASE_URL in Vercel

**File**: No code change required. This is an operator action.

**Specific Changes**:
1. In the Vercel project dashboard → Settings → Environment Variables, add `NEXT_PUBLIC_BASE_URL` set to the production domain (e.g. `https://tendly.app`).
2. The `vercel.json` cron configuration is already correct and must not be changed.
3. Document this requirement in `.env.local` with a comment so future developers know the variable is required in production.

---

### Fix 5 — Fix netlify.toml build command and add env var declarations

**File**: `netlify.toml`

**Specific Changes**:
1. Change `command = "npm run build"` to `command = "pnpm build"`.
2. Add a `[build.environment]` section declaring all required env var keys with empty placeholder values so Netlify surfaces them in the UI.

```toml
[build]
  command = "pnpm build"
  publish = ".next"

[build.environment]
  NEXT_PUBLIC_SUPABASE_URL = ""
  NEXT_PUBLIC_SUPABASE_ANON_KEY = ""
  SUPABASE_SERVICE_ROLE_KEY = ""
  CRON_SECRET = ""
  NEXT_PUBLIC_BASE_URL = ""
```

---

### Fix 6 — Clean up .env.local

**File**: `.env.local`

**Specific Changes**:
1. Remove the first (empty) `RESEND_API_KEY=` line, keeping only `RESEND_API_KEY=re_fyCxvjwT_...`.
2. Replace `NEXT_PUBLIC_APP_URL=http://localhost:3000` with `NEXT_PUBLIC_BASE_URL=http://localhost:3000`.
3. Remove `VERCEL_TOKEN` — this is a personal access token and must never be committed to any file tracked by git.

---

### Fix 7 — Fix dollar-quote delimiter in migration 006

**File**: `supabase/migrations/006_auto_create_profile.sql`

**Specific Changes**:
1. Replace the single `$` delimiter with `$$` in both the opening and closing positions of the function body.

Before:
```sql
returns trigger as $
begin
  ...
end;
$ language plpgsql security definer;
```

After:
```sql
returns trigger as $$
begin
  ...
end;
$$ language plpgsql security definer;
```

---

### Fix 8 — Replace raw createClient with createServerClient in admin pages

**Files**:
- `app/admin/ingestion/page.tsx`
- `app/admin/digest/page.tsx`

**Specific Changes** (identical pattern for both files):
1. Remove the import of `createClient` from `@supabase/supabase-js`.
2. Add an import of `createServerClient` from `@supabase/ssr`.
3. Replace the `createClient(url, key)` call with:

```typescript
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { cookies: { getAll: () => [], setAll: () => {} } }
)
```

This is the exact pattern already used in `app/admin/users/page.tsx`.

---

## Testing Strategy

### Validation Approach

Each fix is independently verifiable. The strategy is: for bugs that are testable in code (1, 2, 7, 8), write unit/integration tests that fail on the unfixed code and pass after the fix. For configuration bugs (3, 4, 5, 6), verification is done by inspection and smoke-testing the CI run or build output.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each bug on the unfixed code before applying fixes.

**Test Cases**:
1. **Middleware absence**: Check that `middleware.ts` does not exist at the project root — confirmed by file system inspection.
2. **Missing APIFY source**: Query `SELECT * FROM opportunity_sources WHERE type = 'APIFY'` — returns 0 rows on unfixed DB.
3. **CI test gap**: Inspect `.github/workflows/ci.yml` — no step contains `vitest` — confirmed by file inspection.
4. **Dollar-quote syntax**: Run `psql` against migration 006 — PostgreSQL raises `ERROR: syntax error at or near "$"`.
5. **Admin client mismatch**: Grep for `createClient` from `@supabase/supabase-js` in `app/admin/` — finds two files.

**Expected Counterexamples**:
- Unauthenticated requests to `/dashboard` succeed (no redirect) when `middleware.ts` is absent.
- Apify webhook inserts opportunities with `source_id = null`.
- Migration 006 fails with a PostgreSQL syntax error.

### Fix Checking

**Goal**: Verify that for all inputs where each bug condition holds, the fixed code produces the expected behavior.

```
FOR ALL request WHERE isBugCondition_1(request) DO
  result := middleware_fixed(request)
  ASSERT result IS redirect OR result IS authorized_pass_through
END FOR

FOR ALL db_state WHERE isBugCondition_2(db_state) AFTER migration_007 DO
  source := SELECT id FROM opportunity_sources WHERE type = 'APIFY'
  ASSERT source IS NOT NULL
END FOR

FOR ALL migration WHERE isBugCondition_7(migration) AFTER fix DO
  ASSERT psql(migration) SUCCEEDS
  ASSERT trigger on_auth_user_created EXISTS on auth.users
END FOR
```

### Preservation Checking

**Goal**: Verify that all existing behaviors are unchanged after each fix.

```
FOR ALL request WHERE NOT isBugCondition_1(request) DO
  ASSERT middleware_original(request) = middleware_fixed(request)
END FOR

FOR ALL ingestion_call WHERE source = 'SAM' DO
  ASSERT sam_ingestion_original() = sam_ingestion_fixed()
END FOR
```

**Testing Approach**: The existing property-based test suite (`pnpm vitest --run`) is the primary preservation check. All 8 unchanged-behavior requirements (3.1–3.8) are covered by the existing tests. The CI fix (Bug 3) itself ensures these tests run on every future push.

### Unit Tests

- Verify `middleware.ts` exports `middleware` function and `config` matcher at the project root.
- Verify migration 007 SQL parses without error and inserts exactly one `APIFY` row.
- Verify migration 006 SQL (after fix) parses without error and creates the trigger.
- Verify `app/admin/ingestion/page.tsx` and `app/admin/digest/page.tsx` import from `@supabase/ssr`, not `@supabase/supabase-js`.

### Property-Based Tests

- Generate random authenticated requests to protected routes and assert middleware redirects or passes through correctly (covers Bug 1 fix).
- Generate random new-user signup events and assert a `profiles` row is created (covers Bug 7 fix, depends on trigger existing).
- Run the full existing PBT suite (`pnpm vitest --run`) to confirm preservation across all 3.x requirements.

### Integration Tests

- End-to-end: unauthenticated `GET /dashboard` → assert redirect to `/login` (Bug 1).
- End-to-end: fire Apify webhook after migration 007 → assert `ingestion_runs` row has non-null `source_id` (Bug 2).
- End-to-end: new user signup → assert `profiles` row exists (Bug 7).
- End-to-end: render `/admin/ingestion` and `/admin/digest` → assert no runtime errors and data loads (Bug 8).
