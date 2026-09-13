import type { ReactNode } from 'react'

import { AppShell } from '@/components/app-shell/app-shell'
import { requireCurrentUser } from '@/lib/server/auth'

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireCurrentUser('records:read')
  return <AppShell user={user}>{children}</AppShell>
}
