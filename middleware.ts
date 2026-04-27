import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Clone request headers and create a mutable response to pass cookies through
  const requestHeaders = new Headers(request.headers)
  let response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          // Write cookies onto the outgoing response
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
          // Apply cache-control headers required by @supabase/ssr when auth
          // cookies are refreshed (prevents CDN caching of session tokens)
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value)
          )
        },
      },
    }
  )

  // Refresh the session — this keeps the access token alive and writes
  // updated cookies to the response via the setAll handler above.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Rule 1: no session → redirect to /login (but allow / for the landing page)
  if (!user) {
    if (pathname === '/') return response
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Fetch profile and company data for the authenticated user
  const [{ data: profile }, { data: company }] = await Promise.all([
    supabase
      .from('profiles')
      .select('role, trial_started_at')
      .eq('id', user.id)
      .single(),
    supabase
      .from('companies')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle(),
  ])

  // Set trial_started_at on first authenticated request if not yet set
  if (profile && !profile.trial_started_at) {
    await supabase
      .from('profiles')
      .update({ trial_started_at: new Date().toISOString() })
      .eq('id', user.id)
  }

  // Rule 2: session + no company row → redirect to /onboard
  if (!company && pathname !== '/onboard') {
    return NextResponse.redirect(new URL('/onboard', request.url))
  }

  // Rule 3: session + trial expired → redirect to /paywall
  if (profile?.trial_started_at && pathname !== '/paywall') {
    const trialExpiresAt =
      new Date(profile.trial_started_at).getTime() + 86400000
    if (Date.now() > trialExpiresAt) {
      return NextResponse.redirect(new URL('/paywall', request.url))
    }
  }

  // Rule 4: non-OWNER accessing /admin/* → redirect to /dashboard
  if (pathname.startsWith('/admin') && profile?.role !== 'OWNER') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all routes EXCEPT:
     *   - /_next/static/*
     *   - /_next/image/*
     *   - /favicon.ico
     *   - /api/*
     *   - /login
     *   - /signup
     *   - /paywall
     */
    '/((?!_next/static|_next/image|favicon\\.ico|api/|login|signup|paywall).*)',
  ],
}
