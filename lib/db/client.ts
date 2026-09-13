import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured')
  }

  return databaseUrl
}

function databasePoolSize(): number {
  const value = Number(process.env.DATABASE_POOL_SIZE ?? 10)

  if (!Number.isInteger(value) || value < 1 || value > 50) {
    throw new Error('DATABASE_POOL_SIZE must be an integer between 1 and 50')
  }

  return value
}

declare global {
  // Reuse the connection pool across Next.js development reloads.
  var northstarPostgresClient: ReturnType<typeof postgres> | undefined
}

const queryClient =
  globalThis.northstarPostgresClient ??
  postgres(requireDatabaseUrl(), {
    max: databasePoolSize(),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.northstarPostgresClient = queryClient
}

export const db = drizzle(queryClient, { schema })
export { queryClient }
