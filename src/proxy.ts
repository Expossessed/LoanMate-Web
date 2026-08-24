/**
 * Next.js Middleware — Supabase session refresh
 *
 * This middleware runs on every non-static request and refreshes the
 * Supabase Auth session by updating the cookie before the page renders.
 * Without this, Server Components may see a stale/missing session even
 * when the user is actually logged in.
 *
 * Protected route logic:
 * - Unauthenticated users hitting /home, /loans, /wallet, etc.
 *   are redirected to /login.
 * - Authenticated users hitting /login or /register are redirected
 *   to their appropriate dashboard.
 */
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — do NOT remove this.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // ── Auth guard: redirect unauthenticated users to /login ──────────────────
  const protectedPrefixes = ['/home', '/loans', '/wallet', '/profile', '/apply', '/pledge-inbox', '/lender', '/admin']
  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix))

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // ── Redirect logged-in users away from auth pages ─────────────────────────
  if (user && (pathname === '/login' || pathname === '/register')) {
    // Fetch the user's role to decide which dashboard to redirect to
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role ?? 'student'
    const redirectUrl = request.nextUrl.clone()

    if (role === 'admin' || role === 'finance_officer') {
      redirectUrl.pathname = '/admin/loans'
    } else {
      redirectUrl.pathname = '/home'
    }

    return NextResponse.redirect(redirectUrl)
  }
  

  return supabaseResponse
  
}

export const config = {
  matcher: [
    '/home/:path*',
    '/loans/:path*',
    '/wallet/:path*',
    '/profile/:path*',
    '/apply/:path*',
    '/pledge-inbox/:path*',
    '/lender/:path*',
    '/admin/:path*',
    '/login',
    '/register',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
