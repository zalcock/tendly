// Feature: tendly-mvp, Property 20: Admin trigger endpoints require valid CRON_SECRET

import { describe, test, expect } from 'vitest'
import fc from 'fast-check'
import { isAuthorized, validateCronSecret } from '../auth'
import { NextResponse } from 'next/server'

const CRON_SECRET = 'test-cron-secret-12345'

describe('Property 20: Admin trigger endpoints require valid CRON_SECRET', () => {
  describe('isAuthorized pure function', () => {
    test('returns false for missing Authorization header', () => {
      expect(isAuthorized(null, CRON_SECRET)).toBe(false)
    })

    test('returns false for empty Authorization header', () => {
      expect(isAuthorized('', CRON_SECRET)).toBe(false)
    })

    test('returns false for wrong token', () => {
      expect(isAuthorized('Bearer wrong-token', CRON_SECRET)).toBe(false)
    })

    test('returns false for malformed header (not Bearer)', () => {
      expect(isAuthorized('Basic token123', CRON_SECRET)).toBe(false)
      expect(isAuthorized('BearerToken', CRON_SECRET)).toBe(false)
      expect(isAuthorized('bearer test-cron-secret-12345', CRON_SECRET)).toBe(false) // case-sensitive
    })

    test('returns false for Bearer without token', () => {
      expect(isAuthorized('Bearer ', CRON_SECRET)).toBe(false)
    })

    test('returns true for correct CRON_SECRET', () => {
      expect(isAuthorized(`Bearer ${CRON_SECRET}`, CRON_SECRET)).toBe(true)
    })

    // Property-based tests
    test('Property: any non-matching token returns false', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter(s => s !== CRON_SECRET),
          (wrongToken) => {
            const authHeader = `Bearer ${wrongToken}`
            return isAuthorized(authHeader, CRON_SECRET) === false
          }
        ),
        { numRuns: 100 }
      )
    })

    test('Property: any missing or null header returns false', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.constant(null), fc.constant(''), fc.string({ maxLength: 0 })),
          (authHeader) => {
            return isAuthorized(authHeader, CRON_SECRET) === false
          }
        ),
        { numRuns: 100 }
      )
    })

    test('Property: any header not starting with "Bearer " returns false', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.startsWith('Bearer ')),
          (authHeader) => {
            return isAuthorized(authHeader, CRON_SECRET) === false
          }
        ),
        { numRuns: 100 }
      )
    })

    test('Property: correct secret always returns true', () => {
      fc.assert(
        fc.property(
          fc.constant(CRON_SECRET),
          (secret) => {
            const authHeader = `Bearer ${secret}`
            return isAuthorized(authHeader, secret) === true
          }
        ),
        { numRuns: 100 }
      )
    })

    test('Property: for any secret, only exact match with Bearer prefix authorizes', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes(' ')),
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes(' ')),
          (secret, wrongToken) => {
            fc.pre(secret !== wrongToken)
            
            // Correct token authorizes
            const correctHeader = `Bearer ${secret}`
            const correctResult = isAuthorized(correctHeader, secret)
            
            // Wrong token does not authorize
            const wrongHeader = `Bearer ${wrongToken}`
            const wrongResult = isAuthorized(wrongHeader, secret)
            
            return correctResult === true && wrongResult === false
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('validateCronSecret returns 401 for invalid auth', () => {
    test('returns 401 NextResponse for missing header', async () => {
      const result = validateCronSecret(null, CRON_SECRET)
      expect(result).not.toBeNull()
      expect(result!.status).toBe(401)
      const json = await result!.json()
      expect(json.error).toBe('Unauthorized')
    })

    test('returns 401 NextResponse for wrong token', async () => {
      const result = validateCronSecret('Bearer wrong-token', CRON_SECRET)
      expect(result).not.toBeNull()
      expect(result!.status).toBe(401)
    })

    test('returns 401 NextResponse for malformed header', async () => {
      const result = validateCronSecret('Basic token', CRON_SECRET)
      expect(result).not.toBeNull()
      expect(result!.status).toBe(401)
    })

    test('returns null for correct CRON_SECRET', () => {
      const result = validateCronSecret(`Bearer ${CRON_SECRET}`, CRON_SECRET)
      expect(result).toBeNull()
    })

    // Property-based tests for validateCronSecret
    test('Property: any invalid auth header returns 401 response', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(null),
            fc.constant(''),
            fc.string().filter(s => !s.startsWith('Bearer ')),
            fc.string().map(s => `Bearer ${s}`).filter(s => !s.endsWith(CRON_SECRET))
          ),
          (authHeader) => {
            const result = validateCronSecret(authHeader, CRON_SECRET)
            // Should return 401 response (not null)
            if (authHeader === `Bearer ${CRON_SECRET}`) {
              return result === null
            }
            return result !== null && result.status === 401
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})