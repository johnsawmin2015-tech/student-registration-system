import { describe, expect, it } from 'vitest'
import {
  calculateCurrentSemesterMetrics,
  calculateOfferingCapacity,
  calculateSemesterMetrics,
  resolveCurrentSemesterId,
} from '@/lib/domain/metrics'

const students = [
  { id: 'student-1', status: 'active' as const, standing: 'good' as const },
  { id: 'student-2', status: 'active' as const, standing: 'probation' as const },
  { id: 'student-3', status: 'archived' as const, standing: 'suspended' as const },
  { id: 'other-term-student', status: 'active' as const, standing: 'probation' as const },
]

const offerings = [
  { id: 'offering-1', semesterId: 'semester-1', status: 'open' as const, capacity: 3 },
  { id: 'offering-2', semesterId: 'semester-1', status: 'closed' as const, capacity: 2 },
  { id: 'draft', semesterId: 'semester-1', status: 'draft' as const, capacity: 100 },
  { id: 'other-term', semesterId: 'semester-2', status: 'open' as const, capacity: 500 },
]

const registrations = [
  {
    studentId: 'student-1',
    offeringId: 'offering-1',
    semesterId: 'semester-1',
    status: 'registered' as const,
  },
  {
    studentId: 'student-2',
    offeringId: 'offering-1',
    semesterId: 'semester-1',
    status: 'completed' as const,
  },
  {
    studentId: 'student-3',
    offeringId: 'offering-2',
    semesterId: 'semester-1',
    status: 'waitlisted' as const,
  },
  {
    studentId: 'student-1',
    offeringId: 'offering-2',
    semesterId: 'semester-1',
    status: 'dropped' as const,
  },
  {
    studentId: 'student-1',
    offeringId: 'draft',
    semesterId: 'semester-1',
    status: 'registered' as const,
  },
  {
    studentId: 'other-term-student',
    offeringId: 'other-term',
    semesterId: 'semester-2',
    status: 'registered' as const,
  },
]

describe('semester-scoped metrics', () => {
  it('counts capacity states for one offering and one semester', () => {
    const capacity = calculateOfferingCapacity(offerings[0], [
      ...registrations,
      {
        studentId: 'outsider',
        offeringId: 'offering-1',
        semesterId: 'semester-2',
        status: 'registered' as const,
      },
    ])
    expect(capacity).toEqual({
      offeringId: 'offering-1',
      semesterId: 'semester-1',
      capacity: 3,
      occupiedSeats: 2,
      registeredCount: 1,
      completedCount: 1,
      waitlistedCount: 0,
      availableSeats: 1,
      utilization: 2 / 3,
    })
  })

  it('derives dashboard metrics without leaking draft or cross-semester records', () => {
    const metrics = calculateSemesterMetrics({
      semesterId: 'semester-1',
      students,
      offerings,
      registrations,
    })
    expect(metrics).toEqual({
      semesterId: 'semester-1',
      activeStudentCount: 2,
      participatingStudentCount: 3,
      activeOfferingCount: 2,
      registeredCount: 1,
      waitlistedCount: 1,
      completedCount: 1,
      droppedCount: 1,
      atRiskStudentCount: 1,
      totalCapacity: 5,
      occupiedSeats: 2,
      availableSeats: 3,
      capacityUtilization: 0.4,
    })
  })

  it('resolves and calculates only the active current semester', () => {
    const semesters = [
      { id: 'semester-1', isCurrent: true, status: 'active' as const },
      { id: 'semester-2', isCurrent: false, status: 'closed' as const },
    ]
    expect(resolveCurrentSemesterId(semesters)).toBe('semester-1')
    expect(
      calculateCurrentSemesterMetrics({ students, offerings, registrations, semesters }).semesterId,
    ).toBe('semester-1')
  })

  it('fails closed when current-semester integrity is missing or ambiguous', () => {
    expect(() => resolveCurrentSemesterId([])).toThrow(/exactly one/)
    expect(() =>
      resolveCurrentSemesterId([
        { id: 'semester-1', isCurrent: true, status: 'active' },
        { id: 'semester-2', isCurrent: true, status: 'active' },
      ]),
    ).toThrow(/found 2/)
  })

  it('rejects invalid capacities rather than hiding corrupt data', () => {
    expect(() =>
      calculateOfferingCapacity(
        { id: 'bad', semesterId: 'semester-1', status: 'open', capacity: -1 },
        [],
      ),
    ).toThrow(RangeError)
  })
})
