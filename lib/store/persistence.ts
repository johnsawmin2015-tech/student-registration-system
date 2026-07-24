import type { DatabaseShape } from '@/lib/domain/types'
import { buildSeedDatabase } from '@/lib/domain/seed'

// Prototype persistence boundary. This intentionally isolates all browser
// storage access so it can be swapped for MongoDB / API repositories later
// without touching UI or store logic.

const DB_KEY = 'meridian-ums:db:v1'

export function loadDatabase(): DatabaseShape {
  if (typeof window === 'undefined') return buildSeedDatabase()
  try {
    const raw = window.localStorage.getItem(DB_KEY)
    if (!raw) {
      const seed = buildSeedDatabase()
      window.localStorage.setItem(DB_KEY, JSON.stringify(seed))
      return seed
    }
    return JSON.parse(raw) as DatabaseShape
  } catch {
    return buildSeedDatabase()
  }
}

export function saveDatabase(db: DatabaseShape) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    // Storage full or unavailable — prototype degrades to in-memory only.
  }
}

export function resetDatabase(): DatabaseShape {
  const seed = buildSeedDatabase()
  saveDatabase(seed)
  return seed
}
