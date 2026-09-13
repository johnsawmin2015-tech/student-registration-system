import { describe, expect, it } from 'vitest'
import { buildAuditEvent, sanitizeAuditSummary } from '@/lib/domain/types'

describe('audit event builder', () => {
  it('builds a complete, deterministic, privacy-minimized event', () => {
    const event = buildAuditEvent(
      {
        actorId: 'user-123',
        actorRole: 'staff',
        action: 'registration.create',
        entityType: 'registration',
        entityId: 'registration-456',
        requestId: 'request-789',
        outcome: 'success',
        summary: {
          fromStatus: 'dropped',
          toStatus: 'registered',
          semesterId: 'semester-1',
          offeringId: 'offering-1',
        },
        source: { channel: 'web', ipHash: 'sha256:opaque' },
      },
      { eventId: 'audit-1', occurredAt: '2026-01-15T12:00:00.000Z' },
    )

    expect(event).toEqual({
      id: 'audit-1',
      actorId: 'user-123',
      actorRole: 'staff',
      action: 'registration.create',
      entityType: 'registration',
      entityId: 'registration-456',
      occurredAt: '2026-01-15T12:00:00.000Z',
      requestId: 'request-789',
      outcome: 'success',
      summary: {
        fromStatus: 'dropped',
        toStatus: 'registered',
        semesterId: 'semester-1',
        offeringId: 'offering-1',
      },
      source: { channel: 'web', ipHash: 'sha256:opaque' },
    })
    expect(Object.isFrozen(event)).toBe(true)
    expect(Object.isFrozen(event.summary)).toBe(true)
  })

  it('redacts credential and email patterns from otherwise safe fields', () => {
    const summary = sanitizeAuditSummary({
      reason: 'Failure for student@example.edu; token=top-secret',
      errorCode: 'LOGIN_FAILED',
    })
    const serialized = JSON.stringify(summary)
    expect(serialized).toContain('[redacted-email]')
    expect(serialized).toContain('[redacted-secret]')
    expect(serialized).not.toContain('student@example.edu')
    expect(serialized).not.toContain('top-secret')
  })

  it('rejects arbitrary summary keys that could carry PII or secrets', () => {
    expect(() => sanitizeAuditSummary({ password: 'secret' })).toThrow(/not allowed/)
    expect(() => sanitizeAuditSummary({ studentName: 'Ada Lovelace' })).toThrow(/not allowed/)
  })

  it('does not accept client-shaped IDs, actors, or timestamps in the summary', () => {
    expect(() =>
      sanitizeAuditSummary({
        actorId: 'forged-user',
        timestamp: '2026-01-01T00:00:00Z',
      }),
    ).toThrow(/not allowed/)
  })

  it('requires valid trusted context', () => {
    expect(() =>
      buildAuditEvent(
        {
          actorId: 'user-1',
          actorRole: 'administrator',
          action: 'settings.update',
          entityType: 'settings',
          entityId: 'institution',
          requestId: 'request-1',
          outcome: 'success',
          source: { channel: 'api' },
        },
        { eventId: 'audit-1', occurredAt: 'not-a-date' },
      ),
    ).toThrow(/ISO timestamp/)
  })
})
