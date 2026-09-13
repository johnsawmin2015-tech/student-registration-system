import 'server-only'

import { randomUUID } from 'node:crypto'

import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import {
  auditEvents,
  completedCourses,
  courseCatalog,
  courseOfferings,
  departments,
  faculty,
  loginAttempts,
  notifications,
  offeringMeetings,
  permissions,
  prerequisites,
  registrations,
  rolePermissions,
  roles,
  semesters,
  sessions,
  studentHolds,
  students,
  systemSettings,
  userRoles,
  users,
} from '@/lib/db/schema'
import type { Capability } from '@/lib/domain/permissions'
import { can, isUserRole } from '@/lib/domain/permissions'
import { calculateSemesterMetrics } from '@/lib/domain/metrics'
import {
  evaluateRegistration,
  type RegistrationEvaluationInput,
  type RegistrationEvaluationRegistration,
} from '@/lib/domain/registration'
import type { DayOfWeek, UserRole } from '@/lib/domain/types'
import { LOGIN_BLOCK_MS, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS, SESSION_IDLE_MS } from '../config'
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
  SettingsView,
  StudentRow,
  UserAdministrationRow,
} from '../contracts'
import { AppError } from '../errors'
import type { RequestContext } from '../request-context'
import type {
  ArchiveCommand,
  AuditWrite,
  AuthorizedActor,
  DropCommand,
  RepositoryHealth,
  RegisterCommand,
  SetUserRoleCommand,
  UniversityRepository,
  UpdateSettingsCommand,
} from './repository'

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

const SETTING_KEYS = {
  institutionName: 'institution_name',
  contactEmail: 'contact_email',
  registrationEnabled: 'registration_enabled',
  maxCreditLoad: 'max_credit_load',
  currentSemesterId: 'current_semester_id',
  timezone: 'timezone',
  version: 'settings_version',
} as const

const DAY_NAMES: readonly DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

function requireCapability(actor: AuthorizedActor, capability: Capability): void {
  if (!actor.permissions.includes(capability) || !can(actor.role, capability)) {
    throw new AppError('FORBIDDEN', 'You do not have permission to perform this action.', 403)
  }
}

function numeric(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function settingString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function settingBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function settingNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function mapSettings(rows: Array<{ key: string; value: unknown; version: number }>): SettingsView {
  const values = new Map(rows.map((row) => [row.key, row]))
  const read = (key: string) => values.get(key)?.value
  const versions = rows.map((row) => row.version)
  return {
    institutionName: settingString(read(SETTING_KEYS.institutionName), 'Northstar Demo University'),
    contactEmail: settingString(read(SETTING_KEYS.contactEmail), 'registrar@example.invalid'),
    registrationEnabled: settingBoolean(read(SETTING_KEYS.registrationEnabled), false),
    maxCreditLoad: settingNumber(read(SETTING_KEYS.maxCreditLoad), 18),
    currentSemesterId: settingString(read(SETTING_KEYS.currentSemesterId), ''),
    timezone: settingString(read(SETTING_KEYS.timezone), 'UTC'),
    version: settingNumber(
      read(SETTING_KEYS.version),
      versions.length > 0 ? Math.max(...versions) : 1,
    ),
  }
}

function sessionFromRows(
  session: typeof sessions.$inferSelect,
  credential: CredentialRecord,
): SessionRecord {
  return {
    id: session.id,
    tokenHash: session.tokenHash,
    userId: session.userId,
    expiresAt: session.expiresAt,
    idleExpiresAt: session.idleExpiresAt,
    rotatedAt: session.createdAt,
    revokedAt: session.revokedAt,
    user: credential,
  }
}

function rolePriority(role: UserRole): number {
  return role === 'administrator' ? 3 : role === 'staff' ? 2 : 1
}

async function currentSemesterContext() {
  const [semester] = await db
    .select({ id: semesters.id, name: semesters.name })
    .from(semesters)
    .where(and(eq(semesters.isCurrent, true), ne(semesters.status, 'archived')))
    .limit(1)
  return {
    mode: 'PostgreSQL data' as const,
    referenceTime: new Date().toISOString(),
    currentSemester: semester ?? { id: '', name: 'No current semester' },
  }
}

async function readSettings(): Promise<SettingsView> {
  const rows = await db
    .select({
      key: systemSettings.key,
      value: systemSettings.value,
      version: systemSettings.version,
    })
    .from(systemSettings)
  return mapSettings(rows)
}

async function insertAudit(
  executor: typeof db | DatabaseTransaction,
  event: AuditWrite,
): Promise<void> {
  await executor.insert(auditEvents).values({
    actorUserId: event.actorId,
    actorRoleKey: event.actorRole,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    requestId: event.requestId,
    correlationId: event.requestId,
    outcome: event.outcome,
    changeSummary: { message: event.summary },
    sourceMetadata: {
      sourceIpHash: event.sourceIpHash,
      userAgentHash: event.userAgentHash,
    },
  })
}

function auditFor(
  actor: AuthorizedActor,
  context: RequestContext,
  action: string,
  entityType: string,
  entityId: string,
  outcome: AuditWrite['outcome'],
  summary: string,
): AuditWrite {
  return {
    actorId: actor.id,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    requestId: context.requestId,
    outcome,
    summary,
    sourceIpHash: context.sourceIpHash,
    userAgentHash: context.userAgentHash,
  }
}

function gradeValue(grade: string): number {
  const values: Record<string, number> = {
    A: 10,
    'A-': 9,
    'B+': 8,
    B: 7,
    'B-': 6,
    'C+': 5,
    C: 4,
    'C-': 3,
    D: 2,
    F: 1,
  }
  return values[grade] ?? 0
}

async function transactionSettings(transaction: DatabaseTransaction): Promise<SettingsView> {
  const rows = await transaction
    .select({
      key: systemSettings.key,
      value: systemSettings.value,
      version: systemSettings.version,
    })
    .from(systemSettings)
  return mapSettings(rows)
}

async function registrationEvaluationSnapshot(
  transaction: DatabaseTransaction,
  actor: AuthorizedActor,
  studentId: string,
  offeringId: string,
  asOf: Date,
  omittedRegistrationId?: string,
): Promise<{
  input: RegistrationEvaluationInput
  existing: typeof registrations.$inferSelect | null
  recipientUserId: string | null
}> {
  const [student] = await transaction
    .select({
      id: students.id,
      status: students.status,
      standing: students.standing,
      enrollment: students.enrollmentState,
      userId: students.userId,
    })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1)
  const [offering] = await transaction
    .select({
      id: courseOfferings.id,
      courseCatalogId: courseCatalog.id,
      semesterId: courseOfferings.semesterId,
      status: courseOfferings.status,
      credits: courseCatalog.credits,
      capacity: courseOfferings.capacity,
    })
    .from(courseOfferings)
    .innerJoin(courseCatalog, eq(courseCatalog.id, courseOfferings.courseCatalogId))
    .where(eq(courseOfferings.id, offeringId))
    .limit(1)
  const [semester] = offering
    ? await transaction
        .select()
        .from(semesters)
        .where(eq(semesters.id, offering.semesterId))
        .limit(1)
    : []
  const settings = await transactionSettings(transaction)

  const meetingRows = offering
    ? await transaction
        .select()
        .from(offeringMeetings)
        .where(eq(offeringMeetings.offeringId, offering.id))
    : []
  const prerequisiteRows = offering
    ? await transaction
        .select({
          courseId: prerequisites.prerequisiteCourseCatalogId,
          minimumGrade: prerequisites.minimumGrade,
        })
        .from(prerequisites)
        .where(eq(prerequisites.courseCatalogId, offering.courseCatalogId))
    : []
  const completionRows = student
    ? await transaction
        .select({
          courseId: completedCourses.courseCatalogId,
          grade: completedCourses.grade,
        })
        .from(completedCourses)
        .where(eq(completedCourses.studentId, student.id))
    : []
  const satisfiedCourseIds = completionRows
    .filter((completion) => {
      const requirement = prerequisiteRows.find(
        (prerequisite) => prerequisite.courseId === completion.courseId,
      )
      const minimum = requirement?.minimumGrade ?? 'D'
      return gradeValue(completion.grade) >= gradeValue(minimum)
    })
    .map((completion) => completion.courseId)
  const holdRows = student
    ? await transaction.select().from(studentHolds).where(eq(studentHolds.studentId, student.id))
    : []

  const registrationRows = offering
    ? await transaction
        .select({
          id: registrations.id,
          studentId: registrations.studentId,
          offeringId: registrations.offeringId,
          courseCatalogId: courseCatalog.id,
          semesterId: registrations.semesterId,
          status: registrations.status,
          credits: courseCatalog.credits,
          waitlistPosition: registrations.waitlistPosition,
          registeredAt: registrations.registeredAt,
        })
        .from(registrations)
        .innerJoin(courseOfferings, eq(courseOfferings.id, registrations.offeringId))
        .innerJoin(courseCatalog, eq(courseCatalog.id, courseOfferings.courseCatalogId))
        .where(eq(registrations.semesterId, offering.semesterId))
    : []
  const relatedOfferingIds = [...new Set(registrationRows.map((row) => row.offeringId))]
  const allMeetingRows =
    relatedOfferingIds.length === 0
      ? []
      : await transaction
          .select()
          .from(offeringMeetings)
          .where(inArray(offeringMeetings.offeringId, relatedOfferingIds))
  const meetingsByOffering = new Map<
    string,
    Array<{ dayOfWeek: DayOfWeek; startsAt: string; endsAt: string }>
  >()
  for (const meeting of allMeetingRows) {
    const list = meetingsByOffering.get(meeting.offeringId) ?? []
    list.push({
      dayOfWeek: DAY_NAMES[meeting.dayOfWeek] ?? 'sunday',
      startsAt: meeting.startsAt.slice(0, 5),
      endsAt: meeting.endsAt.slice(0, 5),
    })
    meetingsByOffering.set(meeting.offeringId, list)
  }
  const evaluationRegistrations: RegistrationEvaluationRegistration[] = registrationRows
    .filter((row) => row.id !== omittedRegistrationId)
    .map((row) => ({
      id: row.id,
      studentId: row.studentId,
      offeringId: row.offeringId,
      courseCatalogId: row.courseCatalogId,
      semesterId: row.semesterId,
      status: row.status,
      credits: numeric(row.credits),
      meetings: meetingsByOffering.get(row.offeringId) ?? [],
      waitlistPosition: row.waitlistPosition,
      registeredAt: row.registeredAt.toISOString(),
    }))
  const [existing] = await transaction
    .select()
    .from(registrations)
    .where(and(eq(registrations.studentId, studentId), eq(registrations.offeringId, offeringId)))
    .limit(1)

  return {
    input: {
      actor: { id: actor.id, role: actor.role, authenticated: true },
      student: student
        ? {
            id: student.id,
            status: student.status,
            standing: student.standing,
            enrollment: student.enrollment,
          }
        : null,
      offering: offering
        ? {
            id: offering.id,
            courseCatalogId: offering.courseCatalogId,
            semesterId: offering.semesterId,
            status: offering.status,
            credits: numeric(offering.credits),
            capacity: offering.capacity,
            prerequisiteCourseIds: prerequisiteRows.map((row) => row.courseId),
            meetings: meetingRows.map((meeting) => ({
              dayOfWeek: DAY_NAMES[meeting.dayOfWeek] ?? 'sunday',
              startsAt: meeting.startsAt.slice(0, 5),
              endsAt: meeting.endsAt.slice(0, 5),
            })),
          }
        : null,
      semester: semester
        ? {
            id: semester.id,
            status: semester.status,
            isCurrent: semester.isCurrent,
            registrationStartsAt: semester.registrationStartsAt.toISOString(),
            registrationEndsAt: semester.registrationEndsAt.toISOString(),
          }
        : null,
      settings: {
        currentSemesterId: settings.currentSemesterId,
        registrationEnabled: settings.registrationEnabled,
        maxCreditsPerSemester: settings.maxCreditLoad,
      },
      holds: holdRows.map((hold) => ({
        active: hold.status === 'active',
        blocksRegistration: hold.blocksRegistration,
        startsAt: hold.startsAt.toISOString(),
        endsAt: hold.expiresAt?.toISOString() ?? null,
      })),
      completedCourseIds: satisfiedCourseIds,
      registrations: evaluationRegistrations,
      asOf: asOf.toISOString(),
    },
    existing: existing ?? null,
    recipientUserId: student?.userId ?? null,
  }
}

export class PostgresUniversityRepository implements UniversityRepository {
  readonly mode = 'postgres' as const

  async findCredentialByEmail(email: string): Promise<CredentialRecord | null> {
    const [account] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    if (!account) return null

    const assignedRoles = await db
      .select({ key: roles.key })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          eq(userRoles.userId, account.id),
          isNull(userRoles.revokedAt),
          eq(roles.status, 'active'),
        ),
      )
    const resolvedRoles = assignedRoles
      .map(({ key }) => key)
      .filter(isUserRole)
      .sort((left, right) => rolePriority(right) - rolePriority(left))
    const role = resolvedRoles[0]
    if (!role) return null

    const permissionRows = await db
      .select({ key: permissions.key })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(
        and(
          eq(userRoles.userId, account.id),
          isNull(userRoles.revokedAt),
          isNull(rolePermissions.revokedAt),
          eq(roles.status, 'active'),
          eq(permissions.status, 'active'),
        ),
      )
    const granted = permissionRows
      .map(({ key }) => key)
      .filter((key): key is Capability => can(role, key as Capability))

    return {
      id: account.id,
      name: account.displayName,
      email: account.email,
      title: account.title ?? 'University user',
      role,
      permissions: [...new Set(granted)],
      passwordHash: account.passwordHash,
      status:
        account.status === 'active' && !account.isDisabled
          ? 'active'
          : account.status === 'archived'
            ? 'archived'
            : 'disabled',
    }
  }

  async getLoginThrottle(identifierHash: string, now: Date): Promise<LoginThrottleState> {
    const windowStart = new Date(now.getTime() - LOGIN_WINDOW_MS)
    const windowStartIso = windowStart.toISOString()
    const [{ failures }] = await db
      .select({ failures: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.emailHash, identifierHash),
          eq(loginAttempts.outcome, 'failure'),
          sql`${loginAttempts.attemptedAt} > greatest(
            ${windowStartIso}::timestamptz,
            coalesce(
              (select max(success.attempted_at)
               from ${loginAttempts} success
               where success.email_hash = ${identifierHash}
                 and success.outcome = 'success'),
              ${windowStartIso}::timestamptz
            )
          )`,
        ),
      )
    const count = Number(failures ?? 0)
    return {
      allowed: count < LOGIN_MAX_ATTEMPTS,
      retryAfterSeconds: count < LOGIN_MAX_ATTEMPTS ? 0 : Math.ceil(LOGIN_BLOCK_MS / 1000),
    }
  }

  async recordLoginFailure(identifierHash: string, now: Date): Promise<void> {
    await db.insert(loginAttempts).values({
      emailHash: identifierHash,
      ipHash: identifierHash,
      outcome: 'failure',
      requestId: randomUUID(),
      attemptedAt: now,
    })
  }

  async clearLoginFailures(identifierHash: string): Promise<void> {
    await db.insert(loginAttempts).values({
      emailHash: identifierHash,
      ipHash: identifierHash,
      outcome: 'success',
      requestId: randomUUID(),
    })
  }

  async createSession(input: SessionCreateInput): Promise<SessionRecord> {
    const [created] = await db
      .insert(sessions)
      .values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        csrfTokenHash: input.tokenHash,
        sessionFamilyId: randomUUID(),
        rotatedFromSessionId: input.rotatedFromId,
        ipHash: input.sourceIpHash,
        userAgentSummary: input.userAgentHash,
        expiresAt: input.expiresAt,
        idleExpiresAt: input.idleExpiresAt,
      })
      .returning()
    if (!created) throw new AppError('INTERNAL_ERROR', 'Unable to create session.', 500)
    const credential = await this.findCredentialForUserId(created.userId)
    if (!credential) throw new AppError('AUTHENTICATION_REQUIRED', 'Account is unavailable.', 401)
    return sessionFromRows(created, credential)
  }

  async findSession(tokenHash: string, now: Date): Promise<SessionRecord | null> {
    const [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          sql`${sessions.expiresAt} > ${now.toISOString()}::timestamptz`,
          sql`${sessions.idleExpiresAt} > ${now.toISOString()}::timestamptz`,
        ),
      )
      .limit(1)
    if (!session) return null
    const credential = await this.findCredentialForUserId(session.userId)
    if (!credential || credential.status !== 'active') return null
    const idleExpiresAt = new Date(
      Math.min(session.expiresAt.getTime(), now.getTime() + SESSION_IDLE_MS),
    )
    const [refreshed] = await db
      .update(sessions)
      .set({ idleExpiresAt, lastUsedAt: now, updatedAt: now })
      .where(
        and(
          eq(sessions.id, session.id),
          isNull(sessions.revokedAt),
          sql`${sessions.idleExpiresAt} > ${now.toISOString()}::timestamptz`,
        ),
      )
      .returning()
    return refreshed ? sessionFromRows(refreshed, credential) : null
  }

  async revokeSession(sessionId: string, now: Date): Promise<void> {
    await db
      .update(sessions)
      .set({ revokedAt: now, revokeReason: 'logout', updatedAt: now })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
  }

  async rotateSession(
    sessionId: string,
    input: SessionCreateInput,
    now: Date,
  ): Promise<SessionRecord> {
    return db.transaction(async (transaction) => {
      const [previous] = await transaction
        .update(sessions)
        .set({ revokedAt: now, revokeReason: 'rotated', updatedAt: now })
        .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
        .returning()
      if (!previous) {
        throw new AppError('AUTHENTICATION_REQUIRED', 'Session is no longer active.', 401)
      }
      const [created] = await transaction
        .insert(sessions)
        .values({
          userId: input.userId,
          tokenHash: input.tokenHash,
          csrfTokenHash: input.tokenHash,
          sessionFamilyId: previous.sessionFamilyId,
          rotatedFromSessionId: previous.id,
          ipHash: input.sourceIpHash,
          userAgentSummary: input.userAgentHash,
          expiresAt: input.expiresAt,
          idleExpiresAt: input.idleExpiresAt,
        })
        .returning()
      const credential = await this.findCredentialForUserId(created.userId)
      if (!credential) throw new AppError('AUTHENTICATION_REQUIRED', 'Account is unavailable.', 401)
      return sessionFromRows(created, credential)
    })
  }

  async writeAudit(event: AuditWrite): Promise<void> {
    await insertAudit(db, event)
  }

  private async findCredentialForUserId(userId: string): Promise<CredentialRecord | null> {
    const [account] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    return account ? this.findCredentialByEmail(account.email) : null
  }

  async students(actor: AuthorizedActor, query: RecordQuery = {}): Promise<StudentRow[]> {
    requireCapability(actor, 'records:read')
    const search = query.search?.trim()
    const conditions = [
      query.includeArchived ? undefined : ne(students.status, 'archived'),
      query.departmentId ? eq(students.departmentId, query.departmentId) : undefined,
      search ? ilike(students.program, `%${search}%`) : undefined,
    ].filter((condition) => condition !== undefined)
    const rows = await db
      .select({
        id: students.id,
        universityId: students.universityId,
        firstName: students.firstName,
        lastName: students.lastName,
        program: students.program,
        departmentCode: departments.code,
        gpa: students.gpa,
        creditsEarned: sql<string>`coalesce((
          select sum(${completedCourses.creditsEarned})
          from ${completedCourses}
          where ${completedCourses.studentId} = ${students.id}
        ), 0)`,
        creditsRequired: students.requiredCredits,
        standing: students.standing,
        status: students.status,
        version: students.version,
      })
      .from(students)
      .innerJoin(departments, eq(departments.id, students.departmentId))
      .where(and(...conditions))
      .orderBy(asc(students.lastName), asc(students.firstName), asc(students.id))

    return rows.map((row) => ({
      id: row.id,
      universityId: row.universityId,
      name: `${row.firstName} ${row.lastName}`,
      program: row.program,
      departmentCode: row.departmentCode,
      gpa: numeric(row.gpa),
      creditsEarned: numeric(row.creditsEarned),
      creditsRequired: numeric(row.creditsRequired),
      standing: row.standing,
      status: row.status,
      version: row.version,
    }))
  }

  async faculty(actor: AuthorizedActor, query: RecordQuery = {}): Promise<FacultyRow[]> {
    requireCapability(actor, 'records:read')
    const search = query.search?.trim()
    const conditions = [
      query.includeArchived ? undefined : ne(faculty.status, 'archived'),
      query.departmentId ? eq(faculty.departmentId, query.departmentId) : undefined,
      search
        ? or(
            ilike(departments.code, `%${search}%`),
            sql`${faculty.rank}::text ilike ${`%${search}%`}`,
          )
        : undefined,
    ].filter((condition) => condition !== undefined)
    const rows = await db
      .select({
        id: faculty.id,
        employeeId: faculty.employeeId,
        firstName: faculty.firstName,
        lastName: faculty.lastName,
        departmentCode: departments.code,
        rank: faculty.rank,
        office: faculty.office,
        status: faculty.status,
        version: faculty.version,
      })
      .from(faculty)
      .innerJoin(departments, eq(departments.id, faculty.departmentId))
      .where(and(...conditions))
      .orderBy(asc(faculty.lastName), asc(faculty.firstName), asc(faculty.id))
    return rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      name: `${row.firstName} ${row.lastName}`,
      departmentCode: row.departmentCode,
      rank: row.rank,
      office: row.office ?? 'Not assigned',
      status: row.status,
      version: row.version,
    }))
  }

  async departments(actor: AuthorizedActor, query: RecordQuery = {}): Promise<DepartmentRow[]> {
    requireCapability(actor, 'records:read')
    const search = query.search?.trim()
    const conditions = [
      query.includeArchived ? undefined : ne(departments.status, 'archived'),
      query.departmentId ? eq(departments.id, query.departmentId) : undefined,
      search
        ? or(ilike(departments.code, `%${search}%`), ilike(departments.name, `%${search}%`))
        : undefined,
    ].filter((condition) => condition !== undefined)
    const rows = await db
      .select({
        id: departments.id,
        code: departments.code,
        name: departments.name,
        chair: sql<string | null>`(
          select concat(chair.first_name, ' ', chair.last_name)
          from ${faculty} chair
          where chair.id = ${departments.chairFacultyId}
        )`,
        studentCount: sql<number>`(
          select count(*)::int from ${students}
          where ${students.departmentId} = ${departments.id}
            and ${students.status} = 'active'
        )`,
        facultyCount: sql<number>`(
          select count(*)::int from ${faculty}
          where ${faculty.departmentId} = ${departments.id}
            and ${faculty.status} = 'active'
        )`,
        status: departments.status,
        version: departments.version,
      })
      .from(departments)
      .where(and(...conditions))
      .orderBy(asc(departments.code))
    return rows.map((row) => ({
      ...row,
      studentCount: Number(row.studentCount),
      facultyCount: Number(row.facultyCount),
    }))
  }

  async courses(actor: AuthorizedActor, query: RecordQuery = {}): Promise<CourseRow[]> {
    requireCapability(actor, 'records:read')
    const search = query.search?.trim()
    const conditions = [
      query.includeArchived ? undefined : ne(courseOfferings.status, 'archived'),
      query.departmentId ? eq(courseCatalog.departmentId, query.departmentId) : undefined,
      query.semesterId ? eq(courseOfferings.semesterId, query.semesterId) : undefined,
      search
        ? or(
            ilike(courseCatalog.code, `%${search}%`),
            ilike(courseCatalog.title, `%${search}%`),
            ilike(courseOfferings.sectionCode, `%${search}%`),
          )
        : undefined,
    ].filter((condition) => condition !== undefined)
    const rows = await db
      .select({
        catalogId: courseCatalog.id,
        offeringId: courseOfferings.id,
        code: courseCatalog.code,
        title: courseCatalog.title,
        credits: courseCatalog.credits,
        departmentCode: departments.code,
        instructorFirstName: faculty.firstName,
        instructorLastName: faculty.lastName,
        room: courseOfferings.room,
        capacity: courseOfferings.capacity,
        enrolled: sql<number>`(
          select count(*)::int from ${registrations}
          where ${registrations.offeringId} = ${courseOfferings.id}
            and ${registrations.status} in ('registered', 'completed')
        )`,
        waitlisted: sql<number>`(
          select count(*)::int from ${registrations}
          where ${registrations.offeringId} = ${courseOfferings.id}
            and ${registrations.status} = 'waitlisted'
        )`,
        status: courseOfferings.status,
        semesterId: semesters.id,
        semesterName: semesters.name,
        version: courseOfferings.version,
      })
      .from(courseOfferings)
      .innerJoin(courseCatalog, eq(courseCatalog.id, courseOfferings.courseCatalogId))
      .innerJoin(departments, eq(departments.id, courseCatalog.departmentId))
      .innerJoin(semesters, eq(semesters.id, courseOfferings.semesterId))
      .leftJoin(faculty, eq(faculty.id, courseOfferings.instructorId))
      .where(and(...conditions))
      .orderBy(asc(courseCatalog.code), asc(courseOfferings.sectionCode))

    const offeringIds = rows.map((row) => row.offeringId)
    const meetings =
      offeringIds.length === 0
        ? []
        : await db
            .select()
            .from(offeringMeetings)
            .where(inArray(offeringMeetings.offeringId, offeringIds))
            .orderBy(asc(offeringMeetings.dayOfWeek), asc(offeringMeetings.startsAt))
    const scheduleByOffering = new Map<string, string[]>()
    for (const meeting of meetings) {
      const entries = scheduleByOffering.get(meeting.offeringId) ?? []
      const day = DAY_NAMES[meeting.dayOfWeek] ?? 'sunday'
      entries.push(
        `${day.slice(0, 3).toUpperCase()} ${meeting.startsAt.slice(0, 5)}-${meeting.endsAt.slice(0, 5)}`,
      )
      scheduleByOffering.set(meeting.offeringId, entries)
    }

    return rows.map((row) => ({
      catalogId: row.catalogId,
      offeringId: row.offeringId,
      code: row.code,
      title: row.title,
      credits: numeric(row.credits),
      departmentCode: row.departmentCode,
      instructor:
        row.instructorFirstName && row.instructorLastName
          ? `${row.instructorFirstName} ${row.instructorLastName}`
          : null,
      schedule: scheduleByOffering.get(row.offeringId)?.join(', ') ?? 'To be arranged',
      room: row.room ?? 'To be arranged',
      capacity: row.capacity,
      enrolled: Number(row.enrolled),
      waitlisted: Number(row.waitlisted),
      status: row.status,
      semesterId: row.semesterId,
      semesterName: row.semesterName,
      version: row.version,
    }))
  }

  async registrations(actor: AuthorizedActor, query: RecordQuery = {}): Promise<RegistrationRow[]> {
    requireCapability(actor, 'records:read')
    const search = query.search?.trim()
    const conditions = [
      query.semesterId ? eq(registrations.semesterId, query.semesterId) : undefined,
      search
        ? or(ilike(courseCatalog.code, `%${search}%`), ilike(courseCatalog.title, `%${search}%`))
        : undefined,
    ].filter((condition) => condition !== undefined)
    const rows = await db
      .select({
        id: registrations.id,
        studentId: students.id,
        firstName: students.firstName,
        lastName: students.lastName,
        universityId: students.universityId,
        offeringId: courseOfferings.id,
        courseCode: courseCatalog.code,
        courseTitle: courseCatalog.title,
        semesterId: semesters.id,
        semesterName: semesters.name,
        status: registrations.status,
        waitlistPosition: registrations.waitlistPosition,
        registeredAt: registrations.registeredAt,
        grade: registrations.grade,
        version: registrations.version,
      })
      .from(registrations)
      .innerJoin(students, eq(students.id, registrations.studentId))
      .innerJoin(courseOfferings, eq(courseOfferings.id, registrations.offeringId))
      .innerJoin(courseCatalog, eq(courseCatalog.id, courseOfferings.courseCatalogId))
      .innerJoin(semesters, eq(semesters.id, registrations.semesterId))
      .where(and(...conditions))
      .orderBy(desc(registrations.registeredAt), asc(students.lastName))
    return rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      studentName: `${row.firstName} ${row.lastName}`,
      universityId: row.universityId,
      offeringId: row.offeringId,
      courseCode: row.courseCode,
      courseTitle: row.courseTitle,
      semesterId: row.semesterId,
      semesterName: row.semesterName,
      status: row.status,
      waitlistPosition: row.waitlistPosition,
      registeredAt: row.registeredAt.toISOString(),
      grade: row.grade,
      version: row.version,
    }))
  }

  async semesters(actor: AuthorizedActor): Promise<SemesterRow[]> {
    requireCapability(actor, 'records:read')
    const rows = await db.select().from(semesters).orderBy(desc(semesters.startsOn))
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      startDate: row.startsOn,
      endDate: row.endsOn,
      registrationOpensAt: row.registrationStartsAt.toISOString(),
      registrationClosesAt: row.registrationEndsAt.toISOString(),
      isCurrent: row.isCurrent,
      status: row.status,
      version: row.version,
    }))
  }

  async dashboard(actor: AuthorizedActor): Promise<DashboardData> {
    requireCapability(actor, 'records:read')
    const [context, studentRows, departmentRows, courseRows, registrationRows, notices] =
      await Promise.all([
        currentSemesterContext(),
        this.students(actor),
        this.departments(actor),
        this.courses(actor),
        this.registrations(actor),
        this.notifications(actor),
      ])
    const facultyRows = await this.faculty(actor)
    const cohortCounts = new Map<string, number>()
    const rawCohorts = await db
      .select({ year: students.cohortYear, count: sql<number>`count(*)::int` })
      .from(students)
      .where(eq(students.status, 'active'))
      .groupBy(students.cohortYear)
      .orderBy(asc(students.cohortYear))
    for (const cohort of rawCohorts) {
      cohortCounts.set(String(cohort.year), Number(cohort.count))
    }

    const currentCourses = courseRows.filter(
      (course) => course.semesterId === context.currentSemester.id,
    )
    const semesterMetrics = calculateSemesterMetrics({
      semesterId: context.currentSemester.id,
      students: studentRows,
      offerings: courseRows.map((course) => ({
        id: course.offeringId,
        semesterId: course.semesterId,
        status: course.status,
        capacity: course.capacity,
      })),
      registrations: registrationRows.map((registration) => ({
        studentId: registration.studentId,
        offeringId: registration.offeringId,
        semesterId: registration.semesterId,
        status: registration.status,
      })),
    })
    const capacity = currentCourses.map((course) => ({
      offeringId: course.offeringId,
      code: course.code,
      title: course.title,
      enrolled: course.enrolled,
      capacity: course.capacity,
      utilization:
        course.capacity > 0 ? Math.round((course.enrolled / course.capacity) * 1000) / 10 : 0,
    }))
    const recentAudit =
      actor.permissions.includes('audit:read') && can(actor.role, 'audit:read')
        ? (await this.audit(actor)).slice(0, 5)
        : []

    return {
      ...context,
      summary: {
        studentCount: studentRows.filter((student) => student.status === 'active').length,
        facultyCount: facultyRows.length,
        offeringCount: semesterMetrics.activeOfferingCount,
        departmentCount: departmentRows.length,
        registrationCount: semesterMetrics.registeredCount,
        atRiskCount: semesterMetrics.atRiskStudentCount,
        capacityUtilization: Math.round(semesterMetrics.capacityUtilization * 1000) / 10,
        unreadNotifications: notices.filter((notice) => !notice.read).length,
      },
      cohorts: [...cohortCounts].map(([year, studentCount]) => ({
        year,
        students: studentCount,
      })),
      departments: departmentRows.map((department) => ({
        code: department.code,
        name: department.name,
        students: department.studentCount,
      })),
      capacity,
      recentAudit,
    }
  }

  async reports(actor: AuthorizedActor): Promise<ReportsData> {
    requireCapability(actor, 'reports:read')
    const [dashboard, studentRows] = await Promise.all([
      this.dashboard(actor),
      this.students(actor),
    ])
    const registrationRows = await this.registrations(actor)
    const participatingStudentIds = new Set(
      registrationRows
        .filter(
          (registration) =>
            registration.semesterId === dashboard.currentSemester.id &&
            ['registered', 'waitlisted', 'completed'].includes(registration.status),
        )
        .map((registration) => registration.studentId),
    )
    const scopedStudents = studentRows.filter(
      (student) => student.status === 'active' && participatingStudentIds.has(student.id),
    )
    const standings = new Map<string, number>()
    for (const student of scopedStudents) {
      standings.set(student.standing, (standings.get(student.standing) ?? 0) + 1)
    }
    return {
      mode: dashboard.mode,
      referenceTime: dashboard.referenceTime,
      currentSemester: dashboard.currentSemester,
      summary: {
        ...dashboard.summary,
        averageGpa:
          scopedStudents.length > 0
            ? Math.round(
                (scopedStudents.reduce((sum, student) => sum + student.gpa, 0) /
                  scopedStudents.length) *
                  100,
              ) / 100
            : 0,
      },
      standings: [...standings].map(([standing, count]) => ({ standing, count })),
      departments: dashboard.departments.map((department) => ({
        ...department,
        students: scopedStudents.filter((student) => student.departmentCode === department.code)
          .length,
      })),
    }
  }

  async notifications(actor: AuthorizedActor): Promise<NotificationRow[]> {
    requireCapability(actor, 'records:read')
    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.recipientUserId, actor.id), isNull(notifications.archivedAt)))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(100)
    return rows.map((row) => ({
      id: row.id,
      level: row.level,
      title: row.title,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
      read: row.readAt !== null,
      href: row.href,
    }))
  }

  async audit(actor: AuthorizedActor): Promise<AuditRow[]> {
    requireCapability(actor, 'audit:read')
    const rows = await db
      .select({
        id: auditEvents.id,
        actorName: users.displayName,
        actorRoleKey: auditEvents.actorRoleKey,
        action: auditEvents.action,
        entityType: auditEvents.entityType,
        entityId: auditEvents.entityId,
        requestId: auditEvents.requestId,
        outcome: auditEvents.outcome,
        summary: auditEvents.changeSummary,
        createdAt: auditEvents.occurredAt,
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorUserId))
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
      .limit(250)
    return rows.map((row) => ({
      id: row.id,
      actorName: row.actorName ?? (row.actorRoleKey === 'anonymous' ? 'Anonymous' : 'System'),
      actorRole: isUserRole(row.actorRoleKey)
        ? row.actorRoleKey
        : row.actorRoleKey === 'anonymous'
          ? 'anonymous'
          : 'system',
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId ?? 'not-applicable',
      requestId: row.requestId,
      outcome: row.outcome,
      summary:
        typeof row.summary.message === 'string'
          ? row.summary.message
          : 'Recorded institutional event.',
      createdAt: row.createdAt.toISOString(),
    }))
  }

  async settings(actor: AuthorizedActor): Promise<SettingsView> {
    requireCapability(actor, 'records:read')
    return readSettings()
  }

  async registrationOptions(actor: AuthorizedActor): Promise<RegistrationOptionData> {
    requireCapability(actor, 'registrations:manage')
    const [context, settings, studentRows, courseRows] = await Promise.all([
      currentSemesterContext(),
      readSettings(),
      this.students(actor),
      this.courses(actor),
    ])
    return {
      ...context,
      students: studentRows
        .filter(
          (student) =>
            student.status === 'active' &&
            student.standing !== 'suspended' &&
            student.standing !== 'graduated' &&
            student.standing !== 'withdrawn',
        )
        .map((student) => ({
          id: student.id,
          label: `${student.universityId} — ${student.name}`,
        })),
      offerings: courseRows
        .filter(
          (course) => course.semesterId === context.currentSemester.id && course.status === 'open',
        )
        .map((course) => ({
          id: course.offeringId,
          label: `${course.code} — ${course.title}`,
          enrolled: course.enrolled,
          capacity: course.capacity,
        })),
      registrationEnabled: settings.registrationEnabled,
    }
  }

  async userAdministration(actor: AuthorizedActor): Promise<UserAdministrationRow[]> {
    requireCapability(actor, 'users:manage')
    const rows = await db
      .select({
        id: users.id,
        name: users.displayName,
        email: users.email,
        title: users.title,
        accountStatus: users.status,
        isDisabled: users.isDisabled,
        version: users.version,
        role: roles.key,
      })
      .from(users)
      .leftJoin(userRoles, and(eq(userRoles.userId, users.id), isNull(userRoles.revokedAt)))
      .leftJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.status, 'active')))
      .orderBy(asc(users.displayName), asc(users.id))

    const byUser = new Map<string, UserAdministrationRow>()
    for (const row of rows) {
      const role = isUserRole(row.role) ? row.role : null
      if (!role) continue
      const existing = byUser.get(row.id)
      if (existing && rolePriority(existing.role) >= rolePriority(role)) continue
      byUser.set(row.id, {
        id: row.id,
        name: row.name,
        email: row.email,
        title: row.title ?? 'University user',
        role,
        status:
          row.accountStatus === 'archived'
            ? 'archived'
            : row.isDisabled || row.accountStatus !== 'active'
              ? 'disabled'
              : 'active',
        version: row.version,
      })
    }
    return [...byUser.values()]
  }

  async register(
    actor: AuthorizedActor,
    command: RegisterCommand,
    context: RequestContext,
  ): Promise<RegistrationMutationResult> {
    requireCapability(actor, 'registrations:manage')
    return db.transaction(async (transaction) => {
      // Serialize registration-policy changes with enrollment decisions.
      await transaction.execute(
        sql`select ${systemSettings.key} from ${systemSettings}
            where ${systemSettings.key} = ${SETTING_KEYS.version} for share`,
      )
      await transaction.execute(
        sql`select ${courseOfferings.id} from ${courseOfferings}
            where ${courseOfferings.id} = ${command.offeringId} for update`,
      )
      // A student is the serialization boundary for schedule and credit-load
      // checks across different offerings.
      await transaction.execute(
        sql`select ${students.id} from ${students}
            where ${students.id} = ${command.studentId} for update`,
      )
      const now = new Date()
      const snapshot = await registrationEvaluationSnapshot(
        transaction,
        actor,
        command.studentId,
        command.offeringId,
        now,
      )
      const decision = evaluateRegistration(snapshot.input)
      if (!decision.allowed) {
        await insertAudit(
          transaction,
          auditFor(
            actor,
            context,
            'registration.create',
            'course_offering',
            command.offeringId,
            'denied',
            `Registration denied: ${decision.code}.`,
          ),
        )
        return {
          ok: false,
          code: decision.code,
          message: decision.message,
        }
      }

      const status = decision.status
      const values = {
        studentId: command.studentId,
        offeringId: command.offeringId,
        semesterId: snapshot.input.offering?.semesterId ?? '',
        status,
        waitlistPosition: decision.waitlistPosition,
        registeredAt: now,
        droppedAt: null,
        completedAt: null,
        grade: null,
        updatedAt: now,
      } as const
      const [saved] = snapshot.existing
        ? await transaction
            .update(registrations)
            .set({
              ...values,
              version: sql`${registrations.version} + 1`,
            })
            .where(
              and(
                eq(registrations.id, snapshot.existing.id),
                eq(registrations.status, 'dropped'),
                eq(registrations.version, snapshot.existing.version),
              ),
            )
            .returning()
        : await transaction.insert(registrations).values(values).returning()
      if (!saved) {
        throw new AppError('STALE_WRITE', 'The registration changed before it could be saved.', 409)
      }

      const recipientUserId = snapshot.recipientUserId ?? actor.id
      await transaction.insert(notifications).values({
        recipientUserId,
        level: status === 'registered' ? 'success' : 'info',
        title: status === 'registered' ? 'Registration confirmed' : 'Waitlist position assigned',
        message:
          status === 'registered'
            ? 'The requested course registration was completed.'
            : `The student was added to waitlist position ${decision.waitlistPosition}.`,
        entityType: 'registration',
        entityId: saved.id,
        href: '/registrations',
      })
      await insertAudit(
        transaction,
        auditFor(
          actor,
          context,
          'registration.create',
          'registration',
          saved.id,
          'success',
          status === 'registered'
            ? 'Student registered for an offering.'
            : 'Student placed on the offering waitlist.',
        ),
      )
      return {
        ok: true,
        code: decision.code,
        message:
          status === 'registered'
            ? 'Registration completed.'
            : `Added to waitlist position ${decision.waitlistPosition}.`,
        registrationId: saved.id,
        status,
        waitlistPosition: decision.waitlistPosition,
      }
    })
  }

  async drop(
    actor: AuthorizedActor,
    command: DropCommand,
    context: RequestContext,
  ): Promise<RegistrationMutationResult> {
    requireCapability(actor, 'registrations:manage')
    return db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select ${registrations.id} from ${registrations}
            where ${registrations.id} = ${command.registrationId} for update`,
      )
      const [existing] = await transaction
        .select()
        .from(registrations)
        .where(eq(registrations.id, command.registrationId))
        .limit(1)
      if (!existing) throw new AppError('NOT_FOUND', 'Registration was not found.', 404)
      if (existing.version !== command.expectedVersion) {
        throw new AppError('STALE_WRITE', 'The registration changed. Refresh and try again.', 409)
      }
      if (existing.status !== 'registered' && existing.status !== 'waitlisted') {
        throw new AppError(
          'CONFLICT',
          'Only an active registration or waitlist entry can be dropped.',
          409,
        )
      }

      await transaction.execute(
        sql`select ${courseOfferings.id} from ${courseOfferings}
            where ${courseOfferings.id} = ${existing.offeringId} for update`,
      )
      const now = new Date()
      const [dropped] = await transaction
        .update(registrations)
        .set({
          status: 'dropped',
          waitlistPosition: null,
          grade: 'W',
          droppedAt: now,
          updatedAt: now,
          version: sql`${registrations.version} + 1`,
        })
        .where(
          and(
            eq(registrations.id, existing.id),
            eq(registrations.version, command.expectedVersion),
          ),
        )
        .returning()
      if (!dropped) {
        throw new AppError('STALE_WRITE', 'The registration changed. Refresh and try again.', 409)
      }

      if (existing.status === 'waitlisted' && existing.waitlistPosition !== null) {
        await transaction
          .update(registrations)
          .set({
            waitlistPosition: sql`${registrations.waitlistPosition} - 1`,
            updatedAt: now,
            version: sql`${registrations.version} + 1`,
          })
          .where(
            and(
              eq(registrations.offeringId, existing.offeringId),
              eq(registrations.status, 'waitlisted'),
              sql`${registrations.waitlistPosition} > ${existing.waitlistPosition}`,
            ),
          )
      }

      let promotedId: string | null = null
      if (existing.status === 'registered') {
        const candidates = await transaction
          .select({
            id: registrations.id,
            studentId: registrations.studentId,
            position: registrations.waitlistPosition,
          })
          .from(registrations)
          .where(
            and(
              eq(registrations.offeringId, existing.offeringId),
              eq(registrations.status, 'waitlisted'),
            ),
          )
          .orderBy(
            asc(registrations.waitlistPosition),
            asc(registrations.registeredAt),
            asc(registrations.id),
          )
        for (const candidate of candidates) {
          await transaction.execute(
            sql`select ${students.id} from ${students}
                where ${students.id} = ${candidate.studentId} for update`,
          )
          const snapshot = await registrationEvaluationSnapshot(
            transaction,
            actor,
            candidate.studentId,
            existing.offeringId,
            now,
            candidate.id,
          )
          const decision = evaluateRegistration(snapshot.input)
          if (!decision.allowed || decision.status !== 'registered') continue
          const [promoted] = await transaction
            .update(registrations)
            .set({
              status: 'registered',
              waitlistPosition: null,
              registeredAt: now,
              updatedAt: now,
              version: sql`${registrations.version} + 1`,
            })
            .where(and(eq(registrations.id, candidate.id), eq(registrations.status, 'waitlisted')))
            .returning()
          if (!promoted) continue
          promotedId = promoted.id
          if (candidate.position !== null) {
            await transaction
              .update(registrations)
              .set({
                waitlistPosition: sql`${registrations.waitlistPosition} - 1`,
                updatedAt: now,
                version: sql`${registrations.version} + 1`,
              })
              .where(
                and(
                  eq(registrations.offeringId, existing.offeringId),
                  eq(registrations.status, 'waitlisted'),
                  sql`${registrations.waitlistPosition} > ${candidate.position}`,
                ),
              )
          }
          await transaction.insert(notifications).values({
            recipientUserId: snapshot.recipientUserId ?? actor.id,
            level: 'success',
            title: 'Promoted from waitlist',
            message: 'An available seat was assigned to the next eligible student.',
            entityType: 'registration',
            entityId: promoted.id,
            href: '/registrations',
          })
          await insertAudit(
            transaction,
            auditFor(
              actor,
              context,
              'registration.waitlist.promote',
              'registration',
              promoted.id,
              'success',
              'Next eligible waitlist entry promoted after a drop.',
            ),
          )
          break
        }
      }

      await insertAudit(
        transaction,
        auditFor(
          actor,
          context,
          'registration.drop',
          'registration',
          existing.id,
          'success',
          promotedId
            ? 'Registration dropped and an eligible waitlist entry promoted.'
            : 'Registration or waitlist entry dropped.',
        ),
      )
      return {
        ok: true,
        code: promotedId ? 'DROPPED_AND_PROMOTED' : 'DROPPED',
        message: promotedId
          ? 'Registration dropped; the next eligible waitlist entry was promoted.'
          : 'Registration dropped.',
        registrationId: existing.id,
      }
    })
  }

  async archive(
    actor: AuthorizedActor,
    command: ArchiveCommand,
    context: RequestContext,
  ): Promise<void> {
    const capability: Capability =
      command.entity === 'student'
        ? 'students:write'
        : command.entity === 'faculty'
          ? 'faculty:write'
          : 'courses:write'
    requireCapability(actor, capability)
    await db.transaction(async (transaction) => {
      const nextStatus = command.archive ? 'archived' : 'active'
      const archivedAt = command.archive ? new Date() : null
      const now = new Date()
      let updatedId: string | undefined

      if (command.entity === 'student') {
        await transaction.execute(
          sql`select ${students.id} from ${students}
              where ${students.id} = ${command.entityId} for update`,
        )
        if (command.archive) {
          const [dependency] = await transaction
            .select({ id: registrations.id })
            .from(registrations)
            .where(
              and(
                eq(registrations.studentId, command.entityId),
                inArray(registrations.status, ['registered', 'waitlisted']),
              ),
            )
            .limit(1)
          if (dependency) {
            throw new AppError(
              'CONFLICT',
              'Drop active registrations and waitlist entries before archiving this student.',
              409,
            )
          }
        }
        const [updated] = await transaction
          .update(students)
          .set({
            status: nextStatus,
            archivedAt,
            updatedAt: now,
            version: sql`${students.version} + 1`,
          })
          .where(
            and(eq(students.id, command.entityId), eq(students.version, command.expectedVersion)),
          )
          .returning({ id: students.id })
        updatedId = updated?.id
      } else if (command.entity === 'faculty') {
        if (command.archive) {
          const [chairDependency] = await transaction
            .select({ id: departments.id })
            .from(departments)
            .where(eq(departments.chairFacultyId, command.entityId))
            .limit(1)
          const [offeringDependency] = await transaction
            .select({ id: courseOfferings.id })
            .from(courseOfferings)
            .where(
              and(
                eq(courseOfferings.instructorId, command.entityId),
                inArray(courseOfferings.status, ['draft', 'open']),
              ),
            )
            .limit(1)
          if (chairDependency || offeringDependency) {
            throw new AppError(
              'CONFLICT',
              'Reassign chair and active teaching responsibilities before archiving this faculty record.',
              409,
            )
          }
        }
        const [updated] = await transaction
          .update(faculty)
          .set({
            status: nextStatus,
            archivedAt,
            updatedAt: now,
            version: sql`${faculty.version} + 1`,
          })
          .where(
            and(eq(faculty.id, command.entityId), eq(faculty.version, command.expectedVersion)),
          )
          .returning({ id: faculty.id })
        updatedId = updated?.id
      } else {
        if (command.archive) {
          const [offeringDependency] = await transaction
            .select({ id: courseOfferings.id })
            .from(courseOfferings)
            .where(
              and(
                eq(courseOfferings.courseCatalogId, command.entityId),
                inArray(courseOfferings.status, ['draft', 'open']),
              ),
            )
            .limit(1)
          if (offeringDependency) {
            throw new AppError(
              'CONFLICT',
              'Close active offerings before archiving this catalog course.',
              409,
            )
          }
        }
        const [updated] = await transaction
          .update(courseCatalog)
          .set({
            status: nextStatus,
            archivedAt,
            updatedAt: now,
            version: sql`${courseCatalog.version} + 1`,
          })
          .where(
            and(
              eq(courseCatalog.id, command.entityId),
              eq(courseCatalog.version, command.expectedVersion),
            ),
          )
          .returning({ id: courseCatalog.id })
        updatedId = updated?.id
      }

      if (!updatedId) {
        throw new AppError(
          'STALE_WRITE',
          'The record was not found or changed. Refresh and try again.',
          409,
        )
      }
      await insertAudit(
        transaction,
        auditFor(
          actor,
          context,
          command.archive ? `${command.entity}.archive` : `${command.entity}.restore`,
          command.entity,
          updatedId,
          'success',
          command.archive ? 'Record archived.' : 'Record restored.',
        ),
      )
    })
  }

  async updateSettings(
    actor: AuthorizedActor,
    command: UpdateSettingsCommand,
    context: RequestContext,
  ): Promise<void> {
    requireCapability(actor, 'settings:manage')
    await db.transaction(async (transaction) => {
      const [currentVersionRow] = await transaction
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, SETTING_KEYS.version))
        .for('update')
        .limit(1)
      const currentVersion = settingNumber(currentVersionRow?.value, 1)
      if (currentVersion !== command.expectedVersion) {
        throw new AppError('STALE_WRITE', 'Settings changed. Refresh and try again.', 409)
      }
      const [semester] = await transaction
        .select({ id: semesters.id })
        .from(semesters)
        .where(and(eq(semesters.id, command.currentSemesterId), ne(semesters.status, 'archived')))
        .limit(1)
      if (!semester) {
        throw new AppError('INVALID_INPUT', 'Select an available semester.', 422)
      }

      const nextVersion = currentVersion + 1
      const updates: Array<{
        key: string
        valueType: 'boolean' | 'number' | 'string'
        value: unknown
        description: string
      }> = [
        {
          key: SETTING_KEYS.institutionName,
          valueType: 'string',
          value: command.institutionName,
          description: 'Institution display name.',
        },
        {
          key: SETTING_KEYS.contactEmail,
          valueType: 'string',
          value: command.contactEmail,
          description: 'Registrar contact email.',
        },
        {
          key: SETTING_KEYS.registrationEnabled,
          valueType: 'boolean',
          value: command.registrationEnabled,
          description: 'Global registration switch.',
        },
        {
          key: SETTING_KEYS.maxCreditLoad,
          valueType: 'number',
          value: command.maxCreditLoad,
          description: 'Maximum current-semester credit load.',
        },
        {
          key: SETTING_KEYS.currentSemesterId,
          valueType: 'string',
          value: command.currentSemesterId,
          description: 'Current semester identifier.',
        },
        {
          key: SETTING_KEYS.timezone,
          valueType: 'string',
          value: command.timezone,
          description: 'Institution timezone.',
        },
        {
          key: SETTING_KEYS.version,
          valueType: 'number',
          value: nextVersion,
          description: 'Optimistic concurrency version for settings.',
        },
      ]
      for (const update of updates) {
        await transaction
          .insert(systemSettings)
          .values({
            ...update,
            updatedByUserId: actor.id,
            version: nextVersion,
          })
          .onConflictDoUpdate({
            target: systemSettings.key,
            set: {
              valueType: update.valueType,
              value: update.value,
              description: update.description,
              updatedByUserId: actor.id,
              updatedAt: new Date(),
              version: nextVersion,
            },
          })
      }
      await transaction
        .update(semesters)
        .set({ isCurrent: false, updatedAt: new Date() })
        .where(and(eq(semesters.isCurrent, true), ne(semesters.id, semester.id)))
      await transaction
        .update(semesters)
        .set({ isCurrent: true, updatedAt: new Date() })
        .where(eq(semesters.id, semester.id))
      await insertAudit(
        transaction,
        auditFor(
          actor,
          context,
          'settings.update',
          'system_settings',
          'institution',
          'success',
          'Allowlisted institution settings updated.',
        ),
      )
    })
  }

  async setUserRole(
    actor: AuthorizedActor,
    command: SetUserRoleCommand,
    context: RequestContext,
  ): Promise<void> {
    requireCapability(actor, 'users:manage')
    await db.transaction(async (transaction) => {
      if (command.userId === actor.id) {
        throw new AppError('CONFLICT', 'You cannot change your own role.', 409)
      }
      // Serialize all role assignments, then re-check the actor from durable
      // grants. This prevents two administrators from authorizing each other
      // with stale sessions while concurrently removing the last admins.
      await transaction.execute(sql`select pg_advisory_xact_lock(724417744101)`)
      const [freshActorGrant] = await transaction
        .select({ id: users.id })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(
          and(
            eq(users.id, actor.id),
            eq(users.status, 'active'),
            eq(users.isDisabled, false),
            isNull(userRoles.revokedAt),
            eq(roles.status, 'active'),
            isNull(rolePermissions.revokedAt),
            eq(permissions.status, 'active'),
            eq(permissions.key, 'users:manage'),
          ),
        )
        .limit(1)
      if (!freshActorGrant) {
        throw new AppError('FORBIDDEN', 'You do not have permission to perform this action.', 403)
      }
      await transaction.execute(
        sql`select ${users.id} from ${users} where ${users.id} = ${command.userId} for update`,
      )
      const [target] = await transaction
        .select({
          id: users.id,
          status: users.status,
          isDisabled: users.isDisabled,
          version: users.version,
        })
        .from(users)
        .where(eq(users.id, command.userId))
        .limit(1)
      if (!target || target.status !== 'active' || target.isDisabled) {
        throw new AppError('NOT_FOUND', 'Active user account was not found.', 404)
      }
      if (target.version !== command.expectedVersion) {
        throw new AppError('STALE_WRITE', 'The user account changed. Refresh and try again.', 409)
      }
      const [desiredRole] = await transaction
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.key, command.role), eq(roles.status, 'active')))
        .limit(1)
      if (!desiredRole) throw new AppError('INVALID_INPUT', 'Select an active role.', 422)

      const currentRows = await transaction
        .select({ id: roles.id, key: roles.key })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(
          and(
            eq(userRoles.userId, target.id),
            isNull(userRoles.revokedAt),
            eq(roles.status, 'active'),
          ),
        )
      const currentRoles = currentRows.map((row) => row.key).filter(isUserRole)
      if (currentRoles.includes('administrator') && command.role !== 'administrator') {
        const [{ count: activeAdministratorCount }] = await transaction
          .select({ count: sql<number>`count(distinct ${users.id})::int` })
          .from(users)
          .innerJoin(userRoles, eq(userRoles.userId, users.id))
          .innerJoin(roles, eq(roles.id, userRoles.roleId))
          .where(
            and(
              eq(users.status, 'active'),
              eq(users.isDisabled, false),
              isNull(userRoles.revokedAt),
              eq(roles.key, 'administrator'),
              eq(roles.status, 'active'),
            ),
          )
        if (Number(activeAdministratorCount) <= 1) {
          throw new AppError('CONFLICT', 'At least one active administrator must remain.', 409)
        }
      }
      if (currentRoles.length === 1 && currentRoles[0] === command.role) {
        await insertAudit(
          transaction,
          auditFor(
            actor,
            context,
            'user.role_change',
            'user',
            target.id,
            'success',
            'Role assignment was already current; no account change was needed.',
          ),
        )
        return
      }

      const now = new Date()
      await transaction
        .update(userRoles)
        .set({ revokedAt: now })
        .where(and(eq(userRoles.userId, target.id), isNull(userRoles.revokedAt)))
      await transaction
        .insert(userRoles)
        .values({
          userId: target.id,
          roleId: desiredRole.id,
          grantedByUserId: actor.id,
          grantedAt: now,
          revokedAt: null,
        })
        .onConflictDoUpdate({
          target: [userRoles.userId, userRoles.roleId],
          set: {
            grantedByUserId: actor.id,
            grantedAt: now,
            revokedAt: null,
          },
        })
      const [updated] = await transaction
        .update(users)
        .set({ updatedAt: now, version: sql`${users.version} + 1` })
        .where(and(eq(users.id, target.id), eq(users.version, command.expectedVersion)))
        .returning({ id: users.id })
      if (!updated) {
        throw new AppError('STALE_WRITE', 'The user account changed. Refresh and try again.', 409)
      }
      await transaction
        .update(sessions)
        .set({
          revokedAt: now,
          revokeReason: 'role_changed',
          updatedAt: now,
          version: sql`${sessions.version} + 1`,
        })
        .where(and(eq(sessions.userId, target.id), isNull(sessions.revokedAt)))
      await insertAudit(
        transaction,
        auditFor(
          actor,
          context,
          'user.role_change',
          'user',
          target.id,
          'success',
          `Changed account role from ${currentRoles.join(', ') || 'none'} to ${command.role}; active sessions revoked.`,
        ),
      )
    })
  }

  async markNotificationRead(
    actor: AuthorizedActor,
    notificationId: string,
    context: RequestContext,
  ): Promise<void> {
    requireCapability(actor, 'notifications:write')
    const [updated] = await db
      .update(notifications)
      .set({
        readAt: new Date(),
        updatedAt: new Date(),
        version: sql`${notifications.version} + 1`,
      })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.recipientUserId, actor.id),
          isNull(notifications.archivedAt),
        ),
      )
      .returning({ id: notifications.id })
    if (!updated) throw new AppError('NOT_FOUND', 'Notification was not found.', 404)
    await this.writeAudit(
      auditFor(
        actor,
        context,
        'notification.read',
        'notification',
        updated.id,
        'success',
        'Notification marked as read.',
      ),
    )
  }

  async markAllNotificationsRead(actor: AuthorizedActor, context: RequestContext): Promise<void> {
    requireCapability(actor, 'notifications:write')
    await db
      .update(notifications)
      .set({
        readAt: new Date(),
        updatedAt: new Date(),
        version: sql`${notifications.version} + 1`,
      })
      .where(
        and(
          eq(notifications.recipientUserId, actor.id),
          isNull(notifications.readAt),
          isNull(notifications.archivedAt),
        ),
      )
    await this.writeAudit(
      auditFor(
        actor,
        context,
        'notification.read_all',
        'notification',
        actor.id,
        'success',
        'All visible notifications marked as read.',
      ),
    )
  }

  async health(): Promise<RepositoryHealth> {
    try {
      const result = await db.execute(
        sql`select to_regclass('drizzle.__drizzle_migrations') as migration_table`,
      )
      const first = result[0] as { migration_table?: string | null } | undefined
      const migrations = first?.migration_table ? 'current' : 'unknown'
      return {
        ready: migrations === 'current',
        mode: 'postgres',
        database: 'connected',
        migrations,
      }
    } catch {
      return {
        ready: false,
        mode: 'postgres',
        database: 'unavailable',
        migrations: 'unknown',
      }
    }
  }
}

let repository: PostgresUniversityRepository | undefined

export function getPostgresRepository(): PostgresUniversityRepository {
  repository ??= new PostgresUniversityRepository()
  return repository
}
