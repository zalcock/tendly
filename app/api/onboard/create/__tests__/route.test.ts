// Feature: tendly-mvp, Property 2: Onboarding validation rejects incomplete submissions
// Validates: Requirements 2.4

/**
 * These tests validate the pure input validation logic extracted from
 * app/api/onboard/create/route.ts. Rather than invoking the route handler
 * directly (which requires a live Supabase session), we test the exact same
 * conditional logic the route applies to the incoming request body.
 *
 * The route's validation logic under test:
 *   1. companyName check: if (!companyName || !companyName.trim()) → 400
 *   2. naics parsing:     naics.split(',').map(s => s.trim()).filter(Boolean)
 *   3. naicsList check:   if (naicsList.length === 0) → 400
 *
 * Property 2: For any POST to /api/onboard/create that is missing a company
 * name or has an empty NAICS codes array, the endpoint SHALL return an error
 * response and SHALL NOT create a company record.
 */

import { describe, test, expect } from 'vitest'
import fc from 'fast-check'

// ---------------------------------------------------------------------------
// Pure validation logic extracted from route.ts — mirrors exact implementation
// ---------------------------------------------------------------------------

interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Mirrors the companyName validation in route.ts:
 *   if (!companyName || !companyName.trim()) → error
 */
function validateCompanyName(companyName: unknown): ValidationResult {
  if (!companyName || !(companyName as string).trim()) {
    return { valid: false, error: 'companyName is required' }
  }
  return { valid: true }
}

/**
 * Mirrors the NAICS parsing + validation in route.ts:
 *   const naicsList = naics
 *     ? naics.split(',').map(s => s.trim()).filter(Boolean)
 *     : []
 *   if (naicsList.length === 0) → error
 */
function parseAndValidateNaics(naics: unknown): { naicsList: string[]; error?: string } {
  const naicsList: string[] =
    naics
      ? (naics as string).split(',').map((s: string) => s.trim()).filter(Boolean)
      : []
  if (naicsList.length === 0) {
    return { naicsList: [], error: 'At least one NAICS code is required' }
  }
  return { naicsList }
}

/**
 * Combined validation — mirrors the full guard block at the top of POST().
 * Returns the first error encountered, matching route behaviour.
 */
function validateOnboardInput(body: {
  companyName?: unknown
  naics?: unknown
}): ValidationResult {
  const nameResult = validateCompanyName(body.companyName)
  if (!nameResult.valid) return nameResult

  const naicsResult = parseAndValidateNaics(body.naics)
  if (naicsResult.error) return { valid: false, error: naicsResult.error }

  return { valid: true }
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Strings that are empty or contain only whitespace — invalid company names */
const blankStringArb = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.constant('\t'),
  fc.constant('\n'),
  fc.stringMatching(/^\s+$/),
)

/** Non-blank strings — valid company names */
const nonBlankStringArb = fc.string({ minLength: 1, maxLength: 80 }).filter(s => s.trim().length > 0)

/** NAICS-like codes: 6-digit strings */
const naicsCodeArb = fc.stringMatching(/^\d{6}$/)

/** A comma-separated string of at least one NAICS code */
const validNaicsStringArb = fc
  .array(naicsCodeArb, { minLength: 1, maxLength: 5 })
  .map(codes => codes.join(','))

/**
 * Strings that parse to an empty naicsList:
 *   - undefined/null (absent field)
 *   - empty string ''
 *   - strings of only commas/whitespace: ',', ' , , '
 */
const emptyNaicsStringArb = fc.oneof(
  fc.constant(''),
  fc.constant(','),
  fc.constant(' , , '),
  fc.constant('   '),
  fc.stringMatching(/^[\s,]+$/),
)

// ---------------------------------------------------------------------------
// Property 2a: Missing or blank company name → validation error
// ---------------------------------------------------------------------------

describe('Property 2: Missing company name is rejected', () => {
  test('blank companyName always fails validation', () => {
    // Feature: tendly-mvp, Property 2: Onboarding validation rejects incomplete submissions
    fc.assert(
      fc.property(blankStringArb, (companyName) => {
        const result = validateCompanyName(companyName)
        return result.valid === false && result.error === 'companyName is required'
      }),
      { numRuns: 100 }
    )
  })

  test('absent companyName (undefined/null) always fails validation', () => {
    // Feature: tendly-mvp, Property 2: Onboarding validation rejects incomplete submissions
    fc.assert(
      fc.property(fc.oneof(fc.constant(undefined), fc.constant(null)), (companyName) => {
        const result = validateCompanyName(companyName)
        return result.valid === false && result.error === 'companyName is required'
      }),
      { numRuns: 100 }
    )
  })

  test('non-blank companyName always passes the name check', () => {
    // Feature: tendly-mvp, Property 2: Onboarding validation rejects incomplete submissions
    fc.assert(
      fc.property(nonBlankStringArb, (companyName) => {
        const result = validateCompanyName(companyName)
        return result.valid === true
      }),
      { numRuns: 100 }
    )
  })

  test('full validation rejects any body with blank companyName regardless of naics', () => {
    // Feature: tendly-mvp, Property 2: Onboarding validation rejects incomplete submissions
    fc.assert(
      fc.property(
        blankStringArb,
        fc.option(validNaicsStringArb, { nil: undefined }),
        (companyName, naics) => {
          const result = validateOnboardInput({ companyName, naics })
          return result.valid === false
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 2b: Empty NAICS codes array → validation error
// ---------------------------------------------------------------------------

describe('Property 2: Empty NAICS codes array is rejected', () => {
  test('absent naics field produces empty naicsList and fails', () => {
    // Feature: tendly-mvp, Property 2: Onboarding validation rejects incomplete submissions
    fc.assert(
      fc.property(fc.oneof(fc.constant(undefined), fc.constant(null)), (naics) => {
        const result = parseAndValidateNaics(naics)
        return result.naicsList.length === 0 && result.error !== undefined
      }),
      { numRuns: 100 }
    )
  })

  test('naics strings that parse to empty list always fail', () => {
    // Feature: tendly-mvp, Property 2: Onboarding validation rejects incomplete submissions
    fc.assert(
      fc.property(emptyNaicsStringArb, (naics) => {
        const result = parseAndValidateNaics(naics)
        return result.naicsList.length === 0 && result.error !== undefined
      }),
      { numRuns: 100 }
    )
  })

  test('valid naics string with at least one code always passes', () => {
    // Feature: tendly-mvp, Property 2: Onboarding validation rejects incomplete submissions
    fc.assert(
      fc.property(validNaicsStringArb, (naics) => {
        const result = parseAndValidateNaics(naics)
        return result.naicsList.length >= 1 && result.error === undefined
      }),
      { numRuns: 100 }
    )
  })

  test('full validation rejects valid companyName when naics is empty', () => {
    // Feature: tendly-mvp, Property 2: Onboarding validation rejects incomplete submissions
    fc.assert(
      fc.property(
        nonBlankStringArb,
        emptyNaicsStringArb,
        (companyName, naics) => {
          const result = validateOnboardInput({ companyName, naics })
          return result.valid === false && result.error === 'At least one NAICS code is required'
        }
      ),
      { numRuns: 100 }
    )
  })

  test('full validation rejects valid companyName when naics is absent', () => {
    // Feature: tendly-mvp, Property 2: Onboarding validation rejects incomplete submissions
    fc.assert(
      fc.property(
        nonBlankStringArb,
        fc.oneof(fc.constant(undefined), fc.constant(null)),
        (companyName, naics) => {
          const result = validateOnboardInput({ companyName, naics })
          return result.valid === false && result.error === 'At least one NAICS code is required'
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 2c: Combined — any incomplete submission is rejected
// ---------------------------------------------------------------------------

describe('Property 2: Any incomplete submission is rejected', () => {
  test('submission missing both companyName and naics is rejected', () => {
    // Feature: tendly-mvp, Property 2: Onboarding validation rejects incomplete submissions
    fc.assert(
      fc.property(
        fc.oneof(blankStringArb, fc.constant(undefined), fc.constant(null)),
        fc.oneof(emptyNaicsStringArb, fc.constant(undefined), fc.constant(null)),
        (companyName, naics) => {
          const result = validateOnboardInput({ companyName, naics })
          return result.valid === false
        }
      ),
      { numRuns: 100 }
    )
  })

  test('valid submission with non-blank name and non-empty naics passes validation', () => {
    // Feature: tendly-mvp, Property 2: Onboarding validation rejects incomplete submissions
    fc.assert(
      fc.property(
        nonBlankStringArb,
        validNaicsStringArb,
        (companyName, naics) => {
          const result = validateOnboardInput({ companyName, naics })
          return result.valid === true && result.error === undefined
        }
      ),
      { numRuns: 100 }
    )
  })

  test('naics whitespace trimming: codes with surrounding spaces are still valid', () => {
    // Feature: tendly-mvp, Property 2: Onboarding validation rejects incomplete submissions
    // Route trims each code: naics.split(',').map(s => s.trim()).filter(Boolean)
    fc.assert(
      fc.property(
        naicsCodeArb,
        fc.integer({ min: 0, max: 5 }).map(n => ' '.repeat(n)),
        fc.integer({ min: 0, max: 5 }).map(n => ' '.repeat(n)),
        (code, leadingSpaces, trailingSpaces) => {
          const naics = `${leadingSpaces}${code}${trailingSpaces}`
          const result = parseAndValidateNaics(naics)
          return result.naicsList.length === 1 && result.naicsList[0] === code
        }
      ),
      { numRuns: 100 }
    )
  })

  test('multiple naics codes separated by commas all get parsed', () => {
    // Feature: tendly-mvp, Property 2: Onboarding validation rejects incomplete submissions
    fc.assert(
      fc.property(
        fc.array(naicsCodeArb, { minLength: 2, maxLength: 5 }),
        (codes) => {
          const naics = codes.join(',')
          const result = parseAndValidateNaics(naics)
          return result.naicsList.length === codes.length &&
            result.naicsList.every((c, i) => c === codes[i])
        }
      ),
      { numRuns: 100 }
    )
  })
})
