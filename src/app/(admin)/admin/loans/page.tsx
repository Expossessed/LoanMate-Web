'use client'

/**
 * Admin Loans Review Page — migrated from Flutter AdminLoanReviewTab
 *
 * Key business rules (preserved exactly):
 * 1. Fetch pending loans from `loans` table
 * 2. Fetch applicant profiles via `admin_get_users_by_ids` RPC (SECURITY DEFINER)
 * 3. Approve → computes 3% p.a. interest over 6 months → inserts active_loans row
 *    → guards against active loan total > ₱10,000
 * 4. Deny → updates status = 'denied' → calls release_loan_pledges RPC
 */

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  RefreshCwIcon, CheckIcon, XIcon,
  SparklesIcon, CheckCircleIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, getStatusColor } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingLoan {
  id: string
  user_id: string
  amount: number
  purpose: string
  status: string
  ai_evaluation: string
  created_at: string
  /**
   * User fields returned directly by the `admin_get_pending_loans` RPC.
   * `student_id`, `course`, and `year_level` are joined from `student_profiles`
   * inside that SECURITY DEFINER function.
   */
  _user: {
    first_name?: string
    last_name?: string
    /** From student_profiles.student_id */
    student_id?: string
    /** From student_profiles.course */
    course?: string
    /** From student_profiles.year_level */
    year_level?: string | number
  }
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchPendingLoans(): Promise<PendingLoan[]> {
  const supabase = createClient()

  // Single SECURITY DEFINER RPC — joins loans + users + student_profiles
  // and bypasses any RLS that might reference dropped users columns.
  const { data, error } = await supabase.rpc('admin_get_pending_loans')

  if (error) {
    console.error('[fetchPendingLoans] RPC error:', error)
    return []
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ''),
    user_id: String(row.user_id ?? ''),
    amount: Number(row.amount ?? 0),
    purpose: String(row.purpose ?? ''),
    status: String(row.status ?? 'pending'),
    ai_evaluation: String(row.ai_evaluation ?? 'pending'),
    created_at: String(row.created_at ?? ''),
    _user: {
      first_name: row.first_name != null ? String(row.first_name) : undefined,
      last_name: row.last_name != null ? String(row.last_name) : undefined,
      student_id: row.student_id != null ? String(row.student_id) : undefined,
      course: row.course != null ? String(row.course) : undefined,
      year_level: row.year_level != null ? row.year_level : undefined,
    },
  }))
}

// ─── Approve / Deny mutations ─────────────────────────────────────────────────

const INTEREST_RATE = 0.03
const TERM_MONTHS = 6
const MAX_ACTIVE_TOTAL = 10000

async function approveLoan(loan: PendingLoan) {
  const supabase = createClient()
  const { id: loanId, user_id: userId, amount } = loan

  const totalInterest = amount * INTEREST_RATE * (TERM_MONTHS / 12)
  const totalRepayment = amount + totalInterest
  const monthlyPayment = totalRepayment / TERM_MONTHS

  // Guard: check existing active loan balance
  const { data: activeRows = [] } = await supabase
    .from('active_loans')
    .select('remaining_balance')
    .eq('user_id', userId)

  const currentTotal = activeRows.reduce((s, r) => s + Number(r.remaining_balance ?? 0), 0)
  if (currentTotal + totalRepayment > MAX_ACTIVE_TOTAL) {
    throw new Error(
      `Cannot approve: total active balance would exceed ₱10,000 ` +
      `(current ${formatCurrency(currentTotal)} + new ${formatCurrency(totalRepayment)}).`
    )
  }

  const now = new Date().toISOString()
  await supabase.from('loans').update({ status: 'approved', approved_at: now }).eq('id', loanId)
  await supabase.from('active_loans').insert({
    loan_id: loanId,
    user_id: userId,
    original_amount: amount,
    remaining_balance: totalRepayment,
    monthly_payment: monthlyPayment,
    start_date: now.substring(0, 10),
  })
}

async function denyLoan(loanId: string) {
  const supabase = createClient()
  await supabase.from('loans').update({ status: 'denied' }).eq('id', loanId)
  await supabase.rpc('release_loan_pledges', { p_loan_id: loanId }).catch(() => {})
}

// ─── AI badge colour ──────────────────────────────────────────────────────────

function aiBadgeClass(aiEval: string) {
  const v = aiEval.toLowerCase()
  if (v === 'eligible' || v === 'approve') return 'bg-green-50 text-green-700 border-green-200'
  if (v === 'ineligible' || v === 'reject') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-orange-50 text-orange-700 border-orange-200'
}

// ─── Confirm Deny Dialog ──────────────────────────────────────────────────────

function ConfirmDenyDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <h3 className="font-bold text-gray-900 text-lg mb-2">Deny this loan request?</h3>
        <p className="text-sm text-gray-500 mb-6">
          This will mark the loan as denied and release any pledged collateral back to co-signers.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700">
            Deny
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminLoansPage() {
  const qc = useQueryClient()
  const [processing, setProcessing] = useState<Set<string>>(new Set())
  const [denyTarget, setDenyTarget] = useState<string | null>(null)

  const { data: loans = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-pending-loans'],
    queryFn: fetchPendingLoans,
  })

  const handleApprove = async (loan: PendingLoan) => {
    setProcessing((p) => new Set(p).add(loan.id))
    try {
      await approveLoan(loan)
      toast.success('Loan approved and added to active loans.')
      qc.invalidateQueries({ queryKey: ['admin-pending-loans'] })
    } catch (e: unknown) {
      toast.error((e as Error).message)
    } finally {
      setProcessing((p) => { const s = new Set(p); s.delete(loan.id); return s })
    }
  }

  const handleDenyConfirm = async () => {
    if (!denyTarget) return
    const id = denyTarget
    setDenyTarget(null)
    setProcessing((p) => new Set(p).add(id))
    try {
      await denyLoan(id)
      toast.success('Loan request denied.')
      qc.invalidateQueries({ queryKey: ['admin-pending-loans'] })
    } catch (e: unknown) {
      toast.error((e as Error).message)
    } finally {
      setProcessing((p) => { const s = new Set(p); s.delete(id); return s })
    }
  }

  return (
    <>
      {denyTarget && (
        <ConfirmDenyDialog onConfirm={handleDenyConfirm} onCancel={() => setDenyTarget(null)} />
      )}

      <div className="min-h-screen">
        {/* Header */}
        <div className="bg-[var(--brand-green)] px-6 pt-12 pb-8">
          <div className="flex items-center justify-between mb-4">
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tracking-widest uppercase">
              Admin
            </span>
            <button
              id="admin-refresh-btn"
              onClick={() => refetch()}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 transition"
            >
              <RefreshCwIcon size={16} className={`text-white ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-white/70 text-xs font-semibold tracking-widest uppercase mb-1">Loan Requests</p>
          <div className="flex items-center gap-3">
            <h1 className="text-white text-3xl font-bold">Pending Review</h1>
            {!isLoading && (
              <span className="px-3 py-1 rounded-full bg-orange-400 text-white text-sm font-bold">
                {loans.length}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 max-w-3xl mx-auto">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse bg-white rounded-2xl h-48" />
              ))}
            </div>
          ) : loans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 rounded-full bg-[var(--brand-green-50)] flex items-center justify-center mb-5">
                <CheckCircleIcon size={40} className="text-[var(--brand-green)]" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">All caught up!</h2>
              <p className="text-sm text-gray-400">No pending loan requests at this time.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {loans.map((loan) => {
                const u = loan._user
                const fullName = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim().toUpperCase()
                const initials = `${u.first_name?.[0] ?? ''}${u.last_name?.[0] ?? ''}`.toUpperCase()
                const dateLabel = loan.created_at
                  ? new Date(loan.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                  : ''
                const isProc = processing.has(loan.id)

                return (
                  <div key={loan.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {/* Card header */}
                    <div className="flex items-center gap-4 px-5 py-4 bg-gray-50 border-b border-gray-100">
                      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--brand-green-100)] shrink-0">
                        <span className="text-base font-extrabold text-[var(--brand-green)]">
                          {initials || '?'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 truncate">{fullName || 'Unknown Applicant'}</p>
                        <p className="text-xs font-mono text-gray-500">ID: {u.student_id ?? '—'}</p>
                        {(u.course || u.year_level) && (
                          <p className="text-xs text-gray-400 uppercase">
                            {u.course} · Year {u.year_level}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-400">Applied</p>
                        <p className="text-xs font-mono font-semibold text-gray-600">{dateLabel}</p>
                      </div>
                    </div>

                    {/* Loan details */}
                    <div className="px-5 py-4">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-xs text-gray-400 font-semibold tracking-widest uppercase mb-1">Loan Amount</p>
                          <p className="text-3xl font-extrabold text-gray-900">{formatCurrency(loan.amount)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold"
                          style={{ borderColor: 'transparent' }}
                        >
                          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${aiBadgeClass(loan.ai_evaluation)}`}>
                            <SparklesIcon size={12} />
                            AI: {loan.ai_evaluation ? loan.ai_evaluation[0].toUpperCase() + loan.ai_evaluation.slice(1) : 'N/A'}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-gray-400 font-semibold tracking-widest uppercase mb-1">Purpose</p>
                      <p className="text-sm text-gray-700 leading-relaxed border border-gray-200 rounded-xl px-4 py-3 mb-5 bg-gray-50">
                        {loan.purpose || '—'}
                      </p>

                      {/* Actions */}
                      {isProc ? (
                        <div className="flex items-center justify-center py-2">
                          <svg className="animate-spin w-6 h-6 text-[var(--brand-green)]" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25"/>
                            <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75"/>
                          </svg>
                        </div>
                      ) : (
                        <div className="flex gap-3">
                          <button
                            id={`deny-loan-${loan.id}`}
                            onClick={() => setDenyTarget(loan.id)}
                            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-300 text-red-600 font-bold text-sm hover:bg-red-50 transition"
                          >
                            <XIcon size={16} /> Deny
                          </button>
                          <button
                            id={`approve-loan-${loan.id}`}
                            onClick={() => handleApprove(loan)}
                            className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--brand-green)] text-white font-bold text-sm hover:bg-[var(--brand-green-dark)] transition"
                          >
                            <CheckIcon size={16} /> Approve
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
