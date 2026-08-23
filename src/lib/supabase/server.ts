/**
 * Supabase SERVER client
 *
 * Use this in Server Components, Route Handlers, and Server Actions.
 * The createServerClient from @supabase/ssr reads/writes cookies
 * via Next.js cookies() — this function must be called inside a
 * request context (not at module level).
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll may be called from a Server Component where
            // setting cookies is a no-op — middleware handles refresh.
          }
        },
      },
    }
  )
}
