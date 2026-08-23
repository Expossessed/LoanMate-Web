'use client'

/**
 * Loans (Track) Page — migrated from Flutter LoanTab
 *
 * Sections (mirrors Flutter exactly):
 *  1. Green header card — total original / total remaining
 *  2. AI Evaluation badge — raw loans.ai_evaluation value
 *  3. Next Payment card — first pending repayment_schedule row
 *  4. Active Loans — from active_loans table (original_amount > 0)
 *  5. Pending Loans — loans with status = 'pending' not in active_loans
 *  6. Loan History — approved/rejected/paid, capped at 5
 *  7. Recent Activity — loan events + payment transactions, newest-first, max 8
 *
 * Responsive:
 *   Mobile:  single column, full-width cards
 *   Desktop: two-column grid for sections 4–7, full-width header/AI/next-payment
 */

import { useQuery } from '@tanstack/react-query'
import {
  TrendingUpIcon,
  CalendarIcon,
  SparklesIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  ActivityIcon,
  AlertCircleIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, getStatusColor } from '@/lib/types'
import { useAuth } from '@/hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LoanRow {
  purpose: string
  amount: string
  amount_raw: number
  remaining_raw: number
  monthly_payment: string
  start_date: string
  date: string
  status: string
  next_due: string
}

interface HistoryRow {
  title: string
  amount: string
  date: string
  status: string
}

interface ActivityRow {
  text: string
  date: string
  icon: string
  sort_key: string
}

interface LoansData {
  activeLoans: LoanRow[]
  pendingLoans: HistoryRow[]
  loanHistory: HistoryRow[]
  recentActivity: ActivityRow[]
  totalOriginalAmount: number
  totalRemainingBalance: number
  nextDueDate: string
  nextDueAmount: string
  aiResult: string
}

// ─── Data fetcher (mirrors _loadData exactly) ─────────────────────────────────

async function fetchLoansData(userId: string): Promise<LoansData> {
  const supabase = createClient()

  const fmt = (n: number) => formatCurrency(n)
  const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s

  // 1. All loans
  const loans = ((await supabase
    .from('loans')
    .select('id, amount, purpose, status, ai_evaluation, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })).data) ?? []

  const loanIds = loans.map((l) => String(l.id))
  const loanById: Record<string, Record<string, unknown>> = {}
  for (const l of loans) loanById[String(l.id)] = l

  // 2. Active loans
  const activeRows = ((await supabase
    .from('active_loans')
    .select('id, loan_id, original_amount, remaining_balance, monthly_payment, start_date')
    .eq('user_id', userId)
    .order('start_date', { ascending: false })).data ?? [])
    .filter((r) => Number(r.original_amount ?? 0) > 0)

  const activeLoanIds = new Set<string>()
  const activeLoans: LoanRow[] = []
  const loanHistory: HistoryRow[] = []
  let totalOriginalAmount = 0
  let totalRemainingBalance = 0

  for (const row of activeRows) {
    const loanId = String(row.loan_id ?? '')
    const loanRow = loanById[loanId]
    const original = Number(row.original_amount ?? 0)
    const remaining = Number(row.remaining_balance ?? original)
    const monthly = Number(row.monthly_payment ?? 0)

    totalOriginalAmount += original
    totalRemainingBalance += remaining
    activeLoanIds.add(loanId)

    const startDate = row.start_date
      ? new Date(String(row.start_date)).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
      : ''
    const appliedDate = loanRow?.created_at
      ? new Date(String(loanRow.created_at)).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
      : ''

    if (remaining <= 0) {
      loanHistory.push({ title: String(loanRow?.purpose ?? 'Loan'), amount: fmt(original), date: appliedDate, status: 'Paid' })
    } else {
      activeLoans.push({
        purpose: String(loanRow?.purpose ?? 'Loan'),
        amount: fmt(original),
        amount_raw: original,
        remaining_raw: remaining,
        monthly_payment: fmt(monthly),
        start_date: startDate,
        date: appliedDate,
        status: 'Active',
        next_due: '',
      })
    }
  }

  // 3. Next repayment schedule
  let nextDueDate = '', nextDueAmount = ''
  if (loanIds.length > 0) {
    const schedules = ((await supabase
      .from('repayment_schedule')
      .select('loan_id, due_date, amount, status')
      .in('loan_id', loanIds)
      .eq('status', 'pending')
      .order('due_date', { ascending: true })
      .limit(1)).data) ?? []

    if (schedules[0]) {
      nextDueDate = new Date(String(schedules[0].due_date)).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
      nextDueAmount = fmt(Number(schedules[0].amount ?? 0))
      for (let i = 0; i < activeLoans.length; i++) {
        activeLoans[i] = { ...activeLoans[i], next_due: nextDueDate }
      }
    }
  }

  // 4. Pending / history
  const pendingLoans: HistoryRow[] = []
  for (const loan of loans) {
    const status = String(loan.status ?? '').toLowerCase()
    const loanId = String(loan.id ?? '')
    const purpose = String(loan.purpose ?? '')
    if (purpose.toLowerCase() === 'placeholder') continue
    if (activeLoanIds.has(loanId)) continue

    const dateStr = loan.created_at
      ? new Date(String(loan.created_at)).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
      : ''
    const row: HistoryRow = { title: purpose, amount: fmt(Number(loan.amount ?? 0)), date: dateStr, status: cap(status) }

    if (status === 'pending') pendingLoans.push(row)
    else loanHistory.push(row)
  }
  const historyTrimmed = loanHistory.slice(0, 5)

  // 5. Recent activity
  const activityIconMap: Record<string, string> = {
    approved: 'check', paid: 'payment', pending: 'send',
    rejected: 'cancel', denied: 'cancel', overdue: 'warning',
    partial: 'payment', active: 'check',
  }
  const recentActivity: ActivityRow[] = []
  for (const loan of loans.slice(0, 5)) {
    const purpose = String(loan.purpose ?? '')
    if (purpose.toLowerCase() === 'placeholder') continue
    const status = String(loan.status ?? 'unknown')
    const dateRaw = String(loan.created_at ?? '')
    recentActivity.push({
      text: `Loan ${cap(status)}`,
      date: dateRaw ? new Date(dateRaw).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) : '',
      icon: activityIconMap[status.toLowerCase()] ?? 'info',
      sort_key: dateRaw,
    })
  }

  // Payment transactions
  const walletRow = (await supabase.from('wallet').select('id').eq('user_id', userId).maybeSingle()).data
  if (walletRow?.id) {
    const txRows = ((await supabase
      .from('transactions')
      .select('type, amount, date, description')
      .eq('wallet_id', walletRow.id)
      .in('type', ['payment', 'auto_deduction'])
      .order('date', { ascending: false })
      .limit(5)).data) ?? []
    for (const tx of txRows) {
      const amt = Number(tx.amount ?? 0)
      const type = String(tx.type ?? 'payment')
      const dateRaw = String(tx.date ?? '')
      recentActivity.push({
        text: type === 'auto_deduction' ? `Auto-Deduction ${fmt(amt)}` : `Loan Payment ${fmt(amt)}`,
        date: dateRaw ? new Date(dateRaw).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
        icon: 'payment',
        sort_key: dateRaw,
      })
    }
  }
  recentActivity.sort((a, b) => b.sort_key.localeCompare(a.sort_key))

  // 6. AI evaluation
  const rawAi = loans[0] ? String(loans[0].ai_evaluation ?? 'N/A') : 'N/A'
  const aiResult = cap(rawAi.replace('_', ' '))

  return {
    activeLoans,
    pendingLoans,
    loanHistory: historyTrimmed,
    recentActivity: recentActivity.slice(0, 8),
    totalOriginalAmount,
    totalRemainingBalance,
    nextDueDate,
    nextDueAmount,
    aiResult,
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-bold text-gray-800 mb-3">{children}</h2>
}

function ActivityItemIcon({ icon }: { icon: string }) {
  const map: Record<string, React.ReactNode> = {
    check: <CheckCircleIcon size={16} className="text-[var(--brand-green)]" />,
    payment: <TrendingUpIcon size={16} className="text-blue-500" />,
    send: <ClockIcon size={16} className="text-orange-500" />,
    cancel: <XCircleIcon size={16} className="text-red-500" />,
    warning: <AlertCircleIcon size={16} className="text-red-600" />,
  }
  return (
    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100">
      {map[icon] ?? <ActivityIcon size={16} className="text-gray-500" />}
    </span>
  )
}

// ─── Loans Page ───────────────────────────────────────────────────────────────

export default function LoansPage() {
  const { profile } = useAuth()
  const userId = profile?.id

  const { data, isLoading } = useQuery({
    queryKey: ['loans', userId],
    queryFn: () => fetchLoansData(userId!),
    enabled: !!userId,
  })

  const totalPaid = (data?.totalOriginalAmount ?? 0) - (data?.totalRemainingBalance ?? 0)
  const progress = data?.totalOriginalAmount
    ? Math.min(totalPaid / data.totalOriginalAmount, 1)
    : 0

  return (
    <div className="min-h-screen">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="bg-[var(--brand-green)] px-6 pt-12 pb-8 rounded-br-[60px]">
        <h1 className="text-white text-2xl font-bold mb-6">Track Loans</h1>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/15 rounded-2xl p-4">
            <p className="text-white/70 text-xs mb-1">Total Loan</p>
            {isLoading ? (
              <Skeleton className="h-7 w-28 bg-white/30" />
            ) : (
              <p className="text-white text-xl font-bold">
                {formatCurrency(data?.totalOriginalAmount ?? 0)}
              </p>
            )}
          </div>
          <div className="bg-white/15 rounded-2xl p-4">
            <p className="text-white/70 text-xs mb-1">Remaining</p>
            {isLoading ? (
              <Skeleton className="h-7 w-28 bg-white/30" />
            ) : (
              <p className="text-white text-xl font-bold">
                {formatCurrency(data?.totalRemainingBalance ?? 0)}
              </p>
            )}
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-white/70 text-xs mb-1.5">
            <span>Overall repayment</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-700"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="px-6 py-6 space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0 lg:items-start">

        {/* AI Evaluation */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <SparklesIcon size={16} className="text-blue-500" />
            <h2 className="font-bold text-gray-800">AI Evaluation</h2>
          </div>
          {isLoading ? (
            <Skeleton className="h-8 w-40" />
          ) : (
            <div className="flex items-center gap-3">
              <span className={`px-4 py-1.5 rounded-full text-sm font-bold border ${getStatusColor(data?.aiResult ?? '')}`}>
                {data?.aiResult ?? 'N/A'}
              </span>
              <p className="text-xs text-gray-400">
                Based on your latest loan application
              </p>
            </div>
          )}
        </div>

        {/* Next Payment */}
        {(isLoading || data?.nextDueDate) && (
          <div className="lg:col-span-2 bg-orange-50 border border-orange-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <CalendarIcon size={16} className="text-orange-600" />
              <h2 className="font-bold text-orange-800 text-sm">Next Payment Due</h2>
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-48" />
            ) : (
              <div className="flex items-end gap-3 mt-1">
                <p className="text-2xl font-bold text-orange-700">{data?.nextDueAmount}</p>
                <p className="text-sm text-orange-600 mb-0.5">due {data?.nextDueDate}</p>
              </div>
            )}
          </div>
        )}

        {/* Active Loans */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <SectionTitle>Active Loans</SectionTitle>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : (data?.activeLoans ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">No active loans</p>
          ) : (
            <ul className="space-y-4">
              {(data?.activeLoans ?? []).map((loan, i) => {
                const pct = loan.amount_raw > 0
                  ? Math.round(((loan.amount_raw - loan.remaining_raw) / loan.amount_raw) * 100)
                  : 0
                return (
                  <li key={i} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-2">
                      <p className="font-semibold text-gray-800 text-sm capitalize">{loan.purpose}</p>
                      <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div>
                        <p className="text-xs text-gray-400">Original</p>
                        <p className="text-sm font-bold text-gray-800">{loan.amount}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Remaining</p>
                        <p className="text-sm font-bold text-orange-600">{formatCurrency(loan.remaining_raw)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Monthly</p>
                        <p className="text-sm font-bold text-blue-600">{loan.monthly_payment}</p>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--brand-green)] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{pct}% repaid</p>
                    {loan.next_due && (
                      <p className="text-xs text-orange-600 mt-1 font-medium">
                        Next due: {loan.next_due}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Pending Loans */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <SectionTitle>Pending Applications</SectionTitle>
          {isLoading ? (
            <Skeleton className="h-16" />
          ) : (data?.pendingLoans ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">No pending applications</p>
          ) : (
            <ul className="space-y-3">
              {(data?.pendingLoans ?? []).map((loan, i) => (
                <li key={i} className="flex items-center gap-3 p-3 border border-orange-100 rounded-xl bg-orange-50">
                  <ClockIcon size={18} className="text-orange-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 capitalize truncate">{loan.title}</p>
                    <p className="text-xs text-gray-400">{loan.date}</p>
                  </div>
                  <p className="text-sm font-bold text-gray-800 shrink-0">{loan.amount}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Loan History */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <SectionTitle>Loan History</SectionTitle>
          {isLoading ? (
            <Skeleton className="h-32" />
          ) : (data?.loanHistory ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">No loan history yet</p>
          ) : (
            <ul className="space-y-3">
              {(data?.loanHistory ?? []).map((loan, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className={`flex items-center justify-center w-9 h-9 rounded-full shrink-0 ${getStatusColor(loan.status)}`}>
                    {loan.status.toLowerCase() === 'paid' ? (
                      <CheckCircleIcon size={16} />
                    ) : loan.status.toLowerCase() === 'rejected' ? (
                      <XCircleIcon size={16} />
                    ) : (
                      <ClockIcon size={16} />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 capitalize truncate">{loan.title}</p>
                    <p className="text-xs text-gray-400">{loan.date}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-800">{loan.amount}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${getStatusColor(loan.status)}`}>
                      {loan.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <SectionTitle>Recent Activity</SectionTitle>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : (data?.recentActivity ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">No recent activity</p>
          ) : (
            <ul className="space-y-3">
              {(data?.recentActivity ?? []).map((act, i) => (
                <li key={i} className="flex items-center gap-3">
                  <ActivityItemIcon icon={act.icon} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{act.text}</p>
                    <p className="text-xs text-gray-400">{act.date}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
