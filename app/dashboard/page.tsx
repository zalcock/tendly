import { createClient } from '@/lib/supabase/server'
import PaywallScreen from '@/src/components/PaywallScreen'
import ProfileSummary from '@/src/components/ProfileSummary'
import TrialCountdown from '@/src/components/TrialCountdown'
import DashboardFeed from '@/src/components/DashboardFeed'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('trial_started_at, role')
    .eq('id', user!.id)
    .single()

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, socio_economic_certs')
    .eq('owner_id', user!.id)
    .single()

  if (!company) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Setting up your profile...</p>
      </main>
    )
  }

  let trialExpiresAt: string | null = null
  let trialActive = true

  if (profile?.trial_started_at) {
    const expiresMs = new Date(profile.trial_started_at).getTime() + 86400000
    trialExpiresAt = new Date(expiresMs).toISOString()
    if (Date.now() >= expiresMs) {
      trialActive = false
    }
  }

  if (!trialActive) {
    return <PaywallScreen />
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <ProfileSummary
          companyName={company?.name ?? ''}
          certifications={company?.socio_economic_certs ?? []}
        />
        {trialExpiresAt && <TrialCountdown trialExpiresAt={trialExpiresAt} />}
      </div>
      <DashboardFeed />
    </main>
  )
}
