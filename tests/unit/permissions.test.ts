import { describe, expect, it } from 'vitest'
import {
  ALL_CAPABILITIES,
  AuthenticationError,
  AuthorizationError,
  ROLE_CAPABILITIES,
  assertActorCapability,
  assertCapability,
  hasCapability,
  normalizeUserRole,
} from '@/lib/domain/permissions'

describe('permission policy', () => {
  it('grants every capability only to administrators', () => {
    for (const capability of ALL_CAPABILITIES) {
      expect(hasCapability('administrator', capability)).toBe(true)
    }
    expect(ROLE_CAPABILITIES.administrator).toHaveLength(ALL_CAPABILITIES.length)
  })

  it('grants staff academic work but not institutional security administration', () => {
    expect(hasCapability('staff', 'students:write')).toBe(true)
    expect(hasCapability('staff', 'registrations:manage')).toBe(true)
    expect(hasCapability('staff', 'exports:create')).toBe(true)
    expect(hasCapability('staff', 'settings:manage')).toBe(false)
    expect(hasCapability('staff', 'semesters:manage')).toBe(false)
    expect(hasCapability('staff', 'users:manage')).toBe(false)
    expect(hasCapability('staff', 'audit:read')).toBe(false)
  })

  it('keeps viewers read-only with audit/report access and no exports', () => {
    expect(hasCapability('viewer', 'records:read')).toBe(true)
    expect(hasCapability('viewer', 'reports:read')).toBe(true)
    expect(hasCapability('viewer', 'audit:read')).toBe(true)
    expect(hasCapability('viewer', 'exports:create')).toBe(false)
    expect(hasCapability('viewer', 'students:write')).toBe(false)
    expect(hasCapability('viewer', 'registrations:manage')).toBe(false)
  })

  it('fails closed for malformed or missing roles', () => {
    expect(hasCapability('owner', 'records:read')).toBe(false)
    expect(hasCapability(undefined, 'records:read')).toBe(false)
    expect(hasCapability(null, 'records:read')).toBe(false)
    expect(normalizeUserRole('admin')).toBe('administrator')
  })

  it('throws a structured authorization error on negative assertions', () => {
    expect(() => assertCapability('viewer', 'students:write')).toThrow(AuthorizationError)
    try {
      assertCapability('viewer', 'students:write')
    } catch (error) {
      expect(error).toMatchObject({ code: 'FORBIDDEN', status: 403 })
    }
  })

  it('distinguishes unauthenticated actors from forbidden actors', () => {
    expect(() =>
      assertActorCapability({ id: null, role: null, authenticated: false }, 'records:read'),
    ).toThrow(AuthenticationError)
    expect(() =>
      assertActorCapability(
        { id: 'user-1', role: 'viewer', authenticated: true },
        'students:write',
      ),
    ).toThrow(AuthorizationError)
  })
})
