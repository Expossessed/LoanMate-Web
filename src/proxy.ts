
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

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  const protectedPrefixes = ['/home', '/loans', '/wallet', '/profile', '/apply', '/pledge-inbox', '/lender', '/admin']
  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix))

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  if (user && (pathname === '/login' || pathname === '/register')) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role ?? 'student'
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = (role === 'admin' || role === 'finance_officer') ? '/admin/loans' : '/home'

    return NextResponse.redirect(redirectUrl)
  }

  return supabaseResponse
}
//yeah
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
