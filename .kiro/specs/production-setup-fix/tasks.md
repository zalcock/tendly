# Implementation Plan

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** - Eight Production Setup Defects
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **GOAL**: Surface counterexamples that demonstrate each bug exists before applying any fix
  - Bug 1: Assert `middleware.ts` exists at project root — FAILS because file is absent
  - Bug 2: Assert `SELECT count(*) FROM opportunity_sources WHERE type = 'APIFY'` returns >= 1 — FAILS because only SAM row exists
  - Bug 3: Assert `.github/workflows/ci.yml` contains a step with `pnpm vitest --run` — FAILS because no test step exists
  - Bug 4: Assert `.env.local` contains `NEXT_PUBLIC_BASE_URL` key — FAILS because only `NEXT_PUBLIC_APP_URL` is present
  - Bug 5: Assert `netlify.toml` build command equals `pnpm build` — FAILS because it reads `npm run build`
  - Bug 6: Assert `RESEND_API_KEY` appears exactly once in `.env.local` — FAILS because it appears twice
  - Bug 7: Assert `supabase/migrations/006_auto_create_profile.sql` uses `$$` as dollar-quote delimiter — FAILS because single `$` is used
  - Bug 8: Assert `app/admin/ingestion/page.tsx` and `app/admin/digest/page.tsx` do NOT import from `@supabase/supabase-js` — FAILS because both use raw `createClient`
  - Run all checks on UNFIXED code
  - **EXPECTED OUTCOME**: All checks FAIL (this is correct — it proves each bug exists)
  - Document counterexamples found to understand root cause of each defect
  - Mark task complete when all checks are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

- [x] 2. Write preservation property tests (BEFORE implementing fixes)
  - **Property 2: Preservation** - Existing Behaviors Unchanged
  - **IMPORTANT**: Follow observation-first methodology — observe UNFIXED code behavior for non-buggy inputs
  - Observe: `pnpm vitest --run` passes all tests in `lib/__tests__/`, `app/api/**/__tests__/`, `src/lib/**/__tests__/` on unfixed code
  - Observe: SAM ingestion route upserts opportunities correctly on unfixed code
  - Observe: `/api/feed/my` returns filtered matches for active-trial users and HTTP 403 for expired-trial users on unfixed code
  - Write property-based test: for all active-trial user feed requests, response contains matches with score >= 40 sorted descending
  - Write property-based test: for all expired-trial user feed requests, response is HTTP 403 with `{ error: 'trial_expired' }`
  - Run `pnpm vitest --run` on UNFIXED code to establish baseline
  - **EXPECTED OUTCOME**: All existing tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 3. Fix Bug 1 — Create middleware.ts at project root

  - [x] 3.1 Move middleware implementation to project root
    - Copy full contents of `proxy/route.ts` verbatim into a new `middleware.ts` at the project root
    - Confirm the file exports `middleware` (async function) and `config` (matcher object) at the top level
    - Delete `proxy/route.ts` to avoid confusion — it is never loaded by Next.js
    - _Bug_Condition: isBugCondition_1 — middleware.ts does not exist at project root_
    - _Expected_Behavior: middleware evaluates session, onboarding, trial-expiry, and role rules for all protected routes_
    - _Preservation: login/signup flows, SAM ingestion, feed API, digest API, scraper webhook all unaffected_
    - _Requirements: 2.1, 3.1, 3.2_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - middleware.ts Exists at Project Root
    - **IMPORTANT**: Re-run the SAME check from task 1 — do NOT write a new test
    - Assert `middleware.ts` exists at project root and exports `middleware` and `config`
    - **EXPECTED OUTCOME**: Check PASSES (confirms Bug 1 is fixed)
    - _Requirements: 2.1_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Auth and Routing Behaviors Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run `pnpm vitest --run` to confirm no regressions
    - **EXPECTED OUTCOME**: All tests PASS

- [x] 4. Fix Bug 2 — Add migration 007 to seed APIFY source row

  - [x] 4.1 Create migration 007_apify_source.sql
    - Create `supabase/migrations/007_apify_source.sql`
    - Drop and recreate `opportunity_sources_type_check` constraint to include `'APIFY'` alongside `'SAM'`, `'STATE'`, `'LOCAL'`
    - Insert row: `type = 'APIFY'`, `name = 'Apify SAM Scraper'`, `base_url = 'https://apify.com'`
    - _Bug_Condition: isBugCondition_2 — COUNT(opportunity_sources WHERE type = 'APIFY') = 0_
    - _Expected_Behavior: Apify webhook and run routes resolve non-null source_id; all upserted opportunities carry that source_id_
    - _Preservation: SAM ingestion source row and all existing opportunity upserts unaffected_
    - _Requirements: 2.2, 3.3, 3.7_

  - [x] 4.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - APIFY Source Row Exists
    - **IMPORTANT**: Re-run the SAME check from task 1 — do NOT write a new test
    - Assert `SELECT count(*) FROM opportunity_sources WHERE type = 'APIFY'` returns >= 1
    - **EXPECTED OUTCOME**: Check PASSES (confirms Bug 2 is fixed)
    - _Requirements: 2.2_

  - [x] 4.3 Verify preservation tests still pass
    - **Property 2: Preservation** - SAM Ingestion and Scraper Webhook Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run `pnpm vitest --run` to confirm no regressions
    - **EXPECTED OUTCOME**: All tests PASS

- [x] 5. Fix Bug 3 — Add vitest step to CI workflow

  - [x] 5.1 Add Test step to .github/workflows/ci.yml
    - Open `.github/workflows/ci.yml`
    - Insert a `Test` step between the `Install dependencies` step and the `Lint` step
    - Step runs `pnpm vitest --run` with env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_BASE_URL` (all from secrets)
    - _Bug_Condition: isBugCondition_3 — 'pnpm vitest --run' NOT IN workflow steps_
    - _Expected_Behavior: CI executes pnpm vitest --run on every push/PR and fails the build if any test fails_
    - _Preservation: existing lint and build steps unaffected_
    - _Requirements: 2.3, 3.8_

  - [x] 5.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - CI Workflow Contains Test Step
    - **IMPORTANT**: Re-run the SAME check from task 1 — do NOT write a new test
    - Assert `.github/workflows/ci.yml` contains a step with `pnpm vitest --run`
    - **EXPECTED OUTCOME**: Check PASSES (confirms Bug 3 is fixed)
    - _Requirements: 2.3_

  - [x] 5.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Tests Pass
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run `pnpm vitest --run` locally to confirm all existing tests still pass
    - **EXPECTED OUTCOME**: All tests PASS

- [x] 6. Fix Bug 4 — Document NEXT_PUBLIC_BASE_URL requirement for Vercel

  - [x] 6.1 Add NEXT_PUBLIC_BASE_URL to .env.local and document Vercel requirement
    - Ensure `NEXT_PUBLIC_BASE_URL=http://localhost:3000` is present in `.env.local` (replacing `NEXT_PUBLIC_APP_URL` if that is the only change needed here — coordinate with Bug 6 fix)
    - Add a comment documenting that `NEXT_PUBLIC_BASE_URL` must be set to the production domain in Vercel dashboard → Settings → Environment Variables
    - Confirm `vercel.json` cron configuration is untouched
    - _Bug_Condition: isBugCondition_4 — env['NEXT_PUBLIC_BASE_URL'] is undefined or empty in Vercel_
    - _Expected_Behavior: login and signup pages pass non-empty redirectTo to Supabase Auth_
    - _Preservation: vercel.json cron config unchanged; no code changes to login/signup pages_
    - _Requirements: 2.4, 3.1_

  - [x] 6.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - NEXT_PUBLIC_BASE_URL Present in .env.local
    - **IMPORTANT**: Re-run the SAME check from task 1 — do NOT write a new test
    - Assert `.env.local` contains `NEXT_PUBLIC_BASE_URL` key
    - **EXPECTED OUTCOME**: Check PASSES
    - _Requirements: 2.4_

- [x] 7. Fix Bug 5 — Fix netlify.toml build command and env var declarations

  - [x] 7.1 Update netlify.toml
    - Change `command = "npm run build"` to `command = "pnpm build"`
    - Add `[build.environment]` section with empty placeholder values for: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_BASE_URL`
    - _Bug_Condition: isBugCondition_5 — toml.build.command = 'npm run build' OR required env keys absent_
    - _Expected_Behavior: Netlify builds with pnpm; required env var keys surfaced in Netlify UI for operator_
    - _Preservation: publish directory and all other netlify.toml settings unchanged_
    - _Requirements: 2.5_

  - [x] 7.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - netlify.toml Uses pnpm Build
    - **IMPORTANT**: Re-run the SAME check from task 1 — do NOT write a new test
    - Assert `netlify.toml` build command equals `pnpm build` and `[build.environment]` section contains required keys
    - **EXPECTED OUTCOME**: Check PASSES (confirms Bug 5 is fixed)
    - _Requirements: 2.5_

- [x] 8. Fix Bug 6 — Clean up .env.local

  - [x] 8.1 Deduplicate RESEND_API_KEY and rename base URL key
    - Remove the first (empty) `RESEND_API_KEY=` line, keeping only the line with the real value
    - Replace `NEXT_PUBLIC_APP_URL=http://localhost:3000` with `NEXT_PUBLIC_BASE_URL=http://localhost:3000`
    - Remove `VERCEL_TOKEN` — personal access token must never be committed to a tracked file
    - _Bug_Condition: isBugCondition_6 — RESEND_API_KEY appears > 1 time OR NEXT_PUBLIC_APP_URL present without NEXT_PUBLIC_BASE_URL_
    - _Expected_Behavior: RESEND_API_KEY appears exactly once with real value; NEXT_PUBLIC_BASE_URL is the canonical base URL key_
    - _Preservation: all other env vars unchanged; no application logic changes_
    - _Requirements: 2.6, 3.6_

  - [x] 8.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - .env.local Has Single RESEND_API_KEY and Correct Base URL Key
    - **IMPORTANT**: Re-run the SAME checks from task 1 — do NOT write new tests
    - Assert `RESEND_API_KEY` appears exactly once and `NEXT_PUBLIC_BASE_URL` is present (no `NEXT_PUBLIC_APP_URL`)
    - **EXPECTED OUTCOME**: Both checks PASS (confirms Bug 6 is fixed)
    - _Requirements: 2.6_

  - [x] 8.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Digest and Auth Redirect Behaviors Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run `pnpm vitest --run` to confirm no regressions
    - **EXPECTED OUTCOME**: All tests PASS

- [x] 9. Fix Bug 7 — Fix dollar-quote delimiter in migration 006

  - [x] 9.1 Replace single dollar-sign with $$ in 006_auto_create_profile.sql
    - Open `supabase/migrations/006_auto_create_profile.sql`
    - Replace the single `$` delimiter with `$$` in both the opening position (`returns trigger as $$`) and the closing position (`$$ language plpgsql security definer`)
    - _Bug_Condition: isBugCondition_7 — migration uses single $ instead of $$ as PL/pgSQL dollar-quote delimiter_
    - _Expected_Behavior: migration executes without PostgreSQL syntax error; on_auth_user_created trigger exists on auth.users; new users receive a profiles row_
    - _Preservation: trigger logic and function body unchanged; only delimiter syntax corrected_
    - _Requirements: 2.7, 3.1, 3.2_

  - [x] 9.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Migration 006 Uses $$ Delimiter
    - **IMPORTANT**: Re-run the SAME check from task 1 — do NOT write a new test
    - Assert `006_auto_create_profile.sql` contains `$$` as the dollar-quote delimiter
    - **EXPECTED OUTCOME**: Check PASSES (confirms Bug 7 is fixed)
    - _Requirements: 2.7_

  - [x] 9.3 Verify preservation tests still pass
    - **Property 2: Preservation** - New User Signup and Profile Creation Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run `pnpm vitest --run` to confirm no regressions
    - **EXPECTED OUTCOME**: All tests PASS

- [x] 10. Fix Bug 8 — Replace raw createClient with createServerClient in admin pages

  - [x] 10.1 Update app/admin/ingestion/page.tsx
    - Remove import of `createClient` from `@supabase/supabase-js`
    - Add import of `createServerClient` from `@supabase/ssr`
    - Replace `createClient(url, key)` call with `createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } })`
    - This is the exact pattern already used in `app/admin/users/page.tsx`
    - _Bug_Condition: isBugCondition_8 — file imports createClient from @supabase/supabase-js AND is under app/admin/_
    - _Expected_Behavior: admin page uses createServerClient from @supabase/ssr with empty cookie stubs_
    - _Preservation: page data fetching logic and rendered output unchanged_
    - _Requirements: 2.8_

  - [x] 10.2 Update app/admin/digest/page.tsx
    - Remove import of `createClient` from `@supabase/supabase-js`
    - Add import of `createServerClient` from `@supabase/ssr`
    - Replace `createClient(url, key)` call with `createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } })`
    - _Bug_Condition: isBugCondition_8 — file imports createClient from @supabase/supabase-js AND is under app/admin/_
    - _Expected_Behavior: admin page uses createServerClient from @supabase/ssr with empty cookie stubs_
    - _Preservation: page data fetching logic and rendered output unchanged_
    - _Requirements: 2.8_

  - [x] 10.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Admin Pages Use @supabase/ssr
    - **IMPORTANT**: Re-run the SAME checks from task 1 — do NOT write new tests
    - Assert neither `app/admin/ingestion/page.tsx` nor `app/admin/digest/page.tsx` imports from `@supabase/supabase-js`
    - **EXPECTED OUTCOME**: Both checks PASS (confirms Bug 8 is fixed)
    - _Requirements: 2.8_

  - [x] 10.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Admin Page Rendering Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run `pnpm vitest --run` to confirm no regressions
    - **EXPECTED OUTCOME**: All tests PASS

- [x] 11. Checkpoint — Ensure all tests pass
  - Run `pnpm vitest --run` and confirm all tests pass
  - Verify all 8 bug condition checks from task 1 now pass
  - Verify all preservation checks from task 2 still pass
  - Confirm `middleware.ts` exists at project root
  - Confirm `supabase/migrations/007_apify_source.sql` exists
  - Confirm `.github/workflows/ci.yml` contains the vitest step
  - Confirm `netlify.toml` uses `pnpm build` and has `[build.environment]` section
  - Confirm `.env.local` has single `RESEND_API_KEY` and `NEXT_PUBLIC_BASE_URL`
  - Confirm `006_auto_create_profile.sql` uses `$$` delimiter
  - Confirm both admin pages import from `@supabase/ssr`
  - Ask the user if any questions arise before closing out
