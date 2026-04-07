export interface ScoringReason {
  reason: string
  contribution: number
}

export interface CompanyProfile {
  id: string
  naics_codes: string[]
  socio_economic_certs: string[]
  target_geographies: string[]
  capability_keywords: string[]
}

// Alias for backwards compatibility
export type Company = CompanyProfile

export interface Opportunity {
  id: string
  naics_code?: string | null
  set_aside?: string | null
  place_of_performance?: string | null
  value_max?: number | null
  value_min?: number | null
  title: string
  synopsis: string
}

export function computeMatchScore(
  company: CompanyProfile,
  opportunity: Opportunity
): { score: number; reasons: ScoringReason[] } {
  let raw = 0
  const reasons: ScoringReason[] = []

  // NAICS: 40 pts for exact match
  if (opportunity.naics_code && company.naics_codes.includes(opportunity.naics_code)) {
    raw += 40
    reasons.push({ reason: `NAICS match (${opportunity.naics_code})`, contribution: 40 })
  }

  // Set-aside: 25 pts if cert matches, 12 pts if no restriction, 0 if mismatch
  if (!opportunity.set_aside) {
    raw += 12
    reasons.push({ reason: 'No set-aside restriction', contribution: 12 })
  } else if (company.socio_economic_certs.includes(opportunity.set_aside)) {
    raw += 25
    reasons.push({ reason: `Set-aside eligible: ${opportunity.set_aside}`, contribution: 25 })
  }

  // Geography: 15 pts if match, 7 pts if unspecified, 0 if mismatch
  if (!opportunity.place_of_performance) {
    raw += 7
    reasons.push({ reason: 'Place of performance unspecified', contribution: 7 })
  } else if (
    company.target_geographies.some(g =>
      opportunity.place_of_performance!.toLowerCase().includes(g.toLowerCase())
    )
  ) {
    raw += 15
    reasons.push({ reason: `Geo match: ${opportunity.place_of_performance}`, contribution: 15 })
  }

  // Contract value band: 10 pts if $100K–$5M or unspecified
  const val = opportunity.value_max ?? opportunity.value_min
  if (!val || (val >= 100_000 && val <= 5_000_000)) {
    raw += 10
    reasons.push({ reason: 'Contract value within typical SMB range', contribution: 10 })
  }

  // Capability keywords: up to 10 pts, scaled by (hits / 5) * 10, capped at 10
  const text = `${opportunity.title} ${opportunity.synopsis}`.toLowerCase()
  const hits = company.capability_keywords.filter(kw => text.includes(kw.toLowerCase())).length
  if (hits > 0) {
    const contribution = Math.min(hits, 5) / 5 * 10
    raw += contribution
    reasons.push({ reason: `${hits} capability keyword match(es)`, contribution })
  }

  return {
    score: Math.min(100, Math.round(raw)),
    reasons,
  }
}
