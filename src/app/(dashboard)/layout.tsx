/**
 * Dashboard layout — Server Component
 *
 * Wraps all student/lender pages (home, loans, wallet, apply, profile).
 * Fetches the user's role server-side and passes it to the client-side
 * nav components.
 *
 * Layout structure:
 * ┌──────────────────────────────────────┐
 * │  Sidebar (hidden on mobile)          │
 * │  ┌────────────────────────────────┐  │
 * │  │  Page content (main)           │  │
 * │  └────────────────────────────────┘  │
 * │  BottomNav (mobile only)             │
 * └──────────────────────────────────────┘
 *
 * On mobile: full-width content + fixed bottom tab bar
 * On md+:    fixed left sidebar (w-64) + content with ml-64 offset
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/nav/Sidebar'
import { BottomNav } from '@/components/nav/BottomNav'
import { Toaster } from 'sonner'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware already guards this, but double-check for safety
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, is_lender')
    .eq('id', user.id)
    .single()

  const role = (profile?.role ?? 'student') as 'student' | 'lender' | 'admin' | 'finance_officer'
  const isLender = profile?.is_lender ?? false

  return (
    <div className="min-h-screen bg-[var(--brand-cream)]">
      {/* Desktop sidebar */}
      <Sidebar role={role} isLender={isLender} />

      {/* Page content — offset left on desktop to clear sidebar */}
      <main className="md:ml-64 pb-24 md:pb-0 min-h-screen">
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <BottomNav />

      <Toaster richColors position="top-center" />
    </div>
  )
}
