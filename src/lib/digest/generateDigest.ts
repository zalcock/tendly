import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '../email/sender'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export async function runDigestForAll({ sinceHours = 24, limit = 1000 } = {}) {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString()

  console.log('runDigestForAll starting', { since, limit, RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY) })

  // fetch profiles with an email
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id,user_id,email,last_digest_at')
    .not('email', 'is', null)
    .limit(limit)

  if (error) throw error
  const results: any[] = []

  for (const p of profiles || []) {
    try {
      const { data: matchScores } = await supabase
        .from('match_scores')
        .select('id,score,opportunity_id,created_at')
        .eq('profile_id', p.id)
        .gte('created_at', since)

      if (!matchScores || matchScores.length === 0) {
        results.push({ profileId: p.id, emailSent: false, reason: 'no-new-matches' })
        continue
      }

      // fetch opportunity details for each match
      const opportunityIds = matchScores.map((m: any) => m.opportunity_id)
      const { data: opportunities } = await supabase
        .from('opportunities')
        .select('id,title,agency,posted_at,url,proposal_due_at')
        .in('id', opportunityIds)

      const items = (opportunities || []).map((o: any) => `
        <li><a href="${o.url}" target="_blank" rel="noreferrer">${o.title}</a> — ${o.agency || ''}</li>
      `)

      const subject = `Tendly Daily Digest: ${matchScores.length} new match${matchScores.length > 1 ? 'es' : ''}`
      const html = `
        <p>Hi —</p>
        <p>We found ${matchScores.length} new contract match${matchScores.length > 1 ? 'es' : ''} for your business:</p>
        <ul>${items.join('')}</ul>
        <p>Log in to Tendly to review and act on these opportunities.</p>
      `

      try {
        await sendEmail(p.email, subject, html)
      } catch (e) {
        results.push({ profileId: p.id, emailSent: false, error: String(e) })
        continue
      }

      // record a notification
      await supabase.from('notifications').insert([
        {
          profile_id: p.id,
          user_id: p.user_id,
          type: 'daily_digest',
          subject,
          body: html,
          sent_at: new Date().toISOString(),
        },
      ])

      // update last_digest_at if column exists (ignore errors)
      try {
        await supabase.from('profiles').update({ last_digest_at: new Date().toISOString() }).eq('id', p.id)
      } catch (e) {
        // ignore
      }

      results.push({ profileId: p.id, emailSent: true, matches: matchScores.length })
    } catch (err) {
      results.push({ profileId: p.id, emailSent: false, error: String(err) })
    }
  }

  return results
}
