'use client'

import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { createClient } from '@/lib/supabase/client'

export default function LoginClient() {
  const supabase = createClient()

  const redirectTo =
    typeof window === 'undefined'
      ? `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://tendygov.vercel.app'}/auth/callback`
      : `${process.env.NEXT_PUBLIC_BASE_URL ?? window.location.origin}/auth/callback`

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ backgroundColor: '#f9fafb' }}>
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm p-8">
        <h1 className="text-2xl font-bold mb-2" style={{ color: '#1B365D' }}>Welcome back</h1>
        <p className="text-sm text-gray-500 mb-6">Log in to your Tendly account</p>
        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#1B365D',
                  brandAccent: '#00D1B2',
                },
              },
            },
          }}
          providers={[]}
          redirectTo={redirectTo}
          view="sign_in"
        />
      </div>
    </div>
  )
}
