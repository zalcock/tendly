import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runSamIngestion } from '../../../../../src/lib/ingest/sam'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let body: any = {}
  try {
    body = await request.json()
  } catch {}

  const useMock = body?.mock === true || !process.env.SAM_GOV_API_KEY

  try {
    const result = await runSamIngestion(supabase, { useMock })
    return NextResponse.json({ ok: true, result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
