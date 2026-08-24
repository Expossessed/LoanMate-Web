'use client'

/**
 * Account Settings — /settings
 *
 * Shared by all account types. Sections shown depend on role:
 *  - All users:    Personal Details (edit), Change Password
 *  - Lenders only: Lender Account info (read-only summary from lender_profiles)
 *
 * Updates personal details via a direct users table update (no RPC needed —
 * the user can only update their own row, enforced by RLS).
 * Password change uses supabase.auth.updateUser().
 */

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useState } from 'react'
import {
  UserIcon,
  LockIcon,
  BriefcaseIcon,
  ChevronDownIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/types'
import type { LenderProfile, StudentProfile } from '@/lib/types'
import { useAuth } from '@/hooks/useAuth'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const detailsSchema = z.object({
  first_name: z.string().min(1, 'First name is required.'),
  last_name: z.string().min(1, 'Last name is required.'),
  address: z.string().optional(),
  contact_number: z
    .string()
    .regex(/^(09\d{9}|\+639\d{9}|)$/, 'Enter a valid PH number (e.g. 09XXXXXXXXX) or leave blank.')
    .optional(),
})
type DetailsForm = z.infer<typeof detailsSchema>

const passwordSchema = z
  .object({
    new_password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .regex(/[A-Z]/, 'Include at least one uppercase letter.')
      .regex(/[0-9]/, 'Include at least one number.'),
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Passwords do not match.',
    path: ['confirm_password'],
  })
type PasswordForm = z.infer<typeof passwordSchema>

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchLenderProfile(userId: string): Promise<LenderProfile | null> {
  const { data } = await createClient()
    .from('lender_profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data as LenderProfile | null
}

// ─── Mutations ────────────────────────────────────────────────────────────────

async function updateDetails(userId: string, values: DetailsForm) {
  const { error } = await createClient()
    .from('users')
    .update({
      first_name: values.first_name,
      last_name: values.last_name,
      address: values.address || null,
      contact_number: values.contact_number || null,
    })
    .eq('id', userId)
  if (error) throw new Error(error.message)
}

async function changePassword(values: PasswordForm) {
  const { error } = await createClient().auth.updateUser({
    password: values.new_password,
  })
  if (error) throw new Error(error.message)
}

// ─── Accordion section ────────────────────────────────────────────────────────

function Section({
  id,
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  id: string
  title: string
  icon: React.ReactNode
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        id={id}
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition"
      >
        <span className="flex items-center gap-3">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--brand-green-50)] text-[var(--brand-green)]">
            {icon}
          </span>
          <span className="font-bold text-gray-900">{title}</span>
        </span>
        <ChevronDownIcon
          size={18}
          className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-extrabold tracking-widest text-gray-500 uppercase mb-2">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

function TextInput({
  id,
  placeholder,
  type = 'text',
  hasError,
  rightSlot,
  ...rest
}: {
  id: string
  placeholder?: string
  type?: string
  hasError?: boolean
  rightSlot?: React.ReactNode
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        {...rest}
        className={[
          'w-full px-4 py-3.5 rounded-2xl border text-sm outline-none transition',
          'bg-[var(--brand-card)] focus:border-[var(--brand-green)] focus:ring-2 focus:ring-[var(--brand-green)]/20',
          hasError ? 'border-red-400' : 'border-gray-200',
          rightSlot ? 'pr-12' : '',
        ].join(' ')}
      />
      {rightSlot && (
        <span className="absolute right-4 top-1/2 -translate-y-1/2">{rightSlot}</span>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { profile, studentProfile } = useAuth()
  const userId = profile?.id
  const isLender = profile?.is_lender ?? false
  const qc = useQueryClient()

  const [openSection, setOpenSection] = useState<'details' | 'password' | 'lender' | null>(
    'details',
  )
  const toggle = (s: typeof openSection) =>
    setOpenSection((prev) => (prev === s ? null : s))

  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)

  // Lender profile (only fetched when is_lender)
  const { data: lenderProfile } = useQuery({
    queryKey: ['lender-profile', userId],
    queryFn: () => fetchLenderProfile(userId!),
    enabled: !!userId && isLender,
  })

  // ── Personal Details form ──────────────────────────────────────────────
  const detailsForm = useForm<DetailsForm>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      first_name: profile?.first_name ?? '',
      last_name: profile?.last_name ?? '',
      address: profile?.address ?? '',
      contact_number: profile?.contact_number ?? '',
    },
  })
  // Re-populate when profile loads
  const { reset: resetDetails } = detailsForm
  const detailsMutation = useMutation({
    mutationFn: (v: DetailsForm) => updateDetails(userId!, v),
    onSuccess: () => {
      toast.success('Personal details updated.')
      qc.invalidateQueries({ queryKey: ['auth'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Change Password form ───────────────────────────────────────────────
  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  })
  const passwordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      toast.success('Password changed successfully.')
      passwordForm.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-[var(--brand-green)] px-6 pt-12 pb-8">
        <p className="text-white/70 text-xs font-semibold tracking-widest uppercase mb-1">
          Account
        </p>
        <h1 className="text-white text-3xl font-bold">Settings</h1>
        <p className="text-white/70 text-sm mt-1">
          {profile?.first_name} {profile?.last_name}
          {studentProfile?.student_id && (
            <span className="ml-2 font-mono text-white/50">
              · {studentProfile.student_id}
            </span>
          )}
        </p>
      </div>

      {/* Sections */}
      <div className="px-6 py-6 max-w-2xl mx-auto space-y-4">

        {/* ── Personal Details ──────────────────────────────────────────── */}
        <Section
          id="settings-details-section"
          title="Personal Details"
          icon={<UserIcon size={18} />}
          open={openSection === 'details'}
          onToggle={() => toggle('details')}
        >
          <form
            onSubmit={detailsForm.handleSubmit((v) => detailsMutation.mutate(v))}
            className="space-y-4 pt-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="First Name" error={detailsForm.formState.errors.first_name?.message}>
                <TextInput
                  id="settings-first-name"
                  placeholder="Juan"
                  hasError={!!detailsForm.formState.errors.first_name}
                  {...detailsForm.register('first_name')}
                />
              </Field>
              <Field label="Last Name" error={detailsForm.formState.errors.last_name?.message}>
                <TextInput
                  id="settings-last-name"
                  placeholder="Dela Cruz"
                  hasError={!!detailsForm.formState.errors.last_name}
                  {...detailsForm.register('last_name')}
                />
              </Field>
            </div>

            <Field label="Address" error={detailsForm.formState.errors.address?.message}>
              <TextInput
                id="settings-address"
                placeholder="Street, Barangay, City"
                hasError={!!detailsForm.formState.errors.address}
                {...detailsForm.register('address')}
              />
            </Field>

            <Field
              label="Contact Number"
              error={detailsForm.formState.errors.contact_number?.message}
            >
              <TextInput
                id="settings-contact"
                placeholder="09XXXXXXXXX"
                type="tel"
                hasError={!!detailsForm.formState.errors.contact_number}
                {...detailsForm.register('contact_number')}
              />
            </Field>

            {/* Read-only student info */}
            {studentProfile && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {[
                  { label: 'Student ID', value: studentProfile.student_id },
                  { label: 'Course', value: studentProfile.course ?? '—' },
                  { label: 'Year Level', value: studentProfile.year_level ? `Year ${studentProfile.year_level}` : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-[var(--brand-card)] rounded-xl p-3">
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-0.5">
                      {label}
                    </p>
                    <p className="text-sm font-bold text-gray-700">{value}</p>
                  </div>
                ))}
              </div>
            )}

            <button
              id="settings-save-details"
              type="submit"
              disabled={detailsMutation.isPending}
              className={[
                'w-full py-3.5 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2',
                detailsMutation.isPending
                  ? 'bg-[var(--brand-green)] text-white opacity-70 cursor-wait'
                  : 'bg-[var(--brand-green)] text-white hover:bg-[var(--brand-green-dark)] active:scale-[0.98]',
              ].join(' ')}
            >
              {detailsMutation.isPending ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75" />
                  </svg>
                  Saving…
                </>
              ) : (
                <>
                  <CheckIcon size={16} />
                  Save Details
                </>
              )}
            </button>
          </form>
        </Section>

        {/* ── Change Password ───────────────────────────────────────────── */}
        <Section
          id="settings-password-section"
          title="Change Password"
          icon={<LockIcon size={18} />}
          open={openSection === 'password'}
          onToggle={() => toggle('password')}
        >
          <form
            onSubmit={passwordForm.handleSubmit((v) => passwordMutation.mutate(v))}
            className="space-y-4 pt-4"
          >
            <Field
              label="New Password"
              error={passwordForm.formState.errors.new_password?.message}
            >
              <TextInput
                id="settings-new-password"
                type={showNewPw ? 'text' : 'password'}
                placeholder="••••••••"
                hasError={!!passwordForm.formState.errors.new_password}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowNewPw((v) => !v)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {showNewPw ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                }
                {...passwordForm.register('new_password')}
              />
              <p className="text-xs text-gray-400 mt-1">
                Min 8 chars, 1 uppercase, 1 number.
              </p>
            </Field>

            <Field
              label="Confirm Password"
              error={passwordForm.formState.errors.confirm_password?.message}
            >
              <TextInput
                id="settings-confirm-password"
                type={showConfirmPw ? 'text' : 'password'}
                placeholder="••••••••"
                hasError={!!passwordForm.formState.errors.confirm_password}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw((v) => !v)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPw ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                }
                {...passwordForm.register('confirm_password')}
              />
            </Field>

            <button
              id="settings-change-password"
              type="submit"
              disabled={passwordMutation.isPending}
              className={[
                'w-full py-3.5 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2',
                passwordMutation.isPending
                  ? 'bg-[var(--brand-green)] text-white opacity-70 cursor-wait'
                  : 'bg-[var(--brand-green)] text-white hover:bg-[var(--brand-green-dark)] active:scale-[0.98]',
              ].join(' ')}
            >
              {passwordMutation.isPending ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75" />
                  </svg>
                  Updating…
                </>
              ) : (
                <>
                  <LockIcon size={16} />
                  Update Password
                </>
              )}
            </button>
          </form>
        </Section>

        {/* ── Lender Account (is_lender only) ──────────────────────────── */}
        {isLender && (
          <Section
            id="settings-lender-section"
            title="Lender Account"
            icon={<BriefcaseIcon size={18} />}
            open={openSection === 'lender'}
            onToggle={() => toggle('lender')}
          >
            {!lenderProfile ? (
              <div className="space-y-3 pt-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse h-12 bg-gray-100 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="pt-4 space-y-4">
                {/* Status badge */}
                <div className="flex items-center gap-3">
                  <span className={[
                    'inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border',
                    lenderProfile.is_active
                      ? 'text-green-700 bg-green-50 border-green-200'
                      : 'text-red-700 bg-red-50 border-red-200',
                  ].join(' ')}>
                    {lenderProfile.is_active ? 'Active Lender' : 'Paused'}
                  </span>
                  {lenderProfile.organization && (
                    <span className="text-sm text-gray-500">{lenderProfile.organization}</span>
                  )}
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Authorized Limit', value: formatCurrency(lenderProfile.authorized_limit) },
                    { label: 'Total Contributed', value: formatCurrency(lenderProfile.total_contributed) },
                    { label: 'Total Deposited', value: formatCurrency(lenderProfile.total_deposited) },
                    { label: 'Total Paid Out', value: formatCurrency(lenderProfile.total_paid_out) },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-[var(--brand-card)] rounded-xl p-3">
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-0.5">
                        {label}
                      </p>
                      <p className="text-sm font-bold text-gray-800">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-[var(--brand-card)] rounded-xl p-3">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-0.5">
                    Member Since
                  </p>
                  <p className="text-sm font-bold text-gray-800">
                    {new Date(lenderProfile.joined_at).toLocaleDateString('en-PH', {
                      year: 'numeric', month: 'long', day: 'numeric',
                    })}
                  </p>
                </div>

                <p className="text-xs text-gray-400">
                  To update your organization name or authorized limit, contact your admin.
                </p>
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  )
}
