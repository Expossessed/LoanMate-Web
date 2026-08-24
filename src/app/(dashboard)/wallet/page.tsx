'use client'

/**
 * E-Wallet Page — migrated from Flutter EWalletTab
 *
 * RPCs used (same names as Flutter):
 *   apply_monthly_savings_deduction(p_user_id)  → 'ok' | 'already_deducted_this_month' | 'insufficient_balance'
 *   add_to_savings(p_user_id, p_amount)          → 'ok' | 'insufficient_balance' | 'invalid_amount'
 *   release_loan_pledges(p_loan_id)              → called on full loan payoff
 *
 * Business rules preserved:
 * - Mandatory ₱500 monthly savings deduction (kMonthlySavingsAmount)
 * - availableSavings = currentSavings - heldAmount (held = pledged collateral)
 * - Pay loan: capped at remainingLoanBalance; on full payoff → release_loan_pledges RPC
 * - Top Up / Withdraw: direct wallet.balance UPDATE + transaction INSERT
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  WalletIcon, PlusCircleIcon, MinusCircleIcon,
  PiggyBankIcon, CreditCardIcon, CalendarIcon,
  TrendingDownIcon, ListIcon, RefreshCwIcon,
  AlertCircleIcon, ChevronDownIcon, ChevronUpIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/types'
import { useAuth } from '@/hooks/useAuth'

const MONTHLY_SAVINGS = 500

// ─── Data fetcher ─────────────────────────────────────────────────────────────

async function fetchWalletData(userId: string) {
  const supabase = createClient()

  const [walletRes, activeLoansRes] = await Promise.all([
    supabase.from('wallet').select('*').eq('user_id', userId).single(),
    supabase.from('active_loans').select('loan_id, remaining_balance, monthly_payment').eq('user_id', userId),
  ])

  const wallet = walletRes.data
  const walletId = wallet?.id as string | undefined

  const totalRemaining = (activeLoansRes.data ?? []).reduce((s, r) => s + Number(r.remaining_balance ?? 0), 0)
  const monthlyPayment = (activeLoansRes.data ?? []).reduce((s, r) => s + Number(r.monthly_payment ?? 0), 0)
  const activeLoanIds = (activeLoansRes.data ?? []).map((r) => String(r.loan_id))

  // Transactions
  const txRes = walletId
    ? await supabase.from('transactions').select('*').eq('wallet_id', walletId).order('date', { ascending: false })
    : { data: [] }
  const txRows = (txRes.data ?? []) as Record<string, unknown>[]

  // Next pending repayment
  const schedRes = activeLoanIds.length > 0
    ? await supabase.from('repayment_schedule').select('due_date, amount').in('loan_id', activeLoanIds).eq('status', 'pending').order('due_date', { ascending: true }).limit(1)
    : { data: [] }
  const nextPayment = schedRes.data?.[0] ?? null

  // Monthly savings progress (current month)
  const now = new Date()
  const monthSavings = txRows.filter((t) => {
    if (t.type !== 'savings') return false
    const d = new Date(String(t.date ?? ''))
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).reduce((s, t) => s + Number(t.amount ?? 0), 0)

  return {
    walletId,
    walletBalance: Number(wallet?.balance ?? 0),
    currentSavings: Number(wallet?.current_savings ?? 0),
    savingsGoal: Number(wallet?.savings_goal ?? 500),
    heldAmount: Number(wallet?.held_amount ?? 0),
    totalRemaining,
    monthlyPayment,
    activeLoanIds,
    txRows,
    monthSavings,
    nextPayment,
  }
}

// ─── Amount Dialog ────────────────────────────────────────────────────────────

function AmountDialog({
  title, subtitle, confirmLabel, confirmClass,
  max, onConfirm, onClose,
}: {
  title: string; subtitle: string; confirmLabel: string; confirmClass: string
  max?: number; onConfirm: (n: number) => void; onClose: () => void
}) {
  const [val, setVal] = useState('')
  const num = parseFloat(val)
  const valid = !isNaN(num) && num > 0 && (max === undefined || num <= max)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4">
      <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl">
        <h3 className="font-bold text-gray-900 text-lg mb-1">{title}</h3>
        <p className="text-sm text-gray-500 mb-4">{subtitle}</p>
        <input
          autoFocus
          type="number"
          min="1"
          max={max}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="Enter amount (₱)"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-[var(--brand-green)] focus:ring-2 focus:ring-[var(--brand-green)]/20 mb-4"
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={() => { if (valid) { onConfirm(num); onClose() } }}
            disabled={!valid}
            className={`flex-1 py-3 rounded-xl text-sm font-bold text-white transition ${valid ? confirmClass : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Wallet Page ──────────────────────────────────────────────────────────────

export default function WalletPage() {
  const { profile } = useAuth()
  const userId = profile?.id
  const isLender = profile?.is_lender ?? false
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['wallet', userId],
    queryFn: () => fetchWalletData(userId!),
    enabled: !!userId,
  })

  const [dialog, setDialog] = useState<'topup' | 'withdraw' | 'pay' | 'save' | null>(null)
  const [showTx, setShowTx] = useState(false)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['wallet', userId] })

  // ── Top Up ─────────────────────────────────────────────────────────────────
  const topUpMutation = useMutation({
    mutationFn: async (amount: number) => {
      const supabase = createClient()
      const newBal = (data?.walletBalance ?? 0) + amount
      const r = await supabase.from('wallet').update({ balance: newBal }).eq('user_id', userId!).select()
      if (!r.data?.length) throw new Error('Wallet update failed — check RLS policies.')
      await supabase.from('transactions').insert({ wallet_id: data?.walletId, type: 'top_up', amount, date: new Date().toISOString(), description: 'Wallet top-up' })
    },
    onSuccess: (_, amount) => { toast.success(`${formatCurrency(amount)} added to your wallet!`); invalidate() },
    onError: (e: Error) => toast.error(`Top-up failed: ${e.message}`),
  })

  // ── Withdraw ───────────────────────────────────────────────────────────────
  const withdrawMutation = useMutation({
    mutationFn: async (amount: number) => {
      if ((data?.walletBalance ?? 0) < amount) throw new Error('Insufficient balance.')
      const supabase = createClient()
      const newBal = (data?.walletBalance ?? 0) - amount
      const r = await supabase.from('wallet').update({ balance: newBal }).eq('user_id', userId!).select()
      if (!r.data?.length) throw new Error('Wallet update failed.')
      await supabase.from('transactions').insert({ wallet_id: data?.walletId, type: 'withdrawal', amount, date: new Date().toISOString(), description: 'Wallet withdrawal' })
    },
    onSuccess: (_, amount) => { toast.success(`${formatCurrency(amount)} withdrawn.`); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Pay Loan ───────────────────────────────────────────────────────────────
  const payLoanMutation = useMutation({
    mutationFn: async (amount: number) => {
      const supabase = createClient()
      if ((data?.totalRemaining ?? 0) <= 0) throw new Error('Your loan is already fully paid! 🎉')
      if ((data?.walletBalance ?? 0) < amount) throw new Error('Insufficient balance.')
      const actual = Math.min(amount, data?.totalRemaining ?? amount)
      const newBal = (data?.walletBalance ?? 0) - actual
      const r = await supabase.from('wallet').update({ balance: newBal }).eq('user_id', userId!).select()
      if (!r.data?.length) throw new Error('Wallet update failed.')
      await supabase.from('transactions').insert({ wallet_id: data?.walletId, type: 'payment', amount: actual, date: new Date().toISOString(), description: 'Paid' })

      const newRemaining = (data?.totalRemaining ?? 0) - actual
      if (newRemaining <= 0 && data?.activeLoanIds?.length) {
        for (const loanId of data.activeLoanIds) {
          await supabase.rpc('release_loan_pledges', { p_loan_id: loanId }).catch(() => {})
        }
        return { actual, fullyPaid: true }
      }
      return { actual, fullyPaid: false }
    },
    onSuccess: ({ actual, fullyPaid }) => {
      const msg = fullyPaid
        ? `${formatCurrency(actual)} paid! 🎉 Loan fully cleared — collateral released!`
        : `${formatCurrency(actual)} paid!`
      toast.success(msg)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Add to Savings ─────────────────────────────────────────────────────────
  const savingsMutation = useMutation({
    mutationFn: async (amount: number) => {
      const supabase = createClient()
      const result = await supabase.rpc('add_to_savings', { p_user_id: userId!, p_amount: amount })
      if (result.data === 'insufficient_balance') throw new Error('Insufficient wallet balance.')
      if (result.data === 'invalid_amount') throw new Error('Amount must be greater than ₱0.')
      if (result.data !== 'ok') throw new Error(`Unexpected: ${result.data}`)
      return amount
    },
    onSuccess: (amount) => { toast.success(`${formatCurrency(amount)} added to savings!`); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Monthly Sweep ──────────────────────────────────────────────────────────
  const sweepMutation = useMutation({
    mutationFn: async () => {
      const supabase = createClient()
      await supabase.from('wallet').update({ monthly_savings_amount: MONTHLY_SAVINGS, savings_deduction_active: true }).eq('user_id', userId!)
      const result = await supabase.rpc('apply_monthly_savings_deduction', { p_user_id: userId! })
      return result.data as string
    },
    onSuccess: (result) => {
      if (result === 'ok') { toast.success(`${formatCurrency(MONTHLY_SAVINGS)} swept to savings!`); invalidate() }
      else if (result === 'already_deducted_this_month') toast.info('Already swept this month.')
      else if (result === 'insufficient_balance') toast.error('Insufficient balance for ₱500 deduction.')
      else toast.warning(result)
    },
    onError: (e: Error) => toast.error(`Sweep failed: ${e.message}`),
  })

  const available = Math.max((data?.currentSavings ?? 0) - (data?.heldAmount ?? 0), 0)
  const savingsGoal = data?.savingsGoal || 500
  const savingsPct = Math.min((data?.currentSavings ?? 0) / savingsGoal, 1)
  const hasInsufficient = (data?.monthlyPayment ?? 0) > 0 && (data?.walletBalance ?? 0) < (data?.monthlyPayment ?? 0)

  const txDisplay = (data?.txRows ?? []).filter((t) => t.type !== 'init').map((t) => ({
    type: String(t.type ?? ''),
    amount: Number(t.amount ?? 0),
    date: t.date ? new Date(String(t.date)).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
    description: String(t.description ?? ''),
  }))

  return (
    <>
      {/* Amount Dialogs */}
      {dialog === 'topup' && (
        <AmountDialog title="Top Up Wallet" subtitle="Enter amount to add to your wallet." confirmLabel="Top Up"
          confirmClass="bg-[var(--brand-green)] hover:bg-[var(--brand-green-dark)]"
          onConfirm={(n) => topUpMutation.mutate(n)} onClose={() => setDialog(null)} />
      )}
      {dialog === 'withdraw' && (
        <AmountDialog title="Withdraw Funds" subtitle={`Available: ${formatCurrency(data?.walletBalance ?? 0)}`} confirmLabel="Withdraw"
          confirmClass="bg-[var(--brand-blue)] hover:opacity-90"
          max={data?.walletBalance} onConfirm={(n) => withdrawMutation.mutate(n)} onClose={() => setDialog(null)} />
      )}
      {dialog === 'pay' && (
        <AmountDialog title="Pay Loan" subtitle={`Remaining: ${formatCurrency(data?.totalRemaining ?? 0)} | Balance: ${formatCurrency(data?.walletBalance ?? 0)}`}
          confirmLabel="Pay" confirmClass="bg-red-500 hover:bg-red-600"
          max={data?.walletBalance} onConfirm={(n) => payLoanMutation.mutate(n)} onClose={() => setDialog(null)} />
      )}
      {dialog === 'save' && !isLender && (
        <AmountDialog title="Add to Savings" subtitle={`Available balance: ${formatCurrency(data?.walletBalance ?? 0)}`}
          confirmLabel="Save" confirmClass="bg-[var(--brand-green-dark)] hover:opacity-90"
          max={data?.walletBalance} onConfirm={(n) => savingsMutation.mutate(n)} onClose={() => setDialog(null)} />
      )}

      <div className="min-h-screen">
        {/* ── Green header ──────────────────────────────────────────── */}
        <div className="bg-[var(--brand-green)] px-6 pt-12 pb-8 rounded-br-[60px]">
          <div className="flex items-center gap-2 mb-2">
            <WalletIcon size={18} className="text-white/70" />
            <p className="text-white/70 text-sm">E-Wallet Balance</p>
          </div>
          {isLoading ? (
            <div className="animate-pulse bg-white/30 h-10 w-48 rounded-lg" />
          ) : (
            <p className="text-white text-4xl font-bold tracking-tight">
              {formatCurrency(data?.walletBalance ?? 0)}
            </p>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 mt-6">
            {[
              { label: 'Top Up', Icon: PlusCircleIcon, action: () => setDialog('topup'), cls: 'bg-white/20 hover:bg-white/30' },
              { label: 'Withdraw', Icon: MinusCircleIcon, action: () => setDialog('withdraw'), cls: 'bg-white/20 hover:bg-white/30' },
            ].map(({ label, Icon, action, cls }) => (
              <button key={label} onClick={action} className={`flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition ${cls}`}>
                <Icon size={18} />{label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-6 space-y-5">
          {/* Insufficient balance warning */}
          {hasInsufficient && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
              <AlertCircleIcon size={18} className="text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 font-medium">
                Insufficient balance! Your wallet ({formatCurrency(data?.walletBalance ?? 0)}) is below your monthly payment ({formatCurrency(data?.monthlyPayment ?? 0)}).
              </p>
            </div>
          )}

          {/* Remaining loan card — students only */}
          {!isLender && (data?.totalRemaining ?? 0) > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-red-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Remaining Loan Balance</p>
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(data?.totalRemaining ?? 0)}</p>
                  {data?.nextPayment && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <CalendarIcon size={13} className="text-orange-500" />
                      <p className="text-xs text-orange-600 font-medium">
                        Next due: {new Date(String(data.nextPayment.due_date)).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} — {formatCurrency(Number(data.nextPayment.amount ?? 0))}
                      </p>
                    </div>
                  )}
                </div>
                <button
                  id="pay-loan-btn"
                  onClick={() => setDialog('pay')}
                  className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition"
                >
                  Pay Loan
                </button>
              </div>
            </div>
          )}

          {/* Savings Goal card — students only; lenders cannot add to savings */}
          {!isLender && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <PiggyBankIcon size={18} className="text-[var(--brand-green)]" />
                <h2 className="font-bold text-gray-800">Co-op Savings</h2>
              </div>
              <button
                id="add-to-savings-btn"
                onClick={() => setDialog('save')}
                className="text-xs font-bold text-[var(--brand-green)] hover:underline"
              >
                + Add
              </button>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(data?.currentSavings ?? 0)}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Available (excl. held): {formatCurrency(available)}
              {(data?.heldAmount ?? 0) > 0 && <span className="text-orange-500"> · {formatCurrency(data?.heldAmount ?? 0)} held</span>}
            </p>

            {/* Progress */}
            <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-[var(--brand-green)] rounded-full transition-all" style={{ width: `${savingsPct * 100}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Goal: {formatCurrency(savingsGoal)}</span>
              <span>{Math.round(savingsPct * 100)}%</span>
            </div>

            {/* Monthly progress */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium">This month's savings</p>
                  <p className="text-sm font-bold text-[var(--brand-green)]">
                    {formatCurrency(data?.monthSavings ?? 0)} / {formatCurrency(MONTHLY_SAVINGS)}
                  </p>
                </div>
                <button
                  id="monthly-sweep-btn"
                  onClick={() => sweepMutation.mutate()}
                  disabled={sweepMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--brand-green-50)] text-[var(--brand-green)] text-xs font-bold hover:bg-[var(--brand-green-100)] transition disabled:opacity-60"
                >
                  <RefreshCwIcon size={13} className={sweepMutation.isPending ? 'animate-spin' : ''} />
                  Sweep ₱500
                </button>
              </div>
            </div>
          </div>
          )}

          {/* Transaction List */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => setShowTx((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-2">
                <ListIcon size={16} className="text-gray-500" />
                <span className="font-bold text-gray-800 text-sm">Transaction History</span>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{txDisplay.length}</span>
              </div>
              {showTx ? <ChevronUpIcon size={16} className="text-gray-400" /> : <ChevronDownIcon size={16} className="text-gray-400" />}
            </button>

            {showTx && (
              <ul className="divide-y divide-gray-50">
                {txDisplay.length === 0 ? (
                  <li className="px-5 py-6 text-sm text-gray-400 text-center">No transactions yet</li>
                ) : txDisplay.map((tx, i) => {
                  const isCredit = ['top_up', 'savings', 'auto_deduction'].includes(tx.type)
                  return (
                    <li key={i} className="flex items-center gap-3 px-5 py-3">
                      <span className={`flex items-center justify-center w-9 h-9 rounded-full shrink-0 ${isCredit ? 'bg-green-50' : 'bg-red-50'}`}>
                        {isCredit
                          ? <TrendingDownIcon size={15} className="text-[var(--brand-green)]" />
                          : <CreditCardIcon size={15} className="text-red-500" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate capitalize">
                          {tx.description || tx.type.replace(/_/g, ' ')}
                        </p>
                        <p className="text-xs text-gray-400">{tx.date}</p>
                      </div>
                      <p className={`text-sm font-bold shrink-0 ${isCredit ? 'text-[var(--brand-green)]' : 'text-red-500'}`}>
                        {isCredit ? '+' : '-'}{formatCurrency(tx.amount)}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
