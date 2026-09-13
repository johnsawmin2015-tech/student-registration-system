import 'server-only'

import type { RecordQuery } from './contracts'

export type PageSearchParams = Promise<Record<string, string | string[] | undefined>>

export function firstParam(
  params: Record<string, string | string[] | undefined>,
  name: string,
  max = 200,
): string | undefined {
  const value = params[name]
  const selected = Array.isArray(value) ? value[0] : value
  const trimmed = selected?.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

export function recordQuery(params: Record<string, string | string[] | undefined>): RecordQuery {
  return {
    search: firstParam(params, 'search', 120),
    departmentId: firstParam(params, 'departmentId', 128),
    semesterId: firstParam(params, 'semesterId', 128),
    includeArchived: firstParam(params, 'includeArchived') === 'true',
  }
}
