'use client'

import { UploadIcon, CheckCircleIcon } from 'lucide-react'
import { calcLoan, fmt, type ApplyFormState } from '@/lib/apply-helpers'

interface Props {
  form: ApplyFormState
  isSubmitting: boolean
  onChange: (patch: Partial<ApplyFormState>) => void
  onSubmit: () => void
  onBack: () => void
}

function DocCard({
  id,
  title,
  file,
  onFile,
}: {
  id: string
  title: string
  file: File | null
  onFile: (f: File) => void
}) {
  const uploaded = file !== null

  return (
    <label
      htmlFor={id}
      className={[
        'flex items-center gap-4 p-4 rounded-2xl border cursor-pointer mb-3 transition',
        uploaded
          ? 'bg-green-50/50 border-[var(--brand-green)]/40'
          : 'bg-white border-gray-200 hover:border-gray-300',
      ].join(' ')}
    >
      <div
        className={[
          'w-12 h-12 flex items-center justify-center rounded-xl shrink-0',
          uploaded ? 'bg-green-100' : 'bg-gray-100',
        ].join(' ')}
      >
        {uploaded ? (
          <img
            src={URL.createObjectURL(file!)}
            alt={title}
            className="w-full h-full object-cover rounded-xl"
          />
        ) : (
          <UploadIcon size={20} className="text-gray-400" />
        )}
      </div>
      <div className="flex-1">
        <p className="font-bold text-sm text-gray-900">{title}</p>
        <p className={`text-[11px] font-mono mt-0.5 ${uploaded ? 'text-[var(--brand-green)]' : 'text-gray-400'}`}>
          Required · {uploaded ? `Uploaded ✓` : 'Tap to upload'}
        </p>
      </div>
      {uploaded ? (
        <CheckCircleIcon size={20} className="text-[var(--brand-green)] shrink-0" />
      ) : (
        <span className="text-gray-300 shrink-0">›</span>
      )}
      <input
        id={id}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
        }}
      />
    </label>
  )
}

export default function Step3Documents({ form, isSubmitting, onChange, onSubmit, onBack }: Props) {
  const principal = parseFloat(form.amount.replace(/,/g, '')) || 0
  const { monthly, penaltyRate, penalty } = calcLoan(principal, form.repaymentTerm)

  function handleSubmit() {
    if (!form.schoolIdFile || !form.assessmentFile) {
      alert('Please upload all required documents before submitting.')
      return
    }
    onSubmit()
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 mb-1">Upload documents</h2>
        <p className="text-sm text-gray-500">Upload clear, legible copies of each required file.</p>
      </div>

      <div>
        <DocCard
          id="doc-school-id"
          title="School ID"
          file={form.schoolIdFile}
          onFile={(f) => onChange({ schoolIdFile: f })}
        />
        <DocCard
          id="doc-assessment"
          title="Assessment Slip"
          file={form.assessmentFile}
          onFile={(f) => onChange({ assessmentFile: f })}
        />
      </div>

      {/* Auto-deduct notice */}
      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
        <p className="text-[10px] font-extrabold tracking-widest text-orange-800 uppercase mb-2">
          Auto-Deduct Active
        </p>
        <p className="text-xs text-orange-900 leading-relaxed">
          Monthly repayments of <strong>{fmt(monthly)}</strong> will be automatically deducted
          from your E-Wallet every 15th of the month. Missed payments incur a{' '}
          <strong>{Math.round(penaltyRate * 100)}%</strong> penalty ({fmt(penalty)}).
        </p>
      </div>

      {/* Buttons */}
      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="flex-1 py-4 rounded-2xl border border-gray-300 bg-white text-gray-800 font-bold hover:bg-gray-50 transition"
        >
          Back
        </button>
        <button
          id="submit-application"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex-1 py-4 rounded-2xl bg-[var(--brand-green)] text-white font-bold hover:bg-[var(--brand-green-dark)] transition disabled:opacity-60 flex items-center justify-center"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Submitting...
            </span>
          ) : (
            'Submit Application'
          )}
        </button>
      </div>
    </div>
  )
}
