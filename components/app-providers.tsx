'use client'

import type { ReactNode } from 'react'
import { DataStoreProvider } from '@/lib/store/data-store'

export function AppProviders({ children }: { children: ReactNode }) {
  return <DataStoreProvider>{children}</DataStoreProvider>
}
