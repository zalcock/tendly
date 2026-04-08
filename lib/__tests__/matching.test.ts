// Feature: tendly-mvp, Property 8: Match score formula is correct and bounded
// Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6

import { describe, test, expect } from 'vitest'
import fc from 'fast-check'
import { computeMatchScore, type CompanyProfile, type Opportunity } from '../matching'

// Arbitraries

const naicsCodeArb = fc.stringMatching(/^\d{6}$/)

const companyArb = fc.record<CompanyProfile>({
  id: fc.uuid(),
  naics_codes: fc.array(naicsCodeArb, { minLength: 0, maxLength: 5 }),
  socio_economic_certs: fc.array(
    fc.constantFrom('SDVOSB', 'WOSB', '8(a)', 'HUBZone', 'VOSB'),
    { minLength: 0, maxLength: 3 }
  ),
  target_geographies: fc.array(
    fc.constantFrom('Texas', 'Virginia', 'California', 'Maryland', 'Florida'),
    { minLength: 0, maxLength: 3 }
  ),
  capability_keywords: fc.array(
    fc.constantFrom('software', 'cloud', 'cybersecurity', 'logistics', 'consulting', 'data'),
    { minLength: 0, maxLength: 8 }
  ),
})

const opportunityArb = fc.record<Opportunity>({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 80 }),
  synopsis: fc.string({ minLength: 0, maxLength: 200 }),
  naics_code: fc.option(naicsCodeArb, { nil: null }),
  set_aside: fc.option(
    fc.constantFrom('SDVOSB', 'WOSB', '8(a)', 'HUBZone', 'VOSB'),
    { nil: null }
  ),
  place_of_performance: fc.option(
    fc.constantFrom('Texas', 'Virginia', 'California', 'Maryland', 'Florida', 'Remote'),
    { nil: null }
  ),
  value_min: fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
  value_max: fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
})

describe('Property 8: Match score formula is correct and bounded', () => {
  test('score is always between 0 and 100 inclusive', () => {
    fc.assert(
      fc.property(companyArb, opportunityArb, (company, opp) => {
        const { score } = computeMatchScore(company, opp)
        return score >= 0 && score <= 100
      }),
      { numRuns: 100 }
    )
  })

  test('score equals sum of reason contributions (rounded, capped at 100)', () => {
    fc.assert(
      fc.property(companyArb, opportunityArb, (company, opp) => {
        const { score, reasons } = computeMatchScore(company, opp)
        const rawSum = reasons.reduce((acc, r) => acc + r.contribution, 0)
        const expected = Math.min(100, Math.round(rawSum))
        return score === expected
      }),
      { numRuns: 100 }
    )
  })

  test('NAICS contribution is exactly 40 when company has the opp NAICS code', () => {
    const sharedNaics = '541512'
    fc.assert(
      fc.property(
        companyArb.map(c => ({ ...c, naics_codes: [sharedNaics, ...c.naics_codes] })),
        opportunityArb.map(o => ({ ...o, naics_code: sharedNaics })),
        (company, opp) => {
          const { reasons } = computeMatchScore(company, opp)
          const naicsReason = reasons.find(r => r.reason.includes('NAICS match'))
          return naicsReason !== undefined && naicsReason.contribution === 40
        }
      ),
      { numRuns: 100 }
    )
  })

  test('NAICS contributes 0 when company does not have the opp NAICS code', () => {
    fc.assert(
      fc.property(
        companyArb.map(c => ({ ...c, naics_codes: [] })),
        opportunityArb.map(o => ({ ...o, naics_code: '999999' })),
        (company, opp) => {
          const { reasons } = computeMatchScore(company, opp)
          return !reasons.some(r => r.reason.includes('NAICS match'))
        }
      ),
      { numRuns: 100 }
    )
  })

  test('set-aside contributes 25 when company cert matches', () => {
    fc.assert(
      fc.property(
        companyArb.map(c => ({ ...c, socio_economic_certs: ['SDVOSB'] })),
        opportunityArb.map(o => ({ ...o, set_aside: 'SDVOSB' })),
        (company, opp) => {
          const { reasons } = computeMatchScore(company, opp)
          const r = reasons.find(r => r.reason.includes('Set-aside eligible'))
          return r !== undefined && r.contribution === 25
        }
      ),
      { numRuns: 100 }
    )
  })

  test('set-aside contributes 12 when opportunity has no set-aside restriction', () => {
    fc.assert(
      fc.property(
        companyArb,
        opportunityArb.map(o => ({ ...o, set_aside: null })),
        (company, opp) => {
          const { reasons } = computeMatchScore(company, opp)
          const r = reasons.find(r => r.reason === 'No set-aside restriction')
          return r !== undefined && r.contribution === 12
        }
      ),
      { numRuns: 100 }
    )
  })

  test('set-aside contributes 0 when set-aside exists but company lacks the cert', () => {
    fc.assert(
      fc.property(
        companyArb.map(c => ({ ...c, socio_economic_certs: [] })),
        opportunityArb.map(o => ({ ...o, set_aside: 'WOSB' })),
        (company, opp) => {
          const { reasons } = computeMatchScore(company, opp)
          return !reasons.some(r => r.reason.includes('Set-aside') || r.reason.includes('set-aside'))
        }
      ),
      { numRuns: 100 }
    )
  })

  test('geography contributes 15 when place_of_performance matches target_geographies', () => {
    fc.assert(
      fc.property(
        companyArb.map(c => ({ ...c, target_geographies: ['Texas'] })),
        opportunityArb.map(o => ({ ...o, place_of_performance: 'Texas' })),
        (company, opp) => {
          const { reasons } = computeMatchScore(company, opp)
          const r = reasons.find(r => r.reason.includes('Geo match'))
          return r !== undefined && r.contribution === 15
        }
      ),
      { numRuns: 100 }
    )
  })

  test('geography contributes 7 when place_of_performance is unspecified', () => {
    fc.assert(
      fc.property(
        companyArb,
        opportunityArb.map(o => ({ ...o, place_of_performance: null })),
        (company, opp) => {
          const { reasons } = computeMatchScore(company, opp)
          const r = reasons.find(r => r.reason === 'Place of performance unspecified')
          return r !== undefined && r.contribution === 7
        }
      ),
      { numRuns: 100 }
    )
  })

  test('contract value contributes 10 when value is in $100K–$5M range', () => {
    fc.assert(
      fc.property(
        companyArb,
        opportunityArb.map(o => ({ ...o, value_max: 500_000, value_min: null })),
        (company, opp) => {
          const { reasons } = computeMatchScore(company, opp)
          const r = reasons.find(r => r.reason.includes('Contract value'))
          return r !== undefined && r.contribution === 10
        }
      ),
      { numRuns: 100 }
    )
  })

  test('contract value contributes 10 when value is unspecified', () => {
    fc.assert(
      fc.property(
        companyArb,
        opportunityArb.map(o => ({ ...o, value_max: null, value_min: null })),
        (company, opp) => {
          const { reasons } = computeMatchScore(company, opp)
          const r = reasons.find(r => r.reason.includes('Contract value'))
          return r !== undefined && r.contribution === 10
        }
      ),
      { numRuns: 100 }
    )
  })

  test('contract value contributes 0 when value is outside $100K–$5M range', () => {
    fc.assert(
      fc.property(
        companyArb,
        opportunityArb.map(o => ({ ...o, value_max: 50_000, value_min: null })),
        (company, opp) => {
          const { reasons } = computeMatchScore(company, opp)
          return !reasons.some(r => r.reason.includes('Contract value'))
        }
      ),
      { numRuns: 100 }
    )
  })

  test('keyword contribution is scaled by hits (max 5 hits = 10 pts)', () => {
    // Company has all 5 keywords, opp title/synopsis contains all of them → 10 pts
    const keywords = ['software', 'cloud', 'cybersecurity', 'logistics', 'consulting']
    const company: CompanyProfile = {
      id: 'test-company',
      naics_codes: [],
      socio_economic_certs: [],
      target_geographies: [],
      capability_keywords: keywords,
    }
    const opp: Opportunity = {
      id: 'test-opp',
      title: 'software cloud cybersecurity logistics consulting',
      synopsis: '',
      naics_code: null,
      set_aside: null,
      place_of_performance: null,
      value_min: null,
      value_max: null,
    }
    const { reasons } = computeMatchScore(company, opp)
    const r = reasons.find(r => r.reason.includes('keyword'))
    expect(r).toBeDefined()
    expect(r!.contribution).toBe(10)
  })

  test('keyword contribution is proportional for fewer than 5 hits', () => {
    // 2 hits → (2/5)*10 = 4 pts
    const company: CompanyProfile = {
      id: 'test-company',
      naics_codes: [],
      socio_economic_certs: [],
      target_geographies: [],
      capability_keywords: ['software', 'cloud'],
    }
    const opp: Opportunity = {
      id: 'test-opp',
      title: 'software cloud platform',
      synopsis: '',
      naics_code: null,
      set_aside: null,
      place_of_performance: null,
      value_min: null,
      value_max: null,
    }
    const { reasons } = computeMatchScore(company, opp)
    const r = reasons.find(r => r.reason.includes('keyword'))
    expect(r).toBeDefined()
    expect(r!.contribution).toBe(4)
  })

  test('keyword contribution is 0 when no keywords match', () => {
    fc.assert(
      fc.property(
        companyArb.map(c => ({ ...c, capability_keywords: ['zzznomatch'] })),
        opportunityArb.map(o => ({ ...o, title: 'unrelated title', synopsis: 'unrelated synopsis' })),
        (company, opp) => {
          const { reasons } = computeMatchScore(company, opp)
          return !reasons.some(r => r.reason.includes('keyword'))
        }
      ),
      { numRuns: 100 }
    )
  })

  test('maximum possible score is 100 (40+25+15+10+10)', () => {
    const company: CompanyProfile = {
      id: 'max-company',
      naics_codes: ['541512'],
      socio_economic_certs: ['SDVOSB'],
      target_geographies: ['Virginia'],
      capability_keywords: ['software', 'cloud', 'cybersecurity', 'logistics', 'consulting'],
    }
    const opp: Opportunity = {
      id: 'max-opp',
      title: 'software cloud cybersecurity logistics consulting',
      synopsis: '',
      naics_code: '541512',
      set_aside: 'SDVOSB',
      place_of_performance: 'Virginia',
      value_min: 500_000,
      value_max: 1_000_000,
    }
    const { score } = computeMatchScore(company, opp)
    expect(score).toBe(100)
  })

  test('minimum possible score is 0', () => {
    const company: CompanyProfile = {
      id: 'min-company',
      naics_codes: [],
      socio_economic_certs: [],
      target_geographies: [],
      capability_keywords: [],
    }
    const opp: Opportunity = {
      id: 'min-opp',
      title: 'unrelated',
      synopsis: 'unrelated',
      naics_code: '999999',
      set_aside: 'WOSB',
      place_of_performance: 'Alaska',
      value_min: 50_000,
      value_max: 50_000,
    }
    const { score } = computeMatchScore(company, opp)
    expect(score).toBe(0)
  })
})
