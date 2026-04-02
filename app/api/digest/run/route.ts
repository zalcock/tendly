import { NextResponse } from 'next/server'
import { runDigestForAll } from '../../../../src/lib/digest/generateDigest'

export async function POST(request: Request) {
  const auth = request.headers.get('authorization') || ''
  const secret = (process.env.CRON_SECRET || '')
  if (!auth.startsWith('Bearer') || auth.split(' ')[1] !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const results = await runDigestForAll({ sinceHours: 24 })
    return NextResponse.json({ ok: true, results })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
