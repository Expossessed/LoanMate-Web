'use client'

/**
 * Register Page — migrated from Flutter RegisterScreen
 *
 * Business rules preserved exactly:
 * 1. Account type: Student | Lender (Admin cannot self-register)
 * 2. Students require course + year level fields
 * 3. Students must upload a Study Load file (web: <input type="file">)
 * 4. AI evaluation flow: spinner (3 s) → approval dialog → actual signup
 * 5. Lenders skip the AI step entirely
 * 6. signUp() inserts: users → wallet → notifications → transactions → documents
 * 7. Duplicate student_id → toast + "Log In" action
 */

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  WalletIcon,
  SchoolIcon,
  BriefcaseIcon,
  BadgeIcon,
  UserIcon,
  BookOpenIcon,
  CalendarIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
  UploadCloudIcon,
  CheckCircleIcon,
  XIcon,
  SparklesIcon,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { toEmail } from '@/lib/types'
import { callGeminiEvaluate } from '@/lib/gemini-client'

// ─── Zod schema ───────────────────────────────────────────────────────────────

const registerSchema = z
  .object({
    accountType: z.enum(['Student', 'Lender']),
    studentId: z.string().min(1, 'Required'),
    firstName: z.string().min(1, 'Required'),
    lastName: z.string().min(1, 'Required'),
    course: z.string().optional(),
    yearLevel: z.string().optional(),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(1, 'Required'),
    agreeToTerms: z.boolean().refine((v) => v, 'You must accept the Terms & Conditions'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine(
    (d) => d.accountType !== 'Student' || (d.course && d.yearLevel),
    { message: 'Course and year level are required for students', path: ['course'] }
  )

type RegisterForm = z.infer<typeof registerSchema>

// ─── Sign-up function ─────────────────────────────────────────────────────────

async function signUp(values: RegisterForm, studyLoadFile: File | null) {
  const supabase = createClient()

  // 1. Create auth user
  const { data: auth, error: authErr } = await supabase.auth.signUp({
    email: toEmail(values.studentId),
    password: values.password,
  })
  if (authErr) {
    const msg = authErr.message.toLowerCase()
    if (msg.includes('already registered') || authErr.status === 422) {
      throw new Error('DUPLICATE')
    }
    throw new Error(authErr.message)
  }
  if (!auth.user) throw new Error('Sign up failed. Please try again.')
  if (!auth.session) throw new Error('NEEDS_CONFIRMATION')

  const userId = auth.user.id
  const isStudent = values.accountType === 'Student'

  // 2. Insert lean users row — role reflects actual account type
  const { error: userErr } = await supabase.from('users').insert({
    id: userId,
    first_name: values.firstName,
    last_name: values.lastName,
    role: isStudent ? 'student' : 'lender',
    is_lender: !isStudent,
    agreed_to_terms: true,
  })
  if (userErr) throw new Error(`Failed to create account: ${userErr.message}`)

  // 3. Upload document (Study Load for students, Valid ID for lenders)
  let requirementsUrl = ''
  if (studyLoadFile) {
    const ext = studyLoadFile.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const folder = isStudent ? 'study_load' : 'valid_id'
    const fileName = `${folder}_${userId}_${Date.now()}.${ext}`
    const bytes = await studyLoadFile.arrayBuffer()
    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(fileName, bytes, { contentType: studyLoadFile.type, upsert: true })
    if (!uploadErr) {
      requirementsUrl = supabase.storage.from('documents').getPublicUrl(fileName).data.publicUrl
    }
  }

  // 4a. Insert student_profiles — required for ALL account types.
  //     Lenders are university students too, so this row must always exist.
  //     For lenders: requirements_url stores the Study Load (if provided at registration).
  //     Requires RLS: allow insert with check (auth.uid() = id)
  const { error: spErr } = await supabase.from('student_profiles').insert({
    id: userId,
    student_id: values.studentId,
    course: values.course ?? null,
    year_level: values.yearLevel ? parseInt(values.yearLevel, 10) : null,
    enrollment_status: 'enrolled',
    has_forfeiture_history: false,
    // Students: their uploaded study load URL; lenders: null here (Valid ID goes to lender_profiles)
    requirements_url: isStudent ? (requirementsUrl || null) : null,
  })
  if (spErr) throw new Error(`Failed to save student profile: ${spErr.message}`)

  // 4b. Insert lender_profiles row (lenders only)
  //     requirements_url stores the Valid ID document URL.
  //     Requires RLS: allow insert with check (auth.uid() = id)
  if (!isStudent) {
    const { error: lpErr } = await supabase.from('lender_profiles').insert({
      id: userId,
      requirements_url: requirementsUrl || null,
    })
    if (lpErr) throw new Error(`Failed to save lender profile: ${lpErr.message}`)
  }

  // 5. Insert wallet — get back the id
  const { data: walletRow, error: walletErr } = await supabase
    .from('wallet')
    .insert({ user_id: userId, balance: 0, savings_goal: 0, current_savings: 0 })
    .select('id')
    .single()
  if (walletErr) console.warn('[signUp] wallet insert failed:', walletErr.message)
  const walletId = walletRow?.id as string | undefined

  // 6. Welcome notification (non-fatal)
  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'Welcome',
    message: `Welcome to LoanMate, ${values.firstName}! Your account is ready. Start by setting up your savings goal in the E-Wallet tab.`,
    is_read: false,
    created_at: new Date().toISOString(),
  }).then(() => {}, () => {})

  // 7. Init transaction (non-fatal)
  if (walletId) {
    await supabase.from('transactions').insert({
      wallet_id: walletId,
      type: 'init',
      amount: 0,
      date: new Date().toISOString(),
      description: 'Account Created',
    }).then(() => {}, () => {})
  }

  // 8. Record the uploaded document (non-fatal)
  if (requirementsUrl) {
    await supabase.from('documents').insert({
      user_id: userId,
      loan_id: null,
      file_url: requirementsUrl,
      uploaded_at: new Date().toISOString(),
    }).then(() => {}, () => {})
  }
}




// ─── AI Evaluation Dialog ─────────────────────────────────────────────────────

const AI_STEPS = [
  'Scanning study load document...',
  'Verifying student information...',
  'Running AI evaluation...',
]

function AiEvaluatingDialog({
  studyLoadFile,
  studentName,
  studentId,
  onApproved,
  onRejected,
}: {
  studyLoadFile: File | null
  studentName: string
  studentId: string
  onApproved: () => void
  onRejected: (reason: string) => void
}) {
  const [stepIdx, setStepIdx] = useState(0)
  const [dots, setDots] = useState(0)
  const [result, setResult] = useState<'pending' | 'approved' | 'rejected' | 'manual_review'>('pending')
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    // Cycle through steps visually
    const iv = setInterval(() => {
      setDots((d) => {
        const next = (d + 1) % 4
        if (next === 0) setStepIdx((s) => (s + 1) % AI_STEPS.length)
        return next
      })
    }, 700)

    // Call real Gemini
    const files = studyLoadFile
      ? [{ file: studyLoadFile, label: 'Study Load' }]
      : []

    callGeminiEvaluate({
      files,
      studentName,
      studentId,
      requestedAmount: 0,
      maxLoanCap: 50000,
      context: 'register',
    }).then((res) => {
      clearInterval(iv)
      if (res.recommendation === 'reject') {
        setRejectReason(res.reasoning)
        setResult('rejected')
      } else {
        // approve or manual_review both allow registration
        setResult(res.recommendation === 'approve' ? 'approved' : 'manual_review')
      }
    })

    return () => clearInterval(iv)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (result === 'rejected') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
          <XIcon size={52} className="mx-auto mb-4 text-red-500" />
          <h2 className="text-lg font-bold mb-3 text-red-600">Document Rejected</h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-6">{rejectReason}</p>
          <button
            id="ai-rejected-close-btn"
            onClick={() => onRejected(rejectReason)}
            className="w-full py-3 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  if (result === 'approved' || result === 'manual_review') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
          <CheckCircleIcon size={64} className="mx-auto mb-4 text-[var(--brand-green)]" />
          <h2 className="text-lg font-bold mb-3">AI Evaluation Approved</h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-6">
            {result === 'approved'
              ? 'Your Study Load has been verified. Your registration is approved.'
              : 'Your document will be manually reviewed. Registration will proceed.'}
          </p>
          <button
            id="ai-approved-continue-btn"
            onClick={onApproved}
            className="w-full py-3 rounded-xl bg-[var(--brand-green)] text-white font-bold text-sm hover:bg-[var(--brand-green-dark)] transition"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
      <div className="bg-white rounded-3xl px-8 py-9 max-w-sm w-full text-center shadow-2xl">
        <div className="mx-auto mb-6 w-16 h-16 relative">
          <svg className="animate-spin w-16 h-16 text-[var(--brand-green)]" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="5" strokeOpacity="0.2"/>
            <path d="M32 4a28 28 0 0 1 28 28" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/>
          </svg>
          <SparklesIcon size={20} className="absolute inset-0 m-auto text-[var(--brand-green)]" />
        </div>
        <h2 className="text-base font-bold mb-2">AI Evaluation in Progress</h2>
        <p className="text-sm text-gray-500 mb-1">
          {AI_STEPS[stepIdx]}{'.'.repeat(dots)}
        </p>
        <p className="text-xs text-gray-400">
          Please wait — this usually takes a few seconds.
        </p>
      </div>
    </div>
  )
}

// ─── Terms Dialog ─────────────────────────────────────────────────────────────

function TermsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-[var(--brand-green)]">Terms &amp; Conditions</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XIcon size={20} />
          </button>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">
          1. Use LoanMate responsibly.<br />
          2. All loan data is for UCLM CCS use only.<br />
          3. Personal information is kept confidential.<br />
          4. Misuse may result in account suspension.<br /><br />
          By creating an account you acknowledge these terms.
        </p>
        <button
          onClick={onClose}
          className="mt-5 w-full py-2.5 rounded-xl border border-[var(--brand-green)] text-[var(--brand-green)] font-semibold text-sm hover:bg-[var(--brand-green-50)] transition"
        >
          Close
        </button>
      </div>
    </div>
  )
}

// ─── Register Page ────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [studyLoadFile, setStudyLoadFile] = useState<File | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [aiApproved, setAiApproved] = useState(false)
  const pendingSubmitRef = useRef<RegisterForm | null>(null)

  const watchedValues = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { accountType: 'Student', agreeToTerms: false },
  })
  const { register, handleSubmit, watch, setValue, formState: { errors } } = watchedValues

  const accountType = watch('accountType')
  const agreeToTerms = watch('agreeToTerms')

  const mutation = useMutation({
    mutationFn: (values: RegisterForm) => signUp(values, studyLoadFile),
    onSuccess: () => {
      toast.success('Registration successful! Please log in.')
      router.replace('/login')
    },
    onError: (err: Error) => {
      if (err.message === 'DUPLICATE') {
        toast.error('This ID is already registered.', {
          action: { label: 'Log In', onClick: () => router.push('/login') },
        })
      } else if (err.message === 'NEEDS_CONFIRMATION') {
        toast.info('Check your email to confirm your account before logging in.')
      } else {
        toast.error(err.message || 'Registration failed.')
      }
    },
  })

  /** Called by the form submit handler */
  const onSubmit = (values: RegisterForm) => {
    // Students: require file + run AI step first
    if (values.accountType === 'Student' && !studyLoadFile) {
      toast.warning('Please upload your Study Load photo to continue.')
      return
    }
    if (values.accountType === 'Student' && !aiApproved) {
      pendingSubmitRef.current = values
      setShowAi(true)
      return
    }
    mutation.mutate(values)
  }

  /** Called when user clicks Continue in the AI Approved dialog */
  const handleAiApproved = () => {
    setShowAi(false)
    setAiApproved(true)
    if (pendingSubmitRef.current) {
      mutation.mutate(pendingSubmitRef.current)
      pendingSubmitRef.current = null
    }
  }

  /** Called when AI rejects the study load */
  const handleAiRejected = (reason: string) => {
    setShowAi(false)
    toast.error(`Document rejected: ${reason}`)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setStudyLoadFile(file)
    setAiApproved(false) // reset if file changes
  }

  return (
    <>
      {showAi && (
        <AiEvaluatingDialog
          studyLoadFile={studyLoadFile}
          studentName={`${watch('firstName')} ${watch('lastName')}`.trim()}
          studentId={watch('studentId')}
          onApproved={handleAiApproved}
          onRejected={handleAiRejected}
        />
      )}
      {showTerms && <TermsDialog onClose={() => setShowTerms(false)} />}

      <div className="min-h-screen lg:min-h-0 flex flex-col bg-gray-50">
        {/* ── Green app bar ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 pt-12 pb-5 bg-[var(--brand-green)]">
          <Link href="/login" className="text-white/80 hover:text-white text-sm font-medium">
            ← Back
          </Link>
          <h1 className="text-white font-bold text-base">Create Account</h1>
          <span className="w-12" />
        </div>

        <div className="flex-1 px-6 py-6 overflow-y-auto">
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <span className="flex items-center justify-center w-20 h-20 rounded-full bg-[var(--brand-green)] mb-3">
              <WalletIcon size={40} className="text-white" />
            </span>
            <p className="text-xl font-bold text-[var(--brand-green)] tracking-wide">LoanMate</p>
            <p className="text-sm text-gray-500 mt-1">Fill in your details to get started</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            {/* Account type toggle */}
            <p className="text-sm text-gray-700 mb-3">Choose your account type to get started</p>
            <div className="flex gap-1 p-1 bg-gray-200 rounded-2xl mb-6">
              {(['Student', 'Lender'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  id={`account-type-${type.toLowerCase()}`}
                  onClick={() => { setValue('accountType', type); setAiApproved(false) }}
                  className={[
                    'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl',
                    'text-sm font-semibold transition-all duration-200',
                    accountType === type
                      ? 'bg-white shadow text-[var(--brand-green)]'
                      : 'text-gray-500',
                  ].join(' ')}
                >
                  {type === 'Student' ? <SchoolIcon size={16} /> : <BriefcaseIcon size={16} />}
                  {type}
                </button>
              ))}
            </div>

            {/* Form card */}
            <div className="bg-white rounded-2xl shadow p-5 space-y-4">

              {/* ID field */}
              <Field
                id="reg-student-id"
                label={accountType === 'Student' ? 'Student ID' : 'ID Number'}
                placeholder={accountType === 'Student' ? 'Enter your Student ID' : 'Enter your ID Number'}
                Icon={BadgeIcon}
                error={errors.studentId?.message}
                {...register('studentId')}
              />

              {/* Name row */}
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="reg-first-name"
                  label="First Name"
                  placeholder="First"
                  Icon={UserIcon}
                  error={errors.firstName?.message}
                  {...register('firstName')}
                />
                <Field
                  id="reg-last-name"
                  label="Last Name"
                  placeholder="Last"
                  Icon={UserIcon}
                  error={errors.lastName?.message}
                  {...register('lastName')}
                />
              </div>

              {/* Course + Year — students only */}
              {accountType === 'Student' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    id="reg-course"
                    label="Course"
                    placeholder="e.g. BSCS"
                    Icon={BookOpenIcon}
                    error={errors.course?.message}
                    {...register('course')}
                  />
                  <Field
                    id="reg-year-level"
                    label="Year Level"
                    placeholder="e.g. 2"
                    Icon={CalendarIcon}
                    inputMode="numeric"
                    error={errors.yearLevel?.message}
                    {...register('yearLevel')}
                  />
                </div>
              )}

              {/* Password */}
              <PasswordField
                id="reg-password"
                label="Password"
                placeholder="Create a password"
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                error={errors.password?.message}
                {...register('password')}
              />
              <PasswordField
                id="reg-confirm-password"
                label="Confirm Password"
                placeholder="Re-enter your password"
                show={showConfirm}
                onToggle={() => setShowConfirm((v) => !v)}
                error={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />

              {/* Study load upload — students only */}
              {accountType === 'Student' && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <button
                    type="button"
                    id="study-load-upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                    className={[
                      'w-full rounded-xl border-2 p-4 transition-all duration-300 text-center',
                      studyLoadFile
                        ? 'border-[var(--brand-green)] bg-[var(--brand-green-50)]'
                        : 'border-[var(--brand-green)] border-dashed bg-gray-50 hover:bg-[var(--brand-green-50)]',
                    ].join(' ')}
                  >
                    {studyLoadFile ? (
                      <div className="flex flex-col items-center gap-1">
                        <CheckCircleIcon size={28} className="text-[var(--brand-green)]" />
                        <p className="text-sm font-semibold text-[var(--brand-green)]">
                          Study Load uploaded ✓
                        </p>
                        <p className="text-xs text-gray-400 truncate max-w-full px-4">
                          {studyLoadFile.name}
                        </p>
                        <p className="text-xs text-gray-400">Tap to change</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <UploadCloudIcon size={32} className="text-[var(--brand-green)]" />
                        <p className="text-sm font-bold text-[var(--brand-green)]">
                          Upload Study Load Photo *
                        </p>
                        <p className="text-xs text-gray-400">
                          Required for AI verification — tap to upload
                        </p>
                      </div>
                    )}
                  </button>
                </>
              )}

              {/* Terms & conditions */}
              <div className="flex items-start gap-3">
                <input
                  id="reg-agree-terms"
                  type="checkbox"
                  className="mt-0.5 w-4 h-4 accent-[var(--brand-green)] cursor-pointer"
                  {...register('agreeToTerms')}
                />
                <label htmlFor="reg-agree-terms" className="text-sm text-gray-700">
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={() => setShowTerms(true)}
                    className="text-[var(--brand-green)] font-semibold underline"
                  >
                    Terms &amp; Conditions
                  </button>
                </label>
              </div>
              {errors.agreeToTerms && (
                <p className="text-xs text-red-500 -mt-2">{errors.agreeToTerms.message}</p>
              )}

              {/* Submit */}
              <button
                id="register-submit-btn"
                type="submit"
                disabled={!agreeToTerms || mutation.isPending}
                className={[
                  'w-full py-3.5 rounded-xl font-semibold text-base transition-all',
                  agreeToTerms && !mutation.isPending
                    ? 'bg-[var(--brand-green)] text-white hover:bg-[var(--brand-green-dark)] active:scale-[0.98]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed',
                ].join(' ')}
              >
                {mutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25"/>
                      <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75"/>
                    </svg>
                    Creating account…
                  </span>
                ) : (
                  'Register'
                )}
              </button>

              {/* Login link */}
              <p className="text-center text-sm text-gray-500">
                Already have an account?{' '}
                <Link href="/login" className="text-[var(--brand-green)] font-semibold hover:underline">
                  Login
                </Link>
              </p>
            </div>

            <div className="h-10" />
          </form>
        </div>
      </div>
    </>
  )
}

// ─── Shared form field components ─────────────────────────────────────────────

import React from 'react'
import type { LucideIcon } from 'lucide-react'

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string
  label: string
  Icon: LucideIcon
  error?: string
}

const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ id, label, Icon, error, ...props }, ref) => (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-500 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand-green)]" />
        <input
          id={id}
          ref={ref}
          className={[
            'w-full pl-9 pr-4 py-3 rounded-xl border text-sm outline-none transition',
            'focus:border-[var(--brand-green)] focus:ring-2 focus:ring-[var(--brand-green)]/20',
            error ? 'border-red-400' : 'border-gray-200',
          ].join(' ')}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
)
Field.displayName = 'Field'

interface PasswordFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string
  label: string
  show: boolean
  onToggle: () => void
  error?: string
}

const PasswordField = React.forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ id, label, show, onToggle, error, ...props }, ref) => (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-500 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <LockIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand-green)]" />
        <input
          id={id}
          ref={ref}
          type={show ? 'text' : 'password'}
          className={[
            'w-full pl-9 pr-10 py-3 rounded-xl border text-sm outline-none transition',
            'focus:border-[var(--brand-green)] focus:ring-2 focus:ring-[var(--brand-green)]/20',
            error ? 'border-red-400' : 'border-gray-200',
          ].join(' ')}
          {...props}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
)
PasswordField.displayName = 'PasswordField'
