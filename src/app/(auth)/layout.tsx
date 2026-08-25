import type { Metadata } from 'next'
import { Toaster } from 'sonner'


export const metadata: Metadata = {
  title: 'LoanMate — Sign In',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-start lg:items-center justify-center bg-[var(--brand-cream)]">
      <div className="w-full lg:max-w-md lg:shadow-xl lg:rounded-3xl lg:overflow-hidden lg:my-8">
        {children}
      </div>
      <Toaster richColors position="top-center" />
    </div>
  )
}
