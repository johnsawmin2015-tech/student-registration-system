import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Next.js loads these files itself. Standalone migration/seed commands do not,
// so load the same local operator file without overriding exported CI values.
for (const filename of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), filename)
  if (!existsSync(path)) continue
  process.loadEnvFile(path)
  break
}
