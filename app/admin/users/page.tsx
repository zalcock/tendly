import { createServerClient } from '@supabase/ssr'
import AdminUserTable from '../../../src/components/AdminUserTable'

interface AdminUser {
  id: string
  email: string
  companyName: string | null
  trialStartedAt: string | null
  role: string
}

export default async function Page() {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )

  const [{ data: profiles }, { data: authData }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, role, trial_started_at, companies(name)'),
    supabase.auth.admin.listUsers(),
  ])

  const emailMap = new Map(
    (authData?.users ?? []).map((u) => [u.id, u.email ?? ''])
  )

  const users: AdminUser[] = (profiles ?? []).map((p: any) => ({
    id: p.id,
    email: emailMap.get(p.id) ?? '',
    companyName: p.companies?.[0]?.name ?? null,
    trialStartedAt: p.trial_started_at ?? null,
    role: p.role,
  }))

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Users</h1>
      <AdminUserTable users={users} />
    </div>
  )
}
