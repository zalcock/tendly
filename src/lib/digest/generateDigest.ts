import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '../email/sender'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://tendly.vercel.app'

const TRIAL_DURATION_MS = 86_400_000 // 24 hours
const SCORE_THRESHOLD = 40
const MAX_MATCHES = 10
const DEADLINE_WARNING_DAYS = 7

function isTrialActive(trialStartedAt: string): boolean {
  return new Date(trialStartedAt).getTime() + TRIAL_DURATION_MS > Date.now()
}

function formatDate(iso: string | null): string {
  if (!iso) return 'N/A'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function isWithinDays(iso: string | null, days: number): boolean {
  if (!iso) return false
  const deadline = new Date(iso).getTime()
  const now = Date.now()
  return deadline > now && deadline - now <= days * 24 * 60 * 60 * 1000
}

function buildEmailHtml(
  companyName: string,
  matches: Array<{
    score: number
    title: string
    agency: string
    proposals_due_at: string | null
    sam_or_source_url: string
  }>
): string {
  const matchRows = matches
    .map((m) => {
      const deadlineWarning =
        isWithinDays(m.proposals_due_at, DEADLINE_WARNING_DAYS)
          ? `<span style="color:#dc2626;font-weight:bold;"> ⚠ Due soon!</span>`
          : ''
      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
            <a href="${m.sam_or_source_url}" target="_blank" rel="noreferrer" style="font-weight:bold;color:#1d4ed8;">${m.title}</a><br/>
            <span style="color:#6b7280;">${m.agency}</span>
          </td>
          <td style="padding:8px;text-align:center;border-bottom:1px solid #e5e7eb;">
            <span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:9999px;font-size:13px;">${m.score}</span>
          </td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">
            ${formatDate(m.proposals_due_at)}${deadlineWarning}
          </td>
        </tr>`
    })
    .join('')

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#111827;">Your Tendly Contract Matches</h2>
      <p style="color:#374151;">
        We found <strong>${matches.length} new contract match${matches.length !== 1 ? 'es' : ''}</strong>
        for <strong>${companyName}</strong> in the last 24 hours.
      </p>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="text-align:left;padding:8px 0;font-size:13px;color:#6b7280;">Opportunity</th>
            <th style="padding:8px;font-size:13px;color:#6b7280;">Score</th>
            <th style="padding:8px;font-size:13px;color:#6b7280;">Due Date</th>
          </tr>
        </thead>
        <tbody>${matchRows}</tbody>
      </table>
      <div style="margin-top:24px;">
        <a href="${BASE_URL}/dashboard"
           style="background:#1d4ed8;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">
          View Dashboard →
        </a>
      </div>
      <p style="color:#9ca3af;font-size:12px;margin-top:24px;">
        You're receiving this because you have an active Tendly pilot account.
      </p>
    </div>`
}

export async function runDigestForAll({ sinceHours = 24, limit = 1000 } = {}) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString()

  console.log('runDigestForAll starting', {
    since,
    limit,
    hasResend: Boolean(process.env.RESEND_API_KEY),
  })

  // 1. Fetch profiles that have an active trial
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, trial_started_at')
    .not('trial_started_at', 'is', null)
    .limit(limit)

  if (profilesError) throw profilesError

  const activeProfiles = (profiles || []).filter(
    (p) => p.trial_started_at && isTrialActive(p.trial_started_at)
  )

  const results: Array<{
    profileId: string
    emailSent: boolean
    matches?: number
    reason?: string
    error?: string
  }> = []

  for (const profile of activeProfiles) {
    try {
      // Resolve email via auth admin API
      let email: string | null = null
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(profile.id)
        email = userData?.user?.email ?? null
      } catch {
        // ignore
      }

      if (!email) {
        results.push({ profileId: profile.id, emailSent: false, reason: 'no-email' })
        continue
      }

      // Find company owned by this profile
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name')
        .eq('owner_id', profile.id)
        .limit(1)

      const company = companies?.[0]
      if (!company) {
        results.push({ profileId: profile.id, emailSent: false, reason: 'no-company' })
        continue
      }

      // 2. Query match_scores with score >= 40, created in last 24h, joined with opportunities
      const { data: matchRows } = await supabase
        .from('match_scores')
        .select(`
          id,
          score,
          created_at,
          opportunities (
            id,
            title,
            agency,
            proposals_due_at,
            sam_or_source_url
          )
        `)
        .eq('company_id', company.id)
        .gte('score', SCORE_THRESHOLD)
        .gte('created_at', since)
        .order('score', { ascending: false })

      // 3. Skip users with zero qualifying matches
      if (!matchRows || matchRows.length === 0) {
        results.push({ profileId: profile.id, emailSent: false, reason: 'no-new-matches' })
        continue
      }

      // 4. Sort by score DESC (already ordered), cap at 10
      const topMatches = matchRows.slice(0, MAX_MATCHES).map((m: any) => ({
        score: m.score,
        title: m.opportunities?.title ?? 'Untitled',
        agency: m.opportunities?.agency ?? '',
        proposals_due_at: m.opportunities?.proposals_due_at ?? null,
        sam_or_source_url: m.opportunities?.sam_or_source_url ?? '',
      }))

      // 5. Build email
      const subject = `Tendly: ${matchRows.length} new contract match${matchRows.length !== 1 ? 'es' : ''} for ${company.name}`
      const html = buildEmailHtml(company.name, topMatches)

      // Send email — on failure, log and continue
      try {
        await sendEmail(email, subject, html)
      } catch (emailErr) {
        console.error(`Digest email failed for profile ${profile.id}:`, emailErr)
        results.push({ profileId: profile.id, emailSent: false, error: String(emailErr) })
        continue
      }

      // 6. Insert into notifications table
      await supabase.from('notifications').insert({
        user_id: profile.id,
        type: 'daily_digest',
        data_json: { matchCount: matchRows.length, companyName: company.name },
        scheduled_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
      })

      // 7. Update profiles.last_digest_at
      await supabase
        .from('profiles')
        .update({ last_digest_at: new Date().toISOString() })
        .eq('id', profile.id)

      results.push({ profileId: profile.id, emailSent: true, matches: matchRows.length })
    } catch (err) {
      console.error(`Digest error for profile ${profile.id}:`, err)
      results.push({ profileId: profile.id, emailSent: false, error: String(err) })
    }
  }

  return results
}
