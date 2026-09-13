import { describe, expect, it } from 'vitest'
import {
  assertRegistrationTransition,
  canTransitionRegistration,
  countOccupiedSeats,
  evaluateRegistration,
  nextWaitlistPosition,
  selectNextWaitlistCandidate,
  type RegistrationEvaluationInput,
  type RegistrationEvaluationRegistration,
} from '@/lib/domain/registration'

function registration(
  overrides: Partial<RegistrationEvaluationRegistration> = {},
): RegistrationEvaluationRegistration {
  return {
    id: 'registration-1',
    studentId: 'other-student',
    offeringId: 'offering-1',
    courseCatalogId: 'course-1',
    semesterId: 'semester-1',
    status: 'registered',
    credits: 3,
    meetings: [{ dayOfWeek: 'tuesday', startsAt: '09:00', endsAt: '10:00' }],
    waitlistPosition: null,
    registeredAt: '2026-01-02T10:00:00.000Z',
    ...overrides,
  }
}

function validInput(): RegistrationEvaluationInput {
  return {
    actor: { id: 'staff-1', role: 'staff', authenticated: true },
    student: {
      id: 'student-1',
      status: 'active',
      standing: 'good',
      enrollment: 'enrolled',
      registrationEligible: true,
    },
    offering: {
      id: 'offering-1',
      courseCatalogId: 'course-301',
      semesterId: 'semester-1',
      status: 'open',
      credits: 3,
      capacity: 2,
      prerequisiteCourseIds: [],
      meetings: [{ dayOfWeek: 'monday', startsAt: '09:00', endsAt: '10:30' }],
    },
    semester: {
      id: 'semester-1',
      status: 'active',
      isCurrent: true,
      registrationStartsAt: '2026-01-01T00:00:00.000Z',
      registrationEndsAt: '2026-01-31T23:59:59.999Z',
    },
    settings: {
      currentSemesterId: 'semester-1',
      registrationEnabled: true,
      maxCreditsPerSemester: 18,
    },
    holds: [],
    completedCourseIds: [],
    registrations: [],
    asOf: '2026-01-15T12:00:00.000Z',
  }
}

describe('registration state transitions', () => {
  it.each([
    ['registered', 'dropped'],
    ['registered', 'completed'],
    ['waitlisted', 'registered'],
    ['waitlisted', 'dropped'],
    ['dropped', 'registered'],
    ['dropped', 'waitlisted'],
  ] as const)('allows %s -> %s', (from, to) => {
    expect(canTransitionRegistration(from, to)).toBe(true)
    expect(() => assertRegistrationTransition(from, to)).not.toThrow()
  })

  it.each([
    ['registered', 'waitlisted'],
    ['registered', 'registered'],
    ['completed', 'registered'],
    ['completed', 'dropped'],
    ['waitlisted', 'completed'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(canTransitionRegistration(from, to)).toBe(false)
    expect(() => assertRegistrationTransition(from, to)).toThrow(/cannot transition/)
  })
})

describe('registration evaluation denials', () => {
  const denialCases: ReadonlyArray<{
    label: string
    code: string
    arrange: (input: RegistrationEvaluationInput) => void
  }> = [
    {
      label: 'unauthenticated actor',
      code: 'UNAUTHENTICATED',
      arrange: (input) => {
        input.actor = null
      },
    },
    {
      label: 'missing capability',
      code: 'FORBIDDEN',
      arrange: (input) => {
        input.actor = { id: 'viewer-1', role: 'viewer', authenticated: true }
      },
    },
    {
      label: 'missing student',
      code: 'STUDENT_NOT_FOUND',
      arrange: (input) => {
        input.student = null
      },
    },
    {
      label: 'archived student',
      code: 'STUDENT_INACTIVE',
      arrange: (input) => {
        input.student!.status = 'archived'
      },
    },
    {
      label: 'suspended student',
      code: 'STUDENT_INELIGIBLE',
      arrange: (input) => {
        input.student!.standing = 'suspended'
      },
    },
    {
      label: 'missing offering',
      code: 'OFFERING_NOT_FOUND',
      arrange: (input) => {
        input.offering = null
      },
    },
    {
      label: 'closed offering',
      code: 'OFFERING_INACTIVE',
      arrange: (input) => {
        input.offering!.status = 'closed'
      },
    },
    {
      label: 'missing semester',
      code: 'SEMESTER_NOT_FOUND',
      arrange: (input) => {
        input.semester = null
      },
    },
    {
      label: 'cross-semester offering',
      code: 'OFFERING_SEMESTER_MISMATCH',
      arrange: (input) => {
        input.offering!.semesterId = 'semester-2'
      },
    },
    {
      label: 'non-current semester',
      code: 'SEMESTER_NOT_CURRENT',
      arrange: (input) => {
        input.semester!.isCurrent = false
      },
    },
    {
      label: 'global registration switch off',
      code: 'REGISTRATION_DISABLED',
      arrange: (input) => {
        input.settings.registrationEnabled = false
      },
    },
    {
      label: 'closed registration window',
      code: 'REGISTRATION_WINDOW_CLOSED',
      arrange: (input) => {
        input.asOf = '2026-02-01T00:00:00.000Z'
      },
    },
    {
      label: 'duplicate request',
      code: 'DUPLICATE_REGISTRATION',
      arrange: (input) => {
        input.registrations = [registration({ studentId: 'student-1' })]
      },
    },
    {
      label: 'completed registration reopening',
      code: 'INVALID_REGISTRATION_TRANSITION',
      arrange: (input) => {
        input.registrations = [registration({ studentId: 'student-1', status: 'completed' })]
      },
    },
    {
      label: 'active registration hold',
      code: 'REGISTRATION_HOLD',
      arrange: (input) => {
        input.holds = [
          {
            active: true,
            blocksRegistration: true,
            startsAt: '2026-01-01T00:00:00Z',
            endsAt: null,
          },
        ]
      },
    },
    {
      label: 'missing prerequisite',
      code: 'MISSING_PREREQUISITE',
      arrange: (input) => {
        input.offering!.prerequisiteCourseIds = ['course-200']
      },
    },
    {
      label: 'schedule conflict',
      code: 'SCHEDULE_CONFLICT',
      arrange: (input) => {
        input.registrations = [
          registration({
            studentId: 'student-1',
            offeringId: 'offering-2',
            meetings: [{ dayOfWeek: 'monday', startsAt: '10:00', endsAt: '11:00' }],
          }),
        ]
      },
    },
    {
      label: 'credit overload',
      code: 'CREDIT_LIMIT_EXCEEDED',
      arrange: (input) => {
        input.registrations = [
          registration({ studentId: 'student-1', offeringId: 'offering-2', credits: 18 }),
        ]
      },
    },
    {
      label: 'invalid capacity',
      code: 'INVALID_CAPACITY',
      arrange: (input) => {
        input.offering!.capacity = -1
      },
    },
  ]

  it.each(denialCases)('denies $label', ({ code, arrange }) => {
    const input = validInput()
    arrange(input)
    const result = evaluateRegistration(input)
    expect(result).toMatchObject({ allowed: false, decision: 'denied', code })
  })
})

describe('registration placement', () => {
  it('registers when a seat is available', () => {
    const result = evaluateRegistration(validInput())
    expect(result).toEqual({
      allowed: true,
      decision: 'registered',
      code: 'REGISTERED',
      status: 'registered',
      waitlistPosition: null,
      registeredCount: 0,
      waitlistedCount: 0,
    })
  })

  it('waitlists deterministically when registered and completed seats fill capacity', () => {
    const input = validInput()
    input.registrations = [
      registration({ id: 'seat-1', status: 'registered' }),
      registration({ id: 'seat-2', studentId: 'other-2', status: 'completed' }),
      registration({
        id: 'wait-1',
        studentId: 'other-3',
        status: 'waitlisted',
        waitlistPosition: 1,
      }),
      registration({
        id: 'wait-4',
        studentId: 'other-4',
        status: 'waitlisted',
        waitlistPosition: 4,
      }),
      registration({
        id: 'other-term',
        semesterId: 'semester-2',
        status: 'waitlisted',
        waitlistPosition: 99,
      }),
    ]
    expect(evaluateRegistration(input)).toMatchObject({
      allowed: true,
      decision: 'waitlisted',
      waitlistPosition: 5,
      registeredCount: 2,
      waitlistedCount: 2,
    })
  })

  it('isolates capacity, credits, conflicts and duplicates by semester', () => {
    const input = validInput()
    input.registrations = [
      registration({ id: 'other-term-seat', semesterId: 'semester-2' }),
      registration({
        id: 'other-term-self',
        studentId: 'student-1',
        semesterId: 'semester-2',
        credits: 99,
        meetings: [{ dayOfWeek: 'monday', startsAt: '09:00', endsAt: '10:30' }],
      }),
      registration({ id: 'dropped-seat', status: 'dropped' }),
    ]
    expect(evaluateRegistration(input)).toMatchObject({
      allowed: true,
      decision: 'registered',
      registeredCount: 0,
    })
  })

  it('allows a dropped row to transition back into registration', () => {
    const input = validInput()
    input.registrations = [registration({ studentId: 'student-1', status: 'dropped' })]
    expect(evaluateRegistration(input)).toMatchObject({ allowed: true, status: 'registered' })
  })

  it('calculates capacity and waitlist positions only for the requested offering and term', () => {
    const rows = [
      registration({ id: 'a', status: 'registered' }),
      registration({ id: 'b', status: 'completed', studentId: 'student-b' }),
      registration({ id: 'c', status: 'dropped', studentId: 'student-c' }),
      registration({ id: 'd', status: 'waitlisted', studentId: 'student-d', waitlistPosition: 3 }),
      registration({ id: 'e', semesterId: 'semester-2', status: 'registered' }),
    ]
    expect(countOccupiedSeats(rows, 'offering-1', 'semester-1')).toBe(2)
    expect(nextWaitlistPosition(rows, 'offering-1', 'semester-1')).toBe(4)
  })

  it('selects the next waitlisted candidate by position, request time, then ID', () => {
    const rows = [
      registration({
        id: 'later',
        status: 'waitlisted',
        waitlistPosition: 2,
        registeredAt: '2026-01-03T00:00:00Z',
      }),
      registration({
        id: 'b',
        status: 'waitlisted',
        waitlistPosition: 1,
        registeredAt: '2026-01-02T00:00:00Z',
      }),
      registration({
        id: 'a',
        status: 'waitlisted',
        waitlistPosition: 1,
        registeredAt: '2026-01-02T00:00:00Z',
      }),
      registration({
        id: 'other-term',
        semesterId: 'semester-2',
        status: 'waitlisted',
        waitlistPosition: 0,
      }),
    ]
    expect(selectNextWaitlistCandidate(rows, 'offering-1', 'semester-1')?.id).toBe('a')
  })
})
