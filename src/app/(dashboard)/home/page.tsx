'use client'

/**
 * Home Page — migrated from Flutter HomeTab
 *
 * Data fetched (all parallel via Promise.all — mirrors Future.wait):
 *   - users profile  → name, studentId
 *   - wallet         → balance, savingsGoal, currentSavings, walletId
 *   - transactions   → recentActivity, monthlySavings, paymentHistory
 *   - loans          → loanStatus, activeLoan
 *   - active_loans   → aggregate total/remaining/monthly
 *   - repayment_schedule → nextPaymentDate
 *
 * Responsive layout:
 *   Mobile: single-column stacked cards
 *   Desktop (lg+): two-column grid for summary cards, full-width others
 */

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  WalletIcon,
  TrendingUpIcon,
  StarIcon,
  CalendarIcon,
  ChevronRightIcon,
  BellIcon,
  ActivityIcon,
  ArrowDownIcon,
  ArrowUpIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/types'
import { useAuth } from '@/hooks/useAuth'

// ─── Data fetcher ─────────────────────────────────────────────────────────────

interface HomeData {
  walletBalance: number
  savingsGoal: number
  savingsBalance: number
  monthlySavingsAdded: number
  totalSavingsDeposited: number
  activeLoan: Record<string, unknown> | null
  activeLoanTotal: number
  activeLoanRemaining: number
  activeLoanPaid: number
  totalMonthlyPayment: number
  activeLoanPurpose: string
  nextPaymentDate: Date | null
  recentTransactions: Array<Record<string, unknown>>
  paymentTransactions: Array<Record<string, unknown>>
  loanStatus: string
}

async function fetchHomeData(userId: string): Promise<HomeData> {
  const supabase = createClient()

  // ── Run all initial queries in parallel ───────────────────────────────────
  const [walletRes, loansRes] = await Promise.all([
    supabase.from('wallet').select('*').eq('user_id', userId).single(),
    supabase
      .from('loans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ])

  const wallet = walletRes.data
  const loans = loansRes.data ?? []
  const walletId = wallet?.id as string | undefined

  // Determine basic loan status
  let loanStatus = 'No Loans'
  let activeLoan: Record<string, unknown> | null = null
  let activeLoanPurpose = ''

  if (loans.length > 0) {
    const latest = loans[0]
    loanStatus = String(latest.status ?? 'No Loans')
    // Find most recent approved/active loan for display
    const found = loans.find((l) => {
      const s = String(l.status ?? '').toLowerCase()
      return s === 'approved' || s === 'active' || s === 'partial'
    })
    if (found) {
      activeLoan = found
      activeLoanPurpose = String(found.purpose ?? 'Loan')
    }
  }

  const loanIds = loans.map((l) => String(l.id))

  // ── Secondary queries (depend on walletId / loanIds) ─────────────────────
  const secondaryQueries = await Promise.all([
    // Recent transactions (exclude init rows)
    walletId
      ? supabase
          .from('transactions')
          .select('*')
          .eq('wallet_id', walletId)
          .order('date', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),

    // Active loans aggregate
    supabase
      .from('active_loans')
      .select('original_amount, remaining_balance, monthly_payment')
      .eq('user_id', userId),

    // Next pending repayment
    loanIds.length > 0
      ? supabase
          .from('repayment_schedule')
          .select('due_date, amount')
          .in('loan_id', loanIds)
          .eq('status', 'pending')
          .order('due_date', { ascending: true })
          .limit(1)
      : Promise.resolve({ data: [] }),
  ])

  const allTxs: Array<Record<string, unknown>> =
    (secondaryQueries[0].data ?? []) as Array<Record<string, unknown>>
  const activeRows = (secondaryQueries[1].data ?? []) as Array<Record<string, unknown>>
  const schedules = (secondaryQueries[2].data ?? []) as Array<Record<string, unknown>>

  // Filter recent transactions
  const recentTransactions = allTxs
    .filter((tx) => tx.type !== 'init')
    .slice(0, 5)

  const paymentTransactions = allTxs.filter((tx) => tx.type === 'payment')

  // Monthly savings (current month)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
  const monthlySavingsAdded = allTxs
    .filter((tx) => tx.type === 'savings' && String(tx.date) >= monthStart && String(tx.date) < monthEnd)
    .reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0)

  const totalSavingsDeposited = allTxs
    .filter((tx) => tx.type === 'savings' || tx.type === 'auto_deduction')
    .reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0)

  // Aggregate active_loans (skip placeholder rows with original_amount === 0)
  let activeLoanTotal = 0, activeLoanRemaining = 0, totalMonthlyPayment = 0
  for (const row of activeRows) {
    const orig = Number(row.original_amount ?? 0)
    if (orig === 0) continue
    activeLoanTotal += orig
    activeLoanRemaining += Number(row.remaining_balance ?? 0)
    totalMonthlyPayment += Number(row.monthly_payment ?? 0)
  }
  if (activeLoanTotal > 0 && activeLoan === null) activeLoan = {}

  const activeLoanPaid = paymentTransactions.reduce(
    (sum, tx) => sum + Number(tx.amount ?? 0),
    0
  )

  const nextPaymentDate = schedules[0]?.due_date
    ? new Date(String(schedules[0].due_date))
    : null

  return {
    walletBalance: Number(wallet?.balance ?? 0),
    savingsGoal: Number(wallet?.savings_goal ?? 0),
    savingsBalance: Number(wallet?.current_savings ?? 0),
    monthlySavingsAdded,
    totalSavingsDeposited,
    activeLoan,
    activeLoanTotal,
    activeLoanRemaining,
    activeLoanPaid,
    totalMonthlyPayment,
    activeLoanPurpose,
    nextPaymentDate,
    recentTransactions,
    paymentTransactions,
    loanStatus,
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-lg ${className ?? ''}`} />
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  const style =
    s === 'approved' || s === 'active'
      ? 'bg-green-100 text-green-700'
      : s === 'pending'
        ? 'bg-orange-100 text-orange-700'
        : s === 'rejected'
          ? 'bg-red-100 text-red-700'
          : 'bg-gray-100 text-gray-600'
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${style}`}>
      {status}
    </span>
  )
}

// ─── Home Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { profile, studentProfile, isLoading: authLoading } = useAuth()
  const userId = profile?.id

  const { data, isLoading } = useQuery({
    queryKey: ['home', userId],
    queryFn: () => fetchHomeData(userId!),
    enabled: !!userId,
  })

  const loading = authLoading || isLoading

  const savingsProgress =
    data && data.savingsGoal > 0
      ? Math.min(data.savingsBalance / data.savingsGoal, 1)
      : 0

  const loanProgress =
    data && data.activeLoanTotal > 0
      ? Math.min(data.activeLoanPaid / data.activeLoanTotal, 1)
      : 0

  // Savings star score (matches Flutter logic)
  const starScore =
    data && data.totalSavingsDeposited > 0
      ? data.totalSavingsDeposited < 5000
        ? 1
        : data.totalSavingsDeposited < 15000
          ? 2
          : data.totalSavingsDeposited < 30000
            ? 3
            : data.totalSavingsDeposited < 50000
              ? 4
              : 5
      : 0

  return (
    <div className="min-h-screen">
      {/* ── Green header ─────────────────────────────────────────────── */}
      <div className="bg-[var(--brand-green)] px-6 pt-12 pb-8 rounded-br-[60px]">
        {/* Greeting row */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-white/70 text-sm">Good day,</p>
            {loading ? (
              <Skeleton className="w-36 h-7 mt-1" />
            ) : (
              <h1 className="text-white text-2xl font-bold tracking-tight">
                {profile?.first_name ?? 'Student'} 👋
              </h1>
            )}
            {loading ? (
              <Skeleton className="w-24 h-4 mt-1" />
            ) : (
              <p className="text-white/60 text-xs mt-0.5">{studentProfile?.student_id}</p>
            )}
          </div>
          <button
            id="notifications-btn"
            className="relative flex items-center justify-center w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 transition"
          >
            <BellIcon size={20} className="text-white" />
          </button>
        </div>

        {/* Wallet balance card */}
        <div className="bg-white/15 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-1">
            <WalletIcon size={16} className="text-white/70" />
            <p className="text-white/70 text-sm">E-Wallet Balance</p>
          </div>
          {loading ? (
            <Skeleton className="w-48 h-9 mt-2" />
          ) : (
            <p className="text-white text-3xl font-bold tracking-tight">
              {formatCurrency(data?.walletBalance ?? 0)}
            </p>
          )}
          <Link
            href="/wallet"
            className="mt-3 inline-flex items-center gap-1 text-white/80 text-xs font-semibold hover:text-white"
          >
            Manage Wallet <ChevronRightIcon size={14} />
          </Link>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="px-6 py-6 space-y-6">

        {/* Active loan + Summary row */}
        <div className="lg:grid lg:grid-cols-3 lg:gap-4 space-y-4 lg:space-y-0">

          {/* Active loan card — takes 2 cols on desktop */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 text-lg">Active Loan</h2>
              <Link
                href="/loans"
                className="flex items-center gap-1 text-[var(--brand-green)] text-sm font-bold hover:underline"
              >
                Track <ChevronRightIcon size={16} />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : data?.activeLoan ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Purpose</p>
                    <p className="font-semibold text-gray-800 capitalize">
                      {data.activeLoanPurpose || 'Loan'}
                    </p>
                  </div>
                  <StatusBadge status="Active" />
                </div>

                {/* Loan amounts */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-[var(--brand-green-50)] rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">Total</p>
                    <p className="text-sm font-bold text-gray-900">
                      {formatCurrency(data.activeLoanTotal)}
                    </p>
                  </div>
                  <div className="bg-orange-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">Remaining</p>
                    <p className="text-sm font-bold text-orange-700">
                      {formatCurrency(data.activeLoanRemaining)}
                    </p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">Monthly</p>
                    <p className="text-sm font-bold text-blue-700">
                      {formatCurrency(data.totalMonthlyPayment)}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                    <span>Repayment progress</span>
                    <span>{Math.round(loanProgress * 100)}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--brand-green)] rounded-full transition-all duration-700"
                      style={{ width: `${loanProgress * 100}%` }}
                    />
                  </div>
                </div>

                {/* Next payment */}
                {data.nextPaymentDate && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <CalendarIcon size={14} className="text-[var(--brand-green)]" />
                    <span>
                      Next payment:{' '}
                      <strong>
                        {data.nextPaymentDate.toLocaleDateString('en-PH', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </strong>
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-gray-400 text-sm">No active loans</p>
                <Link
                  href="/apply"
                  className="mt-3 inline-block text-sm font-bold text-[var(--brand-green)] hover:underline"
                >
                  Apply for a loan →
                </Link>
              </div>
            )}
          </div>

          {/* Savings + Score cards — stacked in 1 col on desktop */}
          <div className="space-y-4">
            {/* Savings card */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUpIcon size={16} className="text-[var(--brand-green)]" />
                <p className="text-sm font-semibold text-gray-700">Savings</p>
              </div>
              {loading ? <Skeleton className="h-7 w-32" /> : (
                <>
                  <p className="text-xl font-bold text-gray-900">
                    {formatCurrency(data?.savingsBalance ?? 0)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Goal: {formatCurrency(data?.savingsGoal ?? 0)}
                  </p>
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--brand-green)] rounded-full"
                      style={{ width: `${savingsProgress * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    +{formatCurrency(data?.monthlySavingsAdded ?? 0)} this month
                  </p>
                </>
              )}
            </div>

            {/* Score card */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <StarIcon size={16} className="text-[var(--brand-orange)]" />
                <p className="text-sm font-semibold text-gray-700">Savings Score</p>
              </div>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <StarIcon
                    key={i}
                    size={20}
                    className={
                      i <= starScore
                        ? 'text-[var(--brand-orange)] fill-[var(--brand-orange)]'
                        : 'text-gray-200 fill-gray-200'
                    }
                  />
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {formatCurrency(data?.totalSavingsDeposited ?? 0)} deposited
              </p>
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <ActivityIcon size={16} className="text-[var(--brand-green)]" />
            <h2 className="font-bold text-gray-900">Recent Activity</h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          ) : (data?.recentTransactions ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No recent transactions</p>
          ) : (
            <ul className="space-y-3">
              {(data?.recentTransactions ?? []).map((tx, i) => {
                const type = String(tx.type ?? '')
                const isCredit = ['savings', 'deposit', 'auto_deduction'].includes(type)
                const amount = Number(tx.amount ?? 0)
                const dateStr = tx.date
                  ? new Date(String(tx.date)).toLocaleDateString('en-PH', {
                      month: 'short', day: 'numeric',
                    })
                  : ''
                return (
                  <li key={i} className="flex items-center gap-3">
                    <span
                      className={[
                        'flex items-center justify-center w-10 h-10 rounded-full shrink-0',
                        isCredit ? 'bg-green-50' : 'bg-red-50',
                      ].join(' ')}
                    >
                      {isCredit ? (
                        <ArrowDownIcon size={16} className="text-[var(--brand-green)]" />
                      ) : (
                        <ArrowUpIcon size={16} className="text-red-500" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 capitalize truncate">
                        {String(tx.description ?? type)}
                      </p>
                      <p className="text-xs text-gray-400">{dateStr}</p>
                    </div>
                    <p
                      className={[
                        'text-sm font-bold shrink-0',
                        isCredit ? 'text-[var(--brand-green)]' : 'text-red-500',
                      ].join(' ')}
                    >
                      {isCredit ? '+' : '-'}{formatCurrency(amount)}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
