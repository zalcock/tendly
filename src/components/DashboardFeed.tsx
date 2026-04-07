"use client"

import React, { useEffect, useState } from 'react'
import PaywallScreen from './PaywallScreen'

type Opportunity = {
  id: string
  title: string
  agency: string
  naics_code?: string | null
  set_aside?: string | null
  place_of_performance?: string | null
  value_min?: number | null
  value_max?: number | null
  proposals_due_at?: string | null
  sam_or_source_url: string
}

type Match = {
  id: string
  score: number
  reasons_json: unknown
  opportunity: Opportunity
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toLocaleString()}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function isDueSoon(iso: string): boolean {
  const diff = new Date(iso).getTime() - Date.now()
  return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000
}

function ScoreBadge({ score }: { score: number }) {
  const isGreen = score >= 70
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        isGreen
          ? 'bg-green-100 text-green-800'
          : 'bg-amber-100 text-amber-800'
      }`}
    >
      {score}
    </span>
  )
}

export default function DashboardFeed() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [paywalled, setPaywalled] = useState(false)

  useEffect(() => {
    fetch('/api/feed/my')
      .then(async (res) => {
        if (res.status === 403) {
          setPaywalled(true)
          return
        }
        const data = await res.json()
        setMatches(data.matches || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (paywalled) return <PaywallScreen />
  if (loading) return <div className="text-gray-500 text-sm">Loading matches...</div>

  if (!matches.length) {
    return (
      <p className="text-gray-500 text-sm">
        No matching contracts found. Try updating your profile with more NAICS codes or keywords.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {matches.map((m) => {
        const opp = m.opportunity
        const hasValue = opp.value_min != null || opp.value_max != null
        const dueSoon = opp.proposals_due_at ? isDueSoon(opp.proposals_due_at) : false

        return (
          <div key={m.id} className="rounded-lg border bg-white p-4 shadow-sm space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-gray-900 leading-snug">{opp.title}</h3>
              <ScoreBadge score={m.score} />
            </div>

            <p className="text-sm text-gray-600">{opp.agency}</p>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              {opp.naics_code && <span>NAICS: {opp.naics_code}</span>}
              {opp.set_aside && <span>Set-aside: {opp.set_aside}</span>}
              {opp.place_of_performance && <span>📍 {opp.place_of_performance}</span>}
              {hasValue && (
                <span>
                  {opp.value_min != null ? formatCurrency(opp.value_min) : '?'}{' '}
                  –{' '}
                  {opp.value_max != null ? formatCurrency(opp.value_max) : '?'}
                </span>
              )}
            </div>

            {opp.proposals_due_at && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">Due: {formatDate(opp.proposals_due_at)}</span>
                {dueSoon && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">
                    Due soon
                  </span>
                )}
              </div>
            )}

            <a
              href={opp.sam_or_source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-blue-600 hover:underline"
            >
              View on SAM.gov →
            </a>
          </div>
        )
      })}
    </div>
  )
}
