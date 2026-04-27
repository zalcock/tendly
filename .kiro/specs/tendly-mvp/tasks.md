# Implementation Plan: Tendly MVP

## Overview

Complete the partially-built Tendly codebase to pilot-launch readiness. Tasks are ordered by dependency: schema migrations first, then core lib, then API routes, then UI pages and components, then wiring and cron config, then property-based tests.

The design document uses TypeScript (Next.js 16 App Router). All implementation is in TypeScript/TSX.

## Tasks

- [x] 1. Schema migrations
  - [x] 1.1 Add `trial_started_at` and `last_digest_at` columns to `profiles`
    - Create `supabase/migrations/004_profiles_trial.sql`
    - `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_started_at timestamptz, ADD COLUMN IF NOT EXISTS last_digest_at timestamptz`
    - _Requirements: 6.1, 7.6_

  - [x] 1.2 Fix `notifications.type` check constraint to include `daily_digest`
    - Create `supabase/migrations/005_notifications_type.sql`
    - Drop existing `notifications_type_check` constraint and re-add with `'daily_digest'` included
    - _Requirements: 7.6_

- [x] 2. Matching engine — implement full scoring formula
  - [x] 2.1 Verify and harden `lib/matching.ts` scoring formula
    - Confirm NAICS = 40 pts, set-aside full = 25 pts / partial (no restriction) = 12 pts, geography full = 15 pts / partial (unspecified) = 7 pts, value band = 10 pts, keywords up to 10 pts scaled by hits/5
    - Current code awards `SET_ASIDE * 100 * 0.5 = 12.5` (rounds to 12 after `Math.round`) and `GEO * 100 * 0.5 = 7.5` — verify these round correctly to match spec (12 and 7 pts)
    - Ensure `Math.round` is applied only at the final step so partial contributions don't accumulate rounding errors
    - Export `ScoringReason` interface from `lib/matching.ts`
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 2.2 Write property test for match score bounds and formula (Property 8)
    - Install `fast-check` and `vitest` as dev dependencies: `pnpm add -D fast-check vitest @vitest/coverage-v8`
    - Create `lib/__tests__/matching.test.ts`
    - **Property 8: Match score formula is correct and bounded**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6**

- [x] 3. API route — `/api/feed/my`
  - [x] 3.1 Create `app/api/feed/my/route.ts`
    - Authenticate via Supabase SSR session; return 401 if unauthenticated
    - Read `profiles.trial_started_at`; compute `trialExpiresAt = trial_started_at + 86400000 ms`; return 403 `{ error: 'trial_expired' }` if expired
    - Query `companies` for `owner_id = user.id`; query `match_scores` joined with `opportunities` for that company, filtering `score >= 40` and `proposals_due_at > now()`
    - Sort results by `score DESC`; return `{ matches, trialExpiresAt, trialActive }`
    - _Requirements: 5.1, 5.2, 5.5, 6.6_

  - [x] 3.2 Write property tests for feed route logic (Properties 7, 10, 11, 12, 14)
    - Test score threshold filter, sort order, expired opportunity exclusion, trial expiry 403, and user isolation using mocked Supabase responses
    - **Property 7: Expired opportunities excluded from feed**
    - **Property 10: Feed only returns matches above score threshold**
    - **Property 11: Feed only returns authenticated user's matches**
    - **Property 12: Feed results sorted by score descending**
    - **Property 14: Expired trial blocks feed with 403**
    - **Validates: Requirements 5.1, 5.2, 5.5, 6.6**

- [x] 4. API route — `/api/onboard/create` hardening
  - [x] 4.1 Add server-side validation to `app/api/onboard/create/route.ts`
    - Return 400 if `companyName` is empty/missing or if `naics` resolves to an empty array after splitting
    - Set `trial_started_at` on the profile row if not already set (upsert with `trial_started_at: new Date().toISOString()` only when null)
    - Fix the internal match trigger: replace the `fetch` call to `/api/match/run` with a direct import and call to the matching logic (avoids cold-start race condition)
    - _Requirements: 2.3, 2.4, 2.5, 6.1_

  - [x] 4.2 Write property test for onboarding validation (Property 2)
    - **Property 2: Onboarding validation rejects incomplete submissions**
    - **Validates: Requirements 2.4**

- [x] 5. Middleware — auth, onboard, trial, and admin routing
  - [x] 5.1 Create `middleware.ts` at the project root
    - Use `@supabase/ssr` `createServerClient` with cookie helpers to read the session without exposing service role key
    - Matcher config: apply to all routes except `/_next/*`, `/api/*`, `/login`, `/signup`, `/paywall`, and static assets
    - Rule 1: no session → redirect to `/login`
    - Rule 2: session + no company row → redirect to `/onboard` (skip if already on `/onboard`)
    - Rule 3: session + `trial_started_at` set + trial expired → redirect to `/paywall` (skip if already on `/paywall`)
    - Rule 4: session + `profiles.role !== 'OWNER'` + path starts with `/admin` → redirect to `/dashboard`
    - Set `trial_started_at` on first authenticated request if not yet set
    - _Requirements: 1.8, 2.1, 6.1, 6.4, 8.1_

  - [x] 5.2 Write property test for middleware routing rules (Property 1)
    - **Property 1: Protected routes redirect unauthenticated users**
    - **Validates: Requirements 1.8**

- [x] 6. Auth pages — `/login` and `/signup`
  - [x] 6.1 Create `app/login/page.tsx`
    - Use `@supabase/auth-ui-react` `Auth` component with `ThemeSupa` appearance and `supabaseClient` from `lib/supabase/client.ts`
    - Set `redirectTo` to `/dashboard` on successful sign-in
    - _Requirements: 1.4, 1.5, 1.6_

  - [x] 6.2 Create `app/signup/page.tsx`
    - Same `Auth` component, `view="sign_up"`, `redirectTo` to `/onboard`
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 7. Onboarding page and form hardening
  - [x] 7.1 Create `app/onboard/page.tsx`
    - Server component that renders `<OnboardForm />` from `src/components/OnboardForm.tsx`
    - _Requirements: 2.1, 2.2_

  - [x] 7.2 Add client-side validation to `src/components/OnboardForm.tsx`
    - Block submit and show inline error if `companyName` is empty
    - Block submit and show inline error if `naics` is empty or contains only whitespace/commas
    - _Requirements: 2.4_

- [x] 8. New UI components
  - [x] 8.1 Create `src/components/TrialCountdown.tsx`
    - Accept `trialExpiresAt: string` prop (ISO timestamp)
    - Use `setInterval` (1 s) to compute remaining ms; display `HH:MM:SS` or `X hours remaining`
    - Return `null` when trial is expired
    - _Requirements: 5.8_

  - [x] 8.2 Create `src/components/PaywallScreen.tsx`
    - Full-page overlay with message "Your 24-hour pilot has ended."
    - CTA: mailto link or waitlist form pointing to contact address
    - No match data rendered
    - _Requirements: 5.9, 6.4, 6.5_

  - [x] 8.3 Create `src/components/ProfileSummary.tsx`
    - Accept `companyName: string` and `certifications: string[]` props
    - Render company name and active certifications as badges
    - _Requirements: 5.7_

  - [x] 8.4 Create `src/components/AdminUserTable.tsx`
    - Accept `users: AdminUser[]` prop where `AdminUser = { id, email, companyName, trialStartedAt, role }`
    - Render table with columns: email, company name, trial started, trial expires (computed), status badge (Active / Expired)
    - _Requirements: 8.6_

- [x] 9. Dashboard page
  - [x] 9.1 Create `app/dashboard/page.tsx`
    - Server component: fetch session, fetch profile (`trial_started_at`, company), pass `trialExpiresAt` to client components
    - If trial expired, render `<PaywallScreen />`
    - Otherwise render `<TrialCountdown trialExpiresAt={...} />`, `<ProfileSummary ... />`, and `<DashboardFeed />`
    - _Requirements: 5.1, 5.7, 5.8, 5.9_

  - [x] 9.2 Update `src/components/DashboardFeed.tsx`
    - Handle 403 response from `/api/feed/my` by rendering `<PaywallScreen />`
    - Add score badge (colored by score: green ≥70, amber 40–69)
    - Add deadline urgency indicator: red text/badge when `proposals_due_at` is within 7 days
    - Add SAM.gov link per match card
    - Render empty state message when `matches.length === 0`
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 10. Admin pages
  - [x] 10.1 Create `app/admin/users/page.tsx`
    - Server component: query `profiles` joined with `companies` (service role client) to get user list with trial data
    - Render `<AdminUserTable users={...} />`
    - _Requirements: 8.1, 8.6_

  - [x] 10.2 Verify `app/admin/digest/page.tsx` renders `<RunDigestButton />`
    - Ensure the page imports and renders `RunDigestButton` from `src/components/RunDigestButton.tsx`
    - _Requirements: 8.4, 8.5_

  - [x] 10.3 Verify `app/admin/ingestion/page.tsx` renders `<RunIngestionButton />`
    - Ensure the page imports and renders `RunIngestionButton` from `src/components/RunIngestionButton.tsx`
    - _Requirements: 8.2, 8.3_

- [x] 11. Digest pipeline hardening
  - [x] 11.1 Update `src/lib/digest/generateDigest.ts` to enforce trial expiry and score threshold
    - Filter profiles to only those where `trial_started_at` is set and `trial_started_at + 86400000 ms > now()`
    - Filter `match_scores` to `score >= 40` before deciding whether to send
    - Sort matches by `score DESC` before building email; cap at 10 matches
    - Add deadline warning in HTML for matches where `proposals_due_at` is within 7 days
    - Include `sam_or_source_url` link per match in email body
    - Subject: `Tendly: X new contract matches for [Company Name]`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7_

  - [x] 11.2 Write property tests for digest pipeline (Properties 16, 17, 18, 19)
    - **Property 16: Digest is sent only to users with new matches above threshold**
    - **Property 17: Digest email content is complete and correctly ordered**
    - **Property 18: Digest delivery is recorded in notifications**
    - **Property 19: Expired trial users are skipped in digest**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7**

- [x] 12. Ingestion pipeline hardening
  - [x] 12.1 Verify ingestion run always reaches terminal status (Properties 3, 4, 5, 6)
    - Confirm `try/catch/finally` in both `app/api/ingest/sam/route.ts` and `src/lib/ingest/sam.ts` always updates `ingestion_runs` to `SUCCESS` or `FAILED`
    - Confirm upsert uses `onConflict: 'external_id,source_id'` in both paths
    - Confirm field mapping covers `title`, `agency`, `synopsis`, `sam_or_source_url` as non-null with fallbacks
    - _Requirements: 3.2, 3.4, 3.5, 3.6_

  - [x] 12.2 Write property tests for ingestion pipeline (Properties 3, 4, 5, 6, 9)
    - **Property 3: Ingestion upsert is idempotent**
    - **Property 4: Ingestion run always reaches terminal status**
    - **Property 5: Failed ingestion preserves existing opportunities**
    - **Property 6: Opportunity field mapping is complete**
    - **Property 9: Match computation covers all company–opportunity pairs**
    - **Validates: Requirements 3.2, 3.4, 3.5, 3.6, 4.1**

- [x] 13. `vercel.json` cron schedule
  - [x] 13.1 Update `vercel.json` to add digest cron and fix ingestion path
    - Change ingestion path from `/api/ingest/sam` to `/api/ingest/sam/run`
    - Add digest cron: `{ "path": "/api/digest/run", "schedule": "0 8 * * *" }`
    - _Requirements: 3.3_

- [x] 14. Checkpoint — wire everything together and verify
  - Ensure all tests pass, ask the user if questions arise.
  - Confirm middleware redirects work end-to-end: unauthenticated → `/login`, no company → `/onboard`, expired trial → `/paywall`, non-OWNER on `/admin` → `/dashboard`
  - Confirm `/api/feed/my` returns sorted, threshold-filtered, non-expired matches
  - Confirm `/api/onboard/create` sets `trial_started_at` and triggers match computation

- [x] 15. Property-based tests — trial and data-preservation properties
  - [x] 15.1 Write property test for trial expiry computation (Property 13)
    - **Property 13: Trial expiry is exactly 24 hours after trial start**
    - **Validates: Requirements 6.2**

  - [x] 15.2 Write property test for trial data preservation (Property 15)
    - **Property 15: Trial expiry does not delete user data**
    - **Validates: Requirements 6.7**

  - [x] 15.3 Write property test for admin endpoint auth (Property 20)
    - **Property 20: Admin trigger endpoints require valid CRON_SECRET**
    - **Validates: Requirements 8.7**

- [x] 16. Final checkpoint — ensure all tests pass
  - Run `pnpm vitest --run` and confirm all non-optional tests pass.
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for the pilot week deadline
- Each task references specific requirements for traceability
- Property tests use `fast-check` with `numRuns: 100` minimum; tag each test with `// Feature: tendly-mvp, Property N: <title>`
- The `src/` directory contains the active component and lib code; `app/` contains route handlers and pages — keep this split consistent
- Supabase SSR client (`@supabase/ssr`) must be used in middleware and server components; the service role client is only for server-side route handlers and lib functions

---

## Bugfix Tasks — Content Rendering & SEO

- [x] 17. Write bug condition exploration tests (BEFORE implementing fixes)
  - **Property 1: Bug Condition** - Homepage Redirect, Key Leak, Missing Metadata
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **GOAL**: Surface counterexamples that demonstrate each bug on the current codebase
  - Create `app/__tests__/bugfix-exploration.test.ts`
  - **Test 1 — Homepage redirect bug**: Import `app/page.tsx` default export; render it in a test environment; assert the response does NOT issue a redirect to `/admin/ingestion` and the component body contains landing page content. On unfixed code this FAILS because `redirect('/admin/ingestion')` is called unconditionally.
    - Counterexample to document: `GET /` → 307 redirect to `/admin/ingestion` instead of 200 landing page
    - Bug condition: `isBugCondition_1(X)` where `X.path = '/'` AND `X.responseStatusCode = 307`
  - **Test 2 — Translation key leak bug**: Render the root page component and assert no visible text node matches the pattern `/\b\w+\.\w+(\.\w+)+\b/` (dot-notation i18n keys). On unfixed code any `t('some.key')` call site would leak a raw key string.
    - Counterexample to document: visible text contains `home.hero.title` instead of resolved English string
    - Bug condition: `isBugCondition_2(X)` where `X.visibleText MATCHES /\b\w+\.\w+(\.\w+)+\b/`
  - **Test 3 — Missing metadata bug**: Assert that `app/page.tsx` exports a `metadata` object with `title !== 'Tendly'` and `openGraph` defined. Assert `app/login/page.tsx` and `app/signup/page.tsx` each export a `metadata` object with a page-specific title. On unfixed code all three pages export no `metadata`.
    - Counterexample to document: `metadata` is `undefined` on all individual page segments; no OG tags in `<head>`
    - Bug condition: `isBugCondition_3(X)` where `X.headTitle = 'Tendly'` AND `X.ogTitle = ''`
  - Run all three tests on UNFIXED code
  - **EXPECTED OUTCOME**: All three tests FAIL (this is correct — it proves the bugs exist)
  - Document each counterexample found to confirm root cause before implementing fixes
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 18. Write preservation property tests (BEFORE implementing fixes)
  - **Property 2: Preservation** - Authenticated Flows Unaffected by Homepage/SEO Fix
  - **IMPORTANT**: Follow observation-first methodology — observe UNFIXED code behaviour first
  - Create `app/__tests__/bugfix-preservation.test.ts`
  - **Observe on unfixed code** (paths other than `/` are unaffected by the three bugs):
    - `GET /dashboard` with valid session → middleware allows through, page renders feed
    - `GET /dashboard` with no session → middleware redirects to `/login`
    - `GET /admin/ingestion` with OWNER role → 200 with ingestion page
    - `POST /api/onboard/create` with valid payload → 200, company row created
    - `GET /api/feed/my` with expired trial → 403 `{ error: 'trial_expired' }`
  - Write property-based tests using `fast-check` that generate random combinations of:
    - Authenticated state (session present / absent)
    - User role (`OWNER` / non-OWNER)
    - Trial status (active / expired)
    - Path (any path from the set `/dashboard`, `/onboard`, `/admin/*`, `/login`, `/signup`, `/paywall`, `/api/*`)
  - Assert: for all inputs where `NOT isBugCondition(X)` (i.e. path ≠ `/`), the fixed codebase produces the same response as the original
  - Verify all preservation tests PASS on UNFIXED code before proceeding
  - **EXPECTED OUTCOME**: Tests PASS on unfixed code (confirms baseline behaviour to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 19. Fix — Homepage redirect, translation key leak, and SEO metadata

  - [x] 19.1 Replace homepage redirect with landing page (`app/page.tsx`)
    - Remove `import { redirect } from 'next/navigation'` and the `redirect('/admin/ingestion')` call
    - Write a server component that renders a marketing landing page with:
      - Headline: "Find Government Contracts That Match Your Business"
      - Sub-headline value proposition (hardcoded English — no i18n function calls)
      - Primary CTA button linking to `/signup` (styled with Action Mint `#00D1B2`)
      - Secondary CTA link to `/login`
      - Apply Federal Blue (`#1B365D`) for headings; use `geistSans` font variable already loaded in root layout
    - Export `metadata` with:
      - `title: "Tendly — Find Government Contracts That Match Your Business"`
      - `description: "Tendly matches your business profile to active SAM.gov solicitations. Find government contracts, filter by set-aside, and never miss a deadline."`
      - `openGraph: { title, description, type: 'website' }`
    - All strings MUST be hardcoded English — do NOT use any translation function or dot-notation key
    - _Bug_Condition: isBugCondition_1 — X.path = '/' AND X.responseStatusCode = 307_
    - _Expected_Behavior: HTTP 200, body contains landing page content, no redirect to /admin_
    - _Preservation: requests to all other paths are unaffected_
    - _Requirements: 2.1_

  - [x] 19.2 Remove i18n indirection — hardcode all English strings (`app/page.tsx` and any other affected components)
    - Audit all `.tsx` files for calls to any translation function (e.g. `t('...')`, `useTranslation`, `getTranslations`) or raw dot-notation string literals used as display text
    - Replace every occurrence with the resolved hardcoded English string inline
    - The landing page created in 19.1 must be written with hardcoded strings from the start
    - If a translation utility file exists (e.g. `lib/i18n.ts`, `utils/t.ts`), remove it or replace with a no-op — prefer removing call sites entirely
    - Verify no visible text in any `.tsx` file matches `/\b\w+\.\w+(\.\w+)+\b/` after changes
    - _Bug_Condition: isBugCondition_2 — X.visibleText MATCHES /\b\w+\.\w+(\.\w+)+\b/_
    - _Expected_Behavior: all user-facing strings are resolved human-readable English text_
    - _Preservation: component logic and data-fetching are unaffected_
    - _Requirements: 2.2_

  - [x] 19.3 Add per-page metadata and extend root layout Open Graph (`app/layout.tsx`, `app/login/page.tsx`, `app/signup/page.tsx`)
    - **`app/layout.tsx`**: extend `metadata` export to add `metadataBase` (from `NEXT_PUBLIC_BASE_URL`), `openGraph: { title, description, type: 'website' }`, and `twitter: { card: 'summary_large_image' }` as site-wide fallbacks
    - **`app/login/page.tsx`**: because this is a `'use client'` component, add a thin server-component wrapper file (e.g. `app/login/layout.tsx` or split into `app/login/page.tsx` as server shell + `LoginClient.tsx` as client widget) that exports `metadata = { title: "Log in — Tendly", description: "Log in to your Tendly account to view your personalized government contract matches." }`
    - **`app/signup/page.tsx`**: same pattern — export `metadata = { title: "Sign up — Tendly", description: "Create a free Tendly account and start finding government contracts that match your business in minutes." }`
    - Metadata for `app/page.tsx` is already handled in task 19.1
    - _Bug_Condition: isBugCondition_3 — X.headTitle = 'Tendly' AND X.ogTitle = ''_
    - _Expected_Behavior: every public page returns page-specific title, non-empty description, and OG tags_
    - _Preservation: authenticated page metadata (dashboard, admin, onboard, paywall) is unaffected_
    - _Requirements: 2.3_

  - [x] 19.4 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Homepage Renders, No Key Leak, Rich Metadata
    - **IMPORTANT**: Re-run the SAME tests from task 17 — do NOT write new tests
    - The tests from task 17 encode the expected behaviour; when they pass the bugs are fixed
    - Run `pnpm vitest --run app/__tests__/bugfix-exploration.test.ts`
    - **EXPECTED OUTCOME**: All three tests PASS (confirms all three bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 19.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Authenticated Flows Unaffected
    - **IMPORTANT**: Re-run the SAME tests from task 18 — do NOT write new tests
    - Run `pnpm vitest --run app/__tests__/bugfix-preservation.test.ts`
    - **EXPECTED OUTCOME**: All preservation tests PASS (confirms no regressions in auth, middleware, or API flows)

- [x] 20. Checkpoint — ensure all bugfix tests pass
  - Run `pnpm vitest --run` and confirm all tests pass (both existing MVP tests and new bugfix tests)
  - Verify in a browser (or with `curl`) that `GET /` returns a 200 landing page and not a redirect
  - Verify page source for `/`, `/login`, `/signup` contains page-specific `<title>` and `<meta property="og:title">` tags
  - Ensure all tests pass; ask the user if questions arise
