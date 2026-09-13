import 'server-only'

export type DataMode = 'demo' | 'postgres'

function asBoolean(value: string | undefined): boolean {
  return value === 'true'
}

export function getDataMode(): DataMode {
  const configured = process.env.DATA_MODE

  if (configured && configured !== 'demo' && configured !== 'postgres') {
    throw new Error('DATA_MODE must be either "demo" or "postgres".')
  }

  const mode: DataMode =
    configured === 'demo' || configured === 'postgres'
      ? configured
      : process.env.NODE_ENV === 'production'
        ? 'postgres'
        : 'demo'

  if (
    process.env.NODE_ENV === 'production' &&
    mode === 'demo' &&
    !asBoolean(process.env.ALLOW_DEMO_IN_PRODUCTION)
  ) {
    throw new Error(
      'DATA_MODE=demo is disabled in production. Set DATA_MODE=postgres or explicitly allow the labelled demo build.',
    )
  }

  return mode
}

export function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim()
  if (!value) throw new Error('DATABASE_URL is required when DATA_MODE=postgres.')
  return value
}

export function sessionCookieSecure(): boolean {
  // A deployment must never be able to turn off the Secure flag by accident.
  // Local HTTP development may opt in when exercising HTTPS locally.
  if (process.env.NODE_ENV === 'production') return true
  return asBoolean(process.env.SESSION_COOKIE_SECURE)
}

export function sessionSecret(): string {
  const value = process.env.SESSION_SECRET
  if (value && value.length >= 32) return value
  if (getDataMode() === 'demo' && process.env.NODE_ENV !== 'production') {
    return 'northstar-demo-only-session-secret-not-for-production'
  }
  throw new Error('SESSION_SECRET must contain at least 32 characters.')
}

export function demoPassword(): string {
  if (getDataMode() !== 'demo')
    throw new Error('Demo credentials are unavailable in PostgreSQL mode.')
  return process.env.DEMO_PASSWORD ?? 'DemoOnly!2026'
}

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000
export const SESSION_IDLE_MS = 30 * 60 * 1000
export const SESSION_ROTATION_MS = 30 * 60 * 1000
export const LOGIN_WINDOW_MS = 15 * 60 * 1000
export const LOGIN_BLOCK_MS = 15 * 60 * 1000
export const LOGIN_MAX_ATTEMPTS = 5
