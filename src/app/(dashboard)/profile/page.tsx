'use client'


import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  PencilLineIcon,
  LockKeyholeIcon,
  SettingsIcon,
  HandshakeIcon,
  LogOutIcon,
  ChevronRightIcon,
  UserIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'



async function fetchPendingPledges(userId: string): Promise<number> {
  const supabase = createClient()
  const { data } = await supabase
    .from('loan_pledges')
    .select('id')
    .eq('pledger_id', userId)
    .eq('borrower_self', false)
    .eq('status', 'pending')
  return data?.length ?? 0
}


function SettingsTile({
  id,
  Icon,
  label,
  badge,
  hasBadge,
  onClick,
  href,
}: {
  id: string
  Icon: React.ElementType
  label: string
  badge?: number
  hasBadge?: boolean
  onClick?: () => void
  href?: string
}) {
  const inner = (
    <div
      className={[
        'flex items-center gap-4 px-5 py-4 rounded-2xl border bg-white transition',
        hasBadge && badge && badge > 0
          ? 'border-orange-200 shadow-[0_4px_12px_rgba(251,146,60,0.08)]'
          : 'border-gray-100 hover:border-gray-200',
      ].join(' ')}
    >
      <span
        className={[
          'flex items-center justify-center w-10 h-10 rounded-xl',
          hasBadge && badge && badge > 0
            ? 'bg-[var(--brand-green-100)]'
            : 'bg-gray-100',
        ].join(' ')}
      >
        <Icon
          size={20}
          className={
            hasBadge && badge && badge > 0
              ? 'text-[var(--brand-green)]'
              : 'text-gray-600'
          }
        />
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        {hasBadge && badge && badge > 0 && (
          <p className="text-xs font-semibold text-orange-600 mt-0.5">
            {badge} invite{badge > 1 ? 's' : ''} waiting
          </p>
        )}
      </div>

      {hasBadge && badge && badge > 0 ? (
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-orange-100 text-orange-700 text-xs font-bold">
          {badge}
        </span>
      ) : (
        <ChevronRightIcon size={18} className="text-gray-300" />
      )}
    </div>
  )

  if (href) return <Link id={id} href={href}>{inner}</Link>
  return (
    <button id={id} type="button" onClick={onClick} className="w-full text-left">
      {inner}
    </button>
  )
}


export default function ProfilePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { profile, studentProfile, isLoading: authLoading } = useAuth()
  const userId = profile?.id
  const isLender = profile?.is_lender ?? false

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['pending-pledges', userId],
    queryFn: () => fetchPendingPledges(userId!),
    enabled: !!userId,
  })

  const fullName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim()
    : ''
  const initial = fullName?.[0]?.toUpperCase() ?? '?'

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    queryClient.clear()
    router.replace('/login')
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse space-y-4 w-full max-w-lg px-6">
          <div className="h-8 bg-gray-200 rounded-lg w-32" />
          <div className="h-24 bg-gray-200 rounded-2xl" />
          <div className="h-14 bg-gray-200 rounded-2xl" />
          <div className="h-14 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 pt-12 pb-10 max-w-lg mx-auto lg:pt-16">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Profile</h1>

      {/* Profile header card */}
      <div className="flex items-center gap-5 p-6 bg-white rounded-2xl shadow-sm mb-8">
        {/* Avatar */}
        <div className="flex items-center justify-center w-[72px] h-[72px] rounded-full bg-[var(--brand-green-100)] shrink-0">
          {profile ? (
            <span className="text-3xl font-extrabold text-[var(--brand-green)]">
              {initial}
            </span>
          ) : (
            <UserIcon size={32} className="text-[var(--brand-green)]" />
          )}
        </div>

        {/* Details */}
        <div className="min-w-0">
          <p className="text-xl font-bold text-gray-900 uppercase tracking-tight truncate">
            {fullName || 'Loading…'}
          </p>
          <p className="text-sm font-mono text-gray-500 mt-0.5">
            Student ID: {studentProfile?.student_id ?? '—'}
          </p>
          {studentProfile?.course && (
            <p className="text-sm text-gray-400 mt-0.5">
              {studentProfile.course.toUpperCase()} — Year {studentProfile.year_level}
            </p>
          )}
        </div>
      </div>

      {/* Settings tiles */}
      <div className="space-y-3 mb-12">
        <SettingsTile
          id="edit-personal-details-btn"
          Icon={PencilLineIcon}
          label="Edit Personal Details"
          href="/settings"
        />
        <SettingsTile
          id="change-password-btn"
          Icon={LockKeyholeIcon}
          label="Change Password"
          href="/settings"
        />
        <SettingsTile
          id="account-settings-btn"
          Icon={SettingsIcon}
          label="Account Settings"
          href="/settings"
        />
        {/* pledge inbox, shows badge when there are pending invites */}
        <SettingsTile
          id="pledge-inbox-btn"
          Icon={HandshakeIcon}
          label="Pledge Inbox"
          badge={pendingCount}
          hasBadge
          href="/pledge-inbox"
        />

        {/* lender tiles - mobile only, desktop uses the sidebar */}
        {isLender && (
          <>
            <div className="pt-2 pb-1">
              <p className="text-xs font-bold tracking-widest text-gray-400 uppercase">
                Lender
              </p>
            </div>
            <SettingsTile
              id="track-deposits-btn"
              Icon={SettingsIcon}
              label="Track Deposits"
              href="/lender/track-deposits"
            />
            <SettingsTile
              id="withdraw-btn"
              Icon={LockKeyholeIcon}
              label="Request Withdrawal"
              href="/lender/withdraw"
            />
            <SettingsTile
              id="fund-loan-btn"
              Icon={PencilLineIcon}
              label="Fund a Loan"
              href="/lender/fund-loan"
            />
          </>
        )}
      </div>

      {/* sign out */}
      <button
        id="profile-signout-btn"
        type="button"
        onClick={handleSignOut}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-red-50 text-red-600 font-bold text-base hover:bg-red-100 transition-all active:scale-[0.98]"
      >
        <LogOutIcon size={20} />
        Sign out
      </button>
    </div>
  )
}
