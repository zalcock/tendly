import { createClient } from '@supabase/supabase-js'
import { computeMatchScore, Company, Opportunity } from '../../../lib/matching'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ─── Source types ────────────────────────────────────────────────────────────

export type ApifySourceType = 'US_SAM' | 'EU_TENDER'

/**
 * Default Apify actor IDs.
 * Override via env vars APIFY_ACTOR_US_SAM and APIFY_ACTOR_EU_TENDER.
 */
const DEFAULT_ACTORS: Record<ApifySourceType, string> = {
  US_SAM:    'fortuitous_pirate/sam-gov-scraper',
  EU_TENDER: 'eprocurement/eu-tenders-scraper',
}

// ─── Field normalisation ─────────────────────────────────────────────────────

/**
 * Normalise a raw item from the SAM.gov Apify actor into our opportunities schema.
 */
function normaliseUsSam(it: any, sourceId: string) {
  return {
    external_id:          it.noticeId ?? it.id ?? it.externalId ?? null,
    source_id:            sourceId,
    region:               'US' as const,
    title:                it.title ?? it.name ?? 'Untitled',
    agency:               it.fullParentPathName ?? it.agency ?? it.organization ?? it.publisher ?? '',
    sub_agency:           it.organizationName ?? it.subAgency ?? null,
    naics_code:           it.naicsCode ?? it.naics ?? null,
    procurement_method:   it.type ?? it.procurementMethod ?? null,
    set_aside:            it.typeOfSetAsideDescription ?? it.setAside ?? null,
    place_of_performance: it.placeOfPerformance?.state?.name ?? it.placeOfPerformance ?? it.location ?? null,
    buyer_country:        'US',
    cpv_code:             null,
    value_min:            it.award?.amount ?? it.value_min ?? null,
    value_max:            it.value_max ?? null,
    synopsis:             it.description ?? it.synopsis ?? '',
    posted_at:            parseDate(it.postedDate ?? it.posted_at),
    proposals_due_at:     parseDate(it.responseDeadLine ?? it.proposals_due_at),
    sam_or_source_url:    it.url ?? it.sourceUrl
                          ?? (it.noticeId ? `https://sam.gov/opp/${it.noticeId}/view` : ''),
  }
}

/**
 * Normalise a raw item from the EU Tenders (TED) Apify actor into our opportunities schema.
 *
 * TED actor output shape (eprocurement/eu-tenders-scraper):
 *   { id, title, contractingAuthority, cpvCodes, country, deadline, publicationDate,
 *     valueMin, valueMax, description, url, procurementType }
 */
function normaliseEuTender(it: any, sourceId: string) {
  const cpv = Array.isArray(it.cpvCodes) ? it.cpvCodes[0] : (it.cpvCode ?? null)
  return {
    external_id:          it.id ?? it.noticeNumber ?? it.tedId ?? null,
    source_id:            sourceId,
    region:               'EU' as const,
    title:                it.title ?? it.name ?? 'Untitled',
    agency:               it.contractingAuthority ?? it.buyerName ?? it.organization ?? '',
    sub_agency:           null,
    naics_code:           null,        // EU uses CPV, not NAICS
    cpv_code:             cpv,
    procurement_method:   it.procurementType ?? it.type ?? null,
    set_aside:            null,        // EU tenders don't use US set-aside categories
    place_of_performance: it.placeOfPerformance ?? it.country ?? null,
    buyer_country:        it.country ?? null,
    value_min:            it.valueMin ?? it.estimatedValue ?? null,
    value_max:            it.valueMax ?? null,
    synopsis:             it.description ?? it.shortDescription ?? '',
    posted_at:            parseDate(it.publicationDate ?? it.postedDate),
    proposals_due_at:     parseDate(it.deadline ?? it.submissionDeadline),
    sam_or_source_url:    it.url ?? it.tedUrl
                          ?? (it.id ? `https://ted.europa.eu/udl?uri=TED:NOTICE:${it.id}:TEXT:EN:HTML` : ''),
  }
}

function parseDate(val: unknown): string | null {
  if (!val) return null
  const d = new Date(val as string)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// ─── Core ingestion handler ──────────────────────────────────────────────────

export async function handleApifyItems(
  items: any[],
  options: { sourceType?: ApifySourceType } = {}
) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const sourceType: ApifySourceType = options.sourceType ?? 'US_SAM'

  // Resolve the source row
  const { data: source, error: sourceErr } = await supabase
    .from('opportunity_sources')
    .select('id')
    .eq('type', sourceType)
    .single()

  if (sourceErr || !source) {
    throw new Error(`opportunity_sources row for type="${sourceType}" not found. Run migration 008.`)
  }

  // Create ingestion run record
  const { data: run } = await supabase
    .from('ingestion_runs')
    .insert([{ source_id: source.id }])
    .select('id')
    .single()

  const runId = run?.id ?? null
  let inserted = 0
  let skipped = 0
  let errorOccurred = false
  let errorDetails: any = null

  try {
    // Normalise and upsert each item
    for (const it of items) {
      const record = sourceType === 'EU_TENDER'
        ? normaliseEuTender(it, source.id)
        : normaliseUsSam(it, source.id)

      if (!record.external_id) {
        skipped++
        continue
      }

      const { error } = await supabase
        .from('opportunities')
        .upsert(record, { onConflict: 'external_id,source_id' })

      if (error) {
        console.error(`[apify:${sourceType}] upsert error`, error.message, record.external_id)
        skipped++
      } else {
        inserted++
      }
    }

    // ── Matching: score all companies against newly ingested opportunities ──
    const { data: companies } = await supabase
      .from('companies')
      .select('id, naics_codes, socio_economic_certs, target_geographies, capability_keywords')

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: newOpps } = await supabase
      .from('opportunities')
      .select('id, naics_code, set_aside, place_of_performance, value_max, value_min, title, synopsis')
      .gte('created_at', since)

    if (companies && newOpps && companies.length > 0 && newOpps.length > 0) {
      const scores: {
        company_id: string
        opportunity_id: string
        score: number
        reasons_json: unknown
      }[] = []

      for (const company of companies as Company[]) {
        for (const opp of newOpps as Opportunity[]) {
          const { score, reasons } = computeMatchScore(company, opp)
          scores.push({
            company_id:     company.id,
            opportunity_id: opp.id,
            score,
            reasons_json:   reasons,
          })
        }
      }

      if (scores.length > 0) {
        const { error: matchErr } = await supabase
          .from('match_scores')
          .upsert(scores, { onConflict: 'company_id,opportunity_id' })

        if (matchErr) {
          errorOccurred = true
          errorDetails = matchErr
        }
      }
    }
  } catch (e) {
    errorOccurred = true
    errorDetails = e
  } finally {
    try {
      await supabase
        .from('ingestion_runs')
        .update({
          finished_at: new Date().toISOString(),
          status:      errorOccurred ? 'FAILED' : 'SUCCESS',
          total_found: items.length,
          inserted,
          skipped,
          error_json:  errorOccurred ? { message: String(errorDetails) } : null,
        })
        .eq('id', runId)
    } catch {
      // best-effort — don't throw if logging fails
    }
  }

  return { total: items.length, inserted, skipped, errorOccurred, errorDetails }
}

// ─── Actor runner ─────────────────────────────────────────────────────────────

/**
 * Start an Apify actor synchronously and return the dataset items.
 * Uses run-sync-get-dataset-items which blocks until the run completes (up to timeoutSecs).
 */
export async function runApifyActor(
  sourceType: ApifySourceType,
  input: Record<string, unknown> = {},
  timeoutSecs = 300
): Promise<any[]> {
  const token = process.env.APIFY_TOKEN
  if (!token) throw new Error('APIFY_TOKEN env var is not set')

  const actorId = sourceType === 'US_SAM'
    ? (process.env.APIFY_ACTOR_US_SAM    ?? DEFAULT_ACTORS.US_SAM)
    : (process.env.APIFY_ACTOR_EU_TENDER ?? DEFAULT_ACTORS.EU_TENDER)

  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`
    + `?token=${token}&timeout=${timeoutSecs}`

  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(input),
  })

  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Apify actor "${actorId}" error ${resp.status}: ${body}`)
  }

  const items = await resp.json()
  if (!Array.isArray(items)) {
    throw new Error(`Apify actor "${actorId}" returned non-array response`)
  }

  return items
}
