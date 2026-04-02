const WEIGHTS = { NAICS: 0.4, SET_ASIDE: 0.25, GEO: 0.15, VALUE: 0.1, KEYWORDS: 0.1 }

export interface Company {
  id: string
  naics_codes: string[]
  socio_economic_certs: string[]
  target_geographies: string[]
  capability_keywords: string[]
}

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

export function computeMatchScore(company: Company, opp: Opportunity) {
  let score = 0
  const reasons: { reason: string; contribution: number }[] = []

  // NAICS
  if (opp.naics_code && company.naics_codes.includes(opp.naics_code)) {
    const c = WEIGHTS.NAICS * 100
    score += c
    reasons.push({ reason: `NAICS match (${opp.naics_code})`, contribution: c })
  }

  // Set-aside
  if (!opp.set_aside) {
    const c = WEIGHTS.SET_ASIDE * 100 * 0.5
    score += c
    reasons.push({ reason: 'No set-aside restriction', contribution: c })
  } else if (company.socio_economic_certs.includes(opp.set_aside)) {
    const c = WEIGHTS.SET_ASIDE * 100
    score += c
    reasons.push({ reason: `Set-aside eligible: ${opp.set_aside}`, contribution: c })
  }

  // Geography
  if (!opp.place_of_performance) {
    const c = WEIGHTS.GEO * 100 * 0.5
    score += c
    reasons.push({ reason: 'Place of performance unspecified', contribution: c })
  } else if (
    company.target_geographies.some(g =>
      opp.place_of_performance!.toLowerCase().includes(g.toLowerCase())
    )
  ) {
    const c = WEIGHTS.GEO * 100
    score += c
    reasons.push({ reason: `Geo match: ${opp.place_of_performance}`, contribution: c })
  }

  // Value band (default MID company)
  const val = opp.value_max ?? opp.value_min
  if (!val || (val >= 100_000 && val <= 5_000_000)) {
    const c = WEIGHTS.VALUE * 100
    score += c
    reasons.push({ reason: 'Contract value within typical SMB range', contribution: c })
  }

  // Keywords
  const text = `${opp.title} ${opp.synopsis}`.toLowerCase()
  const hits = company.capability_keywords.filter(kw =>
    text.includes(kw.toLowerCase())
  ).length
  if (hits > 0) {
    const c = WEIGHTS.KEYWORDS * 100 * Math.min(hits, 5) / 5
    score += c
    reasons.push({ reason: `${hits} capability keyword match(es)`, contribution: c })
  }

  return {
    company_id: company.id,
    opportunity_id: opp.id,
    score: Math.min(100, Math.round(score)),
    reasons_json: reasons,
  }
}
