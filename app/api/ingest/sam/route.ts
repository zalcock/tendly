import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeMatchScore, Company, Opportunity } from '../../../../lib/matching'


const SAM_API_URL = 'https://api.sam.gov/prod/opportunities/v2/search'

export async function GET(request: Request) {
  // Protect this endpoint — only allow internal cron calls
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Initialize Supabase with service role key inside handler to avoid build-time env access
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date()
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(today.getDate() - 7)

  const formatDate = (d: Date) =>
    `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`

  const params = new URLSearchParams({
    api_key: process.env.SAM_GOV_API_KEY!,
    limit: '100',
    postedFrom: formatDate(sevenDaysAgo),
    postedTo: formatDate(today),
    ptype: 'o',   // Solicitation type
  })

  const response = await fetch(`${SAM_API_URL}?${params}`)
  if (!response.ok) {
    return NextResponse.json(
      { error: 'SAM.gov API error', status: response.status },
      { status: 500 }
    )
  }

  const data = await response.json()
  const opportunities = data.opportunitiesData ?? []

  // Get the SAM.gov source ID
  const { data: source } = await supabase
    .from('opportunity_sources')
    .select('id')
    .eq('type', 'SAM')
    .single()

  let inserted = 0
  let skipped = 0

  for (const opp of opportunities) {
    const record = {
      external_id: opp.noticeId,
      source_id: source?.id ?? null,
      title: opp.title ?? 'Untitled',
      agency: opp.fullParentPathName ?? opp.organizationName ?? 'Unknown Agency',
      sub_agency: opp.organizationName ?? null,
      naics_code: opp.naicsCode ?? null,
      procurement_method: opp.type ?? null,
      set_aside: opp.typeOfSetAsideDescription ?? null,
      place_of_performance: opp.placeOfPerformance?.state?.name ?? null,
      value_min: opp.award?.amount ?? null,
      synopsis: opp.description ?? '',
      posted_at: opp.postedDate ? new Date(opp.postedDate).toISOString() : null,
      proposals_due_at: opp.responseDeadLine
        ? new Date(opp.responseDeadLine).toISOString()
        : null,
      sam_or_source_url: `https://sam.gov/opp/${opp.noticeId}/view`,
    }

    const { error } = await supabase
      .from('opportunities')
      .upsert(record, { onConflict: 'external_id,source_id' })

    if (error) {
      console.error('Insert error:', error.message)
      skipped++
    } else {
      inserted++
    }
  }

  // After ingestion, run matching for all companies against newly created opportunities
  try {
    const { data: companies } = await supabase
      .from('companies')
      .select('id, naics_codes, socio_economic_certs, target_geographies, capability_keywords')

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: newOpps } = await supabase
      .from('opportunities')
      .select('id, naics_code, set_aside, place_of_performance, value_max, value_min, title, synopsis')
      .gte('created_at', since)

    if (companies && newOpps) {
      const scores: { company_id: string; opportunity_id: string; score: number; reasons_json: unknown }[] = []
      for (const company of companies as Company[]) {
        for (const opp of newOpps as Opportunity[]) {
          scores.push(computeMatchScore(company, opp))
        }
      }
      if (scores.length > 0) {
        await supabase.from('match_scores').upsert(scores, {
          onConflict: 'company_id,opportunity_id',
        })
      }
    }
  } catch (e) {
    console.error('Matching error', e)
  }

  return NextResponse.json({
    message: 'Ingestion complete',
    total: opportunities.length,
    inserted,
    skipped,
  })
}
