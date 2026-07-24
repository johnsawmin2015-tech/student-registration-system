'use client'

import { useMemo, useState } from 'react'
import {
  BarChart3, Bell, BookOpen, Building2, ClipboardList, FileClock, GraduationCap,
  LayoutDashboard, LogOut, Menu, Moon, School, Search, Settings, Sun, Users,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useDataStore } from '@/lib/store/data-store'
import { can, roleLabel, type NavKey } from '@/lib/domain/permissions'
import type { Role } from '@/lib/domain/types'
import { RegisterDialog } from './register-dialog'

const NAV: { key: NavKey; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Overview' },
  { key: 'students', label: 'Students', icon: GraduationCap, group: 'Academics' },
  { key: 'faculty', label: 'Faculty', icon: Users, group: 'Academics' },
  { key: 'departments', label: 'Departments', icon: Building2, group: 'Academics' },
  { key: 'courses', label: 'Courses', icon: BookOpen, group: 'Academics' },
  { key: 'registrations', label: 'Registrations', icon: ClipboardList, group: 'Academics' },
  { key: 'reports', label: 'Reports', icon: BarChart3, group: 'Governance' },
  { key: 'notifications', label: 'Notifications', icon: Bell, group: 'Governance' },
  { key: 'audit', label: 'Audit log', icon: FileClock, group: 'Governance' },
  { key: 'settings', label: 'Settings', icon: Settings, group: 'Governance' },
]

const PAGE_TITLES: Record<NavKey, string> = {
  dashboard: 'Institutional overview', students: 'Students', faculty: 'Faculty', departments: 'Departments',
  courses: 'Courses', registrations: 'Registrations', reports: 'Reports', notifications: 'Notifications',
  audit: 'Audit log', settings: 'Settings',
}

function NavList({ active, onSelect }: { active: NavKey; onSelect: (k: NavKey) => void }) {
  const { currentUser } = useDataStore()
  const role = currentUser?.role ?? 'viewer'
  const groups = useMemo(() => {
    const visible = NAV.filter((n) => can(role, n.key))
    return [...new Set(visible.map((n) => n.group))].map((g) => ({ group: g, items: visible.filter((n) => n.group === g) }))
  }, [role])
  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto p-3" aria-label="Primary">
      {groups.map(({ group, items }) => (
        <div key={group} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{group}</p>
          {items.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => onSelect(key)} aria-current={active === key ? 'page' : undefined}
              className={cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors', active === key ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground')}>
              <Icon className="size-4 shrink-0" aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}

function Brand() {
  const { db } = useDataStore()
  return (
    <div className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4">
      <div className="flex size-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><School className="size-5" /></div>
      <div className="min-w-0"><p className="truncate text-sm font-semibold text-sidebar-foreground">{db.settings.institutionName}</p><p className="truncate text-xs text-sidebar-foreground/60">Management Suite</p></div>
    </div>
  )
}

export function AppShell({ children, active, onNavigate }: { children: (view: NavKey) => React.ReactNode; active: NavKey; onNavigate: (k: NavKey) => void }) {
  const { db, currentUser, logout, switchRole, theme, toggleTheme, markAllNotificationsRead } = useDataStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const role = currentUser?.role ?? 'viewer'
  const unread = db.notifications.filter((n) => !n.read).length

  const results = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return []
    const items: { label: string; sub: string; key: NavKey }[] = []
    db.students.filter((s) => `${s.firstName} ${s.lastName} ${s.universityId}`.toLowerCase().includes(q)).slice(0, 4).forEach((s) => items.push({ label: `${s.firstName} ${s.lastName}`, sub: `Student · ${s.universityId}`, key: 'students' }))
    db.faculty.filter((f) => `${f.firstName} ${f.lastName}`.toLowerCase().includes(q)).slice(0, 3).forEach((f) => items.push({ label: `${f.firstName} ${f.lastName}`, sub: `Faculty · ${f.employeeId}`, key: 'faculty' }))
    db.courses.filter((c) => `${c.code} ${c.title}`.toLowerCase().includes(q)).slice(0, 3).forEach((c) => items.push({ label: c.title, sub: `Course · ${c.code}`, key: 'courses' }))
    return items
  }, [query, db])

  const go = (k: NavKey) => { onNavigate(k); setMobileOpen(false); setSearchOpen(false); setQuery('') }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Brand /><NavList active={active} onSelect={onNavigate} />
        <div className="border-t border-sidebar-border p-3 text-xs text-sidebar-foreground/50">v1.0 · Prototype build</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" />}><Menu /></SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0"><SheetTitle className="sr-only">Navigation</SheetTitle><Brand /><NavList active={active} onSelect={go} /></SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1"><h1 className="truncate text-base font-semibold">{PAGE_TITLES[active]}</h1></div>
          <Button variant="outline" size="sm" className="hidden gap-2 text-muted-foreground sm:flex" onClick={() => setSearchOpen(true)}><Search className="size-4" />Search<kbd className="rounded border bg-muted px-1.5 font-mono text-[10px]">/</kbd></Button>
          <Button variant="ghost" size="icon" onClick={() => go('notifications')} aria-label={`Notifications, ${unread} unread`} className="relative"><Bell />{unread > 0 && <span className="absolute right-1.5 top-1.5 flex size-2 rounded-full bg-destructive" />}</Button>
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">{theme === 'dark' ? <Sun /> : <Moon />}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" className="gap-2 pl-2" />}><Avatar className="size-7"><AvatarFallback style={{ backgroundColor: currentUser?.avatarColor }} className="text-xs text-white">{currentUser?.name.split(' ').map((n) => n[0]).join('')}</AvatarFallback></Avatar><span className="hidden text-sm md:inline">{currentUser?.name}</span></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel><p>{currentUser?.name}</p><p className="text-xs font-normal text-muted-foreground">{currentUser?.email}</p></DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Switch role (demo)</DropdownMenuLabel>
              <DropdownMenuGroup>{(['admin', 'staff', 'viewer'] as Role[]).map((r) => <DropdownMenuItem key={r} onClick={() => switchRole(r)}><Badge variant={role === r ? 'default' : 'outline'} className="mr-2">{role === r ? '●' : '○'}</Badge>{roleLabel(r)}</DropdownMenuItem>)}</DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => go('settings')}><Settings data-icon="inline-start" />Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={logout}><LogOut data-icon="inline-start" />Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Badge variant="outline" className="gap-1.5 font-normal"><span className="size-1.5 rounded-full bg-primary" />{db.semesters.find((s) => s.isCurrent)?.name ?? 'No active term'} · {roleLabel(role)} access</Badge>
            {active === 'registrations' && <RegisterDialog disabled={!can(role, 'registrations', 'write') || !db.settings.registrationEnabled} />}
          </div>
          {children(active)}
        </main>
      </div>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="top-24 translate-y-0 gap-0 p-0"><DialogHeader className="sr-only"><DialogTitle>Global search</DialogTitle></DialogHeader>
          <div className="flex items-center gap-3 border-b px-4"><Search className="size-4 text-muted-foreground" /><Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search students, faculty, courses..." className="border-0 shadow-none focus-visible:ring-0" /></div>
          <div className="max-h-80 overflow-y-auto p-2">{results.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">{query ? 'No matches found.' : 'Start typing to search records.'}</p> : results.map((r, i) => <button key={i} onClick={() => go(r.key)} className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted"><span className="font-medium">{r.label}</span><span className="text-xs text-muted-foreground">{r.sub}</span></button>)}</div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
