import { computeMatchScore, Company, Opportunity } from '../../../lib/matching'

export async function runSamIngestion(supabase: any, options: { useMock?: boolean } = {}) {
  const useMock = options.useMock ?? !process.env.SAM_GOV_API_KEY
  const SAM_API_URL = 'https://api.sam.gov/prod/opportunities/v2/search'

  // Get source id
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

  let opportunities: any[] = []
  let inserted = 0
  let skipped = 0
  let errorOccurred = false
  let errorDetails: any = null

  try {
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
      ]
    } else {
      const params = new URLSearchParams({
        api_key: process.env.SAM_GOV_API_KEY ?? '',
        limit: '100',
        // last 7 days
        postedFrom: (() => { const d = new Date(); d.setDate(d.getDate()-7); return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}` })(),
        postedTo: new Date().toLocaleDateString('en-US'),
        ptype: 'o'
      })

      // retry/backoff
      let attempts = 0
      const maxAttempts = 3
      const backoff = [500, 2000, 8000]
      let resp: Response | null = null
      while (attempts < maxAttempts) {
        try {
          resp = await fetch(`${SAM_API_URL}?${params}`)
          if (resp.ok) break
          attempts++
          await new Promise(r => setTimeout(r, backoff[attempts-1] || 1000))
        } catch (e) {
          attempts++
          if (attempts >= maxAttempts) throw e
          await new Promise(r => setTimeout(r, backoff[attempts-1] || 1000))
        }
      }

      if (!resp || !resp.ok) {
        throw new Error('SAM.gov API fetch failed after retries')
      }

      const data = await resp.json()
      opportunities = data.opportunitiesData ?? []
    }

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
        proposals_due_at: opp.responseDeadLine ? new Date(opp.responseDeadLine).toISOString() : null,
        sam_or_source_url: `https://sam.gov/opp/${opp.noticeId}/view`,
      }

      const { error } = await supabase.from('opportunities').upsert(record, { onConflict: 'external_id,source_id' })
      if (error) {
        skipped++
      } else {
        inserted++
      }
    }

    // matching
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
        const { error } = await supabase.from('match_scores').upsert(scores, { onConflict: 'company_id,opportunity_id' })
        if (error) {
          errorOccurred = true
          errorDetails = error
        }
      }
    }
  } catch (e) {
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
      // ignore
    }
  }

  return { total: opportunities.length, inserted, skipped, errorOccurred, errorDetails }
}
