/**
 * useAuth — React Query hook for the current authenticated user
 *
 * Returns the Supabase Auth user + the `users` table profile row
 * (which has role, first_name, is_lender, etc.).
 *
 * Uses TanStack Query so the data is cached and shared across all
 * components that call this hook — no duplicate fetches.
 */
'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/lib/types'

export interface AuthState {
  authUser: { id: string; email?: string } | null
  profile: User | null
  isLoading: boolean
  isAuthenticated: boolean
}

async function fetchAuth(): Promise<AuthState> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { authUser: null, profile: null, isLoading: false, isAuthenticated: false }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  return {
    authUser: user,
    profile: profile as User | null,
    isLoading: false,
    isAuthenticated: true,
  }
}

export function useAuth() {
  const { data, isLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: fetchAuth,
    staleTime: 60_000, // Re-check auth every minute
  })

  return {
    authUser: data?.authUser ?? null,
    profile: data?.profile ?? null,
    isLoading,
    isAuthenticated: data?.isAuthenticated ?? false,
  }
}
