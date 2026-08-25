'use client'


import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useState } from 'react'
import {
  BanknoteIcon,
  CalendarIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  TrendingUpIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/types'
import type { LenderProfile } from '@/lib/types'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'


const TERM_CONFIG = {
  urgent: {
    label: 'Urgent',
    termMonths: 3,
    rate: 0.03,
    color: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  standard: {
    label: 'Standard',
    termMonths: 6,
    rate: 0.05,
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  flexible: {
    label: 'Flexible',
    termMonths: 12,
    rate: 0.08,
    color: 'bg-purple-50 text-purple-700 border-purple-200',
  },
} as const

type LoanType = keyof typeof TERM_CONFIG

function getTermConfig(loanType: string) {
  return TERM_CONFIG[loanType as LoanType] ?? { label: loanType, termMonths: 6, rate: 0.05, color: 'bg-gray-50 text-gray-700 border-gray-200' }
}


interface FundableLoan {
  id: string
  user_id: string
  amount: number
  purpose: string
  loan_type: string
  created_at: string
  borrower_name: string
}

async function fetchFundableLoans(): Promise<FundableLoan[]> {
  const supabase = createClient()

  const { data: loans } = await supabase
    .from('loans')
    .select('id, user_id, amount, purpose, loan_type, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })

  if (!loans?.length) return []

  // loans claimed
  const loanNoteKeys = loans.map((l) => `loan:${l.id}`)
  const { data: claimed } = await supabase
    .from('lender_deposits')
    .select('notes')
    .in('notes', loanNoteKeys)
  const claimedSet = new Set((claimed ?? []).map((d) => String(d.notes ?? '')))

  // borrower names
  const userIds = [...new Set(loans.map((l) => String(l.user_id)))]
  const { data: users } = await supabase
    .from('users')
    .select('id, first_name, last_name')
    .in('id', userIds)
  const userMap: Record<string, string> = {}
  for (const u of users ?? []) {
    userMap[String(u.id)] = `${u.first_name} ${u.last_name}`.trim()
  }

  return loans
    .filter((l) => !claimedSet.has(`loan:${l.id}`))
    .map((l) => ({
      id: String(l.id),
      user_id: String(l.user_id),
      amount: Number(l.amount ?? 0),
      purpose: String(l.purpose ?? ''),
      loan_type: String(l.loan_type ?? 'standard').toLowerCase(),
      created_at: String(l.created_at ?? ''),
      borrower_name: userMap[String(l.user_id)] ?? 'Student',
    }))
}

async function fetchLenderProfile(userId: string): Promise<LenderProfile | null> {
  const { data } = await createClient()
    .from('lender_profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data as LenderProfile | null
}


async function fundLoan(lenderId: string, loan: FundableLoan) {
  const supabase = createClient()

  // Race guard
  const { data: existing } = await supabase
    .from('lender_deposits')
    .select('id')
    .eq('notes', `loan:${loan.id}`)
    .maybeSingle()
  if (existing) throw new Error('This loan was just funded by another lender. Please choose another.')

  const { rate, termMonths } = getTermConfig(loan.loan_type)
  const principal = loan.amount
  const expectedReturn = Math.round(principal * rate * 100) / 100
  const maturityAmount = principal + expectedReturn
  const depositedAt = new Date()
  const maturityDate = new Date(depositedAt)
  maturityDate.setMonth(maturityDate.getMonth() + termMonths)

  const { error } = await supabase.from('lender_deposits').insert({
    lender_id: lenderId,
    principal,
    return_rate: rate,
    term_months: termMonths,
    expected_return: expectedReturn,
    maturity_amount: maturityAmount,
    deposited_at: depositedAt.toISOString(),
    maturity_date: maturityDate.toISOString(),
    status: 'active',
    notes: `loan:${loan.id}`,
  })
  if (error) throw new Error(error.message)
}


function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}



function RateTable() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <TrendingUpIcon size={15} className="text-[var(--brand-green)]" />
          <p className="text-sm font-bold text-gray-800">Return Rate by Loan Type</p>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500">Type</th>
            <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Term</th>
            <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500">Your Return</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {(Object.entries(TERM_CONFIG) as [LoanType, typeof TERM_CONFIG[LoanType]][]).map(([key, cfg]) => (
            <tr key={key}>
              <td className="px-5 py-3 font-semibold text-gray-700 capitalize">{cfg.label}</td>
              <td className="px-3 py-3 text-center text-gray-500">{cfg.termMonths} months</td>
              <td className="px-5 py-3 text-right font-bold text-[var(--brand-green)]">
                {(cfg.rate * 100).toFixed(0)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LoanCard({
  loan,
  lenderProfile,
  onFund,
  isFunding,
}: {
  loan: FundableLoan
  lenderProfile: LenderProfile | null
  onFund: (loan: FundableLoan) => void
  isFunding: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const { rate, termMonths, label, color } = getTermConfig(loan.loan_type)
  const expectedReturn = Math.round(loan.amount * rate * 100) / 100
  const available = Math.max(
    0,
    (lenderProfile?.authorized_limit ?? 0) - (lenderProfile?.total_contributed ?? 0),
  )
  const canFund = loan.amount <= available

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest">Purpose</p>
          <p className="font-bold text-gray-900 capitalize truncate">{loan.purpose}</p>
          <p className="text-xs text-gray-500 mt-0.5">Submitted {fmtDate(loan.created_at)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">
            <CheckCircleIcon size={12} />
            Approved
          </span>
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${color}`}>
            {label}
          </span>
        </div>
      </div>

      {/* Return breakdown */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs text-gray-400 mb-0.5">Loan Amount</p>
          <p className="text-base font-extrabold text-gray-900">{formatCurrency(loan.amount)}</p>
        </div>
        <div className="bg-[var(--brand-green-50,#f0fdf4)] rounded-xl p-3">
          <p className="text-xs text-gray-400 mb-0.5">Return ({(rate * 100).toFixed(0)}%)</p>
          <p className="text-base font-extrabold text-[var(--brand-green)]">+{formatCurrency(expectedReturn)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs text-gray-400 mb-0.5">After {termMonths} mo.</p>
          <p className="text-base font-extrabold text-gray-900">{formatCurrency(loan.amount + expectedReturn)}</p>
        </div>
      </div>

      {/* borrower & term info */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <BanknoteIcon size={15} className="text-gray-400" />
        <span>Borrower: <span className="font-semibold text-gray-700">{loan.borrower_name}</span></span>
        <span className="mx-1 text-gray-200">·</span>
        <CalendarIcon size={13} className="text-gray-400" />
        <span>{termMonths}-month term</span>
      </div>

      {/* Capacity warning */}
      {!canFund && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-orange-50 border border-orange-200">
          <AlertCircleIcon size={15} className="text-orange-600 shrink-0 mt-0.5" />
          <p className="text-xs text-orange-700">
            Your remaining capacity ({formatCurrency(available)}) is below this loan amount.
          </p>
        </div>
      )}

      {/* CTA */}
      {!confirming ? (
        <button
          id={`fund-loan-${loan.id}`}
          onClick={() => setConfirming(true)}
          disabled={!canFund || isFunding}
          className={[
            'w-full py-3.5 rounded-2xl font-bold text-sm transition-all',
            !canFund
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-[var(--brand-green)] text-white hover:bg-[var(--brand-green-dark)] active:scale-[0.98]',
          ].join(' ')}
        >
          Fund This Loan - Earn {(rate * 100).toFixed(0)}% in {termMonths} mo.
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-center text-gray-700 font-medium">
            Commit {formatCurrency(loan.amount)} - Earn +{formatCurrency(expectedReturn)} in {termMonths} months?
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="py-3 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              id={`confirm-fund-${loan.id}`}
              onClick={() => { onFund(loan); setConfirming(false) }}
              disabled={isFunding}
              className="py-3 rounded-2xl bg-[var(--brand-green)] text-white font-bold text-sm hover:bg-[var(--brand-green-dark)] transition disabled:opacity-60"
            >
              {isFunding ? 'Funding…' : 'Confirm & Fund'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}



export default function FundLoanPage() {
  const { profile } = useAuth()
  const userId = profile?.id
  const qc = useQueryClient()

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ['fundable-loans'],
    queryFn: fetchFundableLoans,
    enabled: !!userId,
    refetchInterval: 15_000,
  })

  const { data: lenderProfile } = useQuery({
    queryKey: ['lender-profile', userId],
    queryFn: () => fetchLenderProfile(userId!),
    enabled: !!userId,
  })

  const mutation = useMutation({
    mutationFn: (loan: FundableLoan) => fundLoan(userId!, loan),
    onSuccess: () => {
      toast.success('Loan funded! Check Track Deposits to monitor your return.')
      qc.invalidateQueries({ queryKey: ['fundable-loans'] })
      qc.invalidateQueries({ queryKey: ['lender-deposits', userId] })
      qc.invalidateQueries({ queryKey: ['lender-profile', userId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const available = Math.max(
    0,
    (lenderProfile?.authorized_limit ?? 0) - (lenderProfile?.total_contributed ?? 0),
  )

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-[var(--brand-green)] px-6 pt-12 pb-8">
        <p className="text-white/70 text-xs font-semibold tracking-widest uppercase mb-1">
          Lender Portal
        </p>
        <h1 className="text-white text-3xl font-bold mb-1">Fund a Loan</h1>
        <p className="text-white/70 text-sm">
          First-come, first-serve · Longer term = higher return
        </p>
        <div className="grid grid-cols-2 gap-3 mt-5">
          <div className="bg-white/15 rounded-2xl p-4">
            <p className="text-white/70 text-xs mb-1">Capacity Available</p>
            <p className="text-white text-lg font-bold">{formatCurrency(available)}</p>
          </div>
          <div className="bg-white/15 rounded-2xl p-4">
            <p className="text-white/70 text-xs mb-1">Loans Available</p>
            <p className="text-white text-lg font-bold">{isLoading ? '—' : loans.length}</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 max-w-2xl mx-auto space-y-4">
        {/* Rate table */}
        <RateTable />

        {/* Loan list */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse bg-white rounded-2xl h-52" />
            ))}
          </div>
        ) : loans.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mb-5">
              <ClockIcon size={36} className="text-[var(--brand-green)]" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">No loans available</h2>
            <p className="text-sm text-gray-400 mb-6">
              All approved loans have been funded. Check back soon.
            </p>
            <Link
              href="/lender/track-deposits"
              className="px-6 py-3 rounded-2xl bg-[var(--brand-green)] text-white font-bold hover:opacity-90 transition"
            >
              View My Deposits
            </Link>
          </div>
        ) : (
          loans.map((loan) => (
            <LoanCard
              key={loan.id}
              loan={loan}
              lenderProfile={lenderProfile ?? null}
              onFund={(l) => mutation.mutate(l)}
              isFunding={mutation.isPending}
            />
          ))
        )}
      </div>
    </div>
  )
}
