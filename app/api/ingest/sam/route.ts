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
    api_key: process.env.SAM_GOV_API_KEY ?? '',
    limit: '100',
    postedFrom: formatDate(sevenDaysAgo),
    postedTo: formatDate(today),
    ptype: 'o',   // Solicitation type
  })

  // If mock query param is present or no SAM key, use sample payload for testing
  let opportunities: any[] = []
  const useMock = request.url.includes('mock=true') || !process.env.SAM_GOV_API_KEY

  if (useMock) {
    opportunities = [
      {
        noticeId: 'MOCK-001',
        title: 'Small Business HVAC Maintenance Services',
        fullParentPathName: 'Department of Facilities',
        organizationName: 'Facilities Division',
        naicsCode: '238220',
        type: 'RFP',
        typeOfSetAsideDescription: 'WOSB',
        placeOfPerformance: { state: { name: 'Texas' } },
        award: { amount: 250000 },
        description: 'Provide HVAC maintenance and repairs for federal buildings in Texas.',
        postedDate: new Date().toISOString(),
        responseDeadLine: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        noticeId: 'MOCK-002',
        title: 'IT Managed Services - Helpdesk',
        fullParentPathName: 'Department of Technology',
        organizationName: 'Tech Ops',
        naicsCode: '541513',
        type: 'RFP',
        typeOfSetAsideDescription: null,
        placeOfPerformance: { state: { name: 'California' } },
        award: { amount: 1200000 },
        description: 'Managed helpdesk services for agency staff.',
        postedDate: new Date().toISOString(),
        responseDeadLine: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]
  } else {
    const response = await fetch(`${SAM_API_URL}?${params}`)
    if (!response.ok) {
      return NextResponse.json(
        { error: 'SAM.gov API error', status: response.status },
        { status: 500 }
      )
    }

    const data = await response.json()
    opportunities = data.opportunitiesData ?? []
  }

  // Get the SAM.gov source ID
  const { data: source } = await supabase
    .from('opportunity_sources')
    .select('id')
    .eq('type', 'SAM')
    .single()

  // Create ingestion run record
  const { data: run } = await supabase
    .from('ingestion_runs')
    .insert([{ source_id: source?.id }])
    .select('id')
    .single()

  const runId = run?.id ?? null
  let inserted = 0
  let skipped = 0
  let errorOccurred = false
  let errorDetails: any = null

  try {
    for (const opp of opportunities) {
      const record = {
        external_id: opp.noticeId,
        source_id: source?.id ?? null,
        title: opp.title ?? 'Untitled',
        agency: opp.fullParentPathName ?? opp.organizationName ?? '',
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
            const { score, reasons } = computeMatchScore(company, opp)
            scores.push({ company_id: company.id, opportunity_id: opp.id, score, reasons_json: reasons })
          }
        }
        if (scores.length > 0) {
          const { error } = await supabase.from('match_scores').upsert(scores, {
            onConflict: 'company_id,opportunity_id',
          })
          if (error) {
            console.error('Upsert scores error', error)
            errorOccurred = true
            errorDetails = error
          }
        }
      }
    } catch (e) {
      console.error('Matching error', e)
      errorOccurred = true
      errorDetails = e
    }
  } catch (e) {
    console.error('Ingestion error', e)
    errorOccurred = true
    errorDetails = e
  } finally {
    try {
      await supabase.from('ingestion_runs').update({
        finished_at: new Date().toISOString(),
        status: errorOccurred ? 'FAILED' : 'SUCCESS',
        total_found: opportunities.length,
        inserted,
        skipped,
        error_json: errorOccurred ? { message: String(errorDetails) } : null,
      }).eq('id', runId)
    } catch (e) {
      console.error('Failed to update ingestion run', e)
    }
  }

  return NextResponse.json({
    message: 'Ingestion complete',
    total: opportunities.length,
    inserted,
    skipped,
  })
}
