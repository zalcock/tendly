# Tendly MVP — Bugfix Design

## Overview

Three bugs prevent the Tendly platform from functioning as a production-ready, publicly
discoverable SaaS product:

1. **Homepage redirect** — `app/page.tsx` unconditionally calls `redirect('/admin/ingestion')`,
   so no visitor ever sees a landing page.
2. **Translation key leak** — the codebase was scaffolded with an i18n layer in mind but no
   i18n library was ever installed or configured. Any component that calls a translation
   function (e.g. `t('home.hero.title')`) would render the raw key string instead of resolved
   text. For the MVP the fix is to remove the i18n indirection and use hardcoded English strings
   directly in components.
3. **Missing SEO metadata** — only `app/layout.tsx` exports a `metadata` object, and it
   contains only a generic title and description with no Open Graph tags. Individual pages
   (`/login`, `/signup`, `/onboard`, `/dashboard`, `/paywall`) export no `metadata` at all,
   so every page inherits the same undifferentiated fallback.

The fix strategy is minimal and targeted: replace the redirect with a real landing page
component, remove i18n indirection in favour of direct strings, and add per-page `metadata`
exports plus Open Graph fields to the root layout.

---

## Glossary

- **Bug_Condition (C)**: The set of page requests that trigger at least one of the three bugs —
  a root-URL visit that redirects, a render that outputs a dot-notation key, or a page response
  that carries no meaningful SEO metadata.
- **Property (P)**: The desired correct behaviour for each buggy input — landing page renders,
  human-readable text appears, and rich metadata is present in the HTML `<head>`.
- **Preservation**: All authenticated flows (dashboard, onboard, admin, paywall, login, signup)
  and all API routes must behave identically after the fix.
- **`app/page.tsx`**: The Next.js App Router root segment. Currently contains only an
  unconditional `redirect()` call.
- **`app/layout.tsx`**: The root layout. Exports a single shared `metadata` object used as the
  fallback for every page.
- **`generateMetadata` / `export const metadata`**: Next.js App Router mechanisms for
  per-segment metadata. Static pages use `export const metadata`; dynamic pages use
  `generateMetadata`.
- **i18n key leak**: A string of the form `namespace.key.subkey` rendered as visible text
  because no translation function resolved it to a human-readable string.

---

## Bug Details

### Bug 1 — Homepage Redirect

The root page component performs an unconditional server-side redirect before rendering any
content. No landing page is ever shown to any visitor, authenticated or not.

**Formal Specification:**
```
FUNCTION isBugCondition_1(X)
  INPUT: X of type PageRequest
  OUTPUT: boolean

  RETURN X.path = '/'
         AND X.responseStatusCode = 307
         AND X.responseLocation = '/admin/ingestion'
END FUNCTION
```

**Examples:**
- Unauthenticated visitor hits `/` → 307 redirect to `/admin/ingestion` (bug: should render landing page)
- Search engine crawler hits `/` → 307 redirect (bug: crawler follows redirect to admin, no landing page indexed)
- Authenticated non-admin user hits `/` → 307 redirect to `/admin/ingestion` (bug: admin page shown to regular user)

### Bug 2 — Translation Key Leak

No i18n library (`next-intl`, `react-i18next`, etc.) is present in `package.json`. Any
component that calls a translation function would receive the raw key string as output because
the function is either undefined or returns its argument unchanged.

**Formal Specification:**
```
FUNCTION isBugCondition_2(X)
  INPUT: X of type RenderedPageOutput
  OUTPUT: boolean

  RETURN X.visibleText MATCHES_PATTERN /\b\w+\.\w+(\.\w+)+\b/
         // i.e. visible text contains dot-notation strings like "home.hero.title"
END FUNCTION
```

**Examples:**
- Landing page renders `home.hero.title` instead of "Find Government Contracts That Match Your Business"
- Navigation renders `nav.login` instead of "Log in"
- CTA button renders `home.cta.getStarted` instead of "Get started free"

### Bug 3 — Missing SEO Metadata

Individual page segments export no `metadata` object. The root layout fallback provides only
`title: "Tendly"` and a single description string, with no Open Graph or Twitter card tags.

**Formal Specification:**
```
FUNCTION isBugCondition_3(X)
  INPUT: X of type PageHTMLResponse
  OUTPUT: boolean

  RETURN (
    X.headTitle = 'Tendly'                    // generic fallback, not page-specific
    AND X.metaDescription = ''                // missing or empty
    OR X.ogTitle = ''                         // no Open Graph title
    OR X.ogDescription = ''                   // no Open Graph description
  )
END FUNCTION
```

**Examples:**
- `/` returns `<title>Tendly</title>` with no description or OG tags (bug: should have rich landing page metadata)
- `/login` returns `<title>Tendly</title>` (bug: should be "Log in — Tendly")
- Sharing any page on Slack/Twitter shows no preview card (bug: no OG tags)

---

## Expected Behavior

### Preservation Requirements

The following behaviours must be completely unchanged by this fix:

**Unchanged Behaviors:**
- Authenticated users navigating to `/dashboard` continue to see their personalized contract feed.
- Unauthenticated users navigating to `/dashboard` or `/onboard` continue to be redirected to `/login` by middleware.
- Admin users navigating to `/admin/ingestion`, `/admin/digest`, `/admin/users` continue to see the respective admin pages.
- Users completing sign-up continue to be redirected to `/onboard`.
- Users completing onboarding continue to be redirected to `/dashboard`.
- The `/api/feed/my` endpoint continues to return 403 after trial expiry.
- All API routes (`/api/ingest/*`, `/api/digest/run`, `/api/onboard/create`) continue to function identically.

**Scope:**
All requests that do NOT match the three bug conditions above are completely unaffected by
this fix. This includes:
- Any request to a path other than `/`
- Any authenticated page render (dashboard, onboard, admin, paywall)
- Any API route call
- Any middleware redirect for auth/trial enforcement

---

## Hypothesized Root Cause

### Bug 1 — Homepage Redirect

The redirect was intentionally added during early development as a shortcut to reach the admin
ingestion page quickly. The comment in the file confirms this: `// redirect to admin ingestion
page as default landing for dev/admin`. It was never replaced with a real landing page
implementation.

**Root cause:** Placeholder development shortcut left in production code.

### Bug 2 — Translation Key Leak

The codebase was scaffolded with i18n in mind (dot-notation string keys are referenced in
component code or design documents) but the i18n library was never installed or configured.
There is no `next-intl` or equivalent in `package.json`, no `messages/` directory, and no
`i18n.ts` configuration file.

**Root cause:** i18n library dependency missing; translation function either undefined or
identity-returning, causing raw keys to pass through to the DOM.

**Fix approach:** For the MVP, remove i18n indirection entirely. Use hardcoded English strings
directly in components. i18n can be added in a future iteration when multi-language support
is actually required.

### Bug 3 — Missing SEO Metadata

Next.js App Router requires each page segment to export its own `metadata` object (or
`generateMetadata` function) to override the root layout fallback. No page segment in this
codebase does so. The root layout's `metadata` also lacks Open Graph fields.

**Root cause:** Per-page `metadata` exports were never added; root layout `metadata` is
incomplete (no `openGraph`, no `twitter` fields).

---

## Correctness Properties

Property 1: Bug Condition — Homepage Renders Landing Page

_For any_ HTTP GET request to `/` where the visitor is unauthenticated, the fixed `app/page.tsx`
SHALL return HTTP 200 with a rendered landing page containing a headline, value proposition,
and at least one call-to-action link, and SHALL NOT issue a redirect to any admin route.

**Validates: Requirements 2.1**

Property 2: Bug Condition — No Translation Keys in Rendered Output

_For any_ rendered page output from the fixed codebase, the visible text content SHALL NOT
contain strings matching the pattern `/\b\w+\.\w+(\.\w+)+\b/` (dot-notation i18n keys). All
user-facing strings SHALL be resolved human-readable English text.

**Validates: Requirements 2.2**

Property 3: Bug Condition — Pages Return Rich SEO Metadata

_For any_ HTTP GET request to a public-facing page (`/`, `/login`, `/signup`), the fixed
response SHALL include an HTML `<head>` containing: a page-specific `<title>` tag (not just
"Tendly"), a `<meta name="description">` with non-empty content, and `<meta property="og:title">`
and `<meta property="og:description">` Open Graph tags.

**Validates: Requirements 2.3**

Property 4: Preservation — Authenticated Flows Unaffected

_For any_ request to a path other than `/` (including `/dashboard`, `/onboard`, `/admin/*`,
`/login`, `/signup`, `/paywall`, and all `/api/*` routes), the fixed codebase SHALL produce
exactly the same response as the original codebase, preserving all existing authentication,
trial enforcement, and data-access behaviour.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

---

## Fix Implementation

### Bug 1 — Replace Homepage Redirect

**File:** `app/page.tsx`

**Change:** Remove the `redirect('/admin/ingestion')` call. Replace the component body with a
server component that renders a marketing landing page. The landing page must not require
authentication — it is the public entry point.

**Specific changes:**
1. Remove `import { redirect } from 'next/navigation'` and the `redirect()` call.
2. Add `export const metadata` with page-specific title, description, and Open Graph tags.
3. Render a landing page with: headline ("Find Government Contracts That Match Your Business"),
   sub-headline (value proposition), and CTA buttons linking to `/signup` and `/login`.
4. Apply Tendly design tokens: Federal Blue (`#1B365D`) for headings, Action Mint (`#00D1B2`)
   for the primary CTA button, Inter font (already loaded via `geistSans` variable or direct
   import).

### Bug 2 — Remove i18n Indirection

**Scope:** Any component or page that references dot-notation translation keys.

**Change:** Replace every `t('some.key')` call (or equivalent) with the hardcoded English
string it was intended to resolve. No i18n library needs to be installed.

**Specific changes:**
1. Audit all `.tsx` files for calls to any translation function or raw dot-notation string
   literals used as display text.
2. Replace each occurrence with the resolved English string inline.
3. If a translation utility file exists (e.g. `lib/i18n.ts` or `utils/t.ts`), either delete
   it or replace it with a no-op that returns its argument — but prefer removing the call sites
   entirely.

**Note:** Based on current codebase inspection, no i18n library is installed and no translation
call sites were found in existing `.tsx` files. The landing page created for Bug 1 must be
written with hardcoded strings from the start to prevent this bug from manifesting there.

### Bug 3 — Add Per-Page Metadata and Open Graph to Root Layout

**Files:** `app/layout.tsx`, `app/page.tsx`, `app/login/page.tsx`, `app/signup/page.tsx`

**Changes to `app/layout.tsx`:**
1. Extend the `metadata` export to include `openGraph` and `twitter` fields as the site-wide
   fallback.
2. Add `metadataBase` pointing to `NEXT_PUBLIC_BASE_URL` so relative OG image URLs resolve
   correctly.

**Changes to `app/page.tsx`:**
1. Export `metadata` with title `"Tendly — Find Government Contracts That Match Your Business"`,
   a keyword-rich description targeting "government contract matching", "find government
   contracts", "SAM.gov contract finder", and full Open Graph fields.

**Changes to `app/login/page.tsx`:**
1. Add `export const metadata` with title `"Log in — Tendly"` and a brief description.
   (Note: this is a Client Component — metadata must be exported from a separate Server
   Component wrapper or the page must be split into a server shell + client Auth widget.)

**Changes to `app/signup/page.tsx`:**
1. Same pattern as login: `"Sign up — Tendly"` title and description.

**Metadata values:**

| Page | title | description |
|---|---|---|
| `/` (root layout fallback) | `"Tendly"` | `"AI-powered government contract matching for small businesses"` |
| `/` (page override) | `"Tendly — Find Government Contracts That Match Your Business"` | `"Tendly matches your business profile to active SAM.gov solicitations. Find government contracts, filter by set-aside, and never miss a deadline."` |
| `/login` | `"Log in — Tendly"` | `"Log in to your Tendly account to view your personalized government contract matches."` |
| `/signup` | `"Sign up — Tendly"` | `"Create a free Tendly account and start finding government contracts that match your business in minutes."` |

---

## Testing Strategy

### Validation Approach

Testing follows a two-phase approach: first confirm the bug is reproducible on unfixed code
(exploratory), then verify the fix resolves it without breaking preserved behaviour.

### Exploratory Bug Condition Checking

**Goal:** Surface counterexamples that demonstrate each bug on the unfixed codebase. Confirm
root cause analysis before implementing fixes.

**Test Plan:** Write tests that render the affected components/pages and assert on the output.
Run on the unfixed code to observe failures.

**Test Cases:**

1. **Homepage redirect test** — render `app/page.tsx` in a test environment and assert the
   response status is 200 and the body contains landing page content. On unfixed code this
   will fail because `redirect()` is called instead. *(will fail on unfixed code)*

2. **Translation key leak test** — render the landing page component and assert that no
   visible text node matches `/\b\w+\.\w+(\.\w+)+\b/`. On unfixed code any i18n call site
   would leak a key. *(will fail on unfixed code if i18n call sites exist)*

3. **Root page metadata test** — render `app/page.tsx` and assert `metadata.title` is not
   `"Tendly"` and `metadata.openGraph` is defined. On unfixed code the page exports no
   `metadata`. *(will fail on unfixed code)*

4. **Login/signup metadata test** — assert `metadata` exports exist on login and signup pages
   with page-specific titles. *(will fail on unfixed code)*

**Expected Counterexamples:**
- Homepage render returns a redirect response rather than 200 HTML.
- `metadata` is `undefined` on all individual page segments.
- No Open Graph tags present in rendered `<head>`.

### Fix Checking

**Goal:** Verify that for all inputs where the bug condition holds, the fixed code produces
the expected behaviour.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  result := renderPage_fixed(X)
  ASSERT (
    (X.path = '/' IMPLIES result.statusCode = 200
                          AND result.body CONTAINS landing_page_content
                          AND result.body NOT CONTAINS redirect_to_admin)
    AND result.visibleText NOT_MATCHES /\b\w+\.\w+(\.\w+)+\b/
    AND result.head.title IS page_specific
    AND result.head.ogTitle IS NOT EMPTY
    AND result.head.ogDescription IS NOT EMPTY
  )
END FOR
```

### Preservation Checking

**Goal:** Verify that for all inputs where the bug condition does NOT hold, the fixed code
produces the same result as the original code.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT renderPage_original(X) = renderPage_fixed(X)
  // Paths: /dashboard, /onboard, /admin/*, /login, /signup, /paywall, /api/*
END FOR
```

**Testing Approach:** Property-based testing is appropriate for preservation checking because:
- It generates many combinations of authenticated state, trial status, and path automatically.
- It catches edge cases (e.g. admin user hitting `/`, expired trial user hitting `/login`) that
  manual tests might miss.
- It provides strong guarantees that middleware and auth flows are unaffected.

**Test Cases:**
1. **Dashboard preservation** — authenticated user with active trial hitting `/dashboard`
   continues to receive 200 with feed content.
2. **Auth redirect preservation** — unauthenticated user hitting `/dashboard` continues to
   receive a redirect to `/login`.
3. **Admin route preservation** — OWNER-role user hitting `/admin/ingestion` continues to
   receive 200 with ingestion run data.
4. **API route preservation** — POST to `/api/onboard/create` with valid payload continues to
   create a company record and return 200.
5. **Trial expiry preservation** — GET to `/api/feed/my` for expired-trial user continues to
   return 403 with `{ error: 'trial_expired' }`.

### Unit Tests

- Render `app/page.tsx` and assert: status 200, presence of headline text, presence of CTA
  links to `/signup` and `/login`, absence of any redirect call.
- Assert `metadata` export on `app/page.tsx` has non-generic title and non-empty
  `openGraph.title` and `openGraph.description`.
- Assert `metadata` exports on `app/login/page.tsx` and `app/signup/page.tsx` have
  page-specific titles.
- Assert root layout `metadata` includes `openGraph` and `metadataBase` fields.
- Render landing page component and assert no visible text matches dot-notation key pattern.

### Property-Based Tests

- Generate random authenticated user states (role, trial status) and assert that requests to
  paths other than `/` produce identical responses before and after the fix (preservation).
- Generate random combinations of page paths and assert that every public page (`/`, `/login`,
  `/signup`) returns a non-empty, page-specific `<title>` tag.
- Generate random strings and assert the landing page component never renders them as
  dot-notation keys (i.e. the component uses only hardcoded strings, not dynamic key lookups).

### Integration Tests

- Full browser render of `/` — assert landing page is visible, no redirect occurs, page title
  is correct in the browser tab, and OG meta tags are present in the DOM.
- Social share preview simulation — fetch `/` with a bot user-agent and assert OG tags are
  present and non-empty.
- Authenticated user visits `/` — assert they see the landing page (not an admin redirect),
  and can navigate to `/dashboard` via the CTA.
