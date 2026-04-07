"use client"

import React, { useEffect, useState } from 'react'

type Match = {
  id: string
  opportunity_id: string
  score: number
  reasons: any
  opportunity: any
}

export default function DashboardFeed() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/feed/my')
      .then(r => r.json())
      .then(data => {
        setMatches(data.matches || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div>Loading...</div>
  if (!matches.length) return <div>No matches yet. Try updating your profile.</div>

  return (
    <div className="space-y-4">
      {matches.map(m => (
        <div key={m.id} className="border p-4 rounded">
          <div className="flex justify-between items-start">
            <h3 className="font-semibold">{m.opportunity.title || m.opportunity.solicitation_number}</h3>
            <div className="text-sm font-medium">Score: {m.score}</div>
          </div>
          <p className="text-sm text-gray-600">{m.opportunity.description}</p>
          <div className="mt-2 text-xs text-gray-500">Reasons: {JSON.stringify(m.reasons)}</div>
        </div>
      ))}
    </div>
  )
}
