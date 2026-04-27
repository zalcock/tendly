// Bug condition exploration tests — EXPECTED TO FAIL on unfixed code
//
// These tests confirm the three bugs exist on the current (unfixed) codebase.
// They are intentionally written to FAIL — failure is the correct outcome here.
// Do NOT fix the code or the tests when they fail.
//
// Bug conditions being tested:
//   isBugCondition_1: GET / → 307 redirect to /admin/ingestion (should be 200 landing page)
//   isBugCondition_2: rendered text contains dot-notation i18n keys (e.g. home.hero.title)
//   isBugCondition_3: page segments export no metadata / no openGraph tags

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock next/navigation so redirect() doesn't throw during import/render
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

// Mock next/font/google to avoid font loading in test environment
vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: '--font-geist-sans', className: 'geist-sans' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono', className: 'geist-mono' }),
}))

describe('Bug condition exploration tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------------------------------------------------------------------------
  // Test 1 — Homepage redirect bug (isBugCondition_1)
  //
  // EXPECTED TO FAIL on unfixed code.
  // The current app/page.tsx calls redirect('/admin/ingestion') unconditionally.
  // This test asserts the redirect spy was NOT called and that the component
  // renders actual landing page content.
  //
  // Counterexample on unfixed code:
  //   redirect('/admin/ingestion') IS called → spy.mock.calls.length > 0
  //   component returns null → no landing page content rendered
  // ---------------------------------------------------------------------------
  it('Test 1 — Homepage does NOT redirect to /admin/ingestion and renders landing page content', async () => {
    const { redirect } = await import('next/navigation')
    const redirectSpy = vi.mocked(redirect)

    // Dynamically import the page module (after mocks are in place)
    const pageModule = await import('../page')
    const HomePage = pageModule.default

    // Assert: redirect spy was NOT called during module evaluation
    // On unfixed code this FAILS because redirect('/admin/ingestion') is called at module level
    expect(redirectSpy).not.toHaveBeenCalled()

    // Assert: the component is a function (not null/undefined)
    expect(typeof HomePage).toBe('function')

    // Call the component — on unfixed code it returns null
    const result = HomePage()

    // Assert: the component returns non-null JSX (i.e. actual landing page content)
    // On unfixed code this FAILS because the component returns null
    expect(result).not.toBeNull()

    // Assert: rendered output contains some landing page content
    // We check the JSX tree for a heading or CTA text
    const resultStr = JSON.stringify(result)
    const hasLandingContent =
      resultStr.includes('Government Contract') ||
      resultStr.includes('signup') ||
      resultStr.includes('Get started') ||
      resultStr.includes('landing')
    // On unfixed code this FAILS because result is null (JSON.stringify(null) = 'null')
    expect(hasLandingContent).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Test 2 — Translation key leak bug (isBugCondition_2)
  //
  // NOTE: On the CURRENT unfixed code, app/page.tsx only calls redirect() and
  // returns null — so no text is rendered at all. This test will PASS trivially
  // on unfixed code because null output contains no dot-notation keys.
  //
  // This test becomes meaningful after task 19.1 adds the landing page.
  // It guards against accidentally introducing i18n key leaks in the new page.
  //
  // The test is included here to document the bug condition and will be re-run
  // in task 19.4 to confirm the fixed landing page uses hardcoded strings.
  // ---------------------------------------------------------------------------
  it('Test 2 — Rendered page output contains no dot-notation i18n key strings', async () => {
    const pageModule = await import('../page')
    const HomePage = pageModule.default

    const result = HomePage()

    // Serialize the rendered output to a string for inspection
    const renderedText = result ? JSON.stringify(result) : ''

    // Pattern: dot-notation keys like home.hero.title, nav.login, home.cta.getStarted
    const i18nKeyPattern = /\b\w+\.\w+(\.\w+)+\b/

    // Assert: no dot-notation i18n keys appear in the rendered output
    // On unfixed code this PASSES trivially (result is null, no text rendered).
    // After task 19.1 this will catch any accidental t('key') usage.
    expect(renderedText).not.toMatch(i18nKeyPattern)
  })

  // ---------------------------------------------------------------------------
  // Test 3 — Missing metadata bug (isBugCondition_3)
  //
  // EXPECTED TO FAIL on unfixed code.
  // None of the three page segments export a `metadata` object.
  //
  // Counterexamples on unfixed code:
  //   app/page.tsx    → metadata is undefined
  //   app/login/page.tsx  → metadata is undefined (client component, no export)
  //   app/signup/page.tsx → metadata is undefined (client component, no export)
  // ---------------------------------------------------------------------------
  it('Test 3 — Page segments export page-specific metadata with openGraph', async () => {
    // --- app/page.tsx ---
    const rootPageModule = await import('../page')

    // Assert: metadata is exported and defined
    // On unfixed code this FAILS because app/page.tsx exports no metadata
    expect(rootPageModule.metadata).toBeDefined()

    const rootMeta = rootPageModule.metadata as Record<string, unknown>

    // Assert: title is page-specific (not the generic root layout fallback "Tendly")
    // On unfixed code this FAILS because metadata is undefined
    expect(rootMeta.title).not.toBe('Tendly')

    // Assert: openGraph is defined and non-null
    // On unfixed code this FAILS because metadata is undefined
    expect(rootMeta.openGraph).toBeDefined()
    expect(rootMeta.openGraph).not.toBeNull()

    // --- app/login/page.tsx ---
    const loginPageModule = await import('../login/page')

    // Assert: metadata is exported and defined
    // On unfixed code this FAILS because login/page.tsx is a 'use client' component with no metadata export
    expect((loginPageModule as Record<string, unknown>).metadata).toBeDefined()

    const loginMeta = (loginPageModule as Record<string, unknown>).metadata as Record<string, unknown>

    // Assert: title contains "Log in"
    expect(String(loginMeta.title)).toContain('Log in')

    // --- app/signup/page.tsx ---
    const signupPageModule = await import('../signup/page')

    // Assert: metadata is exported and defined
    // On unfixed code this FAILS because signup/page.tsx is a 'use client' component with no metadata export
    expect((signupPageModule as Record<string, unknown>).metadata).toBeDefined()

    const signupMeta = (signupPageModule as Record<string, unknown>).metadata as Record<string, unknown>

    // Assert: title contains "Sign up"
    expect(String(signupMeta.title)).toContain('Sign up')
  })
})
