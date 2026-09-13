import type { Capability } from '@/lib/domain/permissions'
import type {
  CourseOfferingStatus,
  EntityStatus,
  RegistrationStatus,
  SemesterStatus,
  StudentStanding,
  UserRole,
} from '@/lib/domain/types'

export interface SessionUser {
  id: string
  name: string
  email: string
  title: string
  role: UserRole
  permissions: Capability[]
}

export interface CredentialRecord extends SessionUser {
  passwordHash: string
  status: 'active' | 'disabled' | 'archived'
}

export interface SessionRecord {
  id: string
  tokenHash: string
  userId: string
  expiresAt: Date
  idleExpiresAt: Date
  rotatedAt: Date
  revokedAt: Date | null
  user: CredentialRecord
}

export interface SessionCreateInput {
  tokenHash: string
  userId: string
  expiresAt: Date
  idleExpiresAt: Date
  requestId: string
  sourceIpHash: string | null
  userAgentHash: string | null
  rotatedFromId?: string
}

export interface LoginThrottleState {
  allowed: boolean
  retryAfterSeconds: number
}

export type DataModeLabel = 'Synthetic demo data' | 'PostgreSQL data'

export interface DataContext {
  mode: DataModeLabel
  referenceTime: string
  currentSemester: { id: string; name: string }
}

export interface DashboardData extends DataContext {
  summary: {
    studentCount: number
    facultyCount: number
    offeringCount: number
    departmentCount: number
    registrationCount: number
    atRiskCount: number
    capacityUtilization: number
    unreadNotifications: number
  }
  cohorts: Array<{ year: string; students: number }>
  departments: Array<{ code: string; name: string; students: number }>
  capacity: Array<{
    offeringId: string
    code: string
    title: string
    enrolled: number
    capacity: number
    utilization: number
  }>
  recentAudit: AuditRow[]
}

export interface StudentRow {
  id: string
  universityId: string
  name: string
  program: string
  departmentCode: string
  gpa: number
  creditsEarned: number
  creditsRequired: number
  standing: StudentStanding
  status: EntityStatus
  version: number
}

export interface FacultyRow {
  id: string
  employeeId: string
  name: string
  departmentCode: string
  rank: string
  office: string
  status: EntityStatus
  version: number
}

export interface DepartmentRow {
  id: string
  code: string
  name: string
  chair: string | null
  studentCount: number
  facultyCount: number
  status: EntityStatus
  version: number
}

export interface CourseRow {
  catalogId: string
  offeringId: string
  code: string
  title: string
  credits: number
  departmentCode: string
  instructor: string | null
  schedule: string
  room: string
  capacity: number
  enrolled: number
  waitlisted: number
  status: CourseOfferingStatus
  semesterId: string
  semesterName: string
  version: number
}

export interface RegistrationRow {
  id: string
  studentId: string
  studentName: string
  universityId: string
  offeringId: string
  courseCode: string
  courseTitle: string
  semesterId: string
  semesterName: string
  status: RegistrationStatus
  waitlistPosition: number | null
  registeredAt: string
  grade: string | null
  version: number
}

export interface SemesterRow {
  id: string
  name: string
  startDate: string
  endDate: string
  registrationOpensAt: string
  registrationClosesAt: string
  isCurrent: boolean
  status: SemesterStatus
  version: number
}

export interface NotificationRow {
  id: string
  level: 'info' | 'success' | 'warning' | 'critical'
  title: string
  message: string
  createdAt: string
  read: boolean
  href: string | null
}

export interface AuditRow {
  id: string
  actorName: string
  actorRole: UserRole | 'system' | 'anonymous'
  action: string
  entityType: string
  entityId: string
  requestId: string
  outcome: 'success' | 'failure' | 'denied'
  summary: string
  createdAt: string
}

export interface SettingsView {
  institutionName: string
  contactEmail: string
  registrationEnabled: boolean
  maxCreditLoad: number
  currentSemesterId: string
  timezone: string
  version: number
}

export interface UserAdministrationRow {
  id: string
  name: string
  email: string
  title: string
  role: UserRole
  status: 'active' | 'disabled' | 'archived'
  version: number
}

export interface ReportsData extends DataContext {
  summary: DashboardData['summary'] & { averageGpa: number }
  standings: Array<{ standing: string; count: number }>
  departments: DashboardData['departments']
}

export interface RecordQuery {
  search?: string
  departmentId?: string
  semesterId?: string
  includeArchived?: boolean
}

export interface RegistrationOptionData extends DataContext {
  students: Array<{ id: string; label: string }>
  offerings: Array<{ id: string; label: string; enrolled: number; capacity: number }>
  registrationEnabled: boolean
}

export interface MutationResult {
  ok: boolean
  code: string
  message: string
}

export interface RegistrationMutationResult extends MutationResult {
  registrationId?: string
  status?: 'registered' | 'waitlisted'
  waitlistPosition?: number | null
}
