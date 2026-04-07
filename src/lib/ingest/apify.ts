import { createClient } from '@supabase/supabase-js'
import { computeMatchScore, Company, Opportunity } from '../../../lib/matching'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export async function handleApifyItems(items: any[], options: { sourceName?: string } = {}) {
  // find source id for APIFY
  const { data: source } = await supabase
    .from('opportunity_sources')
    .select('id')
    .eq('type', 'APIFY')
    .single()

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
    for (const it of items) {
      const record = {
        external_id: it.id ?? it.noticeId ?? it.externalId ?? null,
        source_id: source?.id ?? null,
        title: it.title ?? it.name ?? 'Untitled',
        agency: it.agency ?? it.organization ?? it.publisher ?? null,
        sub_agency: it.subAgency ?? null,
        naics_code: it.naics ?? it.naicsCode ?? null,
        procurement_method: it.procurementMethod ?? null,
        set_aside: it.setAside ?? it.typeOfSetAside ?? null,
        place_of_performance: it.placeOfPerformance ?? it.location ?? null,
        value_min: it.value_min ?? it.award?.amount ?? null,
        synopsis: it.description ?? it.synopsis ?? '',
        posted_at: it.posted_at ? new Date(it.posted_at).toISOString() : (it.postedDate ? new Date(it.postedDate).toISOString() : null),
        proposals_due_at: it.proposals_due_at ? new Date(it.proposals_due_at).toISOString() : (it.responseDeadLine ? new Date(it.responseDeadLine).toISOString() : null),
        sam_or_source_url: it.url ?? it.sourceUrl ?? null,
      }

      const { error } = await supabase.from('opportunities').upsert(record, { onConflict: 'external_id,source_id' })
      if (error) skipped++
      else inserted++
    }

    // matching similar to SAM ingestion
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
        total_found: items.length,
        inserted,
        skipped,
        error_json: errorOccurred ? { message: String(errorDetails) } : null,
      }).eq('id', runId)
    } catch (e) {
      // ignore
    }
  }

  return { total: items.length, inserted, skipped, errorOccurred, errorDetails }
}
