'use client'

import { ZapIcon, WalletIcon, SlidersIcon, CheckIcon } from 'lucide-react'
import type { User, StudentProfile } from '@/lib/types'
import type { ApplyFormState, LoanType } from '@/lib/apply-helpers'

interface Props {
  form: ApplyFormState
  profile: User | null
  studentProfile: StudentProfile | null
  onChange: (patch: Partial<ApplyFormState>) => void
  onNext: () => void
}

const LOAN_TYPES: {
  type: LoanType
  description: string
  icon: React.ReactNode
  color: string
  bg: string
}[] = [
  {
    type: 'Urgent',
    description: 'Processed in 1-2 days',
    icon: <ZapIcon size={22} />,
    color: 'text-red-500',
    bg: 'bg-red-50',
  },
  {
    type: 'Standard',
    description: 'Processed in 3-5 days',
    icon: <WalletIcon size={22} />,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
  {
    type: 'Flexible',
    description: 'Processed within one week',
    icon: <SlidersIcon size={22} />,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
  },
]

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-5">
      <p className="text-[10px] font-extrabold tracking-widest text-gray-500 mb-2 uppercase font-mono">
        {label}
      </p>
      <div className="w-full px-4 py-4 bg-white border border-gray-200 rounded-2xl text-sm text-gray-800">
        {value || '—'}
      </div>
    </div>
  )
}

function formatCourseYear(course: string | null, year: number | null) {
  if (!course && !year) return ''
  const c = course ? course.toUpperCase() : ''
  const num = year ?? 0
  const sfx = num === 1 ? 'ST' : num === 2 ? 'ND' : num === 3 ? 'RD' : 'TH'
  const y = num > 0 ? `${num}${sfx} YEAR` : ''
  return c && y ? `${c}, ${y}` : c || y
}

export default function Step1LoanType({ form, profile, studentProfile, onChange, onNext }: Props) {
  const fullName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim().toUpperCase()
    : ''

  function handleContinue() {
    const digits = form.mobile.replace(/\D/g, '')
    if (digits.length !== 10) {
      alert('Please enter a valid 10-digit mobile number (e.g. 9123456789).')
      return
    }
    onNext()
  }

  return (
    <div className="px-6 py-6 space-y-6">
      {/* Loan type */}
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 mb-5">Choose loan type</h2>
        <div className="space-y-4">
          {LOAN_TYPES.map(({ type, description, icon, color, bg }) => {
            const selected = form.loanType === type
            return (
              <button
                key={type}
                id={`loan-type-${type.toLowerCase()}`}
                onClick={() => onChange({ loanType: type })}
                className={[
                  'w-full flex items-center gap-4 p-4 rounded-3xl border-2 text-left transition-all',
                  selected
                    ? 'bg-white border-[var(--brand-green)] shadow-md shadow-green-100'
                    : 'bg-[var(--brand-card)] border-transparent',
                ].join(' ')}
              >
                <span className={`flex items-center justify-center w-12 h-12 rounded-2xl shrink-0 ${bg} ${color}`}>
                  {icon}
                </span>
                <div className="flex-1">
                  <p className="font-extrabold text-base text-gray-900">{type}</p>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">{description}</p>
                </div>
                {selected ? (
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[var(--brand-green)]">
                    <CheckIcon size={14} className="text-white" />
                  </span>
                ) : (
                  <span className="w-6 h-6 rounded-full border-2 border-gray-300 shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Your details */}
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 mb-5">Your details</h2>
        <ReadonlyField label="FULL NAME" value={fullName} />
        <ReadonlyField label="STUDENT ID" value={studentProfile?.student_id ?? ''} />
        <ReadonlyField
          label="COURSE & YEAR"
          value={formatCourseYear(studentProfile?.course ?? null, studentProfile?.year_level ?? null)}
        />

        {/* Mobile */}
        <div>
          <p className="text-[10px] font-extrabold tracking-widest text-gray-500 mb-2 uppercase font-mono">
            MOBILE NUMBER *
          </p>
          <div className="flex items-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-2xl">
            <span className="text-sm font-semibold text-gray-800">+63</span>
            <span className="text-gray-300 text-lg">|</span>
            <input
              id="apply-mobile"
              type="tel"
              maxLength={10}
              placeholder="9XX XXX XXXX"
              value={form.mobile}
              onChange={(e) => onChange({ mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })}
              className="flex-1 text-sm outline-none text-gray-800 bg-transparent"
            />
          </div>
          <p className="text-[10px] text-gray-400 font-mono mt-1">
            Enter 10 digits after +63 (e.g. 9123456789)
          </p>
        </div>
      </div>

      {/* Continue */}
      <button
        id="step1-continue"
        onClick={handleContinue}
        className="w-full flex items-center justify-center gap-2 py-5 rounded-2xl bg-[var(--brand-green)] text-white font-bold text-base hover:bg-[var(--brand-green-dark)] transition"
      >
        Continue →
      </button>
    </div>
  )
}
