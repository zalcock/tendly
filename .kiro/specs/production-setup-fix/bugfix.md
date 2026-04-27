# Bugfix Requirements Document

## Introduction

The Tendly production environment is non-functional due to a cluster of integration bugs spanning middleware routing, Apify ingestion, CI/CD pipeline, deployment configuration, and environment variable setup. The application cannot enforce auth routing (middleware.ts is missing from the project root), Apify webhook ingestion silently fails (wrong source type in the database), the CI pipeline never runs tests, Vercel and Netlify deployment configs conflict, and several required environment variables are absent or duplicated in `.env.local`. This document captures each defect, the correct behavior, and the existing behavior that must be preserved.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN any authenticated page route (e.g. `/dashboard`, `/onboard`, `/admin/*`) is requested, THEN the system does not enforce auth, onboarding, trial-expiry, or admin-role routing because `middleware.ts` does not exist at the project root — the implementation lives in `proxy/route.ts` which Next.js never loads as middleware.

1.2 WHEN the Apify webhook (`POST /api/ingest/apify/webhook`) or the Apify run route processes items, THEN the system queries `opportunity_sources` for `type = 'APIFY'` but no such row exists — only `type = 'SAM'` was seeded in migration 001 — so `source_id` is always `null` and every upsert uses a `null` conflict key, causing duplicate rows and broken ingestion run records.

1.3 WHEN the GitHub Actions CI workflow runs on push or pull request, THEN the system executes `pnpm lint` and `pnpm build` but never runs `pnpm vitest --run`, so all property-based and unit tests are silently skipped and regressions go undetected.

1.4 WHEN Vercel attempts to deploy the project, THEN the system has no `vercel.json` output configuration and no `NEXT_PUBLIC_BASE_URL` environment variable set to the production URL, so Supabase auth redirects after login/signup point to `undefined` or `localhost:3000` instead of the live domain.

1.5 WHEN the application is deployed to Netlify (as evidenced by the committed `.netlify/` artifacts and `netlify.toml`), THEN the system uses `npm run build` instead of `pnpm build`, and the `netlify.toml` has no environment variable passthrough for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, or `CRON_SECRET`, so the build fails or produces a broken bundle.

1.6 WHEN `.env.local` is read at runtime, THEN the system has `RESEND_API_KEY` declared twice (once empty, once with a real value) and `NEXT_PUBLIC_APP_URL` instead of `NEXT_PUBLIC_BASE_URL`, so the digest email sender and auth redirect logic may read the wrong value depending on parse order.

1.7 WHEN the Supabase `handle_new_user` trigger fires on new user signup, THEN the system uses `$` as the PL/pgSQL dollar-quote delimiter in migration 006 instead of `$$`, causing a syntax error that prevents the trigger from being created and leaves new users without a `profiles` row.

1.8 WHEN the admin ingestion page (`/admin/ingestion`) or digest page (`/admin/digest`) renders on the server, THEN the system instantiates a raw `createClient` from `@supabase/supabase-js` directly in the page component using the service role key, bypassing `@supabase/ssr` and exposing the service role key in a context where SSR cookie handling is expected, which also means no RLS-aware session is available for future page-level auth checks.

---

### Expected Behavior (Correct)

2.1 WHEN any authenticated page route is requested, THEN the system SHALL enforce routing rules via a `middleware.ts` file at the project root that exports the `middleware` function and `config` matcher — the existing implementation in `proxy/route.ts` SHALL be moved to `middleware.ts`.

2.2 WHEN the Apify webhook or run route processes items, THEN the system SHALL resolve `source_id` from an `opportunity_sources` row with `type = 'APIFY'`, which SHALL be seeded by a new migration (`007_apify_source.sql`) inserting a row with `type = 'APIFY'`, `name = 'Apify SAM Scraper'`, and `base_url = 'https://apify.com'`.

2.3 WHEN the GitHub Actions CI workflow runs, THEN the system SHALL execute `pnpm vitest --run` as a dedicated test step after the install step and before the build step, so test failures block the build.

2.4 WHEN Vercel deploys the project, THEN the system SHALL have `NEXT_PUBLIC_BASE_URL` set to the production domain in Vercel environment variables, and the `vercel.json` SHALL remain as-is (cron config is correct); the login and signup pages SHALL use `NEXT_PUBLIC_BASE_URL` for `redirectTo` (already implemented — the env var just needs to be set).

2.5 WHEN the project is built on Netlify, THEN the `netlify.toml` SHALL use `pnpm build` as the build command and SHALL declare the required environment variable keys (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_BASE_URL`) so Netlify surfaces them in the UI for the operator to fill in.

2.6 WHEN `.env.local` is read, THEN the system SHALL have exactly one `RESEND_API_KEY` entry (the real value) and SHALL use `NEXT_PUBLIC_BASE_URL` (not `NEXT_PUBLIC_APP_URL`) as the canonical base URL key, consistent with how the codebase references it.

2.7 WHEN the Supabase `handle_new_user` trigger is created via migration 006, THEN the system SHALL use `$$` as the PL/pgSQL dollar-quote delimiter so the function body is parsed correctly and new users automatically receive a `profiles` row on signup.

2.8 WHEN the admin ingestion and digest pages render, THEN the system SHALL use the `@supabase/ssr` `createServerClient` with empty cookie stubs (service-role pattern already used in `app/admin/users/page.tsx`) instead of the raw `@supabase/supabase-js` `createClient`, so all admin pages follow the same consistent pattern.

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user submits valid login credentials, THEN the system SHALL CONTINUE TO authenticate via Supabase Auth and redirect to `/dashboard`.

3.2 WHEN a user submits the onboarding form with a valid company name and at least one NAICS code, THEN the system SHALL CONTINUE TO create a company profile and trigger match computation.

3.3 WHEN the SAM.gov ingestion route (`/api/ingest/sam/run`) is called with a valid `CRON_SECRET`, THEN the system SHALL CONTINUE TO upsert opportunities and compute match scores using the existing `runSamIngestion` function.

3.4 WHEN `/api/feed/my` is called by an authenticated user with an active trial, THEN the system SHALL CONTINUE TO return matches filtered by score ≥ 40, sorted by score descending, excluding expired opportunities.

3.5 WHEN `/api/feed/my` is called by a user whose trial has expired, THEN the system SHALL CONTINUE TO return HTTP 403 with `{ error: 'trial_expired' }`.

3.6 WHEN the digest route (`/api/digest/run`) is called with a valid `CRON_SECRET`, THEN the system SHALL CONTINUE TO send emails only to users with active trials and new matches above the score threshold.

3.7 WHEN the Apify scraper webhook (`/api/ingest/scraper/webhook`) receives a valid payload with `x-scraper-secret`, THEN the system SHALL CONTINUE TO upsert opportunities and compute match scores.

3.8 WHEN all existing property-based tests are run with `pnpm vitest --run`, THEN the system SHALL CONTINUE TO pass all tests in `lib/__tests__/`, `app/api/**/__tests__/`, and `src/lib/**/__tests__/`.
