# Bugfix Requirements Document

## Introduction

The Tendly platform has a set of content rendering and SEO issues that prevent the application from functioning as a production-ready, publicly discoverable SaaS product. Three related defects exist:

1. **Translation key rendering** — pages that use (or are intended to use) an i18n layer display raw dot-notation keys (e.g., `home.hero.title`) instead of resolved human-readable text.
2. **Homepage misdirection** — `app/page.tsx` unconditionally redirects all visitors to `/admin/ingestion`, meaning no public-facing landing page is ever shown.
3. **Missing SEO metadata** — key pages lack proper `<title>`, `<meta name="description">`, and Open Graph tags, making them invisible to search engines and unfurl-unfriendly on social media.

These bugs collectively mean the platform cannot be crawled, indexed, or evaluated by prospective users visiting the root URL.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a visitor navigates to the root URL (`/`) THEN the system immediately redirects them to `/admin/ingestion` without rendering any landing page content.

1.2 WHEN a page component renders a string value that was intended to be resolved through an i18n translation function THEN the system displays the raw translation key (e.g., `home.hero.title`, `nav.login`) as visible text on screen instead of the human-readable string.

1.3 WHEN a search engine crawler or social media unfurler requests any page THEN the system returns pages with no meaningful `<title>` tag, no `<meta name="description">`, and no Open Graph tags, causing the page to appear as "Tendly" with no description in search results.

1.4 WHEN a page component relies on a translation function that has no matching key in the loaded message catalog THEN the system silently falls back to rendering the key string, with no error or warning surfaced to developers.

### Expected Behavior (Correct)

2.1 WHEN a visitor navigates to the root URL (`/`) THEN the system SHALL render a public-facing marketing landing page with real content (headline, value proposition, call-to-action) and SHALL NOT redirect unauthenticated visitors to any admin route.

2.2 WHEN a page component renders a translated string THEN the system SHALL display the resolved human-readable text (e.g., "Find Government Contracts That Match Your Business") and SHALL NOT display the raw translation key.

2.3 WHEN a search engine crawler or social media unfurler requests any page THEN the system SHALL return a page with a descriptive `<title>`, a `<meta name="description">` containing keyword-rich content targeting "government contract matching", "find government contracts", and "SAM.gov contract finder", and appropriate Open Graph tags.

2.4 WHEN a translation key is missing from the message catalog THEN the system SHALL surface a build-time or runtime warning to developers and SHALL fall back to a sensible default string rather than the raw key.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN an authenticated user with a valid session navigates to `/dashboard` THEN the system SHALL CONTINUE TO display their personalized contract matches without interruption.

3.2 WHEN an unauthenticated user navigates to `/dashboard` or `/onboard` THEN the system SHALL CONTINUE TO redirect them to the login page.

3.3 WHEN an admin user navigates to `/admin/ingestion`, `/admin/digest`, or `/admin/users` THEN the system SHALL CONTINUE TO display the respective admin pages with full functionality.

3.4 WHEN a user completes sign-up THEN the system SHALL CONTINUE TO redirect them to `/onboard` for profile setup.

3.5 WHEN a user completes onboarding THEN the system SHALL CONTINUE TO redirect them to `/dashboard`.

3.6 WHEN the `/api/feed/my` endpoint is called after trial expiry THEN the system SHALL CONTINUE TO return a 403 response.

---

## Bug Condition Pseudocode

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type PageRequest
  OUTPUT: boolean

  // Bug is triggered when any of the following are true:
  RETURN (
    X.path = '/'                                          // homepage redirect bug
    OR X.renderedText CONTAINS_PATTERN /\w+\.\w+\.\w+/   // translation key leak
    OR X.pageMetadata.title = 'Tendly'                    // generic/missing SEO title
       AND X.pageMetadata.description = ''                // missing meta description
  )
END FUNCTION
```

### Fix Checking Property

```pascal
// Property: Fix Checking — Content Rendering and SEO
FOR ALL X WHERE isBugCondition(X) DO
  result ← renderPage'(X)
  ASSERT (
    (X.path = '/' IMPLIES result.statusCode = 200 AND result.body CONTAINS landing_page_content)
    AND result.renderedText NOT_CONTAINS_PATTERN /\w+\.\w+\.\w+/
    AND result.metadata.title != 'Tendly'
    AND result.metadata.description != ''
    AND result.metadata.ogTitle != ''
  )
END FOR
```

### Preservation Checking Property

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT renderPage(X) = renderPage'(X)
  // Authenticated dashboard, admin, onboard, login, signup flows are unaffected
END FOR
```
