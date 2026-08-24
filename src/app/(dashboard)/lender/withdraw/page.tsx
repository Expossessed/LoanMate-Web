'use client'

/**
 * Request Withdrawal — /lender/withdraw
 *
 * Lender selects an active or matured deposit and submits a withdrawal request.
 * - Matured deposits: no penalty, full maturity_amount returned.
 * - Active deposits (early): system applies a penalty. Penalty is 10% of
 *   expected_return (returned principal stays intact). Adjust EARLY_PENALTY_RATE
 *   to match the system's policy.
 *
 * Creates a lender_withdrawals row with status = 'pending' for admin processing.
 */

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ArrowDownCircleIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  CalendarIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, getStatusColor } from '@/lib/types'
import type { LenderDeposit } from '@/lib/types'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'

// ─── Policy ───────────────────────────────────────────────────────────────────

/**
 * Penalty rate applied to the expected_return on early withdrawal.
 * e.g. 0.5 → lender forfeits 50% of their expected return (principal intact).
 * Adjust to match system policy. In production, this would come from the DB.
 */
const EARLY_PENALTY_RATE = 0.5

// ─── Zod schema ───────────────────────────────────────────────────────────────

const schema = z.object({
  deposit_id: z.string().min(1, 'Please select a deposit.'),
  notes: z.string().max(300).optional(),
})

type FormValues = z.infer<typeof schema>

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchWithdrawableDeposits(userId: string): Promise<LenderDeposit[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('lender_deposits')
    .select('*')
    .eq('lender_id', userId)
    .in('status', ['active', 'matured'])
    .order('maturity_date', { ascending: true })
  return (data ?? []) as LenderDeposit[]
}

// ─── Mutation ─────────────────────────────────────────────────────────────────

async function submitWithdrawal(
  userId: string,
  depositId: string,
  deposit: LenderDeposit,
  notes?: string,
) {
  const supabase = createClient()

  const isEarly = deposit.status === 'active'
  const penaltyAmount = isEarly
    ? Math.round(deposit.expected_return * EARLY_PENALTY_RATE * 100) / 100
    : 0
  // Amount requested = full maturity_amount (what lender is entitled to)
  const amount = deposit.maturity_amount
  const netPayout = amount - penaltyAmount

  const { error } = await supabase.from('lender_withdrawals').insert({
    lender_id: userId,
    deposit_id: depositId,
    amount,
    penalty_amount: penaltyAmount,
    net_payout: netPayout,
    status: 'pending',
    requested_at: new Date().toISOString(),
    ...(notes ? { rejection_note: null } : {}),
  })

  if (error) throw new Error(error.message)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WithdrawPage() {
  const { profile } = useAuth()
  const userId = profile?.id
  const qc = useQueryClient()
  const searchParams = useSearchParams()
  const preselectedId = searchParams.get('deposit') ?? ''

  const [confirmed, setConfirmed] = useState(false)

  const { data: deposits = [], isLoading } = useQuery({
    queryKey: ['withdrawable-deposits', userId],
    queryFn: () => fetchWithdrawableDeposits(userId!),
    enabled: !!userId,
  })

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { deposit_id: preselectedId, notes: '' },
  })

  const watchDepositId = watch('deposit_id')
  const selectedDeposit = deposits.find((d) => d.id === watchDepositId) ?? null
  const isEarly = selectedDeposit?.status === 'active'
  const penaltyAmount = isEarly && selectedDeposit
    ? Math.round(selectedDeposit.expected_return * EARLY_PENALTY_RATE * 100) / 100
    : 0
  const netPayout = selectedDeposit
    ? selectedDeposit.maturity_amount - penaltyAmount
    : 0

  const mutation = useMutation({
    mutationFn: ({ deposit_id, notes }: FormValues) =>
      submitWithdrawal(userId!, deposit_id, selectedDeposit!, notes),
    onSuccess: () => {
      toast.success('Withdrawal request submitted. Pending admin review.')
      qc.invalidateQueries({ queryKey: ['lender-deposits', userId] })
      qc.invalidateQueries({ queryKey: ['withdrawable-deposits', userId] })
      setConfirmed(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Success / empty states ───────────────────────────────────────────────

  if (!isLoading && deposits.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="w-20 h-20 rounded-full bg-[var(--brand-green-50)] flex items-center justify-center mb-5">
          <ArrowDownCircleIcon size={36} className="text-[var(--brand-green)]" />
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">No withdrawable deposits</h1>
        <p className="text-sm text-gray-400 mb-6">
          You can only request withdrawal from active or matured deposits.
        </p>
        <Link
          href="/lender/track-deposits"
          className="px-6 py-3 rounded-2xl bg-[var(--brand-green)] text-white font-bold hover:bg-[var(--brand-green-dark)] transition"
        >
          View All Deposits
        </Link>
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
        <h1 className="text-white text-3xl font-bold">Request Withdrawal</h1>
        <p className="text-white/70 text-sm mt-2">
          Withdraw from an active or matured deposit.
        </p>
      </div>

      {/* Body */}
      <div className="px-6 py-6 max-w-2xl mx-auto space-y-5">

        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="space-y-5"
        >
          {/* Deposit selector */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
            <p className="text-xs font-extrabold tracking-widest text-gray-500 uppercase">
              Select Deposit *
            </p>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="animate-pulse h-20 bg-gray-100 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {deposits.map((d) => {
                  const isSelected = watchDepositId === d.id
                  const earlyWarn = d.status === 'active'
                  return (
                    <label
                      key={d.id}
                      htmlFor={`dep-${d.id}`}
                      className={[
                        'flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all',
                        isSelected
                          ? 'border-[var(--brand-green)] bg-[var(--brand-green-50)]'
                          : 'border-gray-200 bg-[var(--brand-card)] hover:border-gray-300',
                      ].join(' ')}
                    >
                      <input
                        id={`dep-${d.id}`}
                        type="radio"
                        value={d.id}
                        {...register('deposit_id')}
                        className="mt-1 accent-[var(--brand-green)]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-900">
                            {formatCurrency(d.principal)}
                          </p>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-bold ${getStatusColor(d.status)}`}>
                            {d.status.replace('_', ' ')}
                          </span>
                          {earlyWarn && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600">
                              <AlertTriangleIcon size={12} />
                              Early
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                          <CalendarIcon size={11} />
                          Matures {fmtDate(d.maturity_date)} · {d.term_months}mo ·{' '}
                          {(d.return_rate * 100).toFixed(0)}% return
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-400">At maturity</p>
                        <p className="text-sm font-bold text-gray-900">
                          {formatCurrency(d.maturity_amount)}
                        </p>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}

            {errors.deposit_id && (
              <p className="text-xs text-red-500">{errors.deposit_id.message}</p>
            )}
          </div>

          {/* Payout summary */}
          {selectedDeposit && (
            <div className={[
              'rounded-2xl p-5 space-y-3 border',
              isEarly
                ? 'bg-orange-50 border-orange-200'
                : 'bg-[var(--brand-green-50)] border-[var(--brand-green-100)]',
            ].join(' ')}>
              {isEarly && (
                <div className="flex items-start gap-2">
                  <AlertTriangleIcon size={16} className="text-orange-600 shrink-0 mt-0.5" />
                  <p className="text-sm font-semibold text-orange-800">
                    Early withdrawal — a penalty of {(EARLY_PENALTY_RATE * 100).toFixed(0)}% of
                    your expected return will apply. Your principal is safe.
                  </p>
                </div>
              )}

              <p className="text-xs font-extrabold tracking-widest text-gray-500 uppercase">
                {isEarly ? 'Early Withdrawal Summary' : 'Maturity Payout Summary'}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Principal</p>
                  <p className="text-lg font-bold text-gray-900">
                    {formatCurrency(selectedDeposit.principal)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Expected return</p>
                  <p className="text-lg font-bold text-[var(--brand-green)]">
                    +{formatCurrency(selectedDeposit.expected_return)}
                  </p>
                </div>
                {isEarly && (
                  <div>
                    <p className="text-xs text-gray-500">Early penalty</p>
                    <p className="text-lg font-bold text-red-600">
                      -{formatCurrency(penaltyAmount)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 font-semibold">
                    {isEarly ? 'Net you receive' : 'Total you receive'}
                  </p>
                  <p className="text-2xl font-extrabold text-gray-900">
                    {formatCurrency(netPayout)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Optional notes */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <label
              htmlFor="notes"
              className="block text-xs font-extrabold tracking-widest text-gray-500 uppercase mb-2"
            >
              Reason / Notes (optional)
            </label>
            <textarea
              id="notes"
              rows={3}
              placeholder="e.g. Emergency, tuition, etc."
              {...register('notes')}
              className="w-full text-sm outline-none bg-[var(--brand-card)] border border-gray-200 rounded-xl px-4 py-3 resize-none focus:border-[var(--brand-green)] focus:ring-2 focus:ring-[var(--brand-green)]/20 transition"
            />
          </div>

          {/* Confirmation checkbox */}
          {selectedDeposit && (
            <label
              htmlFor="confirm-check"
              className="flex items-start gap-3 p-4 rounded-2xl border border-gray-200 bg-white cursor-pointer"
            >
              <input
                id="confirm-check"
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 accent-[var(--brand-green)]"
              />
              <p className="text-sm text-gray-700">
                I understand that this is a withdrawal request and is{' '}
                <strong>subject to admin approval</strong>.
                {isEarly && (
                  <> The early withdrawal penalty of{' '}
                    <strong>{formatCurrency(penaltyAmount)}</strong> will be deducted.
                  </>
                )}
              </p>
            </label>
          )}

          {/* Submit */}
          <button
            id="withdraw-submit"
            type="submit"
            disabled={!selectedDeposit || !confirmed || mutation.isPending || isSubmitting}
            className={[
              'w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2',
              !selectedDeposit || !confirmed
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : mutation.isPending || isSubmitting
                ? 'bg-[var(--brand-green)] text-white opacity-70 cursor-wait'
                : 'bg-[var(--brand-green)] text-white hover:bg-[var(--brand-green-dark)] active:scale-[0.98]',
            ].join(' ')}
          >
            {mutation.isPending || isSubmitting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75" />
                </svg>
                Submitting…
              </>
            ) : (
              <>
                <CheckCircleIcon size={18} />
                Submit Withdrawal Request
              </>
            )}
          </button>
        </form>

        <p className="text-xs text-center text-gray-400 pb-4">
          Withdrawal requests are processed by admin within 1–3 business days.
        </p>
      </div>
    </div>
  )
}
