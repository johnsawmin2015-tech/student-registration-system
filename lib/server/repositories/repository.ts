import type { Capability } from '@/lib/domain/permissions'
import type { UserRole } from '@/lib/domain/types'
import type {
  AuditRow,
  CourseRow,
  CredentialRecord,
  DashboardData,
  DepartmentRow,
  FacultyRow,
  LoginThrottleState,
  NotificationRow,
  RecordQuery,
  RegistrationMutationResult,
  RegistrationOptionData,
  RegistrationRow,
  ReportsData,
  SemesterRow,
  SessionCreateInput,
  SessionRecord,
  SessionUser,
  SettingsView,
  StudentRow,
  UserAdministrationRow,
} from '../contracts'
import type { RequestContext } from '../request-context'

export interface AuthorizedActor extends SessionUser {
  permissions: Capability[]
}

export interface AuditWrite {
  actorId: string | null
  actorRole: UserRole | 'system' | 'anonymous'
  action: string
  entityType: string
  entityId: string
  requestId: string
  outcome: 'success' | 'failure' | 'denied'
  summary: string
  sourceIpHash: string | null
  userAgentHash: string | null
}

export interface RegisterCommand {
  studentId: string
  offeringId: string
}

export interface DropCommand {
  registrationId: string
  expectedVersion: number
}

export interface ArchiveCommand {
  entity: 'student' | 'faculty' | 'course'
  entityId: string
  expectedVersion: number
  archive: boolean
}

export interface UpdateSettingsCommand {
  institutionName: string
  contactEmail: string
  registrationEnabled: boolean
  maxCreditLoad: number
  currentSemesterId: string
  timezone: string
  expectedVersion: number
}

export interface SetUserRoleCommand {
  userId: string
  role: UserRole
  expectedVersion: number
}

export interface RepositoryHealth {
  ready: boolean
  mode: 'demo' | 'postgres'
  database: 'not-applicable' | 'connected' | 'unavailable'
  migrations: 'not-applicable' | 'current' | 'unknown'
}

export interface UniversityRepository {
  readonly mode: 'demo' | 'postgres'

  findCredentialByEmail(email: string): Promise<CredentialRecord | null>
  getLoginThrottle(identifierHash: string, now: Date): Promise<LoginThrottleState>
  recordLoginFailure(identifierHash: string, now: Date): Promise<void>
  clearLoginFailures(identifierHash: string): Promise<void>
  createSession(input: SessionCreateInput): Promise<SessionRecord>
  findSession(tokenHash: string, now: Date): Promise<SessionRecord | null>
  revokeSession(sessionId: string, now: Date): Promise<void>
  rotateSession(sessionId: string, input: SessionCreateInput, now: Date): Promise<SessionRecord>

  writeAudit(event: AuditWrite): Promise<void>
  dashboard(actor: AuthorizedActor): Promise<DashboardData>
  students(actor: AuthorizedActor, query?: RecordQuery): Promise<StudentRow[]>
  faculty(actor: AuthorizedActor, query?: RecordQuery): Promise<FacultyRow[]>
  departments(actor: AuthorizedActor, query?: RecordQuery): Promise<DepartmentRow[]>
  courses(actor: AuthorizedActor, query?: RecordQuery): Promise<CourseRow[]>
  registrations(actor: AuthorizedActor, query?: RecordQuery): Promise<RegistrationRow[]>
  semesters(actor: AuthorizedActor): Promise<SemesterRow[]>
  reports(actor: AuthorizedActor): Promise<ReportsData>
  notifications(actor: AuthorizedActor): Promise<NotificationRow[]>
  audit(actor: AuthorizedActor): Promise<AuditRow[]>
  settings(actor: AuthorizedActor): Promise<SettingsView>
  userAdministration(actor: AuthorizedActor): Promise<UserAdministrationRow[]>
  registrationOptions(actor: AuthorizedActor): Promise<RegistrationOptionData>

  register(
    actor: AuthorizedActor,
    command: RegisterCommand,
    context: RequestContext,
  ): Promise<RegistrationMutationResult>
  drop(
    actor: AuthorizedActor,
    command: DropCommand,
    context: RequestContext,
  ): Promise<RegistrationMutationResult>
  archive(actor: AuthorizedActor, command: ArchiveCommand, context: RequestContext): Promise<void>
  updateSettings(
    actor: AuthorizedActor,
    command: UpdateSettingsCommand,
    context: RequestContext,
  ): Promise<void>
  setUserRole(
    actor: AuthorizedActor,
    command: SetUserRoleCommand,
    context: RequestContext,
  ): Promise<void>
  markNotificationRead(
    actor: AuthorizedActor,
    notificationId: string,
    context: RequestContext,
  ): Promise<void>
  markAllNotificationsRead(actor: AuthorizedActor, context: RequestContext): Promise<void>

  health(): Promise<RepositoryHealth>
}
