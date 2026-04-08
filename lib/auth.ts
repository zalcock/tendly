import { NextResponse } from 'next/server'

/**
 * Validates the CRON_SECRET authorization header for admin endpoints.
 * Returns null if valid, or a 401 NextResponse if invalid.
 * 
 * @param authHeader - The Authorization header value (or null)
 * @param cronSecret - The expected CRON_SECRET value
 * @returns null if authorized, NextResponse with 401 if not
 */
export function validateCronSecret(
  authHeader: string | null,
  cronSecret: string
): NextResponse | null {
  // Missing header → 401
  if (authHeader === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Must start with "Bearer "
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Extract token and compare
  const token = authHeader.slice(7) // "Bearer ".length === 7
  if (token !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Valid
  return null
}

/**
 * Pure validation function for testing - returns true if authorized, false otherwise.
 * 
 * @param authHeader - The Authorization header value (or null)
 * @param cronSecret - The expected CRON_SECRET value
 * @returns true if authorized, false if not
 */
export function isAuthorized(
  authHeader: string | null,
  cronSecret: string
): boolean {
  if (authHeader === null) return false
  if (!authHeader.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  return token === cronSecret
}