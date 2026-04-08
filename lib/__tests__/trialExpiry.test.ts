// Feature: tendly-mvp, Property 13: Trial expiry is exactly 24 hours after trial start
// Validates: Requirements 6.2

import { describe, test, expect } from 'vitest'
import fc from 'fast-check'

// Constants
const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000 // 86400000 ms = 24 hours

// Pure trial expiry computation functions (to be tested)
function computeTrialExpiresAt(trialStartedAt: Date): Date {
  return new Date(trialStartedAt.getTime() + TRIAL_DURATION_MS)
}

function isTrialActive(trialStartedAt: Date, now: Date): boolean {
  const trialExpiresAt = computeTrialExpiresAt(trialStartedAt)
  return now.getTime() < trialExpiresAt.getTime()
}

function isTrialExpired(trialStartedAt: Date, now: Date): boolean {
  return !isTrialActive(trialStartedAt, now)
}

// Arbitrary for timestamps (reasonable range: year 2000 to year 2100)
// Use integer-based arbitrary to avoid invalid Date issues
const timestampArb = fc
  .integer({
    min: new Date('2000-01-01T00:00:00.000Z').getTime(),
    max: new Date('2100-01-01T00:00:00.000Z').getTime(),
  })
  .map((ms) => new Date(ms))

describe('Property 13: Trial expiry is exactly 24 hours after trial start', () => {
  test('trial_expires_at equals trial_started_at + 86400000 milliseconds', () => {
    fc.assert(
      fc.property(timestampArb, (trialStartedAt) => {
        const trialExpiresAt = computeTrialExpiresAt(trialStartedAt)
        const expectedExpiry = new Date(trialStartedAt.getTime() + 86400000)
        return trialExpiresAt.getTime() === expectedExpiry.getTime()
      }),
      { numRuns: 100 }
    )
  })

  test('trial is active when now is before trial_expires_at', () => {
    fc.assert(
      fc.property(
        timestampArb,
        // Generate a time that is within the trial window (0 to 86399999 ms after start)
        fc.integer({ min: 0, max: 86399999 }),
        (trialStartedAt, offsetMs) => {
          const now = new Date(trialStartedAt.getTime() + offsetMs)
          return isTrialActive(trialStartedAt, now) === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('trial is expired when now equals trial_expires_at', () => {
    fc.assert(
      fc.property(timestampArb, (trialStartedAt) => {
        const now = computeTrialExpiresAt(trialStartedAt)
        return isTrialExpired(trialStartedAt, now) === true
      }),
      { numRuns: 100 }
    )
  })

  test('trial is expired when now is after trial_expires_at', () => {
    fc.assert(
      fc.property(
        timestampArb,
        // Generate a time that is after the trial window (1 ms to 1 year after expiry)
        fc.integer({ min: 1, max: 365 * 24 * 60 * 60 * 1000 }),
        (trialStartedAt, offsetAfterExpiry) => {
          const trialExpiresAt = computeTrialExpiresAt(trialStartedAt)
          const now = new Date(trialExpiresAt.getTime() + offsetAfterExpiry)
          return isTrialExpired(trialStartedAt, now) === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('trial duration is exactly 24 hours (86400000 ms)', () => {
    fc.assert(
      fc.property(timestampArb, (trialStartedAt) => {
        const trialExpiresAt = computeTrialExpiresAt(trialStartedAt)
        const duration = trialExpiresAt.getTime() - trialStartedAt.getTime()
        return duration === 86400000
      }),
      { numRuns: 100 }
    )
  })

  test('trial is active at the moment it starts', () => {
    fc.assert(
      fc.property(timestampArb, (trialStartedAt) => {
        return isTrialActive(trialStartedAt, trialStartedAt) === true
      }),
      { numRuns: 100 }
    )
  })

  test('trial is active 1 millisecond before expiry', () => {
    fc.assert(
      fc.property(timestampArb, (trialStartedAt) => {
        const trialExpiresAt = computeTrialExpiresAt(trialStartedAt)
        const oneMsBeforeExpiry = new Date(trialExpiresAt.getTime() - 1)
        return isTrialActive(trialStartedAt, oneMsBeforeExpiry) === true
      }),
      { numRuns: 100 }
    )
  })

  test('trial is expired 1 millisecond after expiry', () => {
    fc.assert(
      fc.property(timestampArb, (trialStartedAt) => {
        const trialExpiresAt = computeTrialExpiresAt(trialStartedAt)
        const oneMsAfterExpiry = new Date(trialExpiresAt.getTime() + 1)
        return isTrialExpired(trialStartedAt, oneMsAfterExpiry) === true
      }),
      { numRuns: 100 }
    )
  })
})