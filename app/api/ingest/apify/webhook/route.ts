import { NextResponse } from 'next/server'
import { handleApifyItems } from '../../../../../src/lib/ingest/apify'

export async function POST(request: Request) {
  const secret = process.env.APIFY_WEBHOOK_SECRET || ''
  const header = request.headers.get('x-apify-secret') || request.headers.get('x-apify-signature') || ''
  // If a secret is configured, require it. If not (dev), allow requests for testing.
  if (secret && header !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ ok: false, error: 'invalid-json' }, { status: 400 })

    // Apify actor webhook payload may contain "items" or the results directly
    const items = body.items ?? body.results ?? body.data ?? (Array.isArray(body) ? body : null)
    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ ok: false, error: 'no-items' }, { status: 400 })
    }

    const res = await handleApifyItems(items)
    return NextResponse.json({ ok: true, result: res })
  } catch (err) {
    console.error('apify webhook error', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
