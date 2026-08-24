/**
 * Shared types and helpers for the Apply-for-Loan wizard.
 * Mirrors Flutter apply_tab.dart + AiService logic.
 */

export type LoanType = 'Urgent' | 'Standard' | 'Flexible'

export interface BuddyPledge {
  studentId: string
  userId: string
  name: string
  availableSavings: number
  amount: number
}

export interface ApplyFormState {
  // Step 1
  loanType: LoanType
  mobile: string

  // Step 2
  amount: string        // raw text
  repaymentTerm: 6 | 12 | 18
  purpose: string
  selfPledgeAmount: number
  buddyPledges: BuddyPledge[]

  // Step 3
  schoolIdFile: File | null
  assessmentFile: File | null
}

export const INITIAL_FORM: ApplyFormState = {
  loanType: 'Urgent',
  mobile: '',
  amount: '',
  repaymentTerm: 6,
  purpose: '',
  selfPledgeAmount: 0,
  buddyPledges: [],
  schoolIdFile: null,
  assessmentFile: null,
}

// ─── Loan calculations (mirrors Flutter getters) ──────────────────────────────

export function calcLoan(amount: number, term: 6 | 12 | 18) {
  const interest = amount * 0.03 * (term / 12)
  const total = amount + interest
  const monthly = term > 0 ? total / term : 0
  const penaltyRate = term === 6 ? 0.02 : term === 12 ? 0.03 : 0.04
  const penalty = amount * penaltyRate
  return { interest, total, monthly, penaltyRate, penalty }
}

export function fmt(v: number) {
  return `₱${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

// ─── Local AI evaluation (mirrors Flutter _localEvaluate) ─────────────────────

export interface AiResult {
  recommendation: 'approve' | 'reject' | 'manual_review'
  reasoning: string
  riskScore: number
  error?: string
}

export function localEvaluate(
  hasSchoolId: boolean,
  hasAssessment: boolean,
  requestedAmount: number,
  maxLoanCap = 50000,
): AiResult {
  const allUploaded = hasSchoolId && hasAssessment
  if (!allUploaded) {
    return {
      recommendation: 'manual_review',
      reasoning: 'Required document(s) missing. Please upload both your School ID and Assessment Slip.',
      riskScore: 0.3,
    }
  }
  let risk = 0.70
  if (requestedAmount <= maxLoanCap) risk += 0.10
  if (requestedAmount <= 20000) risk += 0.05
  risk = Math.min(Math.max(risk, 0), 1)

  if (risk >= 0.70) {
    return {
      recommendation: 'approve',
      reasoning: `All required documents submitted and the requested amount (${fmt(requestedAmount)}) is within the approved range. Application forwarded to admin for final sign-off.`,
      riskScore: risk,
    }
  } else if (risk < 0.50) {
    return {
      recommendation: 'reject',
      reasoning: 'The requested amount exceeds the system cap or submitted documents are insufficient.',
      riskScore: risk,
    }
  } else {
    return {
      recommendation: 'manual_review',
      reasoning: `Borderline risk score (${Math.round(risk * 100)}%). Admin will perform a manual verification.`,
      riskScore: risk,
    }
  }
}
