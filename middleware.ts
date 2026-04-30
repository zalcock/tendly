import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const publicRoutes = ["/", "/login", "/signup", "/paywall"];
  const isPublic =
    publicRoutes.includes(pathname) || pathname.startsWith("/auth/");

  if (!user) {
    if (isPublic) return response;
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname === "/login" || pathname === "/signup") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const [{ data: profile }, { data: company }] = await Promise.all([
    supabase
      .from("profiles")
      .select("role, trial_started_at")
      .eq("id", user.id)
      .single(),
    supabase
      .from("companies")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle(),
  ]);

  const onboardingAllowed =
    ["/onboard", "/paywall"].includes(pathname) ||
    pathname.startsWith("/auth/");
  if (!company && !onboardingAllowed) {
    return NextResponse.redirect(new URL("/onboard", request.url));
  }

  if (profile && !profile.trial_started_at && company) {
    await supabase
      .from("profiles")
      .update({ trial_started_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  if (
    company &&
    profile?.trial_started_at &&
    pathname !== "/paywall" &&
    !pathname.startsWith("/auth/")
  ) {
    const trialExpiresAt =
      new Date(profile.trial_started_at).getTime() + 86_400_000;
    if (Date.now() > trialExpiresAt) {
      return NextResponse.redirect(new URL("/paywall", request.url));
    }
  }

  if (pathname.startsWith("/admin") && profile?.role !== "OWNER") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|api/).*)",
  ],
};
