import { NextResponse } from 'next/server'
import { runApifyActor, handleApifyItems } from '../../../../../src/lib/ingest/apify'

function requireBearerAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? ''
  const auth = request.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

export async function POST(request: Request) {
  if (!requireBearerAuth(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    // The EU tenders actor accepts optional filters — pass any body params through
    const body = await request.json().catch(() => ({}))
    const actorInput = {
      // Default: last 7 days of notices, up to 500 results
      // These are standard TED scraper params — override via request body if needed
      dateFrom:  body.dateFrom ?? (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0] })(),
      dateTo:    body.dateTo   ?? new Date().toISOString().split('T')[0],
      maxItems:  body.maxItems ?? 500,
      ...body,
    }

    const items = await runApifyActor('EU_TENDER', actorInput)
    const result = await handleApifyItems(items, { sourceType: 'EU_TENDER' })
    return NextResponse.json({ ok: true, source: 'EU_TENDER', result })
  } catch (err) {
    console.error('[ingest/eu/run] EU_TENDER error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
