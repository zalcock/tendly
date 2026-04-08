"use client"

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardForm() {
  const router = useRouter()
  const [companyName, setCompanyName] = useState('')
  const [naics, setNaics] = useState('')
  const [location, setLocation] = useState('')
  const [certifications, setCertifications] = useState('')
  const [keywords, setKeywords] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [companyNameError, setCompanyNameError] = useState('')
  const [naicsError, setNaicsError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Client-side validation
    let valid = true
    setCompanyNameError('')
    setNaicsError('')

    if (!companyName.trim()) {
      setCompanyNameError('Company name is required.')
      valid = false
    }

    const naicsCodes = naics.split(',').map(s => s.trim()).filter(Boolean)
    if (naicsCodes.length === 0) {
      setNaicsError('At least one NAICS code is required.')
      valid = false
    }

    if (!valid) return

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/onboard/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, naics, location, certifications, keywords }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create company')
      router.refresh()
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block font-medium">Company name</label>
        <input value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full border p-2 rounded" />
        {companyNameError && <p className="text-red-600 text-sm mt-1">{companyNameError}</p>}
      </div>
      <div>
        <label className="block font-medium">NAICS codes (comma separated)</label>
        <input value={naics} onChange={e => setNaics(e.target.value)} className="w-full border p-2 rounded" placeholder="e.g. 541511, 541512" />
        {naicsError && <p className="text-red-600 text-sm mt-1">{naicsError}</p>}
      </div>
      <div>
        <label className="block font-medium">Location (City, State)</label>
        <input value={location} onChange={e => setLocation(e.target.value)} className="w-full border p-2 rounded" />
      </div>
      <div>
        <label className="block font-medium">Certifications (comma separated)</label>
        <input value={certifications} onChange={e => setCertifications(e.target.value)} className="w-full border p-2 rounded" placeholder="SDVOSB, WOSB" />
      </div>
      <div>
        <label className="block font-medium">Keywords (comma separated)</label>
        <input value={keywords} onChange={e => setKeywords(e.target.value)} className="w-full border p-2 rounded" placeholder="cybersecurity, cloud" />
      </div>
      {error && <div className="text-red-600">{error}</div>}
      <button disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded">
        {loading ? 'Creating...' : 'Create account'}
      </button>
    </form>
  )
}
