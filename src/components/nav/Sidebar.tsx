'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HomeIcon,
  FileTextIcon,
  TrendingUpIcon,
  WalletIcon,
  UserIcon,
  BarChart2Icon,
  ClipboardListIcon,
  UsersIcon,
  ShieldIcon,
  LogOutIcon,
  ArrowDownCircleIcon,
  SettingsIcon,
  BanknoteIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface NavItem {
  href: string
  label: string
  Icon: React.ElementType
}

//student only
const studentItems: NavItem[] = [
  { href: '/home',     label: 'Home',        Icon: HomeIcon },
  { href: '/apply',    label: 'Apply',        Icon: FileTextIcon },
  { href: '/loans',    label: 'Track Loans',  Icon: TrendingUpIcon },
  { href: '/wallet',   label: 'E-Wallet',     Icon: WalletIcon },
  { href: '/profile',  label: 'Profile',      Icon: UserIcon },
  { href: '/settings', label: 'Settings',     Icon: SettingsIcon },
]

//lender only
const lenderMainItems: NavItem[] = [
  { href: '/home',                  label: 'Home',           Icon: HomeIcon },
  { href: '/lender/fund-loan',      label: 'Fund a Loan',    Icon: BanknoteIcon },
  { href: '/lender/track-deposits', label: 'Track Funded Loans', Icon: BarChart2Icon },
  { href: '/lender/withdraw',       label: 'Withdraw',       Icon: ArrowDownCircleIcon },
  { href: '/wallet',                label: 'E-Wallet',       Icon: WalletIcon },
  { href: '/profile',               label: 'Profile',        Icon: UserIcon },
  { href: '/settings',              label: 'Settings',       Icon: SettingsIcon },
]

const adminItems: NavItem[] = [
  { href: '/admin/loans',    label: 'Loans',    Icon: ClipboardListIcon },
  { href: '/admin/deposits', label: 'Deposits', Icon: BarChart2Icon },
  { href: '/admin/users',    label: 'Users',    Icon: UsersIcon },
]

interface SidebarProps {
  role: 'student' | 'lender' | 'admin' | 'finance_officer'
  isLender?: boolean
}

export function Sidebar({ role, isLender }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const isAdmin = role === 'admin' || role === 'finance_officer'
  //lender and student have different navbar
  const mainItems = isAdmin ? adminItems : isLender ? lenderMainItems : studentItems

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    // hidden on mobile, flex column on md+
    <aside className="hidden md:flex flex-col w-64 min-h-screen bg-white border-r border-gray-100 py-6 px-4 fixed top-0 left-0 z-30">
      {/* Logo */}
      <Link href={isAdmin ? '/admin/loans' : '/home'} className="flex items-center gap-3 px-2 mb-8">
        <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--brand-green)]">
          <ShieldIcon size={18} className="text-white" />
        </span>
        <span className="text-base font-bold text-[var(--brand-green)] tracking-wide">LoanMate</span>
      </Link>

      {/* Main nav */}
      <nav className="flex-1 space-y-1">
        {mainItems.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                active
                  ? 'bg-[var(--brand-green)] text-white'
                  : 'text-gray-600 hover:bg-[var(--brand-green-50)] hover:text-[var(--brand-green)]',
              ].join(' ')}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <button
        id="sidebar-signout-btn"
        onClick={handleSignOut}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all mt-2"
      >
        <LogOutIcon size={18} />
        Sign Out
      </button>
    </aside>
  )
}
