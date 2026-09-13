import { hasCapability } from './permissions'
import type {
  CourseOfferingStatus,
  DayOfWeek,
  EnrollmentState,
  EntityStatus,
  RegistrationStatus,
  SemesterStatus,
  StudentStanding,
  UserRole,
} from './types'

export const REGISTRATION_TRANSITIONS: Readonly<
  Record<RegistrationStatus, readonly RegistrationStatus[]>
> = Object.freeze({
  registered: Object.freeze(['dropped', 'completed'] as const),
  waitlisted: Object.freeze(['registered', 'dropped'] as const),
  dropped: Object.freeze(['registered', 'waitlisted'] as const),
  completed: Object.freeze([] as const),
})

export function canTransitionRegistration(
  from: RegistrationStatus,
  to: RegistrationStatus,
): boolean {
  return REGISTRATION_TRANSITIONS[from].includes(to)
}

export class RegistrationTransitionError extends Error {
  readonly code = 'INVALID_REGISTRATION_TRANSITION'
  readonly from: RegistrationStatus
  readonly to: RegistrationStatus

  constructor(from: RegistrationStatus, to: RegistrationStatus) {
    super(`Registration cannot transition from ${from} to ${to}.`)
    this.name = 'RegistrationTransitionError'
    this.from = from
    this.to = to
  }
}

export function assertRegistrationTransition(
  from: RegistrationStatus,
  to: RegistrationStatus,
): void {
  if (!canTransitionRegistration(from, to)) throw new RegistrationTransitionError(from, to)
}

export interface RegistrationMeeting {
  dayOfWeek: DayOfWeek
  startsAt: string
  endsAt: string
}

export interface RegistrationEvaluationActor {
  id: string | null
  role: UserRole | string | null
  authenticated: boolean
}

export interface RegistrationEvaluationStudent {
  id: string
  status: EntityStatus
  standing: StudentStanding
  enrollment: EnrollmentState
  registrationEligible?: boolean
}

export interface RegistrationEvaluationOffering {
  id: string
  courseCatalogId: string
  semesterId: string
  status: CourseOfferingStatus
  credits: number
  capacity: number
  prerequisiteCourseIds: readonly string[]
  meetings: readonly RegistrationMeeting[]
}

export interface RegistrationEvaluationSemester {
  id: string
  status: SemesterStatus
  isCurrent: boolean
  registrationStartsAt: string
  registrationEndsAt: string
}

export interface RegistrationEvaluationSettings {
  currentSemesterId: string
  registrationEnabled: boolean
  maxCreditsPerSemester: number
}

export interface RegistrationEvaluationHold {
  active: boolean
  blocksRegistration: boolean
  startsAt: string
  endsAt: string | null
}

/** A repository projection containing only fields required by the evaluator. */
export interface RegistrationEvaluationRegistration {
  id: string
  studentId: string
  offeringId: string
  courseCatalogId: string
  semesterId: string
  status: RegistrationStatus
  credits: number
  meetings: readonly RegistrationMeeting[]
  waitlistPosition: number | null
  registeredAt: string
}

export interface RegistrationEvaluationInput {
  actor: RegistrationEvaluationActor | null
  student: RegistrationEvaluationStudent | null
  offering: RegistrationEvaluationOffering | null
  semester: RegistrationEvaluationSemester | null
  settings: RegistrationEvaluationSettings
  holds: readonly RegistrationEvaluationHold[]
  completedCourseIds: readonly string[]
  registrations: readonly RegistrationEvaluationRegistration[]
  asOf: string
}

export type RegistrationDenialCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'STUDENT_NOT_FOUND'
  | 'STUDENT_INACTIVE'
  | 'STUDENT_INELIGIBLE'
  | 'OFFERING_NOT_FOUND'
  | 'OFFERING_INACTIVE'
  | 'SEMESTER_NOT_FOUND'
  | 'OFFERING_SEMESTER_MISMATCH'
  | 'SEMESTER_NOT_CURRENT'
  | 'REGISTRATION_DISABLED'
  | 'REGISTRATION_WINDOW_CLOSED'
  | 'DUPLICATE_REGISTRATION'
  | 'REGISTRATION_HOLD'
  | 'MISSING_PREREQUISITE'
  | 'SCHEDULE_CONFLICT'
  | 'CREDIT_LIMIT_EXCEEDED'
  | 'INVALID_CAPACITY'
  | 'INVALID_REGISTRATION_TRANSITION'

export interface RegistrationDeniedResult {
  allowed: false
  decision: 'denied'
  code: RegistrationDenialCode
  message: string
}

export interface RegistrationAcceptedResult {
  allowed: true
  decision: 'registered' | 'waitlisted'
  code: 'REGISTERED' | 'WAITLISTED'
  status: 'registered' | 'waitlisted'
  waitlistPosition: number | null
  registeredCount: number
  waitlistedCount: number
}

export type RegistrationEvaluationResult = RegistrationDeniedResult | RegistrationAcceptedResult

const occupyingStatuses = new Set<RegistrationStatus>(['registered', 'completed'])
const duplicateStatuses = new Set<RegistrationStatus>(['registered', 'waitlisted'])

function deny(code: RegistrationDenialCode, message: string): RegistrationDeniedResult {
  return { allowed: false, decision: 'denied', code, message }
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function isRegistrationWindowOpen(semester: RegistrationEvaluationSemester, asOf: string): boolean {
  const now = timestamp(asOf)
  const startsAt = timestamp(semester.registrationStartsAt)
  const endsAt = timestamp(semester.registrationEndsAt)
  return now !== null && startsAt !== null && endsAt !== null && startsAt <= now && now <= endsAt
}

function isBlockingHold(hold: RegistrationEvaluationHold, asOf: string): boolean {
  if (!hold.active || !hold.blocksRegistration) return false
  const now = timestamp(asOf)
  const startsAt = timestamp(hold.startsAt)
  const endsAt = hold.endsAt === null ? null : timestamp(hold.endsAt)
  if (now === null || startsAt === null || (hold.endsAt !== null && endsAt === null)) return true
  return startsAt <= now && (endsAt === null || now <= endsAt)
}

function toMinuteOfDay(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

export function meetingsConflict(left: RegistrationMeeting, right: RegistrationMeeting): boolean {
  if (left.dayOfWeek !== right.dayOfWeek) return false
  const leftStart = toMinuteOfDay(left.startsAt)
  const leftEnd = toMinuteOfDay(left.endsAt)
  const rightStart = toMinuteOfDay(right.startsAt)
  const rightEnd = toMinuteOfDay(right.endsAt)
  if (leftStart === null || leftEnd === null || rightStart === null || rightEnd === null) {
    return true
  }
  return leftStart < rightEnd && rightStart < leftEnd
}

export function hasScheduleConflict(
  requestedMeetings: readonly RegistrationMeeting[],
  registrations: readonly RegistrationEvaluationRegistration[],
): boolean {
  return registrations.some(
    (registration) =>
      registration.status === 'registered' &&
      requestedMeetings.some((requested) =>
        registration.meetings.some((existing) => meetingsConflict(requested, existing)),
      ),
  )
}

export function countOccupiedSeats(
  registrations: readonly RegistrationEvaluationRegistration[],
  offeringId: string,
  semesterId: string,
): number {
  return registrations.filter(
    (registration) =>
      registration.offeringId === offeringId &&
      registration.semesterId === semesterId &&
      occupyingStatuses.has(registration.status),
  ).length
}

export function nextWaitlistPosition(
  registrations: readonly RegistrationEvaluationRegistration[],
  offeringId: string,
  semesterId: string,
): number {
  const positions = registrations
    .filter(
      (registration) =>
        registration.offeringId === offeringId &&
        registration.semesterId === semesterId &&
        registration.status === 'waitlisted',
    )
    .map((registration) => registration.waitlistPosition ?? 0)
    .filter((position) => Number.isInteger(position) && position > 0)
  return (positions.length ? Math.max(...positions) : 0) + 1
}

export function selectNextWaitlistCandidate(
  registrations: readonly RegistrationEvaluationRegistration[],
  offeringId: string,
  semesterId: string,
): RegistrationEvaluationRegistration | null {
  const candidates = registrations
    .filter(
      (registration) =>
        registration.offeringId === offeringId &&
        registration.semesterId === semesterId &&
        registration.status === 'waitlisted',
    )
    .slice()
    .sort((left, right) => {
      const leftPosition = left.waitlistPosition ?? Number.MAX_SAFE_INTEGER
      const rightPosition = right.waitlistPosition ?? Number.MAX_SAFE_INTEGER
      return (
        leftPosition - rightPosition ||
        left.registeredAt.localeCompare(right.registeredAt) ||
        left.id.localeCompare(right.id)
      )
    })
  return candidates[0] ?? null
}

function isEligibleStudent(student: RegistrationEvaluationStudent): boolean {
  return (
    student.registrationEligible !== false &&
    student.enrollment === 'enrolled' &&
    student.standing !== 'suspended' &&
    student.standing !== 'withdrawn' &&
    student.standing !== 'graduated'
  )
}

/**
 * Produces a deterministic registration decision from an already consistent
 * repository snapshot. The service must re-check this snapshot and write the
 * result inside one database transaction/lock to prevent final-seat races.
 */
export function evaluateRegistration(
  input: RegistrationEvaluationInput,
): RegistrationEvaluationResult {
  const { actor, student, offering, semester, settings, registrations } = input

  if (!actor?.authenticated || !actor.id) {
    return deny('UNAUTHENTICATED', 'Authentication is required.')
  }
  if (!hasCapability(actor.role, 'registrations:manage')) {
    return deny('FORBIDDEN', 'You do not have permission to manage registrations.')
  }
  if (!student) return deny('STUDENT_NOT_FOUND', 'Student was not found.')
  if (student.status !== 'active') {
    return deny('STUDENT_INACTIVE', 'The student record is not active.')
  }
  if (!isEligibleStudent(student)) {
    return deny('STUDENT_INELIGIBLE', 'The student is not eligible to register.')
  }
  if (!offering) return deny('OFFERING_NOT_FOUND', 'Course offering was not found.')
  if (offering.status !== 'open') {
    return deny('OFFERING_INACTIVE', 'The course offering is not open for registration.')
  }
  if (!semester) return deny('SEMESTER_NOT_FOUND', 'Semester was not found.')
  if (offering.semesterId !== semester.id) {
    return deny('OFFERING_SEMESTER_MISMATCH', 'The offering does not belong to this semester.')
  }
  if (
    semester.id !== settings.currentSemesterId ||
    !semester.isCurrent ||
    semester.status !== 'active'
  ) {
    return deny('SEMESTER_NOT_CURRENT', 'Registration is limited to the current semester.')
  }
  if (!settings.registrationEnabled) {
    return deny('REGISTRATION_DISABLED', 'Registration is currently disabled.')
  }
  if (!isRegistrationWindowOpen(semester, input.asOf)) {
    return deny('REGISTRATION_WINDOW_CLOSED', 'The semester registration window is closed.')
  }

  const sameStudentOffering = registrations.find(
    (registration) =>
      registration.studentId === student.id &&
      registration.offeringId === offering.id &&
      registration.semesterId === semester.id,
  )
  if (sameStudentOffering && duplicateStatuses.has(sameStudentOffering.status)) {
    return deny('DUPLICATE_REGISTRATION', 'The student already has this course offering.')
  }
  if (sameStudentOffering?.status === 'completed') {
    return deny('INVALID_REGISTRATION_TRANSITION', 'A completed registration cannot be reopened.')
  }
  if (input.holds.some((hold) => isBlockingHold(hold, input.asOf))) {
    return deny('REGISTRATION_HOLD', 'An active hold prevents registration.')
  }

  const completed = new Set(input.completedCourseIds)
  const missingPrerequisite = offering.prerequisiteCourseIds.some(
    (courseId) => !completed.has(courseId),
  )
  if (missingPrerequisite) {
    return deny('MISSING_PREREQUISITE', 'The student has not completed all prerequisites.')
  }

  const currentStudentRegistrations = registrations.filter(
    (registration) =>
      registration.studentId === student.id &&
      registration.semesterId === semester.id &&
      registration.offeringId !== offering.id &&
      occupyingStatuses.has(registration.status),
  )
  if (hasScheduleConflict(offering.meetings, currentStudentRegistrations)) {
    return deny('SCHEDULE_CONFLICT', 'The course offering conflicts with the student schedule.')
  }

  const existingCredits = currentStudentRegistrations.reduce(
    (sum, registration) => sum + registration.credits,
    0,
  )
  if (
    !Number.isFinite(settings.maxCreditsPerSemester) ||
    settings.maxCreditsPerSemester < 0 ||
    existingCredits + offering.credits > settings.maxCreditsPerSemester
  ) {
    return deny('CREDIT_LIMIT_EXCEEDED', 'Registration would exceed the semester credit limit.')
  }
  if (!Number.isInteger(offering.capacity) || offering.capacity < 0) {
    return deny('INVALID_CAPACITY', 'The course offering capacity is invalid.')
  }

  const registeredCount = countOccupiedSeats(registrations, offering.id, semester.id)
  const waitlistedCount = registrations.filter(
    (registration) =>
      registration.offeringId === offering.id &&
      registration.semesterId === semester.id &&
      registration.status === 'waitlisted',
  ).length
  const status: 'registered' | 'waitlisted' =
    registeredCount < offering.capacity ? 'registered' : 'waitlisted'

  if (sameStudentOffering?.status === 'dropped' && !canTransitionRegistration('dropped', status)) {
    return deny('INVALID_REGISTRATION_TRANSITION', 'The existing registration cannot be reopened.')
  }

  if (status === 'waitlisted') {
    return {
      allowed: true,
      decision: 'waitlisted',
      code: 'WAITLISTED',
      status,
      waitlistPosition: nextWaitlistPosition(registrations, offering.id, semester.id),
      registeredCount,
      waitlistedCount,
    }
  }

  return {
    allowed: true,
    decision: 'registered',
    code: 'REGISTERED',
    status,
    waitlistPosition: null,
    registeredCount,
    waitlistedCount,
  }
}

export const evaluateRegistrationRequest = evaluateRegistration
