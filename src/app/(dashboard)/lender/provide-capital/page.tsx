'use client'


import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  PlusCircleIcon,
  CalendarIcon,
  TrendingUpIcon,
  CheckCircleIcon,
  InfoIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/types'
import type { LenderProfile } from '@/lib/types'
import { useAuth } from '@/hooks/useAuth'

const TERM_OPTIONS = [
  { months: 3,  label: '3 Months',  rate: 0.03, rateLabel: '3% fixed return' },
  { months: 6,  label: '6 Months',  rate: 0.05, rateLabel: '5% fixed return' },
  { months: 12, label: '12 Months', rate: 0.08, rateLabel: '8% fixed return' },
] as const

type TermMonths = (typeof TERM_OPTIONS)[number]['months']

function buildSchema(authorizedLimit: number, alreadyContributed: number) {
  const available = Math.max(0, authorizedLimit - alreadyContributed)
  return z.object({
    principal: z
      .number()
      .min(500, 'Minimum deposit is ₱500.')
      .max(available, `Maximum available is ${formatCurrency(available)}.`),
    term_months: z.number().refine(
      (v): v is TermMonths => TERM_OPTIONS.some((o) => o.months === v),
      'Please select a term.',
    ),
  })
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>

async function fetchLenderProfile(userId: string): Promise<LenderProfile | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('lender_profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data as LenderProfile | null
}


async function submitDeposit(
  userId: string,
  principal: number,
  termMonths: TermMonths,
) {
  const supabase = createClient()

  const termOption = TERM_OPTIONS.find((o) => o.months === termMonths)!
  const expectedReturn = Math.round(principal * termOption.rate * 100) / 100
  const maturityAmount = principal + expectedReturn

  const depositedAt = new Date()
  const maturityDate = new Date(depositedAt)
  maturityDate.setMonth(maturityDate.getMonth() + termMonths)

  const { error } = await supabase.from('lender_deposits').insert({
    lender_id: userId,
    principal,
    return_rate: termOption.rate,
    term_months: termMonths,
    expected_return: expectedReturn,
    maturity_amount: maturityAmount,
    deposited_at: depositedAt.toISOString(),
    maturity_date: maturityDate.toISOString(),
    status: 'pending',
  })

  if (error) throw new Error(error.message)
}

//helpers
function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}


export default function ProvideCapitalPage() {
  const { profile } = useAuth()
  const userId = profile?.id
  const qc = useQueryClient()

  const { data: lenderProfile, isLoading } = useQuery({
    queryKey: ['lender-profile', userId],
    queryFn: () => fetchLenderProfile(userId!),
    enabled: !!userId,
  })

  const available = Math.max(
    0,
    (lenderProfile?.authorized_limit ?? 0) - (lenderProfile?.total_contributed ?? 0),
  )

  const schema = buildSchema(
    lenderProfile?.authorized_limit ?? 0,
    lenderProfile?.total_contributed ?? 0,
  )

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: { term_months: 6 },
  })

  const watchPrincipal = watch('principal')
  const watchTerm = watch('term_months') as TermMonths | undefined
  const selectedTerm = TERM_OPTIONS.find((o) => o.months === watchTerm)

  const previewReturn = selectedTerm && watchPrincipal > 0
    ? Math.round(watchPrincipal * selectedTerm.rate * 100) / 100
    : 0
  const previewTotal = (watchPrincipal || 0) + previewReturn
  const previewMaturity = selectedTerm
    ? formatDate(addMonths(new Date(), selectedTerm.months))
    : '—'

  const mutation = useMutation({
    mutationFn: ({ principal, term_months }: FormValues) =>
      submitDeposit(userId!, principal, term_months as TermMonths),
    onSuccess: () => {
      toast.success('Capital submitted! Pending admin review.')
      qc.invalidateQueries({ queryKey: ['lender-profile', userId] })
      qc.invalidateQueries({ queryKey: ['lender-deposits', userId] })
      reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="min-h-screen">
      {/* header */}
      <div className="bg-[var(--brand-green)] px-6 pt-12 pb-8">
        <p className="text-white/70 text-xs font-semibold tracking-widest uppercase mb-1">
          Lender Portal
        </p>
        <h1 className="text-white text-3xl font-bold mb-6">Provide Capital</h1>

        {/* Limit status cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/15 rounded-2xl p-4">
            <p className="text-white/70 text-xs mb-1">Authorized Limit</p>
            {isLoading ? (
              <div className="h-6 w-24 bg-white/30 rounded animate-pulse" />
            ) : (
              <p className="text-white text-lg font-bold">
                {formatCurrency(lenderProfile?.authorized_limit ?? 0)}
              </p>
            )}
          </div>
          <div className="bg-white/15 rounded-2xl p-4">
            <p className="text-white/70 text-xs mb-1">Available to Contribute</p>
            {isLoading ? (
              <div className="h-6 w-24 bg-white/30 rounded animate-pulse" />
            ) : (
              <p className="text-white text-lg font-bold">{formatCurrency(available)}</p>
            )}
          </div>
        </div>
      </div>

      {/* body */}
      <div className="px-6 py-6 max-w-2xl mx-auto space-y-5">

        {/* guide message */}
        <div className="flex gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-200">
          <InfoIcon size={18} className="text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800 leading-relaxed">
            Your contribution enters the cooperative lending pool for the chosen term.
            You receive your full principal back <strong>plus</strong> the fixed return at maturity.
            You do not fund specific student loans individually.
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v)) as any}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6"
        >
          {/* principal input */}
          <div>
            <label
              htmlFor="principal"
              className="block text-xs font-extrabold tracking-widest text-gray-500 uppercase mb-2"
            >
              Principal Amount *
            </label>
            <div className="flex items-center gap-2 px-4 py-3 bg-[var(--brand-card)] border border-gray-200 rounded-2xl focus-within:border-[var(--brand-green)] focus-within:ring-2 focus-within:ring-[var(--brand-green)]/20 transition">
              <span className="text-sm font-bold text-gray-500">₱</span>
              <input
                id="principal"
                type="number"
                min={500}
                max={available}
                step={100}
                placeholder="0.00"
                {...register('principal', { valueAsNumber: true })}
                className="flex-1 text-sm outline-none bg-transparent text-gray-800"
              />
            </div>
            {errors.principal && (
              <p className="mt-1 text-xs text-red-500">{errors.principal.message}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Min ₱500 · Max {formatCurrency(available)}
            </p>
          </div>

          {/* term selection */}
          <div>
            <p className="text-xs font-extrabold tracking-widest text-gray-500 uppercase mb-3">
              Choose Term *
            </p>
            <div className="space-y-2">
              {TERM_OPTIONS.map((opt) => {
                const isSelected = watchTerm === opt.months
                return (
                  <label
                    key={opt.months}
                    htmlFor={`term-${opt.months}`}
                    className={[
                      'flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all',
                      isSelected
                        ? 'border-[var(--brand-green)] bg-[var(--brand-green-50)]'
                        : 'border-gray-200 bg-[var(--brand-card)] hover:border-gray-300',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        id={`term-${opt.months}`}
                        type="radio"
                        value={opt.months}
                        {...register('term_months', { valueAsNumber: true })}
                        className="accent-[var(--brand-green)]"
                      />
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{opt.label}</p>
                        <p className="text-xs text-gray-500">{opt.rateLabel}</p>
                      </div>
                    </div>
                    {isSelected && (
                      <CheckCircleIcon size={20} className="text-[var(--brand-green)]" />
                    )}
                  </label>
                )
              })}
            </div>
            {errors.term_months && (
              <p className="mt-1 text-xs text-red-500">{errors.term_months.message}</p>
            )}
          </div>

          {/* preview */}
          {selectedTerm && watchPrincipal > 0 && (
            <div className="bg-[var(--brand-green-50)] rounded-2xl p-5 space-y-3">
              <p className="text-xs font-extrabold tracking-widest text-gray-500 uppercase">
                Deposit Preview
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">You contribute</p>
                  <p className="text-lg font-bold text-gray-900">
                    {formatCurrency(watchPrincipal)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Fixed return</p>
                  <p className="text-lg font-bold text-[var(--brand-green)]">
                    +{formatCurrency(previewReturn)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <TrendingUpIcon size={11} /> You receive at maturity
                  </p>
                  <p className="text-xl font-extrabold text-gray-900">
                    {formatCurrency(previewTotal)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <CalendarIcon size={11} /> Maturity date
                  </p>
                  <p className="text-sm font-bold text-gray-800">{previewMaturity}</p>
                </div>
              </div>
            </div>
          )}

          <button
            id="provide-capital-submit"
            type="submit"
            disabled={mutation.isPending || isSubmitting || available <= 0}
            className={[
              'w-full py-4 rounded-2xl font-bold text-base transition-all',
              available <= 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : mutation.isPending || isSubmitting
                ? 'bg-[var(--brand-green)] text-white opacity-70 cursor-wait'
                : 'bg-[var(--brand-green)] text-white hover:bg-[var(--brand-green-dark)] active:scale-[0.98]',
            ].join(' ')}
          >
            {mutation.isPending || isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75" />
                </svg>
                Submitting…
              </span>
            ) : available <= 0 ? (
              'Limit Reached'
            ) : (
              <span className="flex items-center justify-center gap-2">
                <PlusCircleIcon size={18} />
                Submit Deposit
              </span>
            )}
          </button>
        </form>

        <p className="text-xs text-center text-gray-400 pb-4">
          Deposits are reviewed by admin before becoming active.
          Early withdrawal may incur a penalty.
        </p>
      </div>
    </div>
  )
}
