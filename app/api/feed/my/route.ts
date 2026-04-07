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

  // 4. Query company for this user
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!company) {
    return Response.json({ matches: [], trialExpiresAt: null, trialActive: true })
  }

  // 5. Query match_scores joined with opportunities
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
    .eq('company_id', company.id)
    .gte('score', 40)
    .gt('opportunities.proposals_due_at', new Date().toISOString())
    .order('score', { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // 6. Shape the response — filter out rows where opportunity join returned null
  //    (this happens when the .gt filter on the joined table excludes the row)
  const matches = (matchRows ?? [])
    .filter((row: any) => row.opportunities !== null)
    .map((row: any) => ({
      id: row.id,
      score: row.score,
      reasons_json: row.reasons_json,
      opportunity: row.opportunities,
    }))

  return Response.json({ matches, trialExpiresAt, trialActive })
}
