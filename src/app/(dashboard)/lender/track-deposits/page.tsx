'use client'

/**
 * Track Deposits — /lender/track-deposits
 *
 * Lender's dashboard for viewing all their lender_deposits and
 * lender_withdrawals. Shows summary stats and a per-deposit card
 * for each status group (active, pending, matured, past).
 */

import { useQuery } from '@tanstack/react-query'
import {
  TrendingUpIcon,
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  XCircleIcon,
  ArrowDownCircleIcon,
  BarChart2Icon,
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, getStatusColor } from '@/lib/types'
import type { LenderProfile, LenderDeposit, LenderWithdrawal } from '@/lib/types'
import { useAuth } from '@/hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrackData {
  profile: LenderProfile | null
  deposits: LenderDeposit[]
  withdrawals: LenderWithdrawal[]
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchTrackData(userId: string): Promise<TrackData> {
  const supabase = createClient()

  const [profileRes, depositsRes, withdrawalsRes] = await Promise.all([
    supabase.from('lender_profiles').select('*').eq('id', userId).single(),
    supabase
      .from('lender_deposits')
      .select('*')
      .eq('lender_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('lender_withdrawals')
      .select('*')
      .eq('lender_id', userId)
      .order('requested_at', { ascending: false }),
  ])

  return {
    profile: profileRes.data as LenderProfile | null,
    deposits: (depositsRes.data ?? []) as LenderDeposit[],
    withdrawals: (withdrawalsRes.data ?? []) as LenderWithdrawal[],
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-bold ${getStatusColor(status)}`}>
      {label}
    </span>
  )
}

function DepositCard({ deposit }: { deposit: LenderDeposit }) {
  const rateLabel = `${(deposit.return_rate * 100).toFixed(0)}% fixed`

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-gray-400 font-semibold tracking-widest uppercase">Principal</p>
          <p className="text-2xl font-extrabold text-gray-900">
            {formatCurrency(deposit.principal)}
          </p>
        </div>
        <StatusBadge status={deposit.status} />
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-gray-400">Return rate</p>
          <p className="text-sm font-bold text-[var(--brand-green)]">{rateLabel}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Term</p>
          <p className="text-sm font-bold text-gray-800">{deposit.term_months} months</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Expected return</p>
          <p className="text-sm font-bold text-[var(--brand-green)]">
            +{formatCurrency(deposit.expected_return)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">You receive</p>
          <p className="text-sm font-bold text-gray-900">
            {formatCurrency(deposit.maturity_amount)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <CalendarIcon size={11} /> Maturity date
          </p>
          <p className="text-sm font-semibold text-gray-800">{fmtDate(deposit.maturity_date)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Deposited</p>
          <p className="text-sm font-semibold text-gray-500">{fmtDate(deposit.deposited_at)}</p>
        </div>
      </div>

      {/* Notes */}
      {deposit.notes && (
        <p className="text-xs text-gray-500 italic border-t border-gray-100 pt-3">
          Note: {deposit.notes}
        </p>
      )}

      {/* Withdraw CTA for active/matured deposits */}
      {(deposit.status === 'active' || deposit.status === 'matured') && (
        <Link
          href={`/lender/withdraw?deposit=${deposit.id}`}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-[var(--brand-green)] text-[var(--brand-green)] font-bold text-sm hover:bg-[var(--brand-green-50)] transition"
        >
          <ArrowDownCircleIcon size={16} />
          {deposit.status === 'matured' ? 'Claim Matured Deposit' : 'Request Early Withdrawal'}
        </Link>
      )}
    </div>
  )
}

function WithdrawalRow({ w }: { w: LenderWithdrawal }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-100 last:border-0">
      <span className={`flex items-center justify-center w-9 h-9 rounded-full shrink-0 ${getStatusColor(w.status)}`}>
        {w.status === 'completed' ? <CheckCircleIcon size={16} />
          : w.status === 'rejected' ? <XCircleIcon size={16} />
          : w.status === 'approved' ? <TrendingUpIcon size={16} />
          : <ClockIcon size={16} />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">
          Withdrawal — {formatCurrency(w.net_payout)} net
        </p>
        <p className="text-xs text-gray-400">Requested {fmtDate(w.requested_at)}</p>
        {w.rejection_note && (
          <p className="text-xs text-red-500 mt-0.5">Reason: {w.rejection_note}</p>
        )}
      </div>
      <div className="text-right shrink-0">
        <StatusBadge status={w.status} />
        {w.penalty_amount > 0 && (
          <p className="text-xs text-red-500 mt-1">
            Penalty: {formatCurrency(w.penalty_amount)}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrackDepositsPage() {
  const { profile } = useAuth()
  const userId = profile?.id

  const { data, isLoading } = useQuery({
    queryKey: ['lender-deposits', userId],
    queryFn: () => fetchTrackData(userId!),
    enabled: !!userId,
  })

  const lp = data?.profile
  const deposits = data?.deposits ?? []
  const withdrawals = data?.withdrawals ?? []

  const active   = deposits.filter((d) => d.status === 'active')
  const pending  = deposits.filter((d) => d.status === 'pending')
  const matured  = deposits.filter((d) => d.status === 'matured')
  const past     = deposits.filter((d) => ['paid_out', 'withdrawn_early'].includes(d.status))

  function Stat({ label, value }: { label: string; value: string }) {
    return (
      <div className="bg-white/15 rounded-2xl p-4">
        <p className="text-white/70 text-xs mb-1">{label}</p>
        {isLoading ? (
          <div className="h-6 w-20 bg-white/30 rounded animate-pulse" />
        ) : (
          <p className="text-white text-lg font-bold">{value}</p>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-[var(--brand-green)] px-6 pt-12 pb-8">
        <p className="text-white/70 text-xs font-semibold tracking-widest uppercase mb-1">
          Lender Portal
        </p>
        <h1 className="text-white text-3xl font-bold mb-6">Track Funded Loans</h1>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Total Deposited" value={formatCurrency(lp?.total_deposited ?? 0)} />
          <Stat label="Total Contributed" value={formatCurrency(lp?.total_contributed ?? 0)} />
          <Stat label="Total Paid Out" value={formatCurrency(lp?.total_paid_out ?? 0)} />
          <Stat label="Active Deposits" value={String(active.length)} />
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-6 max-w-3xl mx-auto space-y-8">



        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-white rounded-2xl h-40" />
            ))}
          </div>
        ) : deposits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-[var(--brand-green-50)] flex items-center justify-center mb-5">
              <AlertCircleIcon size={36} className="text-[var(--brand-green)]" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">No funded loans yet</h2>
            <p className="text-sm text-gray-400 mb-6">
              Start funding approved loans to earn a fixed return.
            </p>
            <Link
              href="/lender/fund-loan"
              className="px-6 py-3 rounded-2xl bg-[var(--brand-green)] text-white font-bold hover:bg-[var(--brand-green-dark)] transition"
            >
              Fund a Loan
            </Link>
          </div>
        ) : (
          <>
            {/* Matured — action needed */}
            {matured.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircleIcon size={18} className="text-blue-600" />
                  <h2 className="text-base font-bold text-gray-800">
                    Matured — Ready to Claim
                    <span className="ml-2 text-sm font-semibold text-blue-600">({matured.length})</span>
                  </h2>
                </div>
                <div className="space-y-4">
                  {matured.map((d) => <DepositCard key={d.id} deposit={d} />)}
                </div>
              </section>
            )}

            {/* Active */}
            {active.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUpIcon size={18} className="text-[var(--brand-green)]" />
                  <h2 className="text-base font-bold text-gray-800">
                    Active
                    <span className="ml-2 text-sm font-semibold text-[var(--brand-green)]">({active.length})</span>
                  </h2>
                </div>
                <div className="space-y-4">
                  {active.map((d) => <DepositCard key={d.id} deposit={d} />)}
                </div>
              </section>
            )}

            {/* Pending admin review */}
            {pending.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <ClockIcon size={18} className="text-orange-500" />
                  <h2 className="text-base font-bold text-gray-800">
                    Pending Review
                    <span className="ml-2 text-sm font-semibold text-orange-500">({pending.length})</span>
                  </h2>
                </div>
                <div className="space-y-4">
                  {pending.map((d) => <DepositCard key={d.id} deposit={d} />)}
                </div>
              </section>
            )}

            {/* Past */}
            {past.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircleIcon size={18} className="text-gray-400" />
                  <h2 className="text-base font-bold text-gray-800">
                    Past Deposits
                    <span className="ml-2 text-sm font-semibold text-gray-400">({past.length})</span>
                  </h2>
                </div>
                <div className="space-y-4">
                  {past.map((d) => <DepositCard key={d.id} deposit={d} />)}
                </div>
              </section>
            )}
          </>
        )}

        {/* Withdrawal history */}
        {withdrawals.length > 0 && (
          <section>
            <h2 className="text-base font-bold text-gray-800 mb-4">Withdrawal Requests</h2>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-2">
              {withdrawals.map((w) => <WithdrawalRow key={w.id} w={w} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
