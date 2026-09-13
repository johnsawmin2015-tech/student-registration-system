import { randomUUID } from 'node:crypto'

import { hash } from '@node-rs/argon2'
import { inArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import './load-local-env'

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
} from '../lib/db/schema'

const FIXTURE_CLOCK = new Date('2026-01-05T09:00:00.000Z')
const FIXTURE_CLOCK_ISO = FIXTURE_CLOCK.toISOString()
const RESET_CONFIRMATION = 'RESET_NORTHSTAR_DEMO_FIXTURES'

function fixtureId(namespace: number, sequence: number) {
  return `${namespace.toString(16).padStart(8, '0')}-0000-4000-8000-${sequence
    .toString(16)
    .padStart(12, '0')}`
}

const ids = {
  roles: {
    administrator: fixtureId(0x10, 1),
    staff: fixtureId(0x10, 2),
    viewer: fixtureId(0x10, 3),
  },
  users: {
    administrator: fixtureId(0x20, 1),
    staff: fixtureId(0x20, 2),
    viewer: fixtureId(0x20, 3),
  },
  departments: {
    computing: fixtureId(0x30, 1),
    mathematics: fixtureId(0x30, 2),
  },
  faculty: {
    computingChair: fixtureId(0x31, 1),
    mathematicsInstructor: fixtureId(0x31, 2),
  },
  students: {
    one: fixtureId(0x32, 1),
    two: fixtureId(0x32, 2),
    three: fixtureId(0x32, 3),
  },
  courses: {
    programming: fixtureId(0x40, 1),
    dataStructures: fixtureId(0x40, 2),
    calculus: fixtureId(0x40, 3),
  },
  prerequisites: {
    dataStructuresProgramming: fixtureId(0x41, 1),
  },
  semesters: {
    fall2025: fixtureId(0x50, 1),
    spring2026: fixtureId(0x50, 2),
  },
  offerings: {
    dataStructures: fixtureId(0x51, 1),
    calculus: fixtureId(0x51, 2),
  },
  meetings: {
    dataStructuresMonday: fixtureId(0x52, 1),
    dataStructuresWednesday: fixtureId(0x52, 2),
    calculusTuesday: fixtureId(0x52, 3),
    calculusThursday: fixtureId(0x52, 4),
  },
  registrations: {
    registeredDataStructures: fixtureId(0x60, 1),
    waitlistedDataStructures: fixtureId(0x60, 2),
    registeredCalculus: fixtureId(0x60, 3),
  },
  completedCourses: {
    studentOneProgramming: fixtureId(0x61, 1),
    studentTwoProgramming: fixtureId(0x61, 2),
  },
  holds: {
    releasedDemoHold: fixtureId(0x62, 1),
  },
  settings: {
    institutionName: fixtureId(0x70, 1),
    institutionTimezone: fixtureId(0x70, 2),
    registrationEnabled: fixtureId(0x70, 3),
    registrationMaximumCredits: fixtureId(0x70, 4),
    currentSemester: fixtureId(0x70, 5),
    contactEmail: fixtureId(0x70, 6),
    settingsVersion: fixtureId(0x70, 7),
  },
  notifications: {
    waitlist: fixtureId(0x71, 1),
    demoBoundary: fixtureId(0x71, 2),
  },
} as const

const permissionDefinitions = [
  ['records:read', 'Read permitted institutional records.'],
  ['students:write', 'Create and update permitted student records.'],
  ['faculty:write', 'Create and update permitted faculty records.'],
  ['departments:write', 'Create and update permitted department records.'],
  ['courses:write', 'Create and update catalog entries and offerings.'],
  ['registrations:manage', 'Register, waitlist, and drop eligible students.'],
  ['semesters:manage', 'Manage terms and registration windows.'],
  ['settings:manage', 'Manage non-secret institution settings.'],
  ['users:manage', 'Manage users and role assignments.'],
  ['audit:read', 'Read the protected audit event stream.'],
  ['reports:read', 'Read permitted institutional reports.'],
  ['exports:create', 'Create authorized, filtered institutional exports.'],
  ['notifications:write', 'Create permitted operational notifications.'],
] as const

const permissionRows = permissionDefinitions.map(([key, description], index) => ({
  id: fixtureId(0x11, index + 1),
  key,
  description,
  status: 'active' as const,
  createdAt: FIXTURE_CLOCK,
  updatedAt: FIXTURE_CLOCK,
  version: 1,
}))

const fixtureIds = {
  roles: Object.values(ids.roles),
  users: Object.values(ids.users),
  permissions: permissionRows.map((permission) => permission.id),
  departments: Object.values(ids.departments),
  faculty: Object.values(ids.faculty),
  students: Object.values(ids.students),
  courses: Object.values(ids.courses),
  prerequisites: Object.values(ids.prerequisites),
  semesters: Object.values(ids.semesters),
  offerings: Object.values(ids.offerings),
  meetings: Object.values(ids.meetings),
  registrations: Object.values(ids.registrations),
  completedCourses: Object.values(ids.completedCourses),
  holds: Object.values(ids.holds),
  settings: Object.values(ids.settings),
  notifications: Object.values(ids.notifications),
}

function requireEnvironment(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} is required for the synthetic demo seed`)
  }

  return value
}

function requireSeedPassword(name: string) {
  const password = requireEnvironment(name)

  if (password.length < 14) {
    throw new Error(`${name} must be at least 14 characters`)
  }

  return password
}

function assertSafeSeedTarget(databaseUrl: string) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The synthetic demo seed is disabled when NODE_ENV=production')
  }

  const target = new URL(databaseUrl)
  const databaseName = target.pathname.slice(1)
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(target.hostname)
  const isClearlyDemo = /(demo|development|dev|test)/i.test(databaseName)
  const remoteOverride = process.env.SEED_ALLOW_REMOTE_DEMO_DATABASE === 'NORTHSTAR_DEMO_ONLY'

  if (!isClearlyDemo) {
    throw new Error(
      'Refusing to seed a database whose name is not clearly marked demo, development, or test',
    )
  }

  if (!isLocal && !remoteOverride) {
    throw new Error(
      'Refusing to seed a remote database without SEED_ALLOW_REMOTE_DEMO_DATABASE=NORTHSTAR_DEMO_ONLY',
    )
  }

  return { databaseName, hostname: target.hostname }
}

async function main() {
  const databaseUrl = requireEnvironment('DATABASE_URL')
  const safeTarget = assertSafeSeedTarget(databaseUrl)
  const resetRequested = process.env.SEED_RESET_CONFIRM !== undefined

  if (resetRequested && process.env.SEED_RESET_CONFIRM !== RESET_CONFIRMATION) {
    throw new Error(
      `To remove only known Northstar fixture rows, set SEED_RESET_CONFIRM=${RESET_CONFIRMATION}`,
    )
  }

  const passwords = {
    administrator: requireSeedPassword('SEED_ADMIN_PASSWORD'),
    staff: requireSeedPassword('SEED_STAFF_PASSWORD'),
    viewer: requireSeedPassword('SEED_VIEWER_PASSWORD'),
  }

  const [administratorPasswordHash, staffPasswordHash, viewerPasswordHash] = await Promise.all(
    Object.values(passwords).map((password) =>
      hash(password, {
        // @node-rs/argon2 exposes Argon2id as ambient const-enum value 2.
        algorithm: 2,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
        outputLen: 32,
      }),
    ),
  )

  // Do not retain plaintext credentials longer than hashing requires.
  passwords.administrator = ''
  passwords.staff = ''
  passwords.viewer = ''

  const client = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
    prepare: false,
  })
  const db = drizzle(client)
  const operationId = randomUUID()
  const executionTime = new Date()

  async function removeKnownFixtures(
    transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) {
    await transaction.execute(sql`select set_config('app.allow_hard_delete', 'on', true)`)

    await transaction
      .delete(notifications)
      .where(inArray(notifications.id, fixtureIds.notifications))
    await transaction.delete(studentHolds).where(inArray(studentHolds.id, fixtureIds.holds))
    await transaction
      .delete(completedCourses)
      .where(inArray(completedCourses.id, fixtureIds.completedCourses))
    await transaction
      .delete(registrations)
      .where(inArray(registrations.id, fixtureIds.registrations))
    await transaction
      .delete(offeringMeetings)
      .where(inArray(offeringMeetings.id, fixtureIds.meetings))
    await transaction
      .delete(courseOfferings)
      .where(inArray(courseOfferings.id, fixtureIds.offerings))
    await transaction
      .delete(prerequisites)
      .where(inArray(prerequisites.id, fixtureIds.prerequisites))
    await transaction.delete(courseCatalog).where(inArray(courseCatalog.id, fixtureIds.courses))
    await transaction.delete(students).where(inArray(students.id, fixtureIds.students))
    await transaction
      .update(departments)
      .set({ chairFacultyId: null })
      .where(inArray(departments.id, fixtureIds.departments))
    await transaction.delete(faculty).where(inArray(faculty.id, fixtureIds.faculty))
    await transaction.delete(departments).where(inArray(departments.id, fixtureIds.departments))
    await transaction.delete(semesters).where(inArray(semesters.id, fixtureIds.semesters))
    await transaction.delete(sessions).where(inArray(sessions.userId, fixtureIds.users))
    await transaction.delete(loginAttempts).where(inArray(loginAttempts.userId, fixtureIds.users))
    await transaction.delete(systemSettings).where(inArray(systemSettings.id, fixtureIds.settings))
    await transaction
      .delete(rolePermissions)
      .where(inArray(rolePermissions.roleId, fixtureIds.roles))
    await transaction.delete(userRoles).where(inArray(userRoles.userId, fixtureIds.users))
    // Preserve principals referenced by append-only audit rows. The upserts below
    // refresh their safe fixture fields and credentials without breaking evidence.

    await transaction.insert(auditEvents).values({
      id: randomUUID(),
      actorUserId: null,
      actorRoleKey: 'system',
      action: 'demo_fixture_reset',
      entityType: 'system',
      requestId: operationId,
      correlationId: operationId,
      outcome: 'success',
      changeSummary: {
        scope: 'known_northstar_fixture_ids_only',
        preservedAuditEvents: true,
      },
      sourceMetadata: {
        command: 'db:seed',
        fixture: 'northstar-demo-v1',
      },
      occurredAt: executionTime,
    })
  }

  try {
    await db.transaction(async (transaction) => {
      if (resetRequested) {
        await removeKnownFixtures(transaction)
      }

      await transaction
        .insert(roles)
        .values([
          {
            id: ids.roles.administrator,
            key: 'administrator',
            name: 'Administrator',
            description: 'Full synthetic institution administration role.',
            isSystem: true,
            status: 'active',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.roles.staff,
            key: 'staff',
            name: 'Staff',
            description: 'Permitted academic records and registration operations.',
            isSystem: true,
            status: 'active',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.roles.viewer,
            key: 'viewer',
            name: 'Viewer / Auditor',
            description: 'Read-only institutional and audit access.',
            isSystem: true,
            status: 'active',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
        ])
        .onConflictDoNothing()

      await transaction.insert(permissions).values(permissionRows).onConflictDoNothing()

      await transaction
        .insert(users)
        .values([
          {
            id: ids.users.administrator,
            email: 'admin@northstar-demo.invalid',
            passwordHash: administratorPasswordHash,
            displayName: 'Northstar Demo Administrator',
            title: 'Synthetic Registrar',
            status: 'active',
            isDisabled: false,
            lastActiveAt: FIXTURE_CLOCK,
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.users.staff,
            email: 'staff@northstar-demo.invalid',
            passwordHash: staffPasswordHash,
            displayName: 'Northstar Demo Staff',
            title: 'Synthetic Academic Coordinator',
            status: 'active',
            isDisabled: false,
            lastActiveAt: FIXTURE_CLOCK,
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.users.viewer,
            email: 'viewer@northstar-demo.invalid',
            passwordHash: viewerPasswordHash,
            displayName: 'Northstar Demo Viewer',
            title: 'Synthetic Auditor',
            status: 'active',
            isDisabled: false,
            lastActiveAt: FIXTURE_CLOCK,
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
        ])
        .onConflictDoNothing()

      const roleAssignments = [
        [ids.users.administrator, ids.roles.administrator],
        [ids.users.staff, ids.roles.staff],
        [ids.users.viewer, ids.roles.viewer],
      ] as const

      await transaction
        .insert(userRoles)
        .values(
          roleAssignments.map(([userId, roleId], index) => ({
            id: fixtureId(0x21, index + 1),
            userId,
            roleId,
            grantedByUserId: ids.users.administrator,
            grantedAt: FIXTURE_CLOCK,
          })),
        )
        .onConflictDoNothing()

      const staffPermissionKeys = new Set([
        'records:read',
        'students:write',
        'faculty:write',
        'departments:write',
        'courses:write',
        'registrations:manage',
        'reports:read',
        'exports:create',
        'notifications:write',
      ])
      const viewerPermissionKeys = new Set(['records:read', 'reports:read', 'audit:read'])
      const permissionAssignments: Array<{
        roleId: string
        permissionId: string
      }> = []

      for (const permission of permissionRows) {
        permissionAssignments.push({
          roleId: ids.roles.administrator,
          permissionId: permission.id,
        })

        if (staffPermissionKeys.has(permission.key)) {
          permissionAssignments.push({
            roleId: ids.roles.staff,
            permissionId: permission.id,
          })
        }

        if (viewerPermissionKeys.has(permission.key)) {
          permissionAssignments.push({
            roleId: ids.roles.viewer,
            permissionId: permission.id,
          })
        }
      }

      await transaction
        .insert(rolePermissions)
        .values(
          permissionAssignments.map((assignment, index) => ({
            id: fixtureId(0x12, index + 1),
            ...assignment,
            grantedByUserId: ids.users.administrator,
            grantedAt: FIXTURE_CLOCK,
          })),
        )
        .onConflictDoNothing()

      await transaction
        .insert(departments)
        .values([
          {
            id: ids.departments.computing,
            code: 'CSE',
            name: 'Demo Computing Department',
            schoolName: 'Northstar Demo School of Engineering',
            chairFacultyId: ids.faculty.computingChair,
            building: 'Synthetic Hall A',
            contactEmail: 'computing@northstar-demo.invalid',
            description: 'Synthetic department used only for local demonstration.',
            status: 'active',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.departments.mathematics,
            code: 'MAT',
            name: 'Demo Mathematics Department',
            schoolName: 'Northstar Demo School of Sciences',
            chairFacultyId: null,
            building: 'Synthetic Hall B',
            contactEmail: 'mathematics@northstar-demo.invalid',
            description: 'Synthetic department used only for local demonstration.',
            status: 'active',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
        ])
        .onConflictDoNothing()

      await transaction
        .insert(faculty)
        .values([
          {
            id: ids.faculty.computingChair,
            employeeId: 'NDU-DEMO-F001',
            userId: ids.users.staff,
            firstName: 'Synthetic',
            lastName: 'Faculty One',
            email: 'faculty.one@northstar-demo.invalid',
            departmentId: ids.departments.computing,
            rank: 'professor',
            employmentType: 'full-time',
            office: 'Synthetic Hall A 101',
            specialization: 'Demonstration Computing',
            hiredOn: '2020-01-15',
            notes: 'Synthetic fixture record. Not a real person.',
            status: 'active',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.faculty.mathematicsInstructor,
            employeeId: 'NDU-DEMO-F002',
            firstName: 'Synthetic',
            lastName: 'Faculty Two',
            email: 'faculty.two@northstar-demo.invalid',
            departmentId: ids.departments.mathematics,
            rank: 'associate',
            employmentType: 'full-time',
            office: 'Synthetic Hall B 101',
            specialization: 'Demonstration Mathematics',
            hiredOn: '2021-08-01',
            notes: 'Synthetic fixture record. Not a real person.',
            status: 'active',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
        ])
        .onConflictDoNothing()

      await transaction
        .insert(students)
        .values([
          {
            id: ids.students.one,
            universityId: 'NDU-DEMO-S001',
            firstName: 'Synthetic',
            lastName: 'Student One',
            email: 'student.one@northstar-demo.invalid',
            dateOfBirth: '2004-02-10',
            gender: 'undisclosed',
            departmentId: ids.departments.computing,
            advisorId: ids.faculty.computingChair,
            program: 'Demo BSc Computing',
            degreeLevel: 'undergraduate',
            cohortYear: 2024,
            gpa: '3.40',
            requiredCredits: '120.0',
            standing: 'good',
            enrollmentState: 'enrolled',
            notes: 'Synthetic fixture record. Not a real student.',
            status: 'active',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.students.two,
            universityId: 'NDU-DEMO-S002',
            firstName: 'Synthetic',
            lastName: 'Student Two',
            email: 'student.two@northstar-demo.invalid',
            dateOfBirth: '2003-11-20',
            gender: 'undisclosed',
            departmentId: ids.departments.computing,
            advisorId: ids.faculty.computingChair,
            program: 'Demo BSc Computing',
            degreeLevel: 'undergraduate',
            cohortYear: 2023,
            gpa: '3.10',
            requiredCredits: '120.0',
            standing: 'good',
            enrollmentState: 'enrolled',
            notes: 'Synthetic fixture record. Not a real student.',
            status: 'active',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.students.three,
            universityId: 'NDU-DEMO-S003',
            firstName: 'Synthetic',
            lastName: 'Student Three',
            email: 'student.three@northstar-demo.invalid',
            dateOfBirth: '2005-06-05',
            gender: 'undisclosed',
            departmentId: ids.departments.mathematics,
            advisorId: ids.faculty.mathematicsInstructor,
            program: 'Demo BSc Mathematics',
            degreeLevel: 'undergraduate',
            cohortYear: 2025,
            gpa: '3.75',
            requiredCredits: '120.0',
            standing: 'good',
            enrollmentState: 'enrolled',
            notes: 'Synthetic fixture record. Not a real student.',
            status: 'active',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
        ])
        .onConflictDoNothing()

      await transaction
        .insert(courseCatalog)
        .values([
          {
            id: ids.courses.programming,
            code: 'NDU-CS-101',
            title: 'Demo Introduction to Programming',
            departmentId: ids.departments.computing,
            description: 'Synthetic foundational course for demo prerequisite data.',
            credits: '3.0',
            level: 100,
            status: 'active',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.courses.dataStructures,
            code: 'NDU-CS-201',
            title: 'Demo Data Structures',
            departmentId: ids.departments.computing,
            description: 'Synthetic capacity and waitlist demonstration course.',
            credits: '3.0',
            level: 200,
            status: 'active',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.courses.calculus,
            code: 'NDU-MAT-101',
            title: 'Demo Calculus I',
            departmentId: ids.departments.mathematics,
            description: 'Synthetic mathematics course for local demonstration.',
            credits: '4.0',
            level: 100,
            status: 'active',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
        ])
        .onConflictDoNothing()

      await transaction
        .insert(prerequisites)
        .values({
          id: ids.prerequisites.dataStructuresProgramming,
          courseCatalogId: ids.courses.dataStructures,
          prerequisiteCourseCatalogId: ids.courses.programming,
          minimumGrade: 'C',
          createdAt: FIXTURE_CLOCK,
        })
        .onConflictDoNothing()

      await transaction
        .insert(semesters)
        .values([
          {
            id: ids.semesters.fall2025,
            code: 'NDU-DEMO-2025-FALL',
            name: 'Demo Fall 2025',
            season: 'fall',
            year: 2025,
            startsOn: '2025-08-25',
            endsOn: '2025-12-12',
            registrationStartsAt: new Date('2025-07-01T00:00:00.000Z'),
            registrationEndsAt: new Date('2025-08-29T23:59:59.000Z'),
            isCurrent: false,
            status: 'closed',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.semesters.spring2026,
            code: 'NDU-DEMO-2026-SPRING',
            name: 'Demo Spring 2026',
            season: 'spring',
            year: 2026,
            startsOn: '2026-01-12',
            endsOn: '2026-05-08',
            registrationStartsAt: new Date('2025-12-15T00:00:00.000Z'),
            registrationEndsAt: new Date('2026-01-16T23:59:59.000Z'),
            isCurrent: true,
            status: 'active',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
        ])
        .onConflictDoNothing()

      await transaction
        .insert(courseOfferings)
        .values([
          {
            id: ids.offerings.dataStructures,
            courseCatalogId: ids.courses.dataStructures,
            semesterId: ids.semesters.spring2026,
            instructorId: ids.faculty.computingChair,
            sectionCode: 'DEMO-A',
            capacity: 1,
            room: 'Synthetic Hall A 201',
            status: 'open',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.offerings.calculus,
            courseCatalogId: ids.courses.calculus,
            semesterId: ids.semesters.spring2026,
            instructorId: ids.faculty.mathematicsInstructor,
            sectionCode: 'DEMO-A',
            capacity: 24,
            room: 'Synthetic Hall B 202',
            status: 'open',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
        ])
        .onConflictDoNothing()

      await transaction
        .insert(offeringMeetings)
        .values([
          {
            id: ids.meetings.dataStructuresMonday,
            offeringId: ids.offerings.dataStructures,
            dayOfWeek: 1,
            startsAt: '10:00:00',
            endsAt: '11:30:00',
            room: 'Synthetic Hall A 201',
            createdAt: FIXTURE_CLOCK,
          },
          {
            id: ids.meetings.dataStructuresWednesday,
            offeringId: ids.offerings.dataStructures,
            dayOfWeek: 3,
            startsAt: '10:00:00',
            endsAt: '11:30:00',
            room: 'Synthetic Hall A 201',
            createdAt: FIXTURE_CLOCK,
          },
          {
            id: ids.meetings.calculusTuesday,
            offeringId: ids.offerings.calculus,
            dayOfWeek: 2,
            startsAt: '13:00:00',
            endsAt: '14:30:00',
            room: 'Synthetic Hall B 202',
            createdAt: FIXTURE_CLOCK,
          },
          {
            id: ids.meetings.calculusThursday,
            offeringId: ids.offerings.calculus,
            dayOfWeek: 4,
            startsAt: '13:00:00',
            endsAt: '14:30:00',
            room: 'Synthetic Hall B 202',
            createdAt: FIXTURE_CLOCK,
          },
        ])
        .onConflictDoNothing()

      await transaction
        .insert(completedCourses)
        .values([
          {
            id: ids.completedCourses.studentOneProgramming,
            studentId: ids.students.one,
            courseCatalogId: ids.courses.programming,
            semesterId: ids.semesters.fall2025,
            source: 'institutional',
            grade: 'B+',
            gradePoints: '3.30',
            creditsEarned: '3.0',
            completedOn: '2025-12-12',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.completedCourses.studentTwoProgramming,
            studentId: ids.students.two,
            courseCatalogId: ids.courses.programming,
            semesterId: ids.semesters.fall2025,
            source: 'institutional',
            grade: 'A-',
            gradePoints: '3.70',
            creditsEarned: '3.0',
            completedOn: '2025-12-12',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
        ])
        .onConflictDoNothing()

      await transaction
        .insert(registrations)
        .values([
          {
            id: ids.registrations.registeredDataStructures,
            studentId: ids.students.one,
            offeringId: ids.offerings.dataStructures,
            semesterId: ids.semesters.spring2026,
            status: 'registered',
            registeredAt: FIXTURE_CLOCK,
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.registrations.waitlistedDataStructures,
            studentId: ids.students.two,
            offeringId: ids.offerings.dataStructures,
            semesterId: ids.semesters.spring2026,
            status: 'waitlisted',
            waitlistPosition: 1,
            registeredAt: FIXTURE_CLOCK,
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.registrations.registeredCalculus,
            studentId: ids.students.three,
            offeringId: ids.offerings.calculus,
            semesterId: ids.semesters.spring2026,
            status: 'registered',
            registeredAt: FIXTURE_CLOCK,
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
        ])
        .onConflictDoNothing()

      await transaction
        .insert(studentHolds)
        .values({
          id: ids.holds.releasedDemoHold,
          studentId: ids.students.three,
          type: 'administrative',
          status: 'released',
          blocksRegistration: true,
          reason: 'Synthetic resolved document check.',
          startsAt: new Date('2025-12-01T09:00:00.000Z'),
          releasedAt: new Date('2025-12-20T09:00:00.000Z'),
          releasedByUserId: ids.users.staff,
          createdAt: new Date('2025-12-01T09:00:00.000Z'),
          updatedAt: new Date('2025-12-20T09:00:00.000Z'),
          version: 1,
        })
        .onConflictDoNothing()

      await transaction
        .insert(systemSettings)
        .values([
          {
            id: ids.settings.institutionName,
            key: 'institution_name',
            valueType: 'string',
            value: 'Northstar Demo University',
            description: 'Clearly fictional institution name for local demo data.',
            updatedByUserId: ids.users.administrator,
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.settings.institutionTimezone,
            key: 'timezone',
            valueType: 'string',
            value: 'UTC',
            description: 'IANA timezone used for synthetic academic windows.',
            updatedByUserId: ids.users.administrator,
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.settings.registrationEnabled,
            key: 'registration_enabled',
            valueType: 'boolean',
            value: true,
            description: 'Global registration feature gate.',
            updatedByUserId: ids.users.administrator,
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.settings.registrationMaximumCredits,
            key: 'max_credit_load',
            valueType: 'number',
            value: 18,
            description: 'Maximum active credits in the current demo semester.',
            updatedByUserId: ids.users.administrator,
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.settings.currentSemester,
            key: 'current_semester_id',
            valueType: 'string',
            value: ids.semesters.spring2026,
            description: 'Current synthetic semester identifier.',
            updatedByUserId: ids.users.administrator,
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.settings.contactEmail,
            key: 'contact_email',
            valueType: 'string',
            value: 'registrar@northstar-demo.invalid',
            description: 'Fictional registrar contact for demo data.',
            updatedByUserId: ids.users.administrator,
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.settings.settingsVersion,
            key: 'settings_version',
            valueType: 'number',
            value: 1,
            description: 'Optimistic concurrency version for settings.',
            updatedByUserId: ids.users.administrator,
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
        ])
        .onConflictDoNothing()

      await transaction
        .insert(notifications)
        .values([
          {
            id: ids.notifications.waitlist,
            recipientUserId: ids.users.staff,
            level: 'info',
            title: 'Synthetic waitlist entry created',
            message: 'NDU-DEMO-S002 is first on the NDU-CS-201 DEMO-A waitlist.',
            entityType: 'course_offering',
            entityId: ids.offerings.dataStructures,
            href: '/registrations',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
          {
            id: ids.notifications.demoBoundary,
            recipientUserId: ids.users.administrator,
            level: 'warning',
            title: 'Synthetic fixture data',
            message: 'Northstar Demo University records are fictional development fixtures.',
            createdAt: FIXTURE_CLOCK,
            updatedAt: FIXTURE_CLOCK,
            version: 1,
          },
        ])
        .onConflictDoNothing()

      await transaction.insert(auditEvents).values({
        id: randomUUID(),
        actorUserId: null,
        actorRoleKey: 'system',
        action: 'demo_fixture_seed',
        entityType: 'system',
        requestId: operationId,
        correlationId: operationId,
        outcome: 'success',
        changeSummary: {
          fixture: 'northstar-demo-v1',
          deterministicReferenceTime: FIXTURE_CLOCK_ISO,
          mode: resetRequested ? 'reset-and-seed' : 'idempotent-seed',
        },
        sourceMetadata: {
          command: 'db:seed',
          containsSyntheticDataOnly: true,
        },
        occurredAt: executionTime,
      })
    })

    console.info(
      `Synthetic Northstar demo fixtures seeded into ${safeTarget.hostname}/${safeTarget.databaseName}.`,
    )
  } catch (error) {
    try {
      await db.insert(auditEvents).values({
        id: randomUUID(),
        actorUserId: null,
        actorRoleKey: 'system',
        action: 'demo_fixture_seed',
        entityType: 'system',
        requestId: operationId,
        correlationId: operationId,
        outcome: 'failure',
        changeSummary: {
          fixture: 'northstar-demo-v1',
          mode: resetRequested ? 'reset-and-seed' : 'idempotent-seed',
        },
        sourceMetadata: {
          command: 'db:seed',
          diagnostic: 'Seed transaction failed; inspect protected server logs.',
        },
        occurredAt: new Date(),
      })
    } catch {
      // A missing/unmigrated database cannot accept the failure audit event.
    }

    throw error
  } finally {
    await client.end({ timeout: 5 })
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown seed error'
  console.error(`Synthetic demo seed failed: ${message}`)
  process.exitCode = 1
})
