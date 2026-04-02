'use client'
import React, { useState } from 'react'

export default function RunDigestButton({ label = 'Run Daily Digest (admin)' }: { label?: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function run() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/digest/run', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      setResult(JSON.stringify(json))
    } catch (e) {
      setResult(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button className="btn" onClick={run} disabled={loading}>
        {loading ? 'Running…' : label}
      </button>
      {result && <pre className="mt-2 text-xs">{result}</pre>}
    </div>
  )
}
