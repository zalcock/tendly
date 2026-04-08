import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServerSupabaseClient } from '../../../../lib/supabase/server'
import { computeMatchScore, type CompanyProfile } from '../../../../lib/matching'

function createServiceRoleClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

export async function POST(req: Request) {
  const body = await req.json()
  const { companyName, naics, location, certifications, keywords } = body

  // Validate required fields
  if (!companyName || !companyName.trim()) {
    return NextResponse.json({ error: 'companyName is required' }, { status: 400 })
  }
  const naicsList: string[] = naics
    ? naics.split(',').map((s: string) => s.trim()).filter(Boolean)
    : []
  if (naicsList.length === 0) {
    return NextResponse.json({ error: 'At least one NAICS code is required' }, { status: 400 })
  }

  // Authenticate via session client
  const sessionClient = await createServerSupabaseClient()
  const { data: { user } } = await sessionClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Use service role client for all DB writes to bypass RLS
  const supabase = createServiceRoleClient()

  const certList: string[] = certifications
    ? certifications.split(',').map((s: string) => s.trim()).filter(Boolean)
    : []
  const keywordList: string[] = keywords
    ? keywords.split(',').map((s: string) => s.trim()).filter(Boolean)
    : []

  // Ensure profile row exists (profiles.name is NOT NULL in schema)
  await supabase
    .from('profiles')
    .upsert([{ id: user.id, name: user.email ?? 'User' }], { onConflict: 'id', ignoreDuplicates: true })

  // Create company with full profile data
  const companyRes = await supabase
    .from('companies')
    .insert([{
      name: companyName,
      owner_id: user.id,
      naics_codes: naicsList,
      socio_economic_certs: certList,
      target_geographies: location ? [location] : [],
      capability_keywords: keywordList,
    }])
    .select()

  if (companyRes.error) {
    return NextResponse.json({ error: companyRes.error.message }, { status: 500 })
  }
  const company = companyRes.data[0]

  // Set trial_started_at if not already set
  await supabase
    .from('profiles')
    .update({ trial_started_at: new Date().toISOString() })
    .eq('id', user.id)
    .is('trial_started_at', null)

  // Run matching inline
  const { data: opportunities } = await supabase
    .from('opportunities')
    .select('id, naics_code, set_aside, place_of_performance, value_max, value_min, title, synopsis')

  if (opportunities && opportunities.length > 0) {
    const companyProfile: CompanyProfile = {
      id: company.id,
      naics_codes: naicsList,
      socio_economic_certs: certList,
      target_geographies: location ? [location] : [],
      capability_keywords: keywordList,
    }

    const matchRows = opportunities.map((opp) => {
      const { score, reasons } = computeMatchScore(companyProfile, opp)
      return {
        company_id: company.id,
        opportunity_id: opp.id,
        score,
        reasons_json: reasons,
      }
    })

    await supabase
      .from('match_scores')
      .upsert(matchRows, { onConflict: 'company_id,opportunity_id' })
  }

  return NextResponse.json({ ok: true })
}
