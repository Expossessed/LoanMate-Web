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
  BanknoteIcon,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export function BottomNav() {
  const pathname = usePathname()
  const { profile } = useAuth()
  const isLender = profile?.is_lender ?? false

  const tabs = [
    { href: '/home',    label: 'HOME',    Icon: HomeIcon },
    isLender
      ? { href: '/lender/fund-loan',      label: 'FUND',     Icon: BanknoteIcon }
      : { href: '/apply',                  label: 'APPLY',    Icon: FileTextIcon },
    isLender
      ? { href: '/lender/track-deposits', label: 'FUNDED',   Icon: BarChart2Icon }
      : { href: '/loans',                  label: 'TRACK',    Icon: TrendingUpIcon },
    { href: '/wallet',  label: 'WALLET',  Icon: WalletIcon },
    { href: '/profile', label: 'PROFILE', Icon: UserIcon },
  ]

  return (
    <nav
      className="
        md:hidden fixed bottom-0 inset-x-0 z-30
        bg-white border-t border-gray-100
        flex items-center justify-around
        px-2 pb-safe pt-2
        shadow-[0_-4px_12px_rgba(0,0,0,0.06)]
      "
    >
      {tabs.map(({ href, label, Icon }) => {
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
