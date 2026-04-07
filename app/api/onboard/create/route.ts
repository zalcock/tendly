import { NextResponse } from 'next/server'
import { createClient as createServerSupabaseClient } from '../../../../lib/supabase/server'

export async function POST(req: Request) {
  const body = await req.json()
  const { companyName, naics, location, certifications, keywords } = body

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Create company and profile
  const companyRes = await supabase
    .from('companies')
    .insert([{ name: companyName, owner_id: user.id }])
    .select()
  if (companyRes.error) {
    return NextResponse.json({ error: companyRes.error.message }, { status: 500 })
  }
  const company = companyRes.data[0]

  const profileRes = await supabase
    .from('profiles')
    .upsert([
      {
        id: user.id,
        company_id: company.id,
        naics: naics ? naics.split(',').map((s: string) => s.trim()) : [],
        location,
        certifications: certifications ? certifications.split(',').map((s: string) => s.trim()) : [],
        keywords: keywords ? keywords.split(',').map((s: string) => s.trim()) : [],
      },
    ])
    .select()

  if (profileRes.error) {
    return NextResponse.json({ error: profileRes.error.message }, { status: 500 })
  }

  // Trigger background matching run for this company/profile
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/match/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId: company.id }),
  })

  return NextResponse.json({ ok: true })
}
