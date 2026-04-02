'use client'
import { useState } from 'react'

export default function RunIngestionButton({}: any) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function run(mock = false) {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/ingest/sam/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? 'test-cron-secret-12345'}` },
        body: JSON.stringify({ mock }),
      })
      const data = await res.json()
      if (data.ok) setMessage(`Run complete: inserted ${data.result.inserted}, skipped ${data.result.skipped}`)
      else setMessage(`Run failed: ${data.error}`)
    } catch (e) {
      setMessage(String(e))
    } finally { setLoading(false) }
  }

  return (
    <div className="flex gap-2">
      <button disabled={loading} onClick={() => run(false)} className="px-3 py-1 bg-blue-600 text-white rounded">Run Ingestion</button>
      <button disabled={loading} onClick={() => run(true)} className="px-3 py-1 bg-gray-600 text-white rounded">Run Mock</button>
      {loading && <span className="ml-2">Running…</span>}
      {message && <div className="ml-2">{message}</div>}
    </div>
  )
}
