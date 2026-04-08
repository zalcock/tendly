/**
 * Pure routing decision logic extracted from middleware.ts for testability.
 * The middleware itself is tightly coupled to Supabase SSR and Next.js request
 * objects, so these functions mirror the routing rules as pure functions.
 */

export type RoutingContext = {
  pathname: string
  user: { id: string } | null
  profile: { role: string; trial_started_at: string | null } | null
  company: { id: string } | null
  now?: number // injectable for deterministic testing
}

export type RoutingDecision =
  | { action: 'redirect'; destination: string }
  | { action: 'next' }

/**
 * Applies the four middleware routing rules in order and returns the first
 * matching decision. Mirrors the logic in middleware.ts exactly.
 */
export function resolveRoute(ctx: RoutingContext): RoutingDecision {
  const { pathname, user, profile, company } = ctx
  const now = ctx.now ?? Date.now()

  // Rule 1: no session → redirect to /login
  if (!user) {
    return { action: 'redirect', destination: '/login' }
  }

  // Rule 2: session + no company row → redirect to /onboard (skip if already on /onboard)
  if (!company && pathname !== '/onboard') {
    return { action: 'redirect', destination: '/onboard' }
  }

  // Rule 3: session + trial_started_at set + trial expired → redirect to /paywall (skip if already on /paywall)
  if (profile?.trial_started_at && pathname !== '/paywall') {
    const trialExpiresAt = new Date(profile.trial_started_at).getTime() + 86400000
    if (now > trialExpiresAt) {
      return { action: 'redirect', destination: '/paywall' }
    }
  }

  // Rule 4: non-OWNER accessing /admin/* → redirect to /dashboard
  if (pathname.startsWith('/admin') && profile?.role !== 'OWNER') {
    return { action: 'redirect', destination: '/dashboard' }
  }

  return { action: 'next' }
}
