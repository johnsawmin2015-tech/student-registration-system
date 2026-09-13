import { NextResponse } from 'next/server'

import { getRepository } from '@/lib/server/repositories'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const health = await (await getRepository()).health()
  return NextResponse.json(
    {
      status: health.ready ? 'ready' : 'not_ready',
      mode: health.mode,
      database: health.database,
      migrations: health.migrations,
      checkedAt: new Date().toISOString(),
    },
    {
      status: health.ready ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
