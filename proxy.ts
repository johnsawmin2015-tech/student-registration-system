import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

function compact(value: string): string {
  return value.replace(/\s{2,}/g, ' ').trim()
}

function requestIdentifier(value: string | null): string {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : randomUUID()
}

export function proxy(request: NextRequest) {
  const requestId = requestIdentifier(request.headers.get('x-request-id'))
  const nonce = Buffer.from(randomUUID()).toString('base64')
  const development = process.env.NODE_ENV !== 'production'
  const scriptPolicy = development
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
  const upgrade = process.env.ENABLE_HSTS === 'true' ? 'upgrade-insecure-requests;' : ''
  const contentSecurityPolicy = compact(`
    default-src 'self';
    ${scriptPolicy};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob:;
    font-src 'self';
    connect-src 'self' ${development ? 'ws: wss:' : ''};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${upgrade}
  `)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', contentSecurityPolicy)
  response.headers.set('x-request-id', requestId)
  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!api/health|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
