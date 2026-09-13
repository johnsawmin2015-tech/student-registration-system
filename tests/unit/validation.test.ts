import { describe, expect, it } from 'vitest'
import {
  archiveStudentCommandSchema,
  createCourseCatalogCommandSchema,
  createCourseOfferingCommandSchema,
  createStudentCommandSchema,
  dropRegistrationCommandSchema,
  loginCommandSchema,
  recordGradeCommandSchema,
  registerStudentCommandSchema,
  setCurrentSemesterCommandSchema,
  updateInstitutionSettingsCommandSchema,
  updateStudentProfileCommandSchema,
} from '@/lib/domain/validation'

const validStudent = {
  universityId: 'MU-2026-01234',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ADA@EXAMPLE.EDU',
  dateOfBirth: '2004-12-10',
  gender: 'female' as const,
  departmentId: 'department-cs',
  program: 'BSc Computer Science',
  degreeLevel: 'undergraduate' as const,
  cohortYear: 2026,
}

describe('command validation', () => {
  it('parses and normalizes an allowlisted student command', () => {
    const parsed = createStudentCommandSchema.parse(validStudent)
    expect(parsed.email).toBe('ada@example.edu')
    expect(parsed).not.toHaveProperty('id')
    expect(parsed).not.toHaveProperty('status')
  })

  it('requires an actual update field', () => {
    expect(updateStudentProfileCommandSchema.safeParse({ studentId: 'student-1' }).success).toBe(
      false,
    )
    expect(
      updateStudentProfileCommandSchema.safeParse({ studentId: 'student-1', city: 'Yangon' })
        .success,
    ).toBe(true)
  })

  it('validates meeting times and unique prerequisites', () => {
    expect(
      createCourseOfferingCommandSchema.safeParse({
        courseCatalogId: 'course-1',
        semesterId: 'semester-1',
        capacity: 30,
        meetings: [{ dayOfWeek: 'monday', startsAt: '11:00', endsAt: '10:00', room: 'A-101' }],
      }).success,
    ).toBe(false)
    expect(
      createCourseCatalogCommandSchema.safeParse({
        code: 'cs-301',
        title: 'Algorithms',
        departmentId: 'department-cs',
        credits: 3,
        level: '300',
        prerequisiteCourseIds: ['course-100', 'course-100'],
      }).success,
    ).toBe(false)
  })

  it('rejects calendar dates that JavaScript would otherwise normalize', () => {
    expect(
      createStudentCommandSchema.safeParse({ ...validStudent, dateOfBirth: '2026-02-30' }).success,
    ).toBe(false)
  })

  it('does not trim or expose the login password', () => {
    const parsed = loginCommandSchema.parse({
      email: ' ADMIN@EXAMPLE.EDU ',
      password: '  a password with spaces  ',
    })
    expect(parsed.email).toBe('admin@example.edu')
    expect(parsed.password).toBe('  a password with spaces  ')
  })

  it.each([
    ['create student / primary ID', createStudentCommandSchema, validStudent, 'id', 'client-id'],
    [
      'update student / version',
      updateStudentProfileCommandSchema,
      { studentId: 'student-1', city: 'Yangon' },
      'version',
      7,
    ],
    [
      'archive student / timestamp',
      archiveStudentCommandSchema,
      { studentId: 'student-1', reason: 'Duplicate institutional record' },
      'archivedAt',
      '2026-01-01T00:00:00Z',
    ],
    [
      'create course / derived status',
      createCourseCatalogCommandSchema,
      {
        code: 'CS-301',
        title: 'Algorithms',
        departmentId: 'department-cs',
        credits: 3,
        level: '300',
      },
      'status',
      'active',
    ],
    [
      'create offering / derived enrollment',
      createCourseOfferingCommandSchema,
      { courseCatalogId: 'course-1', semesterId: 'semester-1', capacity: 30 },
      'registeredCount',
      0,
    ],
    [
      'register / server-calculated status',
      registerStudentCommandSchema,
      { studentId: 'student-1', offeringId: 'offering-1' },
      'status',
      'registered',
    ],
    [
      'register / waitlist position',
      registerStudentCommandSchema,
      { studentId: 'student-1', offeringId: 'offering-1' },
      'waitlistPosition',
      1,
    ],
    [
      'drop / audit actor',
      dropRegistrationCommandSchema,
      { registrationId: 'registration-1' },
      'actorId',
      'user-1',
    ],
    [
      'grade / timestamp',
      recordGradeCommandSchema,
      { registrationId: 'registration-1', grade: 'A' },
      'updatedAt',
      '2026-01-01T00:00:00Z',
    ],
    [
      'set semester / derived current flag',
      setCurrentSemesterCommandSchema,
      { semesterId: 'semester-1' },
      'isCurrent',
      true,
    ],
    [
      'settings / internal version',
      updateInstitutionSettingsCommandSchema,
      { registrationEnabled: true },
      'version',
      2,
    ],
    [
      'login / role',
      loginCommandSchema,
      { email: 'admin@example.edu', password: 'valid-password' },
      'role',
      'administrator',
    ],
  ])('rejects unknown server-owned fields: %s', (_name, schema, valid, key, value) => {
    expect(schema.safeParse({ ...valid, [key]: value }).success).toBe(false)
  })
})
