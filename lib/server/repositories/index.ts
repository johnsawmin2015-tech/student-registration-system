import 'server-only'

import { getDataMode } from '../config'
import type { UniversityRepository } from './repository'

export async function getRepository(): Promise<UniversityRepository> {
  if (getDataMode() === 'demo') {
    const { getDemoRepository } = await import('./demo-repository')
    return getDemoRepository()
  }
  const { getPostgresRepository } = await import('./postgres-repository')
  return getPostgresRepository()
}
