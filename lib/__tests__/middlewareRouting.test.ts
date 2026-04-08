// Feature: tendly-mvp, Property 1: Protected routes redirect unauthenticated users
// Validates: Requirements 1.8

import { describe, test, expect } from 'vitest'
import fc from 'fast-check'
import { resolveRoute, type RoutingContext } from '../middlewareRouting'

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Protected routes that the middleware matcher covers (excludes /login, /signup, /paywall, /api/*) */
const protectedPathArb = fc.oneof(
  fc.constant('/dashboard'),
  fc.constant('/onboard'),
  fc.constant('/admin'),
  fc.constant('/admin/users'),
  fc.constant('/admin/digest'),
  fc.constant('/admin/ingestion'),
  // arbitrary sub-paths under /admin
  fc.string({ minLength: 1, maxLength: 20 }).map(s => `/admin/${s.replace(/[^a-z0-9-]/gi, 'x')}`),
  // arbitrary other protected paths
  fc.string({ minLength: 1, maxLength: 20 }).map(s => `/${s.replace(/[^a-z0-9-]/gi, 'x')}`),
)

const activeProfileArb = fc.record({
  role: fc.constantFrom('USER', 'OWNER'),
  // trial started between 1 minute and 23 hours ago → still active
  trial_started_at: fc
    .integer({ min: 60_000, max: 23 * 60 * 60 * 1000 })
    .map(offsetMs => new Date(Date.now() - offsetMs).toISOString()),
})

const companyArb = fc.record({ id: fc.uuid() })

// ---------------------------------------------------------------------------
// Property 1: Protected routes redirect unauthenticated users to /login
// ---------------------------------------------------------------------------

describe('Property 1: Protected routes redirect unauthenticated users', () => {
  test('any protected route with no session redirects to /login', () => {
    fc.assert(
      fc.property(protectedPathArb, (pathname) => {
        const ctx: RoutingContext = {
          pathname,
          user: null,
          profile: null,
          company: null,
        }
        const decision = resolveRoute(ctx)
        return decision.action === 'redirect' && decision.destination === '/login'
      }),
      { numRuns: 100 }
    )
  })

  test('/dashboard with no session redirects to /login', () => {
    const ctx: RoutingContext = {
      pathname: '/dashboard',
      user: null,
      profile: null,
      company: null,
    }
    const decision = resolveRoute(ctx)
    expect(decision).toEqual({ action: 'redirect', destination: '/login' })
  })

  test('/onboard with no session redirects to /login', () => {
    const ctx: RoutingContext = {
      pathname: '/onboard',
      user: null,
      profile: null,
      company: null,
    }
    const decision = resolveRoute(ctx)
    expect(decision).toEqual({ action: 'redirect', destination: '/login' })
  })

  test('/admin/* with no session redirects to /login', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 30 }).map(s => `/admin/${s}`),
        (pathname) => {
          const ctx: RoutingContext = {
            pathname,
            user: null,
            profile: null,
            company: null,
          }
          const decision = resolveRoute(ctx)
          return decision.action === 'redirect' && decision.destination === '/login'
        }
      ),
      { numRuns: 100 }
    )
  })

  // Rule 1 fires before all other rules — even if profile/company data is present
  test('no session always redirects to /login regardless of profile or company data', () => {
    fc.assert(
      fc.property(
        protectedPathArb,
        fc.option(activeProfileArb, { nil: null }),
        fc.option(companyArb, { nil: null }),
        (pathname, profile, company) => {
          const ctx: RoutingContext = {
            pathname,
            user: null,
            profile,
            company,
          }
          const decision = resolveRoute(ctx)
          return decision.action === 'redirect' && decision.destination === '/login'
        }
      ),
      { numRuns: 100 }
    )
  })

  // Authenticated users with a valid session and company should NOT be redirected to /login
  test('authenticated user with active trial and company is NOT redirected to /login', () => {
    fc.assert(
      fc.property(
        protectedPathArb.filter(p => p !== '/admin' && !p.startsWith('/admin/')),
        activeProfileArb,
        companyArb,
        (pathname, profile, company) => {
          const ctx: RoutingContext = {
            pathname,
            user: { id: 'user-123' },
            profile,
            company,
          }
          const decision = resolveRoute(ctx)
          // Should not redirect to /login (may redirect for other rules, but not /login)
          return !(decision.action === 'redirect' && decision.destination === '/login')
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Sanity checks for the other routing rules (ensures Rule 1 priority is correct)
// ---------------------------------------------------------------------------

describe('Routing rule priority — Rule 1 fires before Rules 2, 3, 4', () => {
  test('Rule 2 (no company → /onboard) only fires when user IS authenticated', () => {
    // With no user, should go to /login, not /onboard
    const ctx: RoutingContext = {
      pathname: '/dashboard',
      user: null,
      profile: { role: 'USER', trial_started_at: new Date().toISOString() },
      company: null,
    }
    const decision = resolveRoute(ctx)
    expect(decision).toEqual({ action: 'redirect', destination: '/login' })
  })

  test('Rule 3 (expired trial → /paywall) only fires when user IS authenticated', () => {
    const expiredTrialStart = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const ctx: RoutingContext = {
      pathname: '/dashboard',
      user: null,
      profile: { role: 'USER', trial_started_at: expiredTrialStart },
      company: { id: 'co-1' },
    }
    const decision = resolveRoute(ctx)
    expect(decision).toEqual({ action: 'redirect', destination: '/login' })
  })

  test('Rule 4 (non-OWNER on /admin → /dashboard) only fires when user IS authenticated', () => {
    const ctx: RoutingContext = {
      pathname: '/admin/users',
      user: null,
      profile: { role: 'USER', trial_started_at: new Date().toISOString() },
      company: { id: 'co-1' },
    }
    const decision = resolveRoute(ctx)
    expect(decision).toEqual({ action: 'redirect', destination: '/login' })
  })
})
