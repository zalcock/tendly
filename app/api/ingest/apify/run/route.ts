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
    const items = await runApifyActor('US_SAM')
    const result = await handleApifyItems(items, { sourceType: 'US_SAM' })
    return NextResponse.json({ ok: true, source: 'US_SAM', result })
  } catch (err) {
    console.error('[ingest/apify/run] US_SAM error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
