import { createClient } from '../../../../lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  // 1. Authenticate
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  // 2. Read trial_started_at from profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('trial_started_at')
    .eq('id', user.id)
    .single()

  // 3. Compute trial expiry and enforce
  let trialExpiresAt: string | null = null
  let trialActive = true

  if (profile?.trial_started_at) {
    const expiresMs = new Date(profile.trial_started_at).getTime() + 86400000
    trialExpiresAt = new Date(expiresMs).toISOString()
    if (Date.now() >= expiresMs) {
      return Response.json({ error: 'trial_expired' }, { status: 403 })
    }
    trialActive = true
  }
  // If no trial_started_at, treat as trial active (user just signed up)

  // 4. Query ALL companies for this user — user may have multiple rows from
  //    repeated onboarding attempts during testing. We union matches across all.
  const { data: companies } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_id', user.id)

  if (!companies || companies.length === 0) {
    return Response.json({ matches: [], trialExpiresAt: null, trialActive: true })
  }

  const companyIds = companies.map((c: any) => c.id)

  // 5. Query match_scores joined with opportunities across all company rows.
  //    Score threshold lowered to 10 to surface all relevant matches while
  //    the ingestion pipeline builds up a larger opportunity set.
  const { data: matchRows, error } = await supabase
    .from('match_scores')
    .select(`
      id,
      score,
      reasons_json,
      opportunity_id,
      opportunities (
        id,
        title,
        agency,
        naics_code,
        set_aside,
        place_of_performance,
        value_min,
        value_max,
        proposals_due_at,
        sam_or_source_url
      )
    `)
    .in('company_id', companyIds)
    .gte('score', 10)
    .gt('opportunities.proposals_due_at', new Date().toISOString())
    .order('score', { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // 6. Shape the response — deduplicate by opportunity_id (multiple company
  //    rows can produce duplicate matches), filter nulls from the join filter,
  //    and keep the highest-scoring match per opportunity.
  const seen = new Set<string>()
  const matches = (matchRows ?? [])
    .filter((row: any) => row.opportunities !== null)
    .filter((row: any) => {
      if (seen.has(row.opportunity_id)) return false
      seen.add(row.opportunity_id)
      return true
    })
    .map((row: any) => ({
      id: row.id,
      score: row.score,
      reasons_json: row.reasons_json,
      opportunity: row.opportunities,
    }))

  return Response.json({ matches, trialExpiresAt, trialActive })
}
