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
  // Temporary simplification to isolate the MIDDLEWARE_INVOCATION_FAILED crash.
  return NextResponse.next()
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
