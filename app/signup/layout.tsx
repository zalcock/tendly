import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign up — Tendly',
  description: 'Create a free Tendly account and start finding government contracts that match your business in minutes.',
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
