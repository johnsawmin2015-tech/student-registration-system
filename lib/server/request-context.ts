import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { AppError } from './errors'
import { sessionSecret } from './config'

export interface RequestContext {
  requestId: string
  sourceIpHash: string | null
  userAgentHash: string | null
}

function digest(value: string): string {
  return createHash('sha256').update(`${sessionSecret()}:${value}`).digest('hex')
}

function requestIdentifier(value: string | null): string {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : randomUUID()
}

function selectedHost(headerList: Headers): string | null {
  if (process.env.TRUST_PROXY === 'true') {
    return headerList.get('x-forwarded-host')?.split(',')[0]?.trim() ?? headerList.get('host')
  }
  return headerList.get('host')
}

export async function getRequestContext(): Promise<RequestContext> {
  const headerList = await headers()
  const rawIp =
    process.env.TRUST_PROXY === 'true'
      ? headerList.get('x-forwarded-for')?.split(',')[0]?.trim()
      : null
  const userAgent = headerList.get('user-agent')
  return {
    requestId: requestIdentifier(headerList.get('x-request-id')),
    sourceIpHash: rawIp ? digest(rawIp) : null,
    userAgentHash: userAgent ? digest(userAgent) : null,
  }
}

export async function assertSameOrigin(): Promise<void> {
  const headerList = await headers()
  const origin = headerList.get('origin')
  const host = selectedHost(headerList)
  if (!origin || !host) {
    throw new AppError('FORBIDDEN', 'The request origin could not be verified.', 403)
  }

  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    throw new AppError('FORBIDDEN', 'The request origin is invalid.', 403)
  }
  if (originHost !== host) {
    throw new AppError('FORBIDDEN', 'Cross-site requests are not allowed.', 403)
  }
}
