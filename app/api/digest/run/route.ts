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
    try {
      console.error('digest run error', err)
    } catch (e) {
      // ignore
    }
    const serializeError = (e: any) => {
      if (e instanceof Error) return { message: e.message, stack: e.stack }
      try {
        return JSON.parse(JSON.stringify(e))
      } catch (e2) {
        return String(e)
      }
    }
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 })
  }
}
