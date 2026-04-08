import { NextResponse } from 'next/server'
import { handleApifyItems } from '../../../../../src/lib/ingest/apify'

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET || ''
  const auth = request.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer') || auth.split(' ')[1] !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const token = process.env.APIFY_TOKEN || ''
  const actorId = process.env.APIFY_ACTOR_ID || 'fortuitous_pirate/sam-gov-scraper'

  if (!token) {
    return NextResponse.json({ ok: false, error: 'APIFY_TOKEN not set' }, { status: 400 })
  }

  try {
    // Start the actor run synchronously (waits for completion, up to 300s)
    const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=300`
    const runResp = await fetch(runUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })

    if (!runResp.ok) {
      const err = await runResp.text()
      return NextResponse.json({ ok: false, error: `Apify error: ${err}` }, { status: 500 })
    }

    const items = await runResp.json()
    if (!Array.isArray(items)) {
      return NextResponse.json({ ok: false, error: 'Unexpected Apify response format' }, { status: 500 })
    }

    const result = await handleApifyItems(items)
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error('apify run error', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
