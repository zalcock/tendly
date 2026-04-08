'use client'
import { useState } from 'react'

export default function RunIngestionButton({}: any) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function runMock() {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/ingest/sam/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ''}` },
        body: JSON.stringify({ mock: true }),
      })
      const data = await res.json()
      if (data.ok) setMessage(`Mock run complete: inserted ${data.result?.inserted ?? 0}, skipped ${data.result?.skipped ?? 0}`)
      else setMessage(`Run failed: ${data.error}`)
    } catch (e) {
      setMessage(String(e))
    } finally { setLoading(false) }
  }

  async function runApify() {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/ingest/apify/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ''}` },
      })
      const data = await res.json()
      if (data.ok) setMessage(`Apify run complete: inserted ${data.result?.inserted ?? 0}, skipped ${data.result?.skipped ?? 0}`)
      else setMessage(`Run failed: ${data.error}`)
    } catch (e) {
      setMessage(String(e))
    } finally { setLoading(false) }
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <button disabled={loading} onClick={runApify} className="px-3 py-1 bg-blue-600 text-white rounded">
        {loading ? 'Running…' : 'Run Apify (SAM.gov)'}
      </button>
      <button disabled={loading} onClick={runMock} className="px-3 py-1 bg-gray-600 text-white rounded">
        Run Mock
      </button>
      {message && <div className="mt-2 text-sm">{message}</div>}
    </div>
  )
}
