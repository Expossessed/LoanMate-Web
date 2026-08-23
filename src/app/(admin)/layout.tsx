/**
 * Admin layout — Server Component
 *
 * Wraps all admin pages (/admin/loans, /admin/deposits, /admin/users).
 * Server-side checks that the user has admin or finance_officer role;
 * redirects to /home if they don't.
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/nav/Sidebar'
import { Toaster } from 'sonner'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()

  const role = profile?.role ?? 'student'
  if (role !== 'admin' && role !== 'finance_officer') redirect('/home')

  return (
    <div className="min-h-screen bg-[var(--brand-cream)]">
      <Sidebar role={role as 'admin' | 'finance_officer'} />
      <main className="md:ml-64 min-h-screen pb-10">{children}</main>
      <Toaster richColors position="top-center" />
    </div>
  )
}
