import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Capability } from '@/lib/domain/permissions'
import { can } from '@/lib/domain/permissions'
import {
  SESSION_IDLE_MS,
  SESSION_ROTATION_MS,
  SESSION_TTL_MS,
  sessionCookieSecure,
  sessionSecret,
} from './config'
import type { SessionRecord, SessionUser } from './contracts'
import { AppError } from './errors'
import { logger } from './logging'
import type { RequestContext } from './request-context'
import { getRepository } from './repositories'

const COOKIE_NAME = 'northstar_session'
const dummyHash = hash('northstar-invalid-credential', {
  // @node-rs/argon2 exposes Argon2id as ambient const-enum value 2.
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
})

function tokenDigest(token: string): string {
  return createHash('sha256').update(`${sessionSecret()}:${token}`).digest('hex')
}

function identifierDigest(email: string, sourceIpHash: string | null): string {
  return createHash('sha256')
    .update(`${sessionSecret()}:${email.trim().toLowerCase()}:${sourceIpHash ?? 'local'}`)
    .digest('hex')
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: sessionCookieSecure(),
    sameSite: 'strict' as const,
    path: '/',
    expires,
    priority: 'high' as const,
  }
}

async function issueSession(
  userId: string,
  context: RequestContext,
  rotatedFromId?: string,
  absoluteExpiresAt?: Date,
) {
  const repository = await getRepository()
  const token = randomBytes(32).toString('base64url')
  const expiresAt = absoluteExpiresAt ?? new Date(Date.now() + SESSION_TTL_MS)
  const idleExpiresAt = new Date(Math.min(expiresAt.getTime(), Date.now() + SESSION_IDLE_MS))
  const input = {
    tokenHash: tokenDigest(token),
    userId,
    expiresAt,
    idleExpiresAt,
    requestId: context.requestId,
    sourceIpHash: context.sourceIpHash,
    userAgentHash: context.userAgentHash,
    rotatedFromId,
  }
  const session = rotatedFromId
    ? await repository.rotateSession(rotatedFromId, input, new Date())
    : await repository.createSession(input)
  ;(await cookies()).set(COOKIE_NAME, token, cookieOptions(expiresAt))
  return session
}

export async function authenticate(
  email: string,
  password: string,
  context: RequestContext,
): Promise<SessionUser> {
  const repository = await getRepository()
  const identifierHash = identifierDigest(email, context.sourceIpHash)
  const throttle = await repository.getLoginThrottle(identifierHash, new Date())
  if (!throttle.allowed) {
    await repository.writeAudit({
      actorId: null,
      actorRole: 'anonymous',
      action: 'session.login',
      entityType: 'session',
      entityId: identifierHash.slice(0, 16),
      requestId: context.requestId,
      outcome: 'denied',
      summary: 'Login denied by rate limit.',
      sourceIpHash: context.sourceIpHash,
      userAgentHash: context.userAgentHash,
    })
    throw new AppError('RATE_LIMITED', 'Unable to sign in. Try again later.', 429)
  }

  const credential = await repository.findCredentialByEmail(email.trim().toLowerCase())
  let passwordMatches = false
  try {
    passwordMatches = await verify(credential?.passwordHash ?? (await dummyHash), password)
  } catch {
    passwordMatches = false
  }
  if (!credential || credential.status !== 'active' || !passwordMatches) {
    await repository.recordLoginFailure(identifierHash, new Date())
    await repository.writeAudit({
      actorId: credential?.id ?? null,
      actorRole: credential?.role ?? 'anonymous',
      action: 'session.login',
      entityType: 'session',
      entityId: credential?.id ?? identifierHash.slice(0, 16),
      requestId: context.requestId,
      outcome: 'failure',
      summary: 'Login attempt failed.',
      sourceIpHash: context.sourceIpHash,
      userAgentHash: context.userAgentHash,
    })
    throw new AppError('AUTHENTICATION_REQUIRED', 'Email or password is incorrect.', 401)
  }

  await repository.clearLoginFailures(identifierHash)
  await issueSession(credential.id, context)
  await repository.writeAudit({
    actorId: credential.id,
    actorRole: credential.role,
    action: 'session.login',
    entityType: 'session',
    entityId: credential.id,
    requestId: context.requestId,
    outcome: 'success',
    summary: 'User signed in successfully.',
    sourceIpHash: context.sourceIpHash,
    userAgentHash: context.userAgentHash,
  })
  logger.info('Login succeeded', {
    requestId: context.requestId,
    action: 'session.login',
    outcome: 'success',
  })
  return credential
}

export async function getSessionRecord(): Promise<SessionRecord | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return null
  return (await getRepository()).findSession(tokenDigest(token), new Date())
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  return (await getSessionRecord())?.user ?? null
}

export async function requireCurrentUser(capability?: Capability): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (capability && (!user.permissions.includes(capability) || !can(user.role, capability))) {
    redirect('/forbidden')
  }
  return user
}

export async function requireActionUser(
  capability: Capability,
  context: RequestContext,
): Promise<SessionUser> {
  const session = await getSessionRecord()
  if (!session) throw new AppError('AUTHENTICATION_REQUIRED', 'Sign in to continue.', 401)
  const user = session.user
  if (!user.permissions.includes(capability) || !can(user.role, capability)) {
    await (
      await getRepository()
    ).writeAudit({
      actorId: user.id,
      actorRole: user.role,
      action: 'authorization.denied',
      entityType: 'permission',
      entityId: capability,
      requestId: context.requestId,
      outcome: 'denied',
      summary: 'A restricted operation was denied.',
      sourceIpHash: context.sourceIpHash,
      userAgentHash: context.userAgentHash,
    })
    throw new AppError('FORBIDDEN', 'You do not have permission to perform this action.', 403)
  }
  if (Date.now() - session.rotatedAt.getTime() >= SESSION_ROTATION_MS) {
    await issueSession(user.id, context, session.id, session.expiresAt)
  }
  return user
}

export async function logout(context: RequestContext): Promise<void> {
  const repository = await getRepository()
  const session = await getSessionRecord()
  if (session) {
    await repository.revokeSession(session.id, new Date())
    await repository.writeAudit({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: 'session.logout',
      entityType: 'session',
      entityId: session.id,
      requestId: context.requestId,
      outcome: 'success',
      summary: 'User signed out and the session was revoked.',
      sourceIpHash: context.sourceIpHash,
      userAgentHash: context.userAgentHash,
    })
  }
  ;(await cookies()).set(COOKIE_NAME, '', cookieOptions(new Date(0)))
}
