import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Log in — Tendly',
  description: 'Log in to your Tendly account to view your personalized government contract matches.',
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
