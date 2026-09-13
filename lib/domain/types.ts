/**
 * Shared domain contracts.
 *
 * The `*Record` and `*Dto` types are production-facing contracts. The
 * un-suffixed interfaces at the end are retained temporarily so the isolated
 * prototype store compiles while production routes move to server data.
 */

export type UserRole = 'administrator' | 'staff' | 'viewer'

/** @deprecated Prototype-only role spelling. Use {@link UserRole}. */
export type Role = 'admin' | 'staff' | 'viewer'

export type Capability =
  | 'records:read'
  | 'students:write'
  | 'faculty:write'
  | 'departments:write'
  | 'courses:write'
  | 'registrations:manage'
  | 'semesters:manage'
  | 'settings:manage'
  | 'users:manage'
  | 'audit:read'
  | 'reports:read'
  | 'exports:create'
  | 'notifications:write'

export type EntityStatus = 'active' | 'inactive' | 'archived'
export type StudentStanding = 'good' | 'probation' | 'suspended' | 'graduated' | 'withdrawn'
export type EnrollmentState = 'enrolled' | 'leave' | 'graduated' | 'withdrawn'
export type FacultyRank = 'professor' | 'associate' | 'assistant' | 'lecturer' | 'adjunct'
export type EmploymentType = 'full-time' | 'part-time' | 'visiting'
export type RegistrationStatus = 'registered' | 'waitlisted' | 'dropped' | 'completed'
export type LetterGrade =
  'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F' | 'IP' | 'W'
export type TermSeason = 'Fall' | 'Spring' | 'Summer'
export type SemesterStatus = 'planned' | 'active' | 'closed' | 'archived'
export type CourseOfferingStatus = 'draft' | 'open' | 'closed' | 'cancelled' | 'archived'
export type DegreeLevel = 'undergraduate' | 'graduate' | 'doctoral'
export type Gender = 'female' | 'male' | 'nonbinary' | 'undisclosed'
export type DayOfWeek =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export interface UserRecord {
  id: string
  email: string
  displayName: string
  role: UserRole
  status: EntityStatus
  version: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface StudentRecord {
  id: string
  universityId: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  dateOfBirth: string
  gender: Gender
  departmentId: string
  program: string
  degreeLevel: DegreeLevel
  cohortYear: number
  advisorId: string | null
  gpa: number
  creditsEarned: number
  creditsRequired: number
  standing: StudentStanding
  enrollment: EnrollmentState
  status: EntityStatus
  city: string | null
  country: string | null
  notes: string | null
  version: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface FacultyRecord {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  departmentId: string
  rank: FacultyRank
  employment: EmploymentType
  office: string | null
  specialization: string | null
  hireYear: number
  status: EntityStatus
  version: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface DepartmentRecord {
  id: string
  code: string
  name: string
  facultyName: string
  chairId: string | null
  building: string | null
  establishedYear: number | null
  contactEmail: string | null
  status: EntityStatus
  version: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface CourseCatalogEntryRecord {
  id: string
  code: string
  title: string
  departmentId: string
  credits: number
  level: '100' | '200' | '300' | '400' | '500' | '600'
  description: string
  prerequisiteCourseIds: readonly string[]
  status: EntityStatus
  version: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface CoursePrerequisiteRecord {
  courseCatalogId: string
  prerequisiteCourseCatalogId: string
  createdAt: string
}

export interface OfferingMeetingRecord {
  id: string
  offeringId: string
  dayOfWeek: DayOfWeek
  startsAt: string
  endsAt: string
  room: string
}

export interface CourseOfferingRecord {
  id: string
  courseCatalogId: string
  semesterId: string
  instructorId: string | null
  capacity: number
  status: CourseOfferingStatus
  meetings: readonly OfferingMeetingRecord[]
  version: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface SemesterRecord {
  id: string
  name: string
  season: TermSeason
  year: number
  startsAt: string
  endsAt: string
  registrationStartsAt: string
  registrationEndsAt: string
  isCurrent: boolean
  status: SemesterStatus
  version: number
  createdAt: string
  updatedAt: string
}

export interface RegistrationRecord {
  id: string
  studentId: string
  offeringId: string
  semesterId: string
  status: RegistrationStatus
  waitlistPosition: number | null
  grade: LetterGrade | null
  version: number
  registeredAt: string
  updatedAt: string
  droppedAt: string | null
  completedAt: string | null
}

export interface RegistrationHoldRecord {
  id: string
  studentId: string
  kind: 'academic' | 'administrative' | 'financial'
  reasonCode: string
  blocksRegistration: boolean
  active: boolean
  startsAt: string
  endsAt: string | null
}

export interface InstitutionSettingsRecord {
  institutionName: string
  currentSemesterId: string
  registrationEnabled: boolean
  maxCreditsPerSemester: number
  gradingScale: '4.0' | '5.0'
  timezone: string
  contactEmail: string
  version: number
  updatedAt: string
}

export interface NotificationRecord {
  id: string
  recipientUserId: string
  level: 'info' | 'success' | 'warning' | 'critical'
  title: string
  message: string
  entityType: string | null
  entityId: string | null
  href: string | null
  readAt: string | null
  createdAt: string
}

export interface SessionActor {
  id: string
  role: UserRole
  authenticated: true
}

// Privacy-minimized records returned by list and dashboard queries.
export interface StudentListItemDto {
  id: string
  universityId: string
  displayName: string
  program: string
  departmentCode: string
  degreeLevel: DegreeLevel
  standing: StudentStanding
  enrollment: EnrollmentState
  status: EntityStatus
  gpa: number
  creditsEarned: number
  creditsRequired: number
}

export interface FacultyListItemDto {
  id: string
  employeeId: string
  displayName: string
  departmentCode: string
  rank: FacultyRank
  employment: EmploymentType
  office: string
  status: EntityStatus
}

export interface DepartmentListItemDto {
  id: string
  code: string
  name: string
  facultyName: string
  chairName: string | null
  activeStudentCount: number
  activeFacultyCount: number
  activeCourseCount: number
  status: EntityStatus
}

export interface CourseCatalogListItemDto {
  id: string
  code: string
  title: string
  departmentCode: string
  credits: number
  level: CourseCatalogEntryRecord['level']
  prerequisiteCodes: readonly string[]
  status: EntityStatus
}

export interface CourseOfferingListItemDto {
  id: string
  courseCatalogId: string
  code: string
  title: string
  semesterId: string
  semesterName: string
  instructorName: string | null
  capacity: number
  registeredCount: number
  waitlistedCount: number
  availableSeats: number
  utilization: number
  status: CourseOfferingStatus
  meetings: readonly Pick<OfferingMeetingRecord, 'dayOfWeek' | 'startsAt' | 'endsAt' | 'room'>[]
}

export interface RegistrationListItemDto {
  id: string
  studentId: string
  studentUniversityId: string
  studentDisplayName: string
  offeringId: string
  courseCode: string
  courseTitle: string
  semesterId: string
  semesterName: string
  status: RegistrationStatus
  waitlistPosition: number | null
  grade: LetterGrade | null
  registeredAt: string
}

export interface SemesterListItemDto {
  id: string
  name: string
  season: TermSeason
  year: number
  startsAt: string
  endsAt: string
  registrationStartsAt: string
  registrationEndsAt: string
  isCurrent: boolean
  status: SemesterStatus
}

export interface DashboardMetricsDto {
  semesterId: string
  activeStudentCount: number
  participatingStudentCount: number
  activeOfferingCount: number
  registeredCount: number
  waitlistedCount: number
  completedCount: number
  droppedCount: number
  atRiskStudentCount: number
  totalCapacity: number
  occupiedSeats: number
  availableSeats: number
  capacityUtilization: number
}

export interface DashboardDto {
  semester: SemesterListItemDto
  metrics: DashboardMetricsDto
  nearCapacityOfferings: readonly CourseOfferingListItemDto[]
  generatedAt: string
  dataLabel: 'Demo data' | 'Synthetic fixture' | 'Database snapshot'
}

export type DomainErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_FAILED'
  | 'STALE_VERSION'
  | 'REGISTRATION_DENIED'

export interface DomainErrorDto {
  code: DomainErrorCode | string
  message: string
  fieldErrors?: Readonly<Record<string, readonly string[]>>
  requestId?: string
}

export type AuditOutcome = 'success' | 'denied' | 'failure'
export type AuditActorRole = UserRole | 'system' | 'anonymous'
export type AuditSourceChannel = 'web' | 'api' | 'system' | 'job'
export type AuditSafeValue = string | number | boolean | null

export const AUDIT_SUMMARY_KEYS = [
  'reason',
  'field',
  'recordCount',
  'fromStatus',
  'toStatus',
  'semesterId',
  'offeringId',
  'courseCode',
  'setting',
  'method',
  'route',
  'errorCode',
  'exportFormat',
  'result',
  'source',
] as const

export type AuditSummaryKey = (typeof AUDIT_SUMMARY_KEYS)[number]
export type AuditSafeSummary = Readonly<Partial<Record<AuditSummaryKey, AuditSafeValue>>>

export interface AuditEvent {
  id: string
  actorId: string
  actorRole: AuditActorRole
  action: string
  entityType: string
  entityId: string
  occurredAt: string
  requestId: string
  outcome: AuditOutcome
  summary: AuditSafeSummary
  source: Readonly<{
    channel: AuditSourceChannel
    ipHash?: string
    userAgentFamily?: string
  }>
}

export interface BuildAuditEventInput {
  actorId: string
  actorRole: AuditActorRole
  action: string
  entityType: string
  entityId: string
  requestId: string
  outcome: AuditOutcome
  summary?: Readonly<Record<string, AuditSafeValue>>
  source: {
    channel: AuditSourceChannel
    ipHash?: string
    userAgentFamily?: string
  }
}

export interface AuditEventContext {
  eventId: string
  occurredAt: string
}

const auditSummaryKeySet = new Set<string>(AUDIT_SUMMARY_KEYS)
const auditActorRoleSet = new Set<AuditActorRole>([
  'administrator',
  'staff',
  'viewer',
  'system',
  'anonymous',
])
const auditOutcomeSet = new Set<AuditOutcome>(['success', 'denied', 'failure'])
const auditSourceChannelSet = new Set<AuditSourceChannel>(['web', 'api', 'system', 'job'])

function requireAuditText(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new TypeError(`${field} is required.`)
  if (normalized.length > 256) throw new TypeError(`${field} is too long.`)
  return normalized
}

function removeSensitiveText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b(?:bearer|basic)\s+[^\s,;]+/gi, '[redacted-credential]')
    .replace(/\b(?:token|password|secret|cookie)\s*[:=]\s*[^\s,;]+/gi, '[redacted-secret]')
    .slice(0, 256)
}

export function sanitizeAuditSummary(
  summary: Readonly<Record<string, AuditSafeValue>> = {},
): AuditSafeSummary {
  const safeEntries: Array<[AuditSummaryKey, AuditSafeValue]> = []
  for (const [key, value] of Object.entries(summary)) {
    if (!auditSummaryKeySet.has(key)) {
      throw new TypeError(`Audit summary key "${key}" is not allowed.`)
    }
    const safeValue = typeof value === 'string' ? removeSensitiveText(value.trim()) : value
    safeEntries.push([key as AuditSummaryKey, safeValue])
  }
  return Object.freeze(Object.fromEntries(safeEntries)) as AuditSafeSummary
}

/** Build an audit event using identity and time supplied by trusted server context. */
export function buildAuditEvent(
  input: BuildAuditEventInput,
  context: AuditEventContext,
): Readonly<AuditEvent> {
  const occurredAt = requireAuditText(context.occurredAt, 'occurredAt')
  if (Number.isNaN(Date.parse(occurredAt)))
    throw new TypeError('occurredAt must be an ISO timestamp.')
  if (!auditActorRoleSet.has(input.actorRole)) throw new TypeError('actorRole is invalid.')
  if (!auditOutcomeSet.has(input.outcome)) throw new TypeError('outcome is invalid.')
  if (!auditSourceChannelSet.has(input.source.channel))
    throw new TypeError('source.channel is invalid.')

  const source = Object.freeze({
    channel: input.source.channel,
    ...(input.source.ipHash ? { ipHash: removeSensitiveText(input.source.ipHash) } : {}),
    ...(input.source.userAgentFamily
      ? { userAgentFamily: removeSensitiveText(input.source.userAgentFamily) }
      : {}),
  })

  return Object.freeze({
    id: requireAuditText(context.eventId, 'eventId'),
    actorId: requireAuditText(input.actorId, 'actorId'),
    actorRole: input.actorRole,
    action: requireAuditText(input.action, 'action'),
    entityType: requireAuditText(input.entityType, 'entityType'),
    entityId: requireAuditText(input.entityId, 'entityId'),
    occurredAt,
    requestId: requireAuditText(input.requestId, 'requestId'),
    outcome: input.outcome,
    summary: sanitizeAuditSummary(input.summary),
    source,
  })
}

// Legacy fixture-store contracts. These are not production persistence DTOs.
export type NotificationLevel = 'info' | 'success' | 'warning' | 'critical'
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'archive'
  | 'restore'
  | 'register'
  | 'drop'
  | 'login'
  | 'logout'
  | 'export'
  | 'settings'
  | 'grade'
  | 'promote'
export type AuditEntity =
  | 'student'
  | 'faculty'
  | 'department'
  | 'course'
  | 'offering'
  | 'registration'
  | 'semester'
  | 'user'
  | 'system'
  | 'session'

export interface UserAccount {
  id: string
  name: string
  email: string
  role: Role
  title: string
  avatarColor: string
  lastActiveISO: string
}

export interface Student {
  id: string
  universityId: string
  firstName: string
  lastName: string
  email: string
  phone: string
  dateOfBirth: string
  gender: Gender
  departmentId: string
  program: string
  degreeLevel: DegreeLevel
  cohortYear: number
  advisorId: string | null
  gpa: number
  creditsearned: number
  creditsRequired: number
  standing: StudentStanding
  enrollment: EnrollmentState
  status: EntityStatus
  city: string
  country: string
  createdISO: string
  updatedISO: string
  notes: string
}

export interface Faculty {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  email: string
  phone: string
  departmentId: string
  rank: FacultyRank
  employment: EmploymentType
  office: string
  specialization: string
  hireYear: number
  isChair: boolean
  status: EntityStatus
  createdISO: string
  updatedISO: string
  notes: string
}

export interface Department {
  id: string
  code: string
  name: string
  faculty: string
  chairId: string | null
  building: string
  established: number
  email: string
  budget: number
  status: EntityStatus
  createdISO: string
  updatedISO: string
  description: string
}

export interface Course {
  id: string
  code: string
  title: string
  departmentId: string
  instructorId: string | null
  credits: number
  level: CourseCatalogEntryRecord['level']
  capacity: number
  schedule: string
  room: string
  termSeason: TermSeason
  prerequisiteIds: string[]
  status: EntityStatus
  createdISO: string
  updatedISO: string
  description: string
}

export interface Semester {
  id: string
  name: string
  season: TermSeason
  year: number
  startDate: string
  endDate: string
  registrationOpen: boolean
  isCurrent: boolean
}

export interface Registration {
  id: string
  studentId: string
  courseId: string
  semesterId: string
  status: RegistrationStatus
  grade: LetterGrade
  registeredISO: string
  updatedISO: string
}

export interface NotificationItem {
  id: string
  level: NotificationLevel
  title: string
  message: string
  createdISO: string
  read: boolean
  entity?: AuditEntity
  entityId?: string
  href?: string
}

export interface AuditRecord {
  id: string
  actorId: string
  actorName: string
  action: AuditAction
  entity: AuditEntity
  entityId: string
  entityLabel: string
  summary: string
  createdISO: string
}

export interface SystemSettings {
  institutionName: string
  academicYear: string
  currentSemesterId: string
  registrationEnabled: boolean
  gradingScale: '4.0' | '5.0'
  timezone: string
  contactEmail: string
  tableDensity: 'comfortable' | 'compact'
  theme: 'system' | 'light' | 'dark'
  emailNotifications: boolean
  criticalAlerts: boolean
}

export interface DatabaseShape {
  users: UserAccount[]
  students: Student[]
  faculty: Faculty[]
  departments: Department[]
  courses: Course[]
  semesters: Semester[]
  registrations: Registration[]
  notifications: NotificationItem[]
  audit: AuditRecord[]
  settings: SystemSettings
}
