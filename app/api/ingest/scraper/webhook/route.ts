import { NextResponse } from 'next/server'
import { handleApifyItems } from '../../../../../src/lib/ingest/apify'

export async function POST(request: Request) {
  const secret = process.env.SCRAPER_WEBHOOK_SECRET || ''
  const header = request.headers.get('x-scraper-secret') || request.headers.get('x-webhook-secret') || ''
  // If a secret is configured, require it. If not (dev), allow requests for testing.
  if (secret && header !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ ok: false, error: 'invalid-json' }, { status: 400 })

    // Accept items array or payload itself being an array
    const items = body.items ?? body.results ?? body.data ?? (Array.isArray(body) ? body : null)
    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ ok: false, error: 'no-items' }, { status: 400 })
    }

    const res = await handleApifyItems(items, { sourceName: 'SCRAPER' })
    return NextResponse.json({ ok: true, result: res })
  } catch (err) {
    console.error('scraper webhook error', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
