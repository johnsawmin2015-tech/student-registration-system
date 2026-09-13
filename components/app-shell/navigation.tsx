'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export interface NavigationItem {
  href: string
  label: string
  symbol: string
}

export function Navigation({ items }: { items: NavigationItem[] }) {
  const pathname = usePathname()
  return (
    <ul className="nav-list">
      {items.map((item) => {
        const current = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <li key={item.href}>
            <Link className="nav-link" href={item.href} aria-current={current ? 'page' : undefined}>
              <span aria-hidden="true">{item.symbol}</span>
              <span>{item.label}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
