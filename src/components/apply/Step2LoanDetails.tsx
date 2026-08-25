'use client'

import { useState } from 'react'
import { ShieldIcon, UserPlusIcon, XIcon, RefreshCwIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { calcLoan, fmt, type ApplyFormState, type BuddyPledge } from '@/lib/apply-helpers'

interface Props {
  form: ApplyFormState
  availableSavings: number
  onRefreshSavings: () => void
  onChange: (patch: Partial<ApplyFormState>) => void
  onNext: () => void
  onBack: () => void
}

function TermBtn({
  months,
  selected,
  onClick,
}: {
  months: 6 | 12 | 18
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex-1 py-4 rounded-2xl border text-sm font-bold font-mono transition',
        selected
          ? 'bg-[var(--brand-green)] border-[var(--brand-green)] text-white'
          : 'bg-white border-gray-200 text-gray-800',
      ].join(' ')}
    >
      {months} mos
    </button>
  )
}


function PledgeRow({
  label,
  sublabel,
  pledge,
  maxAmount,
  onAmountChange,
  onMax,
  onRemove,
}: {
  label: string
  sublabel: string
  pledge: number
  maxAmount: number
  onAmountChange: (v: number) => void
  onMax: () => void
  onRemove?: () => void
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[var(--brand-green)]">
          <UserPlusIcon size={15} />
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-800">{label}</p>
          <p className="text-[10px] text-gray-400">{sublabel}</p>
        </div>
        {onRemove && (
          <button onClick={onRemove} className="text-red-400 hover:text-red-600">
            <XIcon size={16} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-semibold whitespace-nowrap">Pledge amount:</span>
        <div className="flex-1 flex items-center border border-gray-200 rounded-lg bg-white h-9 px-2 gap-1">
          <span className="text-sm font-bold text-[var(--brand-green)]">₱</span>
          <input
            type="number"
            min={0}
            max={maxAmount > 0 ? maxAmount : undefined}
            value={pledge > 0 ? pledge : ''}
            placeholder="0"
            onChange={(e) => {
              const v = parseFloat(e.target.value) || 0
              const clamped = maxAmount > 0 ? Math.min(v, maxAmount) : v
              onAmountChange(clamped)
            }}
            className="flex-1 text-sm font-bold text-gray-800 outline-none bg-transparent"
          />
        </div>
        <button
          onClick={onMax}
          disabled={maxAmount <= 0}
          className={[
            'px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold border transition',
            maxAmount > 0
              ? 'bg-green-50 border-green-200 text-[var(--brand-green)]'
              : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed',
          ].join(' ')}
        >
          MAX
        </button>
      </div>
      {pledge > 0 && (
        <p className="text-right text-[10px] font-bold text-[var(--brand-green)] mt-1">
          Pledging {fmt(pledge)}
        </p>
      )}
    </div>
  )
}



export default function Step2LoanDetails({
  form,
  availableSavings,
  onRefreshSavings,
  onChange,
  onNext,
  onBack,
}: Props) {
  const [buddyInput, setBuddyInput] = useState('')
  const [findingBuddy, setFindingBuddy] = useState(false)
  const [buddyError, setBuddyError] = useState('')

  const principal = parseFloat(form.amount.replace(/,/g, '')) || 0
  const { interest, total, monthly, penaltyRate, penalty } = calcLoan(principal, form.repaymentTerm)
  const collateralPool =
    form.selfPledgeAmount + form.buddyPledges.reduce((s, b) => s + b.amount, 0)

  async function findBuddy() {
    const rawId = buddyInput.trim()
    if (!rawId) return
    if (form.buddyPledges.length >= 4) {
      setBuddyError('Maximum 4 co-signers allowed.')
      return
    }
    if (form.buddyPledges.some((b) => b.studentId === rawId)) {
      setBuddyError('This student is already added.')
      return
    }
    setFindingBuddy(true)
    setBuddyError('')
    try {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('search_student_by_id', { p_student_id: rawId })
      if (error) throw new Error(error.message)
      const rows = (data as Record<string, unknown>[] | null) ?? []
      if (rows.length === 0) throw new Error(`No student found with ID "${rawId}".`)
      const u = rows[0]
      const newBuddy: BuddyPledge = {
        studentId: String(u['student_id'] ?? ''),
        userId: String(u['user_id'] ?? ''),
        name: `${u['first_name']} ${u['last_name']}`,
        availableSavings: Number(u['available_savings'] ?? 0),
        amount: 0,
      }
      onChange({ buddyPledges: [...form.buddyPledges, newBuddy] })
      setBuddyInput('')
    } catch (e: unknown) {
      setBuddyError(e instanceof Error ? e.message : 'Could not find student.')
    } finally {
      setFindingBuddy(false)
    }
  }

  function updateBuddyAmount(idx: number, amount: number) {
    const updated = form.buddyPledges.map((b, i) => (i === idx ? { ...b, amount } : b))
    onChange({ buddyPledges: updated })
  }

  function removeBuddy(idx: number) {
    onChange({ buddyPledges: form.buddyPledges.filter((_, i) => i !== idx) })
  }

  function handleContinue() {
    if (!principal || principal < 1000) {
      alert('Please enter a loan amount of at least ₱1,000.')
      return
    }
    if (collateralPool < principal) {
      alert(`Collateral pool (${fmt(collateralPool)}) is less than the requested amount. Reduce the amount or add more co-signers.`)
      return
    }
    if (!form.purpose.trim()) {
      alert('Please describe the purpose of your loan.')
      return
    }
    onNext()
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <h2 className="text-xl font-extrabold text-gray-900">Loan details</h2>

      {/* Amount */}
      <div>
        <Label>AMOUNT (*)</Label>
        <div className="flex items-center px-4 bg-white border border-gray-200 rounded-2xl">
          <span className="text-gray-400 text-sm mr-2">₱</span>
          <input
            id="apply-amount"
            type="number"
            min={1000}
            max={50000}
            placeholder="e.g. 5000"
            value={form.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
            className="flex-1 py-4 text-base text-gray-800 outline-none bg-transparent"
          />
        </div>
        <p className="text-[10px] text-gray-400 font-mono mt-1">*5,000 minimum · *50,000 maximum</p>
      </div>

      {/* Repayment Term */}
      <div>
        <Label>REPAYMENT TERM</Label>
        <div className="flex gap-3 mt-2">
          {([6, 12, 18] as const).map((m) => (
            <TermBtn
              key={m}
              months={m}
              selected={form.repaymentTerm === m}
              onClick={() => onChange({ repaymentTerm: m })}
            />
          ))}
        </div>
      </div>

      {/* Purpose */}
      <div>
        <Label>PURPOSE</Label>
        <textarea
          id="apply-purpose"
          rows={3}
          placeholder="Describe the purpose of your loan..."
          value={form.purpose}
          onChange={(e) => onChange({ purpose: e.target.value })}
          className="w-full mt-2 px-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm text-gray-800 outline-none resize-none"
        />
      </div>

      {/* Loan Estimate Card */}
      <div className="rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Green header */}
        <div className="bg-[var(--brand-green)] px-6 py-5">
          <p className="text-[9px] font-extrabold tracking-widest text-white/70 uppercase mb-1">
            Estimated Monthly Payment
          </p>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-white leading-none">{fmt(monthly)}</span>
            <span className="text-sm text-white/75 mb-1">per month</span>
          </div>
          <p className="text-xs text-white/60 mt-1">for {form.repaymentTerm} months</p>
        </div>
        {/* Breakdown */}
        <div className="bg-white px-6 py-4 space-y-3">
          <Row label="Loan Principal" value={fmt(principal)} />
          <Divider />
          <Row label="Interest Rate" value="3% per year" valueClass="text-blue-600" />
          <Row label="Total Interest" value={fmt(interest)} valueClass="text-blue-600" />
          <Divider />
          <Row label="Total Repayment" value={fmt(total)} bold />
          <Divider />
          <Row label="Missed Payment Penalty" value={`${Math.round(penaltyRate * 100)}% of principal`} valueClass="text-orange-600" />
          <Row label="Penalty Amount" value={fmt(penalty)} valueClass="text-orange-600" />
        </div>
      </div>

      {/* Collateral Pool */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-green-50">
            <ShieldIcon size={18} className="text-[var(--brand-green)]" />
          </span>
          <div className="flex-1">
            <p className="font-extrabold text-sm text-gray-900">Collateral Pool</p>
            <p className="text-[10px] text-gray-400">Your savings secure this loan.</p>
          </div>
          <button onClick={onRefreshSavings} className="text-gray-400 hover:text-gray-600">
            <RefreshCwIcon size={15} />
          </button>
          <span
            className={[
              'px-3 py-1 rounded-full text-sm font-bold',
              collateralPool > 0 ? 'bg-green-50 text-[var(--brand-green)]' : 'bg-gray-100 text-gray-400',
            ].join(' ')}
          >
            {fmt(collateralPool)}
          </span>
        </div>

        <div className="space-y-3">
          {/* Self pledge */}
          <PledgeRow
            label="You (self-pledge)"
            sublabel={`Available: ${fmt(availableSavings)}`}
            pledge={form.selfPledgeAmount}
            maxAmount={availableSavings}
            onAmountChange={(v) => onChange({ selfPledgeAmount: v })}
            onMax={() => {
              const max = principal > 0 ? Math.min(availableSavings, principal) : availableSavings
              onChange({ selfPledgeAmount: max })
            }}
          />

          {/* Buddy pledges */}
          {form.buddyPledges.map((b, i) => (
            <PledgeRow
              key={b.userId}
              label={b.name}
              sublabel={`ID: ${b.studentId}  ·  Avail: ${fmt(b.availableSavings)}`}
              pledge={b.amount}
              maxAmount={b.availableSavings > 0
                ? (principal > 0 ? Math.min(b.availableSavings, principal) : b.availableSavings)
                : (principal > 0 ? principal : 0)}
              onAmountChange={(v) => updateBuddyAmount(i, v)}
              onMax={() => {
                const av = b.availableSavings
                const max = av > 0 ? (principal > 0 ? Math.min(av, principal) : av) : principal
                updateBuddyAmount(i, max)
              }}
              onRemove={() => removeBuddy(i)}
            />
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100 my-4" />

        {/* Buddy search */}
        {form.buddyPledges.length < 4 ? (
          <div>
            <p className="text-sm font-bold text-gray-800 mb-1">Invite a Co-signer</p>
            <p className="text-[11px] text-gray-400 mb-3">
              Enter their student ID. They will receive an invite to pledge their savings.
            </p>
            <div className="flex gap-2">
              <input
                id="buddy-id-input"
                type="text"
                placeholder="Student ID (e.g. 2021-0001)"
                value={buddyInput}
                onChange={(e) => setBuddyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && findBuddy()}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[var(--brand-green)]"
              />
              <button
                onClick={findBuddy}
                disabled={findingBuddy}
                className="px-4 py-2 bg-[var(--brand-green)] text-white rounded-xl text-sm font-bold disabled:opacity-60 hover:bg-[var(--brand-green-dark)] transition"
              >
                {findingBuddy ? '...' : '+'}
              </button>
            </div>
            {buddyError && <p className="text-xs text-red-500 mt-2">{buddyError}</p>}
          </div>
        ) : (
          <p className="text-xs text-orange-500 font-medium text-center">Maximum 4 co-signers reached.</p>
        )}
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="flex-1 py-4 rounded-2xl border border-gray-300 bg-white text-gray-800 font-bold hover:bg-gray-50 transition"
        >
          Back
        </button>
        <button
          id="step2-continue"
          onClick={handleContinue}
          className="flex-1 py-4 rounded-2xl bg-[var(--brand-green)] text-white font-bold hover:bg-[var(--brand-green-dark)] transition"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-extrabold tracking-widest text-gray-500 uppercase font-mono mb-1">
      {children}
    </p>
  )
}
function Row({ label, value, valueClass, bold }: { label: string; value: string; valueClass?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${bold ? 'font-bold text-gray-900' : 'text-gray-500'}`}>{label}</span>
      <span className={`text-sm ${bold ? 'font-extrabold text-gray-900' : 'font-semibold text-gray-800'} ${valueClass ?? ''}`}>
        {value}
      </span>
    </div>
  )
}
function Divider() {
  return <div className="border-t border-gray-100" />
}
