import { NextResponse } from 'next/server'
import { handleApifyItems } from '../../../../../src/lib/ingest/apify'

export async function POST(request: Request) {
  const token = process.env.APIFY_TOKEN || ''
  const actorId = process.env.APIFY_ACTOR_ID || ''
  const secret = process.env.CRON_SECRET || ''

  const auth = request.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer') || auth.split(' ')[1] !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  if (!token || !actorId) {
    return NextResponse.json({ ok: false, error: 'missing-config' }, { status: 400 })
  }

  try {
    // Fetch latest run results from Apify
    const runsUrl = `https://api.apify.com/v2/actors/${actorId}/runs?token=${token}&limit=5`
    const runsResp = await fetch(runsUrl)
    if (!runsResp.ok) throw new Error('apify runs fetch failed')
    const runsJson = await runsResp.json()
    const runs = runsJson.data ?? runsJson.items ?? []

    // find latest finished run with results_url
    for (const r of runs) {
      if (r.status === 'SUCCEEDED' && r.meta && r.meta.output) {
        const resultsUrl = r.meta.output
        const outResp = await fetch(`${resultsUrl}?token=${token}`)
        if (!outResp.ok) continue
        const items = await outResp.json().catch(() => null)
        if (items && Array.isArray(items)) {
          const res = await handleApifyItems(items)
          return NextResponse.json({ ok: true, result: res })
        }
      }
    }

    return NextResponse.json({ ok: false, error: 'no-results-found' }, { status: 404 })
  } catch (err) {
    console.error('apify poll error', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
