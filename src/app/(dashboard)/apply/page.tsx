'use client'

/**
 * Apply Page — placeholder
 *
 * The full loan application form (multi-step: Purpose → Amount → Documents →
 * Collateral/Buddy → Submit) is the next phase of migration.
 * This placeholder ensures navigation works so the app can be demoed end-to-end.
 */

import Link from 'next/link'
import { FileTextIcon } from 'lucide-react'

export default function ApplyPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-[var(--brand-green-50)] flex items-center justify-center mb-5">
        <FileTextIcon size={36} className="text-[var(--brand-green)]" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Loan Application</h1>
      <p className="text-sm text-gray-500 max-w-xs mb-6">
        The multi-step loan application form is coming soon. You can track existing loans in the Track tab.
      </p>
      <Link
        href="/loans"
        className="px-6 py-3 rounded-xl bg-[var(--brand-green)] text-white font-bold text-sm hover:bg-[var(--brand-green-dark)] transition"
      >
        Track My Loans
      </Link>
    </div>
  )
}
