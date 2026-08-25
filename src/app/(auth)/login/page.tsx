'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ShieldIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  SchoolIcon,
  BriefcaseIcon,
  ShieldCheckIcon,
  LogInIcon,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { toEmail } from '@/lib/types'


const loginSchema = z.object({
  studentId: z.string().min(1, 'Please enter your ID.'),
  password: z.string().min(1, 'Please enter your password.'),
})

type LoginForm = z.infer<typeof loginSchema>


const MAX_ATTEMPTS = 5
const LOCKOUT_SECONDS = 300



async function signIn(data: LoginForm): Promise<{ role: string }> {
  const supabase = createClient()


  try {
    const exists = await supabase.rpc('check_student_exists', {
      p_student_id: data.studentId,
    })
    if (exists.data === false) {
      throw new Error('NO_ACCOUNT')
    }
  } catch (e) {
    if ((e as Error).message === 'NO_ACCOUNT') throw e
 
  }

  // Check lockout status in login_attempts table
  const { data: attempt } = await supabase
    .from('login_attempts')
    .select('attempt_count, locked_until')
    .eq('student_id', data.studentId)
    .maybeSingle()

  if (attempt?.locked_until) {
    const lockedUntil = new Date(attempt.locked_until)
    if (lockedUntil > new Date()) {
      const remaining = Math.ceil((lockedUntil.getTime() - Date.now()) / 1000)
      throw new Error(`LOCKED:${remaining}`)
    }
  }

  // Attempt authentication
  const { data: auth, error } = await supabase.auth.signInWithPassword({
    email: toEmail(data.studentId),
    password: data.password,
  })

  if (error || !auth.user) {
    // Record failed attempt
    const currentCount = attempt?.attempt_count ?? 0
    const newCount = currentCount + 1
    const lockedUntil =
      newCount >= MAX_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_SECONDS * 1000).toISOString()
        : null

    await supabase.from('login_attempts').upsert(
      {
        student_id: data.studentId,
        attempt_count: newCount,
        last_attempt_at: new Date().toISOString(),
        locked_until: lockedUntil,
      },
      { onConflict: 'student_id' }
    )

    if (newCount >= MAX_ATTEMPTS) {
      throw new Error(`LOCKED:${LOCKOUT_SECONDS}`)
    }
    const remaining = MAX_ATTEMPTS - newCount
    throw new Error(
      `WRONG_PASSWORD:${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
    )
  }

  // Success, clears attempts and fetch role
  await supabase
    .from('login_attempts')
    .delete()
    .eq('student_id', data.studentId)

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', auth.user.id)
    .single()

  return { role: profile?.role ?? 'student' }
}

type LoginRole = 'Student' | 'Lender' | 'Admin'

const roleOptions: { label: LoginRole; Icon: React.ElementType }[] = [
  { label: 'Student', Icon: SchoolIcon },
  { label: 'Lender', Icon: BriefcaseIcon },
  { label: 'Admin', Icon: ShieldCheckIcon },
]

function RoleToggle({
  selected,
  onChange,
}: {
  selected: LoginRole
  onChange: (r: LoginRole) => void
}) {
  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl">
      {roleOptions.map(({ label, Icon }) => {
        const isActive = selected === label
        return (
          <button
            key={label}
            type="button"
            id={`role-toggle-${label.toLowerCase()}`}
            onClick={() => onChange(label)}
            className={[
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl',
              'text-sm font-semibold transition-all duration-200',
              isActive
                ? 'bg-white shadow-sm text-[var(--brand-green)]'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            <Icon size={15} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}


function formatCountdown(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  if (m > 0) return `Try again in ${m}m ${String(s).padStart(2, '0')}s`
  return `Try again in ${s}s`
}



export default function LoginPage() {
  const router = useRouter()

  const [loginRole, setLoginRole] = useState<LoginRole>('Student')
  const [showPassword, setShowPassword] = useState(false)

  const [lockedSeconds, setLockedSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isLocked = lockedSeconds > 0

  const startLockout = (seconds: number) => {
    setLockedSeconds(seconds)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setLockedSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const mutation = useMutation({
    mutationFn: signIn,
    onSuccess: ({ role }) => {
      if (role === 'admin' || role === 'finance_officer') {
        router.replace('/admin/loans')
      } else {
        router.replace('/home')
      }
    },
    onError: (error: Error) => {
      const msg = error.message

      if (msg === 'NO_ACCOUNT') {
        toast.warning('No account found for this ID. Please register first.', {
          action: { label: 'Register', onClick: () => router.push('/register') },
        })
        return
      }

      if (msg.startsWith('LOCKED:')) {
        const secs = parseInt(msg.split(':')[1], 10)
        startLockout(secs)
        toast.error('Account temporarily locked. Too many failed attempts.')
        return
      }

      if (msg.startsWith('WRONG_PASSWORD:')) {
        toast.error(msg.replace('WRONG_PASSWORD:', ''))
        return
      }

      toast.error(msg || 'Login failed. Please try again.')
    },
  })

  const idLabel =
    loginRole === 'Student'
      ? 'STUDENT ID'
      : loginRole === 'Admin'
        ? 'ADMIN ID'
        : 'ID NUMBER'

  const idPlaceholder =
    loginRole === 'Student'
      ? 'Enter your Student ID'
      : loginRole === 'Admin'
        ? 'Enter your Admin ID'
        : 'Enter your ID Number'

  return (
    <div className="min-h-screen lg:min-h-0 flex flex-col bg-white">
      <div
        className="
          px-8 pt-16 pb-10
          bg-[var(--brand-green)]
          rounded-br-[80px]
        "
      >
        <div className="flex items-center gap-3 mb-10">
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-[var(--brand-orange)]">
            <ShieldIcon size={18} className="text-white" />
          </span>
          <span className="text-white text-lg font-bold tracking-wide">LoanMate</span>
        </div>

        <h1 className="text-white font-bold text-4xl leading-tight tracking-tight">
          Your money,
          <br />
          your future.
        </h1>
        <p className="mt-4 text-white/70 text-base">
          UCLM Student Financial Services
        </p>
      </div>

      <div className="flex-1 px-8 pt-8 pb-10 bg-white">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-7">
          Log in to your account
        </h2>
        {isLocked && (
          <div className="mb-5 flex items-start gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50">
            <LockIcon size={18} className="mt-0.5 shrink-0 text-red-600" />
            <p className="text-sm font-semibold text-red-700 leading-snug">
              Account temporarily locked.
              <br />
              {formatCountdown(lockedSeconds)}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} noValidate>
          {/* Role toggle */}
          <div className="mb-6">
            <RoleToggle selected={loginRole} onChange={setLoginRole} />
          </div>

          {/* Student / Lender / Admin ID field */}
          <div className="mb-5">
            <label
              htmlFor="login-student-id"
              className="block text-xs font-semibold text-gray-400 tracking-widest uppercase mb-2"
            >
              {idLabel}
            </label>
            <input
              id="login-student-id"
              type="text"
              placeholder={idPlaceholder}
              disabled={isLocked}
              {...register('studentId')}
              className={[
                'w-full px-5 py-4 rounded-2xl border text-sm',
                'bg-[var(--brand-card)] outline-none transition',
                'focus:border-[var(--brand-green)] focus:ring-2 focus:ring-[var(--brand-green)]/20',
                isLocked
                  ? 'opacity-50 cursor-not-allowed border-gray-200'
                  : 'border-gray-200 hover:border-gray-300',
                errors.studentId ? 'border-red-400' : '',
              ].join(' ')}
            />
            {errors.studentId && (
              <p className="mt-1 text-xs text-red-500">{errors.studentId.message}</p>
            )}
          </div>

          {/* Password field */}
          <div className="mb-3">
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold text-gray-400 tracking-widest uppercase mb-2"
            >
              PASSWORD
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                disabled={isLocked}
                {...register('password')}
                className={[
                  'w-full px-5 py-4 pr-12 rounded-2xl border text-sm',
                  'bg-[var(--brand-card)] outline-none transition',
                  'focus:border-[var(--brand-green)] focus:ring-2 focus:ring-[var(--brand-green)]/20',
                  isLocked
                    ? 'opacity-50 cursor-not-allowed border-gray-200'
                    : 'border-gray-200 hover:border-gray-300',
                  errors.password ? 'border-red-400' : '',
                ].join(' ')}
              />
              <button
                type="button"
                id="toggle-password-visibility"
                disabled={isLocked}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
            )}
          </div>

          {/* Forgot password */}
          <div className="flex justify-end mb-6">
            <button
              type="button"
              id="forgot-password-btn"
              className="text-sm font-bold text-[var(--brand-green)] hover:underline"
            >
              Forgot password?
            </button>
          </div>

          {/* Submit button */}
          <button
            id="login-submit-btn"
            type="submit"
            disabled={mutation.isPending || isLocked}
            className={[
              'w-full h-14 rounded-2xl font-bold text-base transition-all duration-200',
              isLocked
                ? 'bg-red-100 text-red-400 cursor-not-allowed flex items-center justify-center gap-2'
                : mutation.isPending
                  ? 'bg-[var(--brand-green)] text-white opacity-70 cursor-wait'
                  : 'bg-[var(--brand-green)] text-white hover:bg-[var(--brand-green-dark)] active:scale-[0.98]',
            ].join(' ')}
          >
            {mutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Logging in…
              </span>
            ) : isLocked ? (
              <>
                <LockIcon size={16} />
                {formatCountdown(lockedSeconds)}
              </>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <LogInIcon size={18} />
                Log In
              </span>
            )}
          </button>
        </form>

        {/* Register link */}
        <p className="mt-7 text-center text-sm text-gray-500">
          New student?{' '}
          <Link
            href="/register"
            className="font-extrabold text-[var(--brand-green)] hover:underline"
          >
            Create Account
          </Link>
        </p>
      </div>
    </div>
  )
}
