import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import './load-local-env'

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run database migrations')
  }

  return databaseUrl
}

async function main() {
  const client = postgres(requireDatabaseUrl(), {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
    prepare: false,
  })

  try {
    await migrate(drizzle(client), { migrationsFolder: './drizzle' })
    console.info('Database migrations completed successfully.')
  } finally {
    await client.end({ timeout: 5 })
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown migration error'
  console.error(`Database migration failed: ${message}`)
  process.exitCode = 1
})
