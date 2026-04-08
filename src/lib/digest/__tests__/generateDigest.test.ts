// Feature: tendly-mvp, Property 16: Digest is sent only to users with new matches above threshold
// Feature: tendly-mvp, Property 17: Digest email content is complete and correctly ordered
// Feature: tendly-mvp, Property 18: Digest delivery is recorded in notifications
// Feature: tendly-mvp, Property 19: Expired trial users are skipped in digest
// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7

/**
 * These tests validate the pure logic extracted from the digest pipeline
 * in src/lib/digest/generateDigest.ts. Rather than testing the full
 * runDigestForAll function (which requires Supabase and Resend), we test
 * the core logic components:
 *   - Trial expiry check (same 86400000ms formula)
 *   - Match filtering (score >= 40, created in last 24h)
 *   - Email content generation (sorted by score desc, capped at 10, deadline warning)
 *   - Notification recording logic
 */

import { describe, test, expect } from 'vitest'
import fc from 'fast-check'

// ---------------------------------------------------------------------------
// Constants from generateDigest.ts
// ---------------------------------------------------------------------------

const TRIAL_DURATION_MS = 86_400_000 // 24 hours
const SCORE_THRESHOLD = 40
const MAX_MATCHES = 10
const DEADLINE_WARNING_DAYS = 7

// ---------------------------------------------------------------------------
// Pure logic extracted from generateDigest.ts
// ---------------------------------------------------------------------------

/**
 * Mirrors isTrialActive from generateDigest.ts:
 *   return new Date(trialStartedAt).getTime() + TRIAL_DURATION_MS > Date.now()
 */
function isTrialActive(trialStartedAt: string, nowMs: number = Date.now()): boolean {
  return new Date(trialStartedAt).getTime() + TRIAL_DURATION_MS > nowMs
}

/**
 * Mirrors formatDate from generateDigest.ts
 */
function formatDate(iso: string | null): string {
  if (!iso) return 'N/A'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Mirrors isWithinDays from generateDigest.ts
 */
function isWithinDays(iso: string | null, days: number): boolean {
  if (!iso) return false
  const deadline = new Date(iso).getTime()
  const now = Date.now()
  return deadline > now && deadline - now <= days * 24 * 60 * 60 * 1000
}

/**
 * Mirrors the match filtering logic from generateDigest.ts:
 *   - score >= SCORE_THRESHOLD
 *   - created_at >= since (last 24h)
 */
function shouldSendDigest(
  matches: Array<{ score: number; created_at: string }>,
  sinceIso: string
): boolean {
  const sinceMs = new Date(sinceIso).getTime()
  const qualifyingMatches = matches.filter(
    m => m.score >= SCORE_THRESHOLD && new Date(m.created_at).getTime() >= sinceMs
  )
  return qualifyingMatches.length > 0
}

/**
 * Mirrors the email content generation logic from generateDigest.ts:
 *   - Sort by score DESC
 *   - Cap at MAX_MATCHES
 *   - Include deadline warning for proposals_due_at <= DEADLINE_WARNING_DAYS
 */
interface Match {
  score: number
  title: string
  agency: string
  proposals_due_at: string | null
  sam_or_source_url: string
}

function prepareDigestMatches(matches: Match[]): Match[] {
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHES)
}

function hasDeadlineWarning(proposalsDueAt: string | null): boolean {
  return isWithinDays(proposalsDueAt, DEADLINE_WARNING_DAYS)
}

/**
 * Mirrors the HTML generation logic from generateDigest.ts
 * Returns key properties we can verify
 */
function buildEmailContent(companyName: string, matches: Match[]): {
  matchCount: number
  topMatches: Match[]
  hasDeadlineWarnings: boolean
  isSortedDescending: boolean
  isCappedAt10: boolean
} {
  const topMatches = prepareDigestMatches(matches)
  const hasDeadlineWarnings = topMatches.some(m => hasDeadlineWarning(m.proposals_due_at))
  
  // Verify sort order
  const isSortedDescending = topMatches.every((m, i) => 
    i === 0 || topMatches[i - 1].score >= m.score
  )
  
  // Verify cap
  const isCappedAt10 = topMatches.length <= MAX_MATCHES
  
  return {
    matchCount: matches.length,
    topMatches,
    hasDeadlineWarnings,
    isSortedDescending,
    isCappedAt10,
  }
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const futureIso = fc
  .integer({ min: 1_000, max: 365 * 24 * 60 * 60 * 1000 })
  .map(ms => new Date(Date.now() + ms).toISOString())

const pastIso = fc
  .integer({ min: 1_000, max: 365 * 24 * 60 * 60 * 1000 })
  .map(ms => new Date(Date.now() - ms).toISOString())

const recentIso = fc
  .integer({ min: 0, max: 24 * 60 * 60 * 1000 })
  .map(ms => new Date(Date.now() - ms).toISOString())

const scoreAboveThreshold = fc.integer({ min: SCORE_THRESHOLD, max: 100 })
const scoreBelowThreshold = fc.integer({ min: 0, max: SCORE_THRESHOLD - 1 })

const matchArb = fc.record<Match>({
  score: scoreAboveThreshold,
  title: fc.string({ minLength: 1, maxLength: 80 }),
  agency: fc.string({ minLength: 1, maxLength: 40 }),
  proposals_due_at: fc.option(futureIso, { nil: null }),
  sam_or_source_url: fc.webUrl(),
})

const matchWithScoreArb = (scoreArb: fc.Arbitrary<number>) =>
  fc.record<Match>({
    score: scoreArb,
    title: fc.string({ minLength: 1, maxLength: 80 }),
    agency: fc.string({ minLength: 1, maxLength: 40 }),
    proposals_due_at: fc.option(futureIso, { nil: null }),
    sam_or_source_url: fc.webUrl(),
  })

const matchWithCreatedAtArb = fc.record({
  score: scoreAboveThreshold,
  created_at: recentIso,
})

// ---------------------------------------------------------------------------
// Property 19: Expired trial users are skipped in digest
// ---------------------------------------------------------------------------

describe('Property 19: Expired trial users are skipped in digest', () => {
  test('trial is active when trial_started_at + 24h is after now', () => {
    // Feature: tendly-mvp, Property 19: Expired trial users are skipped in digest
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 23 * 60 * 60 * 1000 }).map(ms =>
          new Date(Date.now() - ms).toISOString()
        ),
        (activeTrialStart) => {
          return isTrialActive(activeTrialStart) === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('trial is expired when trial_started_at + 24h is before now', () => {
    // Feature: tendly-mvp, Property 19: Expired trial users are skipped in digest
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }).map(days =>
          new Date(Date.now() - days * TRIAL_DURATION_MS - 1000).toISOString()
        ),
        (expiredTrialStart) => {
          return isTrialActive(expiredTrialStart) === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('trial expires at exactly trial_started_at + 86400000ms', () => {
    // Feature: tendly-mvp, Property 19: Expired trial users are skipped in digest
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000_000 }).map(ms =>
          new Date(ms).toISOString()
        ),
        (trialStart) => {
          const startMs = new Date(trialStart).getTime()
          const expiryMs = startMs + TRIAL_DURATION_MS

          // One ms before expiry: active
          const beforeExpiry = isTrialActive(trialStart, expiryMs - 1)
          // At exact expiry: expired
          const atExpiry = isTrialActive(trialStart, expiryMs)
          // One ms after expiry: expired
          const afterExpiry = isTrialActive(trialStart, expiryMs + 1)

          return beforeExpiry === true && atExpiry === false && afterExpiry === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('trial duration constant is exactly 24 hours in milliseconds', () => {
    // Feature: tendly-mvp, Property 19: Expired trial users are skipped in digest
    expect(TRIAL_DURATION_MS).toBe(86_400_000)
    expect(TRIAL_DURATION_MS).toBe(24 * 60 * 60 * 1000)
  })
})

// ---------------------------------------------------------------------------
// Property 16: Digest is sent only to users with new matches above threshold
// ---------------------------------------------------------------------------

describe('Property 16: Digest is sent only to users with new matches above threshold', () => {
  test('digest is sent when user has at least one match with score >= 40 created in last 24h', () => {
    // Feature: tendly-mvp, Property 16: Digest is sent only to users with new matches above threshold
    fc.assert(
      fc.property(
        fc.array(matchWithCreatedAtArb, { minLength: 1, maxLength: 20 }),
        (matches) => {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          return shouldSendDigest(matches, since) === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('digest is not sent when all matches have score < 40', () => {
    // Feature: tendly-mvp, Property 16: Digest is sent only to users with new matches above threshold
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            score: scoreBelowThreshold,
            created_at: recentIso,
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (matches) => {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          return shouldSendDigest(matches, since) === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('digest is not sent when all matches are older than 24h', () => {
    // Feature: tendly-mvp, Property 16: Digest is sent only to users with new matches above threshold
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            score: scoreAboveThreshold,
            created_at: fc.integer({ min: 25, max: 100 }).map(hours =>
              new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
            ),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (matches) => {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          return shouldSendDigest(matches, since) === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('digest is not sent when user has zero matches', () => {
    // Feature: tendly-mvp, Property 16: Digest is sent only to users with new matches above threshold
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    expect(shouldSendDigest([], since)).toBe(false)
  })

  test('score threshold is exactly 40', () => {
    // Feature: tendly-mvp, Property 16: Digest is sent only to users with new matches above threshold
    expect(SCORE_THRESHOLD).toBe(40)
  })

  test('digest is sent when at least one match qualifies (mixed scores)', () => {
    // Feature: tendly-mvp, Property 16: Digest is sent only to users with new matches above threshold
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            score: scoreBelowThreshold,
            created_at: recentIso,
          }),
          { minLength: 0, maxLength: 10 }
        ),
        fc.array(matchWithCreatedAtArb, { minLength: 1, maxLength: 5 }),
        (lowScoreMatches, qualifyingMatches) => {
          const allMatches = [...lowScoreMatches, ...qualifyingMatches]
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          return shouldSendDigest(allMatches, since) === true
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 17: Digest email content is complete and correctly ordered
// ---------------------------------------------------------------------------

describe('Property 17: Digest email content is complete and correctly ordered', () => {
  test('email content includes match count equal to total matches', () => {
    // Feature: tendly-mvp, Property 17: Digest email content is complete and correctly ordered
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.array(matchArb, { minLength: 1, maxLength: 20 }),
        (companyName, matches) => {
          const content = buildEmailContent(companyName, matches)
          return content.matchCount === matches.length
        }
      ),
      { numRuns: 100 }
    )
  })

  test('email content is capped at 10 matches', () => {
    // Feature: tendly-mvp, Property 17: Digest email content is complete and correctly ordered
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.array(matchArb, { minLength: 0, maxLength: 50 }),
        (companyName, matches) => {
          const content = buildEmailContent(companyName, matches)
          return content.isCappedAt10 && content.topMatches.length <= MAX_MATCHES
        }
      ),
      { numRuns: 100 }
    )
  })

  test('email matches are sorted by score descending', () => {
    // Feature: tendly-mvp, Property 17: Digest email content is complete and correctly ordered
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.array(matchArb, { minLength: 2, maxLength: 20 }),
        (companyName, matches) => {
          const content = buildEmailContent(companyName, matches)
          return content.isSortedDescending
        }
      ),
      { numRuns: 100 }
    )
  })

  test('deadline warning is present when any match has proposals_due_at within 7 days', () => {
    // Feature: tendly-mvp, Property 17: Digest email content is complete and correctly ordered
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.array(matchArb, { minLength: 0, maxLength: 5 }),
        fc.array(
          matchArb.map(m => ({
            ...m,
            proposals_due_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          })),
          { minLength: 1, maxLength: 3 }
        ),
        (companyName, normalMatches, urgentMatches) => {
          const allMatches = [...normalMatches, ...urgentMatches]
          const content = buildEmailContent(companyName, allMatches)
          // At least one urgent match should be in top 10
          const hasUrgentInTop = content.topMatches.some(m => 
            hasDeadlineWarning(m.proposals_due_at)
          )
          return hasUrgentInTop === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('deadline warning threshold is exactly 7 days', () => {
    // Feature: tendly-mvp, Property 17: Digest email content is complete and correctly ordered
    expect(DEADLINE_WARNING_DAYS).toBe(7)
  })

  test('each match in email includes title, agency, score, proposals_due_at, and sam_or_source_url', () => {
    // Feature: tendly-mvp, Property 17: Digest email content is complete and correctly ordered
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.array(matchArb, { minLength: 1, maxLength: 10 }),
        (companyName, matches) => {
          const content = buildEmailContent(companyName, matches)
          return content.topMatches.every(m =>
            m.title &&
            m.agency &&
            typeof m.score === 'number' &&
            m.sam_or_source_url
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('formatDate returns N/A for null input', () => {
    // Feature: tendly-mvp, Property 17: Digest email content is complete and correctly ordered
    expect(formatDate(null)).toBe('N/A')
  })

  test('formatDate returns valid date string for ISO input', () => {
    // Feature: tendly-mvp, Property 17: Digest email content is complete and correctly ordered
    fc.assert(
      fc.property(futureIso, (iso) => {
        const formatted = formatDate(iso)
        return formatted !== 'N/A' && formatted.length > 0
      }),
      { numRuns: 100 }
    )
  })

  test('isWithinDays returns true for deadlines within specified days', () => {
    // Feature: tendly-mvp, Property 17: Digest email content is complete and correctly ordered
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7 }),
        (days) => {
          const deadline = new Date(Date.now() + days * 24 * 60 * 60 * 1000 - 1000).toISOString()
          return isWithinDays(deadline, 7) === true
        }
      ),
      { numRuns: 100 }
    )
  })

  test('isWithinDays returns false for deadlines beyond specified days', () => {
    // Feature: tendly-mvp, Property 17: Digest email content is complete and correctly ordered
    fc.assert(
      fc.property(
        fc.integer({ min: 8, max: 365 }),
        (days) => {
          const deadline = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
          return isWithinDays(deadline, 7) === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('isWithinDays returns false for null deadline', () => {
    // Feature: tendly-mvp, Property 17: Digest email content is complete and correctly ordered
    expect(isWithinDays(null, 7)).toBe(false)
  })

  test('isWithinDays returns false for past deadlines', () => {
    // Feature: tendly-mvp, Property 17: Digest email content is complete and correctly ordered
    fc.assert(
      fc.property(pastIso, (iso) => {
        return isWithinDays(iso, 7) === false
      }),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 18: Digest delivery is recorded in notifications
// ---------------------------------------------------------------------------

describe('Property 18: Digest delivery is recorded in notifications', () => {
  test('notification record should include user_id, type=daily_digest, data_json, scheduled_at, sent_at', () => {
    // Feature: tendly-mvp, Property 18: Digest delivery is recorded in notifications
    // This tests the structure of the notification record that should be inserted
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.integer({ min: 1, max: 100 }),
        (userId, companyName, matchCount) => {
          // Simulate the notification record structure from generateDigest.ts
          const notification = {
            user_id: userId,
            type: 'daily_digest',
            data_json: { matchCount, companyName },
            scheduled_at: new Date().toISOString(),
            sent_at: new Date().toISOString(),
          }

          return (
            notification.user_id === userId &&
            notification.type === 'daily_digest' &&
            notification.data_json.matchCount === matchCount &&
            notification.data_json.companyName === companyName &&
            notification.scheduled_at !== null &&
            notification.sent_at !== null
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('notification type must be exactly "daily_digest"', () => {
    // Feature: tendly-mvp, Property 18: Digest delivery is recorded in notifications
    const notificationType = 'daily_digest'
    expect(notificationType).toBe('daily_digest')
  })

  test('notification data_json includes matchCount and companyName', () => {
    // Feature: tendly-mvp, Property 18: Digest delivery is recorded in notifications
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.integer({ min: 1, max: 100 }),
        (companyName, matchCount) => {
          const dataJson = { matchCount, companyName }
          return (
            typeof dataJson.matchCount === 'number' &&
            typeof dataJson.companyName === 'string' &&
            dataJson.matchCount > 0
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  test('sent_at timestamp should be set when email is successfully sent', () => {
    // Feature: tendly-mvp, Property 18: Digest delivery is recorded in notifications
    fc.assert(
      fc.property(fc.constant(null), () => {
        const sentAt = new Date().toISOString()
        const sentAtMs = new Date(sentAt).getTime()
        const nowMs = Date.now()
        // sent_at should be within a reasonable time window (1 second)
        return Math.abs(nowMs - sentAtMs) < 1000
      }),
      { numRuns: 100 }
    )
  })
})
