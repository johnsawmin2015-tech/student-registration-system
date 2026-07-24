'use client'

import { useState } from 'react'
import { ArrowRight, Database, LockKeyhole, School, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AppShell } from './app-shell'
import { Dashboard } from './dashboard'
import { GovernanceWorkspace } from './governance'
import { RecordsWorkspace } from './records'
import { DataStoreProvider, useDataStore } from '@/lib/store/data-store'
import type { NavKey } from '@/lib/domain/permissions'

function LoginGate() {
  const { db, ready, currentUser, login } = useDataStore()
  const [active, setActive] = useState<NavKey>('dashboard')
  if (!ready) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="flex w-full max-w-sm flex-col gap-3 p-6"><Skeleton className="h-12 w-12"/><Skeleton className="h-7 w-64"/><Skeleton className="h-24 w-full"/></div></div>
  if (!currentUser) return <main className="grid min-h-screen bg-background lg:grid-cols-[1.1fr_0.9fr]"><section className="hidden flex-col justify-between border-r bg-sidebar p-10 text-sidebar-foreground lg:flex"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><School className="size-6"/></div><div><p className="font-semibold">Meridian University</p><p className="text-xs text-sidebar-foreground/60">Management Suite</p></div></div><div className="max-w-xl"><Badge variant="outline" className="mb-5 border-sidebar-border text-sidebar-foreground">Institutional operations</Badge><h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight">The operating system for academic administration.</h1><p className="mt-4 max-w-lg text-pretty leading-relaxed text-sidebar-foreground/65">One governed workspace for student records, faculty appointments, curriculum, registration, reporting, and institutional oversight.</p></div><div className="grid grid-cols-3 gap-3 text-xs text-sidebar-foreground/65"><div className="flex items-center gap-2"><ShieldCheck className="size-4"/>Role-aware</div><div className="flex items-center gap-2"><Database className="size-4"/>Fixture data</div><div className="flex items-center gap-2"><LockKeyhole className="size-4"/>Demo sessions</div></div></section><section className="flex items-center justify-center p-5 sm:p-10"><div className="w-full max-w-md"><div className="mb-8 lg:hidden"><div className="mb-5 flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground"><School className="size-6"/></div><h1 className="text-2xl font-semibold">Meridian University</h1></div><Card className="shadow-none"><CardHeader><CardTitle>Enter the administration suite</CardTitle><CardDescription>Select a demonstration role. No password is required in this frontend prototype.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{db.users.map((u)=><button key={u.id} onClick={()=>login(u.id)} className="group flex items-center gap-4 rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-muted/50"><div className="flex size-10 items-center justify-center rounded-md text-sm font-semibold text-white" style={{backgroundColor:u.avatarColor}}>{u.name.split(' ').map(n=>n[0]).join('')}</div><div className="min-w-0 flex-1"><p className="font-medium">{u.name}</p><p className="text-sm text-muted-foreground">{u.title}</p></div><Badge variant="outline" className="capitalize">{u.role}</Badge><ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1"/></button>)}<p className="pt-2 text-center text-xs text-muted-foreground">Data is persisted in this browser only.</p></CardContent></Card></div></section></main>

  const render = (view: NavKey) => {
    if (view === 'dashboard') return <Dashboard />
    if (['students','faculty','departments','courses','registrations'].includes(view)) return <RecordsWorkspace view={view as 'students'|'faculty'|'departments'|'courses'|'registrations'} />
    return <GovernanceWorkspace view={view as 'reports'|'notifications'|'audit'|'settings'} />
  }
  return <AppShell active={active} onNavigate={setActive}>{render}</AppShell>
}

export function UniversityApp() { return <DataStoreProvider><LoginGate /></DataStoreProvider> }
