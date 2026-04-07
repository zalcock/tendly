'use client'

import { useEffect, useState } from 'react'

interface TrialCountdownProps {
  trialExpiresAt: string
}

export default function TrialCountdown({ trialExpiresAt }: TrialCountdownProps) {
  const [remaining, setRemaining] = useState<number>(() =>
    new Date(trialExpiresAt).getTime() - Date.now()
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(new Date(trialExpiresAt).getTime() - Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [trialExpiresAt])

  if (remaining <= 0) return null

  const totalSeconds = Math.floor(remaining / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const label =
    remaining > 60 * 60 * 1000
      ? `${hours}h ${minutes}m remaining`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} remaining`

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
      <span>⏱</span>
      <span>Pilot window: {label}</span>
    </div>
  )
}
