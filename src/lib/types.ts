/**
 * TypeScript types for LoanMate — matching the Supabase DB schema exactly.
 *
 * Rules:
 * - Field names use snake_case to mirror the database columns (no mapping layer needed).
 * - Use `| null` for nullable columns.
 * - Enums are represented as string union types.
 * - Do NOT redefine these per-feature — import from here instead.
 */

// ─── Auth / Users ──────────────────────────────────────────────────────────────

/** The role a user can have in the system. */
export type UserRole = 'student' | 'lender' | 'admin' | 'finance_officer'

/**
 * Row from the `users` table — lean base identity shared by every account type.
 * Linked 1:1 to Supabase Auth's `auth.users` by `id`.
 */
export interface User {
  id: string
  first_name: string
  last_name: string
  address: string | null
  contact_number: string | null
  role: UserRole
  /** True when the user also acts as a lender (has a lender_profiles row). */
  is_lender: boolean
  agreed_to_terms: boolean
  created_at: string
}

/**
 * Row from the `student_profiles` table.
 * One row per user where role = 'student' OR role = 'lender'
 * (every lender is also a university student).
 */
export interface StudentProfile {
  id: string                          // FK → users.id
  student_id: string                  // school-issued Student ID
  course: string | null
  year_level: number | null
  enrollment_status: string           // default 'enrolled'
  has_forfeiture_history: boolean
  /** URL to the uploaded Study Load document. */
  requirements_url: string | null
  created_at: string
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

/** Row from the `wallet` table (one per user). */
export interface Wallet {
  id: string
  user_id: string
  balance: number
  savings_goal: number
  current_savings: number
  /** Amount locked/frozen to back a pending loan pledge. */
  held_amount: number
  monthly_savings_amount: number
  /** Whether automatic monthly deductions are active. */
  savings_deduction_active: boolean
  updated_at: string
}

// ─── Transactions ─────────────────────────────────────────────────────────────

/** Row from the `transactions` table. */
export interface Transaction {
  id: string
  wallet_id: string
  type: string
  amount: number
  date: string
  description: string | null
  created_at: string
}

// ─── Loans ────────────────────────────────────────────────────────────────────

export type LoanStatus = 'pending' | 'approved' | 'rejected'
export type AiEvaluation = 'pending' | 'approve' | 'reject' | 'manual_review'
export type LoanType = 'Urgent' | 'Standard' | 'Flexible'

/** Row from the `loans` table. */
export interface Loan {
  id: string
  user_id: string
  amount: number
  purpose: string
  loan_type: LoanType
  status: LoanStatus
  ai_evaluation: AiEvaluation
  collateral_pool: number
  /** ISO date string for when the loan was submitted. */
  created_at: string
  updated_at: string
}

// ─── Active Loans ─────────────────────────────────────────────────────────────

/** Row from the `active_loans` table (loan after approval). */
export interface ActiveLoan {
  id: string
  loan_id: string
  user_id: string
  principal: number
  outstanding_balance: number
  interest_rate: number
  start_date: string
  due_date: string
  status: 'active' | 'paid' | 'overdue'
}

// ─── Repayment Schedule ───────────────────────────────────────────────────────

/** Row from the `repayment_schedule` table. */
export interface RepaymentSchedule {
  id: string
  active_loan_id: string
  due_date: string
  amount_due: number
  amount_paid: number
  status: 'pending' | 'paid' | 'overdue'
}

// ─── Pledges ──────────────────────────────────────────────────────────────────

export type PledgeStatus = 'pending' | 'accepted' | 'declined' | 'forfeited' | 'released'

/** Row from the `loan_pledges` table. */
export interface LoanPledge {
  id: string
  loan_id: string
  pledger_id: string
  amount: number
  status: PledgeStatus
  /** True when this pledge is the borrower's own self-collateral. */
  borrower_self: boolean
  created_at: string
}

// ─── Pledge Forfeitures ───────────────────────────────────────────────────────

/** Row from the `pledge_forfeitures` table. */
export interface PledgeForfeiture {
  id: string
  pledge_id: string
  loan_id: string
  pledger_id: string
  amount: number
  reason: string | null
  created_at: string
}

// ─── Documents ────────────────────────────────────────────────────────────────

/** Row from the `documents` table. */
export interface Document {
  id: string
  user_id: string
  loan_id: string | null
  file_url: string
  uploaded_at: string
}

// ─── Notifications ────────────────────────────────────────────────────────────

/** Row from the `notifications` table. */
export interface Notification {
  id: string
  user_id: string
  type: string
  message: string
  is_read: boolean
  created_at: string
}

// ─── Login Attempts (lockout) ─────────────────────────────────────────────────

/**
 * Row from the `login_attempts` table.
 * Keyed by student_id (from student_profiles) for lockout tracking.
 */
export interface LoginAttempt {
  student_id: string
  attempt_count: number
  last_attempt_at: string
  /** ISO date string — null if not currently locked. */
  locked_until: string | null
}

// ─── Lender ───────────────────────────────────────────────────────────────────

/**
 * Row from the `lender_profiles` table.
 * One row per user where is_lender = true.
 */
export interface LenderProfile {
  id: string                          // FK → users.id
  organization: string | null
  authorized_limit: number
  total_contributed: number
  total_deposited: number
  total_paid_out: number
  is_active: boolean
  /** URL to the uploaded Valid ID document. */
  requirements_url: string | null
  joined_at: string
}

export type DepositStatus =
  | 'pending'
  | 'active'
  | 'matured'
  | 'paid_out'
  | 'withdrawn_early'

/** Row from the `lender_deposits` table. */
export interface LenderDeposit {
  id: string
  lender_id: string
  principal: number
  return_rate: number
  term_months: number
  expected_return: number
  maturity_amount: number
  deposited_at: string
  maturity_date: string
  processed_at: string | null
  matured_at: string | null
  status: DepositStatus
  processed_by: string | null
  notes: string | null
  created_at: string
}

export type WithdrawalStatus = 'pending' | 'approved' | 'completed' | 'rejected'

/** Row from the `lender_withdrawals` table. */
export interface LenderWithdrawal {
  id: string
  lender_id: string
  deposit_id: string
  amount: number
  penalty_amount: number
  net_payout: number
  status: WithdrawalStatus
  requested_at: string
  processed_by: string | null
  processed_at: string | null
  rejection_note: string | null
}

// ─── Utility / UI ─────────────────────────────────────────────────────────────

/**
 * Converts a status string to a Tailwind colour class for badges/chips.
 * Mirrors Flutter's AppColors.statusColor() logic.
 */
export function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'active':
    case 'approved':
    case 'paid':
    case 'completed':
    case 'paid_out':
      return 'text-green-700 bg-green-50 border-green-200'
    case 'pending':
      return 'text-orange-700 bg-orange-50 border-orange-200'
    case 'matured':
      return 'text-blue-700 bg-blue-50 border-blue-200'
    case 'overdue':
    case 'rejected':
    case 'denied':
    case 'forfeited':
    case 'withdrawn_early':
      return 'text-red-700 bg-red-50 border-red-200'
    case 'released':
      return 'text-blue-700 bg-blue-50 border-blue-200'
    default:
      return 'text-gray-700 bg-gray-50 border-gray-200'
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}


export function toEmail(studentId: string): string {
  return `${studentId}@loanmate.local`
}
