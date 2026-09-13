import 'server-only'

import { hash } from '@node-rs/argon2'
import type { Capability } from '@/lib/domain/permissions'
import { can } from '@/lib/domain/permissions'
import { calculateSemesterMetrics } from '@/lib/domain/metrics'
import { evaluateRegistration, type RegistrationEvaluationResult } from '@/lib/domain/registration'
import type { DayOfWeek, StudentStanding, UserRole } from '@/lib/domain/types'
import {
  demoPassword,
  LOGIN_BLOCK_MS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
  SESSION_IDLE_MS,
} from '../config'
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

const DEMO_NOW = new Date('2026-01-05T12:00:00.000Z')
const DEMO_DAYS: Readonly<Record<string, DayOfWeek>> = {
  Sun: 'sunday',
  Mon: 'monday',
  Tue: 'tuesday',
  Wed: 'wednesday',
  Thu: 'thursday',
  Fri: 'friday',
  Sat: 'saturday',
}

function demoMeetings(schedule: string) {
  return schedule.split(',').flatMap((part) => {
    const match = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(part.trim())
    return match ? [{ dayOfWeek: DEMO_DAYS[match[1]], startsAt: match[2], endsAt: match[3] }] : []
  })
}

interface DemoStudent extends StudentRow {
  departmentId: string
  enrollment: 'enrolled' | 'leave' | 'graduated' | 'withdrawn'
  blocked: boolean
  cohortYear: number
}

interface DemoFaculty extends FacultyRow {
  departmentId: string
  isChair: boolean
}

interface DemoDepartment extends Omit<DepartmentRow, 'studentCount' | 'facultyCount' | 'chair'> {
  chairId: string | null
}

interface DemoCatalog {
  id: string
  code: string
  title: string
  credits: number
  departmentId: string
  status: 'active' | 'archived'
  prerequisiteIds: string[]
  version: number
}

interface DemoOffering {
  id: string
  catalogId: string
  semesterId: string
  instructorId: string | null
  capacity: number
  room: string
  schedule: string
  status: 'open' | 'closed' | 'draft' | 'cancelled' | 'archived'
  version: number
}

interface DemoRegistration {
  id: string
  studentId: string
  offeringId: string
  status: 'registered' | 'waitlisted' | 'dropped' | 'completed'
  waitlistPosition: number | null
  registeredAt: string
  grade: string | null
  version: number
}

interface DemoHold {
  studentId: string
  active: boolean
}

interface DemoCompletion {
  studentId: string
  catalogId: string
  grade: string
}

interface DemoNotification extends NotificationRow {
  userId: string | null
}

interface DemoCredential extends CredentialRecord {
  version: number
}

interface DemoState {
  users: DemoCredential[]
  sessions: Map<string, SessionRecord>
  attempts: Map<string, { windowStartedAt: number; count: number; blockedUntil: number | null }>
  students: DemoStudent[]
  faculty: DemoFaculty[]
  departments: DemoDepartment[]
  catalog: DemoCatalog[]
  offerings: DemoOffering[]
  registrations: DemoRegistration[]
  completions: DemoCompletion[]
  holds: DemoHold[]
  semesters: SemesterRow[]
  notifications: DemoNotification[]
  audit: AuditRow[]
  settings: SettingsView
  nextId: number
}

class Mutex {
  private current: Promise<void> = Promise.resolve()

  async run<T>(operation: () => Promise<T> | T): Promise<T> {
    let release: () => void = () => {}
    const previous = this.current
    this.current = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }
}

function rolePermissions(role: UserRole): Capability[] {
  const candidates: Capability[] = [
    'records:read',
    'students:write',
    'faculty:write',
    'departments:write',
    'courses:write',
    'registrations:manage',
    'semesters:manage',
    'settings:manage',
    'users:manage',
    'audit:read',
    'reports:read',
    'exports:create',
    'notifications:write',
  ]
  return candidates.filter((capability) => can(role, capability))
}

function requireCapability(actor: AuthorizedActor, capability: Capability) {
  if (!actor.permissions.includes(capability) || !can(actor.role, capability)) {
    throw new AppError('FORBIDDEN', 'You do not have permission to perform this action.', 403)
  }
}

function iso(value: string): string {
  return new Date(value).toISOString()
}

async function buildDemoState(): Promise<DemoState> {
  const passwordHash = await hash(demoPassword(), {
    // @node-rs/argon2 exposes Argon2id as ambient const-enum value 2.
    algorithm: 2,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
  })
  const user = (
    id: string,
    name: string,
    email: string,
    role: UserRole,
    title: string,
  ): DemoCredential => ({
    id,
    name,
    email,
    role,
    title,
    permissions: rolePermissions(role),
    passwordHash,
    status: 'active',
    version: 1,
  })
  const departments: DemoDepartment[] = [
    {
      id: 'dept-cs',
      code: 'CS',
      name: 'Computer Science',
      chairId: 'fac-001',
      status: 'active',
      version: 1,
    },
    {
      id: 'dept-math',
      code: 'MATH',
      name: 'Mathematics',
      chairId: 'fac-003',
      status: 'active',
      version: 1,
    },
    {
      id: 'dept-bio',
      code: 'BIO',
      name: 'Biological Sciences',
      chairId: 'fac-004',
      status: 'active',
      version: 1,
    },
    {
      id: 'dept-bus',
      code: 'BUS',
      name: 'Business Studies',
      chairId: 'fac-005',
      status: 'active',
      version: 1,
    },
  ]
  const faculty: DemoFaculty[] = [
    {
      id: 'fac-001',
      employeeId: 'NDU-F-001',
      name: 'Demo Faculty 001',
      departmentId: 'dept-cs',
      departmentCode: 'CS',
      rank: 'Professor',
      office: 'Demo Hall 101',
      status: 'active',
      isChair: true,
      version: 1,
    },
    {
      id: 'fac-002',
      employeeId: 'NDU-F-002',
      name: 'Demo Faculty 002',
      departmentId: 'dept-cs',
      departmentCode: 'CS',
      rank: 'Lecturer',
      office: 'Demo Hall 102',
      status: 'active',
      isChair: false,
      version: 1,
    },
    {
      id: 'fac-003',
      employeeId: 'NDU-F-003',
      name: 'Demo Faculty 003',
      departmentId: 'dept-math',
      departmentCode: 'MATH',
      rank: 'Professor',
      office: 'Demo Hall 201',
      status: 'active',
      isChair: true,
      version: 1,
    },
    {
      id: 'fac-004',
      employeeId: 'NDU-F-004',
      name: 'Demo Faculty 004',
      departmentId: 'dept-bio',
      departmentCode: 'BIO',
      rank: 'Professor',
      office: 'Demo Hall 301',
      status: 'active',
      isChair: true,
      version: 1,
    },
    {
      id: 'fac-005',
      employeeId: 'NDU-F-005',
      name: 'Demo Faculty 005',
      departmentId: 'dept-bus',
      departmentCode: 'BUS',
      rank: 'Professor',
      office: 'Demo Hall 401',
      status: 'active',
      isChair: true,
      version: 1,
    },
  ]
  const student = (
    n: number,
    departmentId: string,
    departmentCode: string,
    program: string,
    standing: StudentStanding = 'good',
  ): DemoStudent => ({
    id: `stu-${String(n).padStart(3, '0')}`,
    universityId: `NDU-2025-${String(n).padStart(4, '0')}`,
    name: `Synthetic Student ${String(n).padStart(3, '0')}`,
    program,
    departmentId,
    departmentCode,
    gpa: standing === 'probation' ? 2.1 : Number((3.05 + n * 0.05).toFixed(2)),
    creditsEarned: 18 + n * 3,
    creditsRequired: 120,
    standing,
    status: 'active',
    enrollment: 'enrolled',
    blocked: false,
    cohortYear: n < 5 ? 2024 : 2025,
    version: 1,
  })
  const students: DemoStudent[] = [
    student(1, 'dept-cs', 'CS', 'BSc Computer Science'),
    student(2, 'dept-cs', 'CS', 'BSc Computer Science'),
    student(3, 'dept-cs', 'CS', 'BSc Software Engineering'),
    student(4, 'dept-math', 'MATH', 'BSc Mathematics'),
    student(5, 'dept-bio', 'BIO', 'BSc Biology', 'probation'),
    student(6, 'dept-bus', 'BUS', 'BBA Business'),
    student(7, 'dept-cs', 'CS', 'BSc Computer Science'),
    student(8, 'dept-math', 'MATH', 'BSc Mathematics'),
  ]
  students.push({
    ...student(9, 'dept-cs', 'CS', 'BSc Computer Science'),
    standing: 'suspended',
    enrollment: 'leave',
  })
  students.push({ ...student(10, 'dept-bio', 'BIO', 'BSc Biology'), status: 'archived' })

  const catalog: DemoCatalog[] = [
    {
      id: 'cat-cs101',
      code: 'CS-101',
      title: 'Programming Foundations',
      credits: 3,
      departmentId: 'dept-cs',
      status: 'active',
      prerequisiteIds: [],
      version: 1,
    },
    {
      id: 'cat-cs201',
      code: 'CS-201',
      title: 'Data Structures',
      credits: 3,
      departmentId: 'dept-cs',
      status: 'active',
      prerequisiteIds: ['cat-cs101'],
      version: 1,
    },
    {
      id: 'cat-cs205',
      code: 'CS-205',
      title: 'Systems Laboratory',
      credits: 3,
      departmentId: 'dept-cs',
      status: 'active',
      prerequisiteIds: ['cat-cs101'],
      version: 1,
    },
    {
      id: 'cat-ma101',
      code: 'MATH-101',
      title: 'Calculus I',
      credits: 4,
      departmentId: 'dept-math',
      status: 'active',
      prerequisiteIds: [],
      version: 1,
    },
    {
      id: 'cat-bi101',
      code: 'BIO-101',
      title: 'Foundations of Biology',
      credits: 4,
      departmentId: 'dept-bio',
      status: 'active',
      prerequisiteIds: [],
      version: 1,
    },
    {
      id: 'cat-bu101',
      code: 'BUS-101',
      title: 'Principles of Management',
      credits: 3,
      departmentId: 'dept-bus',
      status: 'active',
      prerequisiteIds: [],
      version: 1,
    },
  ]
  const offerings: DemoOffering[] = [
    {
      id: 'off-cs101',
      catalogId: 'cat-cs101',
      semesterId: 'sem-s26',
      instructorId: 'fac-002',
      capacity: 3,
      room: 'Demo Hall 110',
      schedule: 'Mon 09:00-10:30',
      status: 'open',
      version: 1,
    },
    {
      id: 'off-cs201',
      catalogId: 'cat-cs201',
      semesterId: 'sem-s26',
      instructorId: 'fac-001',
      capacity: 2,
      room: 'Demo Hall 120',
      schedule: 'Mon 11:00-12:30',
      status: 'open',
      version: 1,
    },
    {
      id: 'off-cs205',
      catalogId: 'cat-cs205',
      semesterId: 'sem-s26',
      instructorId: 'fac-002',
      capacity: 4,
      room: 'Demo Lab 1',
      schedule: 'Mon 09:00-10:30',
      status: 'open',
      version: 1,
    },
    {
      id: 'off-ma101',
      catalogId: 'cat-ma101',
      semesterId: 'sem-s26',
      instructorId: 'fac-003',
      capacity: 4,
      room: 'Demo Hall 210',
      schedule: 'Tue 09:00-10:30',
      status: 'open',
      version: 1,
    },
    {
      id: 'off-bi101',
      catalogId: 'cat-bi101',
      semesterId: 'sem-s26',
      instructorId: 'fac-004',
      capacity: 3,
      room: 'Demo Lab 2',
      schedule: 'Wed 09:00-10:30',
      status: 'open',
      version: 1,
    },
    {
      id: 'off-bu101',
      catalogId: 'cat-bu101',
      semesterId: 'sem-s26',
      instructorId: 'fac-005',
      capacity: 3,
      room: 'Demo Hall 410',
      schedule: 'Thu 13:00-14:30',
      status: 'open',
      version: 1,
    },
  ]
  const registrations: DemoRegistration[] = [
    {
      id: 'reg-001',
      studentId: 'stu-001',
      offeringId: 'off-cs201',
      status: 'registered',
      waitlistPosition: null,
      registeredAt: iso('2025-12-18'),
      grade: null,
      version: 1,
    },
    {
      id: 'reg-002',
      studentId: 'stu-002',
      offeringId: 'off-cs201',
      status: 'registered',
      waitlistPosition: null,
      registeredAt: iso('2025-12-19'),
      grade: null,
      version: 1,
    },
    {
      id: 'reg-003',
      studentId: 'stu-003',
      offeringId: 'off-cs201',
      status: 'waitlisted',
      waitlistPosition: 1,
      registeredAt: iso('2025-12-20'),
      grade: null,
      version: 1,
    },
    {
      id: 'reg-004',
      studentId: 'stu-004',
      offeringId: 'off-ma101',
      status: 'registered',
      waitlistPosition: null,
      registeredAt: iso('2025-12-21'),
      grade: null,
      version: 1,
    },
    {
      id: 'reg-005',
      studentId: 'stu-005',
      offeringId: 'off-bi101',
      status: 'registered',
      waitlistPosition: null,
      registeredAt: iso('2025-12-22'),
      grade: null,
      version: 1,
    },
    {
      id: 'reg-006',
      studentId: 'stu-006',
      offeringId: 'off-bu101',
      status: 'registered',
      waitlistPosition: null,
      registeredAt: iso('2025-12-23'),
      grade: null,
      version: 1,
    },
  ]
  return {
    users: [
      user(
        'user-admin',
        'Demo Administrator',
        'admin@northstar.demo',
        'administrator',
        'Demo Registrar',
      ),
      user(
        'user-staff',
        'Demo Staff Member',
        'staff@northstar.demo',
        'staff',
        'Demo Academic Coordinator',
      ),
      user('user-viewer', 'Demo Viewer', 'viewer@northstar.demo', 'viewer', 'Demo Auditor'),
    ],
    sessions: new Map(),
    attempts: new Map(),
    students,
    faculty,
    departments,
    catalog,
    offerings,
    registrations,
    completions: [
      { studentId: 'stu-001', catalogId: 'cat-cs101', grade: 'B+' },
      { studentId: 'stu-002', catalogId: 'cat-cs101', grade: 'A-' },
      { studentId: 'stu-003', catalogId: 'cat-cs101', grade: 'B' },
      { studentId: 'stu-007', catalogId: 'cat-cs101', grade: 'A' },
    ],
    holds: [{ studentId: 'stu-008', active: true }],
    semesters: [
      {
        id: 'sem-f25',
        name: 'Fall 2025',
        startDate: '2025-09-02',
        endDate: '2025-12-19',
        registrationOpensAt: iso('2025-07-01'),
        registrationClosesAt: iso('2025-08-22'),
        isCurrent: false,
        status: 'closed',
        version: 1,
      },
      {
        id: 'sem-s26',
        name: 'Spring 2026',
        startDate: '2026-01-20',
        endDate: '2026-05-15',
        registrationOpensAt: iso('2025-12-15'),
        registrationClosesAt: iso('2026-01-16T23:59:59Z'),
        isCurrent: true,
        status: 'active',
        version: 1,
      },
      {
        id: 'sem-su26',
        name: 'Summer 2026',
        startDate: '2026-06-01',
        endDate: '2026-08-14',
        registrationOpensAt: iso('2026-04-01'),
        registrationClosesAt: iso('2026-05-15'),
        isCurrent: false,
        status: 'planned',
        version: 1,
      },
    ],
    notifications: [
      {
        id: 'note-001',
        userId: null,
        level: 'info',
        title: 'Synthetic registration window',
        message: 'Spring 2026 registration is open in this fixed-date demo.',
        createdAt: iso('2026-01-05T09:00:00Z'),
        read: false,
        href: '/registrations',
      },
      {
        id: 'note-002',
        userId: null,
        level: 'warning',
        title: 'Course at capacity',
        message: 'CS-201 is full; one synthetic student is waitlisted.',
        createdAt: iso('2026-01-04T12:00:00Z'),
        read: false,
        href: '/courses',
      },
    ],
    audit: [
      {
        id: 'audit-001',
        actorName: 'System',
        actorRole: 'system',
        action: 'seed',
        entityType: 'system',
        entityId: 'demo-fixture',
        requestId: 'seed-2026-01-05',
        outcome: 'success',
        summary: 'Loaded deterministic synthetic demonstration records.',
        createdAt: iso('2026-01-05T08:00:00Z'),
      },
    ],
    settings: {
      institutionName: 'Northstar Demo University',
      contactEmail: 'registrar@northstar.demo',
      registrationEnabled: true,
      maxCreditLoad: 18,
      currentSemesterId: 'sem-s26',
      timezone: 'UTC',
      version: 1,
    },
    nextId: 100,
  }
}

function normalizeSearch(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('en-US') ?? ''
}

function activeRegistration(registration: DemoRegistration) {
  return registration.status === 'registered'
}

export class DemoUniversityRepository implements UniversityRepository {
  readonly mode = 'demo' as const
  private readonly mutex = new Mutex()

  constructor(private readonly state: DemoState) {}

  async findCredentialByEmail(email: string) {
    return this.state.users.find((item) => item.email.toLowerCase() === email.toLowerCase()) ?? null
  }

  async getLoginThrottle(identifierHash: string, now: Date): Promise<LoginThrottleState> {
    const entry = this.state.attempts.get(identifierHash)
    if (!entry) return { allowed: true, retryAfterSeconds: 0 }
    if (entry.blockedUntil && entry.blockedUntil > now.getTime()) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((entry.blockedUntil - now.getTime()) / 1000),
      }
    }
    return { allowed: true, retryAfterSeconds: 0 }
  }

  async recordLoginFailure(identifierHash: string, now: Date) {
    await this.mutex.run(() => {
      const existing = this.state.attempts.get(identifierHash)
      const expired = !existing || now.getTime() - existing.windowStartedAt >= LOGIN_WINDOW_MS
      const entry = expired
        ? { windowStartedAt: now.getTime(), count: 1, blockedUntil: null as number | null }
        : { ...existing, count: existing.count + 1 }
      if (entry.count >= LOGIN_MAX_ATTEMPTS) entry.blockedUntil = now.getTime() + LOGIN_BLOCK_MS
      this.state.attempts.set(identifierHash, entry)
    })
  }

  async clearLoginFailures(identifierHash: string) {
    this.state.attempts.delete(identifierHash)
  }

  async createSession(input: SessionCreateInput): Promise<SessionRecord> {
    const user = this.state.users.find((item) => item.id === input.userId)
    if (!user || user.status !== 'active')
      throw new AppError('AUTHENTICATION_REQUIRED', 'Unable to create a session.', 401)
    const now = new Date()
    const session: SessionRecord = {
      id: `session-${++this.state.nextId}`,
      tokenHash: input.tokenHash,
      userId: input.userId,
      expiresAt: input.expiresAt,
      idleExpiresAt: input.idleExpiresAt,
      rotatedAt: now,
      revokedAt: null,
      user,
    }
    this.state.sessions.set(input.tokenHash, session)
    return session
  }

  async findSession(tokenHash: string, now: Date) {
    const session = this.state.sessions.get(tokenHash)
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.idleExpiresAt <= now ||
      session.user.status !== 'active'
    )
      return null
    session.idleExpiresAt = new Date(
      Math.min(session.expiresAt.getTime(), now.getTime() + SESSION_IDLE_MS),
    )
    return session
  }

  async revokeSession(sessionId: string, now: Date) {
    for (const session of this.state.sessions.values()) {
      if (session.id === sessionId) session.revokedAt = now
    }
  }

  async rotateSession(sessionId: string, input: SessionCreateInput, now: Date) {
    return this.mutex.run(async () => {
      await this.revokeSession(sessionId, now)
      return this.createSession({ ...input, rotatedFromId: sessionId })
    })
  }

  async writeAudit(event: AuditWrite) {
    const actor = event.actorId ? this.state.users.find((item) => item.id === event.actorId) : null
    this.state.audit.unshift({
      id: `audit-${++this.state.nextId}`,
      actorName: actor?.name ?? (event.actorRole === 'anonymous' ? 'Anonymous' : 'System'),
      actorRole: event.actorRole,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      requestId: event.requestId,
      outcome: event.outcome,
      summary: event.summary,
      createdAt: new Date().toISOString(),
    })
  }

  private context() {
    const semester = this.state.semesters.find(
      (item) => item.id === this.state.settings.currentSemesterId,
    )!
    return {
      mode: 'Synthetic demo data' as const,
      referenceTime: DEMO_NOW.toISOString(),
      currentSemester: { id: semester.id, name: semester.name },
    }
  }

  private enrollment(offeringId: string) {
    return this.state.registrations.filter(
      (item) => item.offeringId === offeringId && activeRegistration(item),
    ).length
  }

  private waitlisted(offeringId: string) {
    return this.state.registrations.filter(
      (item) => item.offeringId === offeringId && item.status === 'waitlisted',
    ).length
  }

  private metricRegistrations() {
    return this.state.registrations.flatMap((registration) => {
      const offering = this.state.offerings.find(
        (candidate) => candidate.id === registration.offeringId,
      )
      return offering ? [{ ...registration, semesterId: offering.semesterId }] : []
    })
  }

  async dashboard(actor: AuthorizedActor): Promise<DashboardData> {
    requireCapability(actor, 'records:read')
    const students = this.state.students.filter((item) => item.status === 'active')
    const currentSemesterId = this.state.settings.currentSemesterId
    const semesterMetrics = calculateSemesterMetrics({
      semesterId: currentSemesterId,
      students: this.state.students,
      offerings: this.state.offerings,
      registrations: this.metricRegistrations(),
    })
    const offerings = this.state.offerings.filter(
      (item) => item.status === 'open' && item.semesterId === currentSemesterId,
    )
    const capacity = offerings
      .map((offering) => {
        const catalog = this.state.catalog.find((item) => item.id === offering.catalogId)!
        const enrolled = this.enrollment(offering.id)
        return {
          offeringId: offering.id,
          code: catalog.code,
          title: catalog.title,
          enrolled,
          capacity: offering.capacity,
          utilization: offering.capacity
            ? Math.round((enrolled / offering.capacity) * 1000) / 10
            : 0,
        }
      })
      .sort((a, b) => b.utilization - a.utilization)
    return {
      ...this.context(),
      summary: {
        studentCount: students.length,
        facultyCount: this.state.faculty.filter((item) => item.status === 'active').length,
        offeringCount: semesterMetrics.activeOfferingCount,
        departmentCount: this.state.departments.filter((item) => item.status === 'active').length,
        registrationCount: semesterMetrics.registeredCount,
        atRiskCount: semesterMetrics.atRiskStudentCount,
        capacityUtilization: Math.round(semesterMetrics.capacityUtilization * 1000) / 10,
        unreadNotifications: this.state.notifications.filter(
          (item) => !item.read && (!item.userId || item.userId === actor.id),
        ).length,
      },
      cohorts: [...new Set(students.map((item) => item.cohortYear))].sort().map((year) => ({
        year: String(year),
        students: students.filter((item) => item.cohortYear === year).length,
      })),
      departments: this.state.departments
        .filter((item) => item.status === 'active')
        .map((department) => ({
          code: department.code,
          name: department.name,
          students: students.filter((item) => item.departmentId === department.id).length,
        }))
        .sort((a, b) => b.students - a.students),
      capacity,
      recentAudit:
        actor.permissions.includes('audit:read') && can(actor.role, 'audit:read')
          ? this.state.audit.slice(0, 6)
          : [],
    }
  }

  async students(actor: AuthorizedActor, query: RecordQuery = {}) {
    requireCapability(actor, 'records:read')
    const search = normalizeSearch(query.search)
    return this.state.students.filter(
      (item) =>
        (query.includeArchived || item.status !== 'archived') &&
        (!query.departmentId || item.departmentId === query.departmentId) &&
        (!search || item.program.toLowerCase().includes(search)),
    )
  }

  async faculty(actor: AuthorizedActor, query: RecordQuery = {}) {
    requireCapability(actor, 'records:read')
    const search = normalizeSearch(query.search)
    return this.state.faculty.filter(
      (item) =>
        (query.includeArchived || item.status !== 'archived') &&
        (!query.departmentId || item.departmentId === query.departmentId) &&
        (!search || `${item.departmentCode} ${item.rank}`.toLowerCase().includes(search)),
    )
  }

  async departments(actor: AuthorizedActor, query: RecordQuery = {}): Promise<DepartmentRow[]> {
    requireCapability(actor, 'records:read')
    const search = normalizeSearch(query.search)
    return this.state.departments
      .filter(
        (item) =>
          (query.includeArchived || item.status !== 'archived') &&
          (!search || `${item.code} ${item.name}`.toLowerCase().includes(search)),
      )
      .map((department) => ({
        id: department.id,
        code: department.code,
        name: department.name,
        chair: this.state.faculty.find((item) => item.id === department.chairId)?.name ?? null,
        studentCount: this.state.students.filter(
          (item) => item.departmentId === department.id && item.status === 'active',
        ).length,
        facultyCount: this.state.faculty.filter(
          (item) => item.departmentId === department.id && item.status === 'active',
        ).length,
        status: department.status,
        version: department.version,
      }))
  }

  async courses(actor: AuthorizedActor, query: RecordQuery = {}): Promise<CourseRow[]> {
    requireCapability(actor, 'records:read')
    const search = normalizeSearch(query.search)
    return this.state.offerings
      .filter((offering) => !query.semesterId || offering.semesterId === query.semesterId)
      .flatMap((offering) => {
        const catalog = this.state.catalog.find((item) => item.id === offering.catalogId)
        const semester = this.state.semesters.find((item) => item.id === offering.semesterId)
        const department = catalog
          ? this.state.departments.find((item) => item.id === catalog.departmentId)
          : null
        if (
          !catalog ||
          !semester ||
          !department ||
          (!query.includeArchived && catalog.status === 'archived')
        )
          return []
        if (query.departmentId && catalog.departmentId !== query.departmentId) return []
        if (
          search &&
          !`${catalog.code} ${catalog.title} ${department.code}`.toLowerCase().includes(search)
        )
          return []
        return [
          {
            catalogId: catalog.id,
            offeringId: offering.id,
            code: catalog.code,
            title: catalog.title,
            credits: catalog.credits,
            departmentCode: department.code,
            instructor:
              this.state.faculty.find((item) => item.id === offering.instructorId)?.name ?? null,
            schedule: offering.schedule,
            room: offering.room,
            capacity: offering.capacity,
            enrolled: this.enrollment(offering.id),
            waitlisted: this.waitlisted(offering.id),
            status: offering.status,
            semesterId: semester.id,
            semesterName: semester.name,
            version: offering.version,
          },
        ]
      })
  }

  async registrations(actor: AuthorizedActor, query: RecordQuery = {}): Promise<RegistrationRow[]> {
    requireCapability(actor, 'records:read')
    const search = normalizeSearch(query.search)
    return this.state.registrations.flatMap((registration) => {
      const student = this.state.students.find((item) => item.id === registration.studentId)
      const offering = this.state.offerings.find((item) => item.id === registration.offeringId)
      const catalog = offering
        ? this.state.catalog.find((item) => item.id === offering.catalogId)
        : null
      const semester = offering
        ? this.state.semesters.find((item) => item.id === offering.semesterId)
        : null
      if (!student || !offering || !catalog || !semester) return []
      if (query.semesterId && semester.id !== query.semesterId) return []
      if (search && !`${catalog.code} ${catalog.title}`.toLowerCase().includes(search)) return []
      return [
        {
          id: registration.id,
          studentId: student.id,
          studentName: student.name,
          universityId: student.universityId,
          offeringId: offering.id,
          courseCode: catalog.code,
          courseTitle: catalog.title,
          semesterId: semester.id,
          semesterName: semester.name,
          status: registration.status,
          waitlistPosition: registration.waitlistPosition,
          registeredAt: registration.registeredAt,
          grade: registration.grade,
          version: registration.version,
        },
      ]
    })
  }

  async semesters(actor: AuthorizedActor) {
    requireCapability(actor, 'records:read')
    return this.state.semesters
  }

  async reports(actor: AuthorizedActor): Promise<ReportsData> {
    requireCapability(actor, 'reports:read')
    const dashboard = await this.dashboard(actor)
    const participatingStudentIds = new Set(
      this.metricRegistrations()
        .filter(
          (registration) =>
            registration.semesterId === dashboard.currentSemester.id &&
            ['registered', 'waitlisted', 'completed'].includes(registration.status),
        )
        .map((registration) => registration.studentId),
    )
    const students = this.state.students.filter(
      (item) => item.status === 'active' && participatingStudentIds.has(item.id),
    )
    const standingNames = ['good', 'probation', 'suspended', 'graduated', 'withdrawn']
    return {
      ...this.context(),
      summary: {
        ...dashboard.summary,
        averageGpa: students.length
          ? students.reduce((sum, item) => sum + item.gpa, 0) / students.length
          : 0,
      },
      standings: standingNames.map((standing) => ({
        standing,
        count: students.filter((item) => item.standing === standing).length,
      })),
      departments: this.state.departments
        .filter((department) => department.status === 'active')
        .map((department) => ({
          code: department.code,
          name: department.name,
          students: students.filter((student) => student.departmentId === department.id).length,
        })),
    }
  }

  async notifications(actor: AuthorizedActor) {
    requireCapability(actor, 'records:read')
    return this.state.notifications
      .filter((item) => !item.userId || item.userId === actor.id)
      .map(({ userId, ...item }) => {
        void userId
        return item
      })
  }

  async audit(actor: AuthorizedActor) {
    requireCapability(actor, 'audit:read')
    return this.state.audit
  }

  async settings(actor: AuthorizedActor) {
    requireCapability(actor, 'records:read')
    return { ...this.state.settings }
  }

  async registrationOptions(actor: AuthorizedActor): Promise<RegistrationOptionData> {
    requireCapability(actor, 'registrations:manage')
    const context = this.context()
    return {
      ...context,
      registrationEnabled: this.state.settings.registrationEnabled,
      students: this.state.students
        .filter((item) => item.status === 'active' && item.enrollment === 'enrolled')
        .map((item) => ({ id: item.id, label: `${item.name} · ${item.universityId}` })),
      offerings: this.state.offerings
        .filter((item) => item.status === 'open' && item.semesterId === context.currentSemester.id)
        .map((item) => {
          const catalog = this.state.catalog.find((course) => course.id === item.catalogId)!
          return {
            id: item.id,
            label: `${catalog.code} · ${catalog.title}`,
            enrolled: this.enrollment(item.id),
            capacity: item.capacity,
          }
        }),
    }
  }

  async userAdministration(actor: AuthorizedActor): Promise<UserAdministrationRow[]> {
    requireCapability(actor, 'users:manage')
    return this.state.users
      .map(({ id, name, email, title, role, status, version }) => ({
        id,
        name,
        email,
        title,
        role,
        status,
        version,
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  private registrationDecision(
    actor: AuthorizedActor,
    student: DemoStudent,
    offering: DemoOffering,
    omittedRegistrationId?: string,
  ): RegistrationEvaluationResult {
    const semester = this.state.semesters.find((item) => item.id === offering.semesterId)
    const catalog = this.state.catalog.find((item) => item.id === offering.catalogId)
    return evaluateRegistration({
      actor: { id: actor.id, role: actor.role, authenticated: true },
      student: {
        id: student.id,
        status: student.status as 'active' | 'inactive' | 'archived',
        standing: student.standing as
          'good' | 'probation' | 'suspended' | 'graduated' | 'withdrawn',
        enrollment: student.enrollment,
        registrationEligible: !student.blocked,
      },
      offering: catalog
        ? {
            id: offering.id,
            courseCatalogId: catalog.id,
            semesterId: offering.semesterId,
            status: offering.status,
            credits: catalog.credits,
            capacity: offering.capacity,
            prerequisiteCourseIds: catalog.prerequisiteIds,
            meetings: demoMeetings(offering.schedule),
          }
        : null,
      semester: semester
        ? {
            id: semester.id,
            status: semester.status as 'planned' | 'active' | 'closed' | 'archived',
            isCurrent: semester.isCurrent,
            registrationStartsAt: semester.registrationOpensAt,
            registrationEndsAt: semester.registrationClosesAt,
          }
        : null,
      settings: {
        currentSemesterId: this.state.settings.currentSemesterId,
        registrationEnabled: this.state.settings.registrationEnabled,
        maxCreditsPerSemester: this.state.settings.maxCreditLoad,
      },
      holds: this.state.holds
        .filter((hold) => hold.studentId === student.id)
        .map((hold) => ({
          active: hold.active,
          blocksRegistration: true,
          startsAt: '2025-01-01T00:00:00.000Z',
          endsAt: null,
        })),
      completedCourseIds: this.state.completions
        .filter(
          (completion) =>
            completion.studentId === student.id && !['F', 'W', 'IP'].includes(completion.grade),
        )
        .map((completion) => completion.catalogId),
      registrations: this.state.registrations
        .filter((registration) => registration.id !== omittedRegistrationId)
        .flatMap((registration) => {
          const registeredOffering = this.state.offerings.find(
            (candidate) => candidate.id === registration.offeringId,
          )
          const registeredCatalog = registeredOffering
            ? this.state.catalog.find((candidate) => candidate.id === registeredOffering.catalogId)
            : null
          return registeredOffering && registeredCatalog
            ? [
                {
                  id: registration.id,
                  studentId: registration.studentId,
                  offeringId: registration.offeringId,
                  courseCatalogId: registeredCatalog.id,
                  semesterId: registeredOffering.semesterId,
                  status: registration.status,
                  credits: registeredCatalog.credits,
                  meetings: demoMeetings(registeredOffering.schedule),
                  waitlistPosition: registration.waitlistPosition,
                  registeredAt: registration.registeredAt,
                },
              ]
            : []
        }),
      asOf: DEMO_NOW.toISOString(),
    })
  }

  async register(
    actor: AuthorizedActor,
    command: RegisterCommand,
    context: RequestContext,
  ): Promise<RegistrationMutationResult> {
    requireCapability(actor, 'registrations:manage')
    return this.mutex.run(async () => {
      const student = this.state.students.find((item) => item.id === command.studentId)
      const offering = this.state.offerings.find((item) => item.id === command.offeringId)
      if (!student || !offering)
        throw new AppError('NOT_FOUND', 'The selected student or offering was not found.', 404)
      const existing = this.state.registrations.find(
        (item) => item.studentId === student.id && item.offeringId === offering.id,
      )
      const decision = this.registrationDecision(actor, student, offering)
      if (!decision.allowed) {
        await this.writeAudit({
          actorId: actor.id,
          actorRole: actor.role,
          action: 'registration.create',
          entityType: 'course_offering',
          entityId: offering.id,
          requestId: context.requestId,
          outcome: 'denied',
          summary: decision.message,
          sourceIpHash: context.sourceIpHash,
          userAgentHash: context.userAgentHash,
        })
        throw new AppError('REGISTRATION_DENIED', decision.message, 409)
      }
      const position = decision.waitlistPosition
      const registration: DemoRegistration = existing ?? {
        id: `reg-${++this.state.nextId}`,
        studentId: student.id,
        offeringId: offering.id,
        status: 'registered',
        waitlistPosition: null,
        registeredAt: DEMO_NOW.toISOString(),
        grade: null,
        version: 0,
      }
      registration.status = decision.status
      registration.waitlistPosition = position
      registration.registeredAt = DEMO_NOW.toISOString()
      registration.grade = null
      registration.version += 1
      if (!existing) this.state.registrations.push(registration)
      const status = decision.status
      await this.writeAudit({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'registration.create',
        entityType: 'registration',
        entityId: registration.id,
        requestId: context.requestId,
        outcome: 'success',
        summary:
          status === 'waitlisted'
            ? `Added synthetic record to waitlist position ${position}.`
            : 'Created synthetic registered enrollment.',
        sourceIpHash: context.sourceIpHash,
        userAgentHash: context.userAgentHash,
      })
      this.state.notifications.unshift({
        id: `note-${++this.state.nextId}`,
        userId: actor.id,
        level: status === 'waitlisted' ? 'warning' : 'success',
        title: status === 'waitlisted' ? 'Student waitlisted' : 'Registration complete',
        message:
          status === 'waitlisted'
            ? `The synthetic student was added at waitlist position ${position}.`
            : 'The synthetic registration was created.',
        createdAt: DEMO_NOW.toISOString(),
        read: false,
        href: '/registrations',
      })
      return {
        ok: true,
        code: status.toUpperCase(),
        message:
          status === 'waitlisted'
            ? `Student added to waitlist at position ${position}.`
            : 'Student registered successfully.',
        registrationId: registration.id,
        status,
        waitlistPosition: position,
      }
    })
  }

  async drop(
    actor: AuthorizedActor,
    command: DropCommand,
    context: RequestContext,
  ): Promise<RegistrationMutationResult> {
    requireCapability(actor, 'registrations:manage')
    return this.mutex.run(async () => {
      const target = this.state.registrations.find((item) => item.id === command.registrationId)
      if (!target) throw new AppError('NOT_FOUND', 'Registration not found.', 404)
      if (target.version !== command.expectedVersion)
        throw new AppError('STALE_WRITE', 'The registration changed. Refresh and try again.', 409)
      if (!['registered', 'waitlisted'].includes(target.status))
        throw new AppError('CONFLICT', 'Only registered or waitlisted records can be dropped.', 409)
      const wasRegistered = target.status === 'registered'
      target.status = 'dropped'
      target.waitlistPosition = null
      target.version += 1
      let promoted: DemoRegistration | undefined
      if (wasRegistered) {
        const queue = this.state.registrations
          .filter((item) => item.offeringId === target.offeringId && item.status === 'waitlisted')
          .sort(
            (a, b) =>
              (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0) ||
              a.registeredAt.localeCompare(b.registeredAt) ||
              a.id.localeCompare(b.id),
          )
        const offering = this.state.offerings.find((item) => item.id === target.offeringId)!
        for (const candidate of queue) {
          const student = this.state.students.find((item) => item.id === candidate.studentId)
          const decision = student
            ? this.registrationDecision(actor, student, offering, candidate.id)
            : null
          if (decision?.allowed && decision.status === 'registered') {
            candidate.status = 'registered'
            candidate.waitlistPosition = null
            candidate.version += 1
            promoted = candidate
            break
          }
        }
      }
      const remaining = this.state.registrations
        .filter((item) => item.offeringId === target.offeringId && item.status === 'waitlisted')
        .sort(
          (a, b) =>
            (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0) || a.id.localeCompare(b.id),
        )
      remaining.forEach((item, index) => {
        item.waitlistPosition = index + 1
      })
      await this.writeAudit({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'registration.drop',
        entityType: 'registration',
        entityId: target.id,
        requestId: context.requestId,
        outcome: 'success',
        summary: 'Dropped a synthetic registration.',
        sourceIpHash: context.sourceIpHash,
        userAgentHash: context.userAgentHash,
      })
      if (promoted) {
        await this.writeAudit({
          actorId: actor.id,
          actorRole: actor.role,
          action: 'waitlist.promote',
          entityType: 'registration',
          entityId: promoted.id,
          requestId: context.requestId,
          outcome: 'success',
          summary: 'Promoted the next eligible synthetic waitlist entry.',
          sourceIpHash: context.sourceIpHash,
          userAgentHash: context.userAgentHash,
        })
        this.state.notifications.unshift({
          id: `note-${++this.state.nextId}`,
          userId: actor.id,
          level: 'success',
          title: 'Waitlist promotion',
          message: 'The next eligible synthetic student was promoted transactionally.',
          createdAt: DEMO_NOW.toISOString(),
          read: false,
          href: '/registrations',
        })
      }
      return {
        ok: true,
        code: 'DROPPED',
        message: promoted
          ? 'Registration dropped and the next eligible waitlist entry was promoted.'
          : 'Registration dropped.',
        registrationId: target.id,
      }
    })
  }

  async archive(actor: AuthorizedActor, command: ArchiveCommand, context: RequestContext) {
    const capability: Capability =
      command.entity === 'student'
        ? 'students:write'
        : command.entity === 'faculty'
          ? 'faculty:write'
          : 'courses:write'
    requireCapability(actor, capability)
    await this.mutex.run(async () => {
      const collection =
        command.entity === 'student'
          ? this.state.students
          : command.entity === 'faculty'
            ? this.state.faculty
            : this.state.catalog
      const item = collection.find((candidate) => candidate.id === command.entityId)
      if (!item) throw new AppError('NOT_FOUND', 'Record not found.', 404)
      if (item.version !== command.expectedVersion)
        throw new AppError('STALE_WRITE', 'The record changed. Refresh and try again.', 409)
      if (
        command.archive &&
        command.entity === 'student' &&
        this.state.registrations.some(
          (registration) =>
            registration.studentId === item.id &&
            ['registered', 'waitlisted'].includes(registration.status),
        )
      )
        throw new AppError(
          'CONFLICT',
          'Resolve current registrations before archiving this student.',
          409,
        )
      if (command.archive && command.entity === 'faculty') {
        const faculty = item as DemoFaculty
        if (
          faculty.isChair ||
          this.state.offerings.some(
            (offering) =>
              offering.instructorId === item.id &&
              (offering.status === 'open' || offering.status === 'draft'),
          )
        )
          throw new AppError(
            'CONFLICT',
            'Reassign chair and active teaching responsibilities first.',
            409,
          )
      }
      if (
        command.archive &&
        command.entity === 'course' &&
        this.state.offerings.some(
          (offering) =>
            offering.catalogId === item.id &&
            (offering.status === 'open' || offering.status === 'draft'),
        )
      )
        throw new AppError(
          'CONFLICT',
          'Archive or complete active offerings before archiving the catalog course.',
          409,
        )
      item.status = command.archive ? 'archived' : 'active'
      item.version += 1
      await this.writeAudit({
        actorId: actor.id,
        actorRole: actor.role,
        action: command.archive ? `${command.entity}.archive` : `${command.entity}.restore`,
        entityType: command.entity,
        entityId: command.entityId,
        requestId: context.requestId,
        outcome: 'success',
        summary: command.archive
          ? 'Archived a synthetic institutional record.'
          : 'Restored a synthetic institutional record.',
        sourceIpHash: context.sourceIpHash,
        userAgentHash: context.userAgentHash,
      })
    })
  }

  async updateSettings(
    actor: AuthorizedActor,
    command: UpdateSettingsCommand,
    context: RequestContext,
  ) {
    requireCapability(actor, 'settings:manage')
    await this.mutex.run(async () => {
      if (this.state.settings.version !== command.expectedVersion)
        throw new AppError('STALE_WRITE', 'Settings changed. Refresh and try again.', 409)
      if (!this.state.semesters.some((item) => item.id === command.currentSemesterId))
        throw new AppError('INVALID_INPUT', 'Select a valid semester.', 400)
      this.state.semesters.forEach((semester) => {
        semester.isCurrent = semester.id === command.currentSemesterId
      })
      this.state.settings = {
        institutionName: command.institutionName,
        contactEmail: command.contactEmail,
        registrationEnabled: command.registrationEnabled,
        maxCreditLoad: command.maxCreditLoad,
        currentSemesterId: command.currentSemesterId,
        timezone: command.timezone,
        version: this.state.settings.version + 1,
      }
      await this.writeAudit({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'settings.update',
        entityType: 'system_setting',
        entityId: 'institution',
        requestId: context.requestId,
        outcome: 'success',
        summary: 'Updated allowlisted institutional settings.',
        sourceIpHash: context.sourceIpHash,
        userAgentHash: context.userAgentHash,
      })
    })
  }

  async setUserRole(
    actor: AuthorizedActor,
    command: SetUserRoleCommand,
    context: RequestContext,
  ): Promise<void> {
    requireCapability(actor, 'users:manage')
    await this.mutex.run(async () => {
      // Re-check after entering the serialized section so a concurrent role
      // change cannot continue with a now-stale administrator actor.
      requireCapability(actor, 'users:manage')
      if (command.userId === actor.id) {
        throw new AppError('CONFLICT', 'You cannot change your own role.', 409)
      }
      const user = this.state.users.find((candidate) => candidate.id === command.userId)
      if (!user || user.status !== 'active') {
        throw new AppError('NOT_FOUND', 'Active user account was not found.', 404)
      }
      if (user.version !== command.expectedVersion) {
        throw new AppError('STALE_WRITE', 'The user account changed. Refresh and try again.', 409)
      }
      const previousRole = user.role
      if (
        previousRole === 'administrator' &&
        command.role !== 'administrator' &&
        this.state.users.filter(
          (candidate) => candidate.status === 'active' && candidate.role === 'administrator',
        ).length <= 1
      ) {
        throw new AppError('CONFLICT', 'At least one active administrator must remain.', 409)
      }
      user.role = command.role
      user.permissions = rolePermissions(command.role)
      user.version += 1
      for (const session of this.state.sessions.values()) {
        if (session.userId === user.id && !session.revokedAt) session.revokedAt = DEMO_NOW
      }
      await this.writeAudit({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'user.role_change',
        entityType: 'user',
        entityId: user.id,
        requestId: context.requestId,
        outcome: 'success',
        summary: `Changed account role from ${previousRole} to ${command.role}; active sessions revoked.`,
        sourceIpHash: context.sourceIpHash,
        userAgentHash: context.userAgentHash,
      })
    })
  }

  async markNotificationRead(
    actor: AuthorizedActor,
    notificationId: string,
    context: RequestContext,
  ) {
    requireCapability(actor, 'notifications:write')
    const item = this.state.notifications.find(
      (notification) =>
        notification.id === notificationId &&
        (!notification.userId || notification.userId === actor.id),
    )
    if (!item) throw new AppError('NOT_FOUND', 'Notification not found.', 404)
    item.read = true
    await this.writeAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'notification.read',
      entityType: 'notification',
      entityId: item.id,
      requestId: context.requestId,
      outcome: 'success',
      summary: 'Marked a notification as read.',
      sourceIpHash: context.sourceIpHash,
      userAgentHash: context.userAgentHash,
    })
  }

  async markAllNotificationsRead(actor: AuthorizedActor, context: RequestContext) {
    requireCapability(actor, 'notifications:write')
    this.state.notifications
      .filter((item) => !item.userId || item.userId === actor.id)
      .forEach((item) => {
        item.read = true
      })
    await this.writeAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'notification.read_all',
      entityType: 'notification',
      entityId: 'visible',
      requestId: context.requestId,
      outcome: 'success',
      summary: 'Marked visible notifications as read.',
      sourceIpHash: context.sourceIpHash,
      userAgentHash: context.userAgentHash,
    })
  }

  async health(): Promise<RepositoryHealth> {
    return { ready: true, mode: 'demo', database: 'not-applicable', migrations: 'not-applicable' }
  }
}

const demoGlobal = globalThis as typeof globalThis & {
  __northstarDemoRepository?: Promise<DemoUniversityRepository>
}

export function getDemoRepository(): Promise<DemoUniversityRepository> {
  demoGlobal.__northstarDemoRepository ??= buildDemoState().then(
    (state) => new DemoUniversityRepository(state),
  )
  return demoGlobal.__northstarDemoRepository
}
