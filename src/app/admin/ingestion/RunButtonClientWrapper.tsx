'use client'
import dynamic from 'next/dynamic'
import { useEffect } from 'react'

const RunIngestionButton = dynamic(() => import('@/components/RunIngestionButton'), { ssr: false })

export default function RunButtonClientWrapper() {
  return <RunIngestionButton />
}
