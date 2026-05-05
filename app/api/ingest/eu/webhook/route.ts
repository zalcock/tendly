import { NextResponse } from 'next/server'
import { handleApifyItems } from '../../../../../src/lib/ingest/apify'

export async function POST(request: Request) {
  const secret = process.env.APIFY_WEBHOOK_SECRET ?? ''
  const header = request.headers.get('x-apify-secret')
                 ?? request.headers.get('x-apify-signature')
                 ?? ''

  if (secret && header !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid-json' }, { status: 400 })
  }

  const items = body.items ?? body.results ?? body.data ?? (Array.isArray(body) ? body : null)
  if (!items || !Array.isArray(items)) {
    return NextResponse.json({ ok: false, error: 'no-items-in-payload' }, { status: 400 })
  }

  try {
    const result = await handleApifyItems(items, { sourceType: 'EU_TENDER' })
    return NextResponse.json({ ok: true, source: 'EU_TENDER', result })
  } catch (err) {
    console.error('[ingest/eu/webhook] error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
