import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/support/server-only.ts', import.meta.url)),
    },
  },
  test: {
    clearMocks: true,
    environment: 'node',
    exclude: ['.next/**', 'node_modules/**', 'tests/e2e/**'],
    include: [
      'tests/unit/**/*.{test,spec}.{ts,tsx}',
      'tests/integration/**/*.{test,spec}.{ts,tsx}',
    ],
    restoreMocks: true,
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
})
