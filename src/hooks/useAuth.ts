/**
 * useAuth — React Query hook for the current authenticated user
 *
 * Returns the Supabase Auth user, the lean `users` base row, and
 * the `student_profiles` row for student AND lender accounts (lenders
 * are always also students, so they always have a student_profiles row).
 *
 * Uses TanStack Query so the data is cached and shared across all
 * components that call this hook — no duplicate fetches.
 */
'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { User, StudentProfile } from '@/lib/types'

export interface AuthState {
  authUser: { id: string; email?: string } | null
  profile: User | null
  /**
   * Populated for role === 'student' and role === 'lender'.
   * Null for admin / finance_officer.
   * Since every lender is also a student, they always have a student_profiles row.
   */
  studentProfile: StudentProfile | null
  isLoading: boolean
  isAuthenticated: boolean
}

async function fetchAuth(): Promise<AuthState> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      authUser: null,
      profile: null,
      studentProfile: null,
      isLoading: false,
      isAuthenticated: false,
    }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  // Fetch student_profiles for students AND lenders.
  // Admins / finance_officers have no student_profiles row.
  let studentProfile: StudentProfile | null = null
  if (profile?.role === 'student' || profile?.role === 'lender') {
    const { data: sp } = await supabase
      .from('student_profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    studentProfile = sp as StudentProfile | null
  }

  return {
    authUser: user,
    profile: profile as User | null,
    studentProfile,
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
    studentProfile: data?.studentProfile ?? null,
    isLoading,
    isAuthenticated: data?.isAuthenticated ?? false,
  }
}
