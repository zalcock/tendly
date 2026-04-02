export async function sendEmail(to: string, subject: string, html: string) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const RESEND_FROM = process.env.RESEND_FROM

  if (!RESEND_API_KEY || !RESEND_FROM) {
    console.log('Mock sendEmail', { to, subject })
    return { mock: true }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to,
      subject,
      html,
    }),
  })

  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(JSON.stringify(json || { status: res.status }))
  return json
}
