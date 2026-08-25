'use client'


import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircleIcon, XCircleIcon, ClockIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import {
  INITIAL_FORM,
  fmt,
  type ApplyFormState,
  type AiResult,
} from '@/lib/apply-helpers'
import { callGeminiEvaluate } from '@/lib/gemini-client'
import Step1LoanType from '@/components/apply/Step1LoanType'
import Step2LoanDetails from '@/components/apply/Step2LoanDetails'
import Step3Documents from '@/components/apply/Step3Documents'



function StepBar({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div>
      <div className="flex gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={[
              'flex-1 h-1 rounded-full transition-colors duration-300',
              s <= current ? 'bg-red-400' : 'bg-white/20',
            ].join(' ')}
          />
        ))}
      </div>
      <p className="text-[11px] font-mono text-white/60 mt-2">Step {current} of 3</p>
    </div>
  )
}



function AiResultDialog({
  result,
  onClose,
}: {
  result: AiResult
  onClose: () => void
}) {
  const isApprove = result.recommendation === 'approve'
  const isReject = result.recommendation === 'reject'

  const title = isApprove
    ? 'Application Pre-Approved'
    : isReject
    ? 'Application Rejected'
    : 'Pending Manual Review'

  const subtitle = isApprove
    ? 'Your loan application has been pre-approved by our AI system and will be reviewed by an admin.'
    : isReject
    ? `Your application was not approved at this time. ${result.reasoning ?? ''}`
    : `Your application has been submitted for manual review. ${result.reasoning ?? ''}`

  const accent = isApprove
    ? 'bg-[var(--brand-green)]'
    : isReject
    ? 'bg-red-500'
    : 'bg-orange-500'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4">
      <div className="bg-white w-full max-w-sm rounded-3xl p-7 shadow-2xl flex flex-col items-center gap-4 text-center">
        <div
          className={`flex items-center justify-center w-16 h-16 rounded-full ${
            isApprove
              ? 'bg-green-100'
              : isReject
              ? 'bg-red-100'
              : 'bg-orange-100'
          }`}
        >
          {isApprove ? (
            <CheckCircleIcon size={36} className="text-[var(--brand-green)]" />
          ) : isReject ? (
            <XCircleIcon size={36} className="text-red-500" />
          ) : (
            <ClockIcon size={36} className="text-orange-500" />
          )}
        </div>
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        {result.riskScore > 0 && (
          <p className={`text-xs font-bold font-mono ${isApprove ? 'text-[var(--brand-green)]' : isReject ? 'text-red-600' : 'text-orange-600'}`}>
            Risk score: {Math.round(result.riskScore * 100)}%
          </p>
        )}
        <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-line">{subtitle}</p>
        <button
          id="ai-result-done"
          onClick={onClose}
          className={`w-full py-3 rounded-2xl text-white font-bold text-sm transition ${accent} hover:opacity-90`}
        >
          Done
        </button>
      </div>
    </div>
  )
}



function AiSpinner() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <div className="bg-white rounded-3xl p-8 w-full max-w-xs shadow-2xl flex flex-col items-center gap-4">
        <svg className="animate-spin h-10 w-10 text-[var(--brand-green)]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <p className="text-base font-bold text-gray-800">Evaluating your application…</p>
        <p className="text-sm text-gray-400 text-center">Our AI is reviewing your documents. This takes a few seconds.</p>
      </div>
    </div>
  )
}



export default function ApplyPage() {
  const { profile, studentProfile, isLoading: authLoading } = useAuth()
  const router = useRouter()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [form, setForm] = useState<ApplyFormState>(INITIAL_FORM)
  const [availableSavings, setAvailableSavings] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [aiReviewing, setAiReviewing] = useState(false)
  const [aiResult, setAiResult] = useState<AiResult | null>(null)


  const isLender = profile?.is_lender ?? false
  useEffect(() => {
    if (!authLoading && isLender) {
      router.replace('/lender/fund-loan')
    }
  }, [authLoading, isLender, router])


  const fetchWalletBalance = useCallback(async () => {
    if (!profile?.id) return
    const supabase = createClient()
    const { data } = await supabase
      .from('wallet')
      .select('current_savings, held_amount')
      .eq('user_id', profile.id)
      .maybeSingle()
    const savings = Number(data?.current_savings ?? 0)
    const held = Number(data?.held_amount ?? 0)
    setAvailableSavings(Math.max(savings - held, 0))
  }, [profile?.id])

  useEffect(() => {
    fetchWalletBalance()
  }, [fetchWalletBalance])


  if (!authLoading && isLender) return null

  
  const handleSubmit = async () => {
    const schoolIdFile = form.schoolIdFile
    const assessmentFile = form.assessmentFile
    if (!profile || !studentProfile) return
    setIsSubmitting(true)

    const supabase = createClient()

    try {
      //Insert loan
      const { data: loanRow, error: loanErr } = await supabase
        .from('loans')
        .insert({
          user_id: profile.id,
          amount: Number(form.amount),
          purpose: form.purpose.trim(),
          loan_type: form.loanType,
          status: 'pending',
          ai_evaluation: 'pending',
          collateral_pool: form.buddyPledges.map(p => p.studentId),
        })
        .select('id')
        .single()
      if (loanErr || !loanRow) throw new Error(loanErr?.message ?? 'Loan insert failed')
      const loanId = loanRow.id as string

      //self pledge
      await supabase.from('loan_pledges').insert({
        loan_id: loanId,
        pledger_id: profile.id,
        borrower_self: true,
        amount: form.selfPledgeAmount,
        status: 'accepted',
      })

      //Lock self pledge
      await supabase.rpc('lock_self_pledge', { p_loan_id: loanId, p_user_id: profile.id })

      //Upload documents
      const uploadDoc = async (file: File, folder: string) => {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
        const name = `${folder}_${loanId}_${Date.now()}.${ext}`
        const bytes = await file.arrayBuffer()
        const { error } = await supabase.storage
          .from('documents')
          .upload(name, bytes, { contentType: file.type, upsert: true })
        if (!error) {
          const url = supabase.storage.from('documents').getPublicUrl(name).data.publicUrl
          await supabase.from('documents').insert({
            user_id: profile.id,
            loan_id: loanId,
            file_url: url,
            uploaded_at: new Date().toISOString(),
          })
          return url
        }
        return null
      }

      const schoolIdUrl = schoolIdFile ? await uploadDoc(schoolIdFile, 'school_id') : null
      const assessmentUrl = assessmentFile ? await uploadDoc(assessmentFile, 'assessment') : null

      //AI evaluation
      setIsSubmitting(false)
      setAiReviewing(true)

      let aiDecision: AiResult = { recommendation: 'manual_review', reasoning: '', riskScore: 0 }
      try {
        const files: { file: File; label: string }[] = []
        if (schoolIdFile) files.push({ file: schoolIdFile, label: 'school_id' })
        if (assessmentFile) files.push({ file: assessmentFile, label: 'assessment' })

        aiDecision = await callGeminiEvaluate({
          files,
          studentName: `${profile.first_name} ${profile.last_name}`,
          studentId: studentProfile.student_id,
          requestedAmount: Number(form.amount),
          context: 'loan',
        })
      } catch (err) {
        console.warn('[AI Evaluation Error]', err)
        aiDecision = { recommendation: 'manual_review', reasoning: 'AI unavailable, flagged for manual review.', riskScore: 0 }
      }

      //AI result
      await supabase.rpc('set_loan_ai_evaluation', {
        p_loan_id: loanId,
        p_evaluation: aiDecision.recommendation,
      })

      setAiReviewing(false)
      setAiResult(aiDecision)
    } catch (e) {
      setIsSubmitting(false)
      setAiReviewing(false)
      alert(`Submission failed: ${(e as Error).message}`)
    }
  }

  const handleResultClose = () => {
    setAiResult(null)
    setStep(1)
    setForm(INITIAL_FORM)
    fetchWalletBalance()
  }

  return (
    <>
      {aiReviewing && <AiSpinner />}
      {aiResult && <AiResultDialog result={aiResult} onClose={handleResultClose} />}

      <div className="min-h-screen">

        <div className="bg-[var(--brand-green)] px-6 pt-12 pb-8">
          <h1 className="text-white text-2xl font-bold mb-4">Loan Application</h1>
          <StepBar current={step} />
        </div>

        {/* loan application steps */}
        <div className="px-6 py-6 max-w-2xl mx-auto">
          {step === 1 && (
            <Step1LoanType
              form={form}
              onChange={(updates) => setForm((f) => ({ ...f, ...updates }))}
              onNext={() => setStep(2)}
              profile={profile}
              studentProfile={studentProfile}
            />
          )}
          {step === 2 && (
            <Step2LoanDetails
              form={form}
              onChange={(updates) => setForm((f) => ({ ...f, ...updates }))}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
              availableSavings={availableSavings}
              onRefreshSavings={fetchWalletBalance}
            />
          )}
          {step === 3 && (
            <Step3Documents
              form={form}
              onChange={(updates) => setForm((f) => ({ ...f, ...updates }))}
              onBack={() => setStep(2)}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      </div>
    </>
  )
}
