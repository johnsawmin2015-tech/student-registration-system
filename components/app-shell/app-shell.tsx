import Link from 'next/link'
import type { ReactNode } from 'react'

import { logoutAction } from '@/app/actions'
import { can } from '@/lib/domain/permissions'
import type { SessionUser } from '@/lib/server/contracts'
import { initials } from '@/lib/format'
import { Navigation, type NavigationItem } from './navigation'
import { ThemeToggle } from './theme-toggle'

const primary: NavigationItem[] = [
  { href: '/dashboard', label: 'Dashboard', symbol: '⌂' },
  { href: '/students', label: 'Students', symbol: 'S' },
  { href: '/faculty', label: 'Faculty', symbol: 'F' },
  { href: '/departments', label: 'Departments', symbol: 'D' },
  { href: '/courses', label: 'Courses', symbol: 'C' },
  { href: '/registrations', label: 'Registrations', symbol: 'R' },
  { href: '/semesters', label: 'Semesters', symbol: 'T' },
]

function itemsFor(user: SessionUser): NavigationItem[] {
  const items = [...primary]
  if (can(user.role, 'reports:read'))
    items.push({ href: '/reports', label: 'Reports', symbol: '↗' })
  items.push({ href: '/notifications', label: 'Notifications', symbol: 'N' })
  if (can(user.role, 'audit:read')) items.push({ href: '/audit', label: 'Audit', symbol: 'A' })
  items.push({ href: '/settings', label: 'Settings', symbol: '⚙' })
  return items
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const items = itemsFor(user)
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar" aria-label="Primary navigation">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark" aria-hidden="true">
            N
          </span>
          <span className="brand-copy">
            <strong>Northstar</strong>
            <span>University management</span>
          </span>
        </Link>
        <p className="nav-label">Workspace</p>
        <nav aria-label="Desktop navigation">
          <Navigation items={items} />
        </nav>
      </aside>
      <div className="shell-main">
        <header className="topbar">
          <details className="mobile-nav">
            <summary aria-label="Open navigation menu">☰</summary>
            <nav className="mobile-menu" aria-label="Mobile navigation">
              <Navigation items={items} />
            </nav>
          </details>
          <div className="user-summary">
            <span className="user-avatar" aria-hidden="true">
              {initials(user.name)}
            </span>
            <span className="user-copy">
              <strong>{user.name}</strong>
              <span>
                {user.role} · {user.title}
              </span>
            </span>
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            <form action={logoutAction}>
              <button className="button secondary compact" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="content" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
