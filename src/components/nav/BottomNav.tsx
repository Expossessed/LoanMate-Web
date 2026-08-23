'use client'

/**
 * BottomNav — Mobile navigation (hidden on md+)
 *
 * Mirrors Flutter DashboardScreen's BottomNavigationBar.
 * Visible only on mobile (<768px). On md+ the Sidebar handles navigation.
 *
 * Active item: green pill background (same pill style as Flutter).
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HomeIcon,
  FileTextIcon,
  TrendingUpIcon,
  WalletIcon,
  UserIcon,
} from 'lucide-react'

const studentTabs = [
  { href: '/home',    label: 'HOME',    Icon: HomeIcon },
  { href: '/apply',   label: 'APPLY',   Icon: FileTextIcon },
  { href: '/loans',   label: 'TRACK',   Icon: TrendingUpIcon },
  { href: '/wallet',  label: 'WALLET',  Icon: WalletIcon },
  { href: '/profile', label: 'PROFILE', Icon: UserIcon },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    // Shown only on mobile, fixed to bottom
    <nav
      className="
        md:hidden fixed bottom-0 inset-x-0 z-30
        bg-white border-t border-gray-100
        flex items-center justify-around
        px-2 pb-safe pt-2
        shadow-[0_-4px_12px_rgba(0,0,0,0.06)]
      "
    >
      {studentTabs.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5 min-w-[56px] py-1"
          >
            <span
              className={[
                'flex items-center justify-center px-4 py-2 rounded-full transition-all duration-200',
                active ? 'bg-[var(--brand-green)]' : 'bg-transparent',
              ].join(' ')}
            >
              <Icon
                size={20}
                className={active ? 'text-white' : 'text-gray-400'}
              />
            </span>
            <span
              className={[
                'text-[10px] font-semibold tracking-wide',
                active ? 'text-[var(--brand-green)]' : 'text-gray-400',
              ].join(' ')}
            >
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
