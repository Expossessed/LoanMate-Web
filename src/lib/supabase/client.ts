/**
 * Supabase BROWSER client
 *
 * Use this in 'use client' components.
 * The createBrowserClient from @supabase/ssr handles cookie-based
 * session management automatically in the browser context.
 */
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
