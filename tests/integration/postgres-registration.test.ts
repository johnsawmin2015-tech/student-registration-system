import { randomUUID } from 'node:crypto'

import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const enabled = Boolean(process.env.DATABASE_URL)

describe.skipIf(!enabled)('PostgreSQL registration boundary', () => {
  let sql: Sql

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 4, prepare: false })
  })

  afterAll(async () => {
    await sql.end({ timeout: 5 })
  })

  const request = () => ({
    requestId: randomUUID(),
    sourceIpHash: 'integration-test',
    userAgentHash: 'integration-test',
  })

  async function currentFixture() {
    const [fixture] = await sql<
      Array<{ department_id: string; catalog_id: string; semester_id: string }>
    >`
      select d.id as department_id, c.id as catalog_id, s.id as semester_id
      from departments d
      join course_catalog c on c.department_id = d.id and c.code = 'NDU-MAT-101'
      join semesters s on s.is_current = true
      limit 1
    `
    expect(fixture).toBeDefined()
    return fixture
  }

  it('enforces RBAC from persisted grants and keeps audit rows append-only', async () => {
    const { getPostgresRepository } = await import('@/lib/server/repositories/postgres-repository')
    const repository = getPostgresRepository()
    const viewer = await repository.findCredentialByEmail('viewer@northstar-demo.invalid')
    expect(viewer?.role).toBe('viewer')
    await expect(repository.registrationOptions(viewer!)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    })

    const [event] = await sql<{ id: string }[]>`
      select id from audit_events order by occurred_at desc limit 1
    `
    expect(event).toBeDefined()
    await expect(
      sql`update audit_events set action = 'tampered' where id = ${event.id}`,
    ).rejects.toThrow()
  })

  it('serializes the final seat and promotes the next eligible waitlist entry', async () => {
    const { getPostgresRepository } = await import('@/lib/server/repositories/postgres-repository')
    const repository = getPostgresRepository()
    const actor = await repository.findCredentialByEmail('staff@northstar-demo.invalid')
    expect(actor?.permissions).toContain('registrations:manage')

    const [fixture] = await sql<
      Array<{
        department_id: string
        catalog_id: string
        semester_id: string
        registration_starts_at: Date
        registration_ends_at: Date
      }>
    >`
      select d.id as department_id,
             c.id as catalog_id,
             s.id as semester_id,
             s.registration_starts_at,
             s.registration_ends_at
      from departments d
      join course_catalog c on c.department_id = d.id and c.code = 'NDU-MAT-101'
      join semesters s on s.is_current = true
      limit 1
    `
    expect(fixture).toBeDefined()
    const studentOne = randomUUID()
    const studentTwo = randomUUID()
    const offeringId = randomUUID()
    const request = () => ({
      requestId: randomUUID(),
      sourceIpHash: 'integration-test',
      userAgentHash: 'integration-test',
    })

    try {
      await sql`
        update semesters
        set registration_starts_at = now() - interval '1 day',
            registration_ends_at = now() + interval '1 day'
        where id = ${fixture.semester_id}
      `
      await sql`
        insert into students
          (id, university_id, first_name, last_name, email, department_id,
           program, degree_level, cohort_year, required_credits,
           standing, enrollment_state, status)
        values
          (${studentOne}, ${`NDU-IT-${studentOne.slice(0, 8)}`}, 'Synthetic', 'Concurrent One', ${`it-${studentOne}@example.invalid`}, ${fixture.department_id}, 'Integration test', 'undergraduate', 2026, 120, 'good', 'enrolled', 'active'),
          (${studentTwo}, ${`NDU-IT-${studentTwo.slice(0, 8)}`}, 'Synthetic', 'Concurrent Two', ${`it-${studentTwo}@example.invalid`}, ${fixture.department_id}, 'Integration test', 'undergraduate', 2026, 120, 'good', 'enrolled', 'active')
      `
      await sql`
        insert into course_offerings
          (id, course_catalog_id, semester_id, section_code, capacity, status)
        values
          (${offeringId}, ${fixture.catalog_id}, ${fixture.semester_id}, ${`IT-${offeringId.slice(0, 8)}`}, 1, 'open')
      `

      const results = await Promise.all([
        repository.register(actor!, { studentId: studentOne, offeringId }, request()),
        repository.register(actor!, { studentId: studentTwo, offeringId }, request()),
      ])
      expect(results.map((result) => result.status).sort()).toEqual(['registered', 'waitlisted'])
      const registered = results.find((result) => result.status === 'registered')!
      const waitlisted = results.find((result) => result.status === 'waitlisted')!
      expect(waitlisted.waitlistPosition).toBe(1)

      const dropped = await repository.drop(
        actor!,
        { registrationId: registered.registrationId!, expectedVersion: 1 },
        request(),
      )
      expect(dropped.code).toBe('DROPPED_AND_PROMOTED')
      const [promoted] = await sql<Array<{ status: string; waitlist_position: number | null }>>`
        select status, waitlist_position
        from registrations
        where id = ${waitlisted.registrationId!}
      `
      expect(promoted).toEqual({ status: 'registered', waitlist_position: null })
    } finally {
      await sql.begin(async (transaction) => {
        await transaction`select set_config('app.allow_hard_delete', 'on', true)`
        await transaction`
          delete from notifications
          where entity_id in (select id from registrations where offering_id = ${offeringId})
        `
        await transaction`delete from registrations where offering_id = ${offeringId}`
        await transaction`delete from course_offerings where id = ${offeringId}`
        await transaction`delete from students where id in (${studentOne}, ${studentTwo})`
      })
      await sql`
        update semesters
        set registration_starts_at = ${fixture.registration_starts_at},
            registration_ends_at = ${fixture.registration_ends_at}
        where id = ${fixture.semester_id}
      `
    }
  })

  it('persists sessions and rejects every direct viewer mutation path', async () => {
    const { getPostgresRepository } = await import('@/lib/server/repositories/postgres-repository')
    const repository = getPostgresRepository()
    const viewer = await repository.findCredentialByEmail('viewer@northstar-demo.invalid')
    const staff = await repository.findCredentialByEmail('staff@northstar-demo.invalid')
    expect(viewer?.role).toBe('viewer')
    expect(staff?.role).toBe('staff')
    const tokenHash = randomUUID().replaceAll('-', '')
    const now = new Date()
    const session = await repository.createSession({
      tokenHash,
      userId: viewer!.id,
      expiresAt: new Date(now.getTime() + 60_000),
      idleExpiresAt: new Date(now.getTime() + 30_000),
      requestId: randomUUID(),
      sourceIpHash: 'integration-test',
      userAgentHash: 'integration-test',
    })
    const foundSession = await repository.findSession(tokenHash, new Date())
    expect(foundSession?.user.id).toBe(viewer!.id)
    await repository.revokeSession(session.id, new Date())
    expect(await repository.findSession(tokenHash, new Date())).toBeNull()

    const context = request()
    await expect(
      repository.register(viewer!, { studentId: randomUUID(), offeringId: randomUUID() }, context),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
    await expect(
      repository.drop(viewer!, { registrationId: randomUUID(), expectedVersion: 1 }, context),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
    await expect(
      repository.archive(
        viewer!,
        { entity: 'student', entityId: randomUUID(), expectedVersion: 1, archive: true },
        context,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
    await expect(
      repository.updateSettings(
        viewer!,
        {
          institutionName: 'Denied',
          contactEmail: 'denied@example.invalid',
          registrationEnabled: true,
          maxCreditLoad: 18,
          currentSemesterId: randomUUID(),
          timezone: 'UTC',
          expectedVersion: 1,
        },
        context,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
    await expect(
      repository.setUserRole(
        viewer!,
        { userId: staff!.id, role: 'viewer', expectedVersion: 1 },
        context,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
  })

  it('enforces database uniqueness, current-term, state, and hard-delete constraints', async () => {
    const fixture = await currentFixture()
    const [existingStudent] = await sql<Array<{ id: string; university_id: string }>>`
      select id, university_id from students where status = 'active' limit 1
    `
    const [existingOffering] = await sql<Array<{ id: string; semester_id: string }>>`
      select id, semester_id from course_offerings where semester_id = ${fixture.semester_id} limit 1
    `
    const invalidOfferingId = randomUUID()
    try {
      await sql`
        insert into course_offerings
          (id, course_catalog_id, semester_id, section_code, capacity, status)
        values (${invalidOfferingId}, ${fixture.catalog_id}, ${fixture.semester_id}, ${`INV-${invalidOfferingId.slice(0, 8)}`}, 1, 'open')
      `
      await expect(
        sql`
          insert into students
            (id, university_id, first_name, last_name, email, department_id,
             program, degree_level, cohort_year, required_credits, status)
          values
            (${randomUUID()}, ${existingStudent.university_id}, 'Duplicate', 'Student',
             ${`duplicate-${randomUUID()}@example.invalid`}, ${fixture.department_id},
             'Constraint test', 'undergraduate', 2026, 120, 'active')
        `,
      ).rejects.toThrow()
      await expect(
        sql`update semesters set is_current = true where id <> ${fixture.semester_id}`,
      ).rejects.toThrow()
      await expect(
        sql`
          insert into registrations
            (student_id, offering_id, semester_id, status, waitlist_position)
          values (${existingStudent.id}, ${invalidOfferingId}, ${existingOffering.semester_id}, 'waitlisted', null)
        `,
      ).rejects.toThrow()
      await expect(sql`delete from students where id = ${existingStudent.id}`).rejects.toThrow()
    } finally {
      await sql.begin(async (transaction) => {
        await transaction`select set_config('app.allow_hard_delete', 'on', true)`
        await transaction`delete from registrations where offering_id = ${invalidOfferingId}`
        await transaction`delete from course_offerings where id = ${invalidOfferingId}`
      })
    }
  })

  it('denies registration outside the global switch or semester window', async () => {
    const { getPostgresRepository } = await import('@/lib/server/repositories/postgres-repository')
    const repository = getPostgresRepository()
    const actor = await repository.findCredentialByEmail('staff@northstar-demo.invalid')
    const fixture = await currentFixture()
    const studentId = randomUUID()
    const offeringId = randomUUID()
    const [originalSetting] = await sql<Array<{ value: unknown; version: number }>>`
      select value, version from system_settings where key = 'registration_enabled'
    `
    const [originalWindow] = await sql<Array<{ starts: Date; ends: Date }>>`
      select registration_starts_at as starts, registration_ends_at as ends
      from semesters where id = ${fixture.semester_id}
    `
    try {
      await sql`
        insert into students
          (id, university_id, first_name, last_name, email, department_id,
           program, degree_level, cohort_year, required_credits, status)
        values
          (${studentId}, ${`NDU-IT-${studentId.slice(0, 8)}`}, 'Window', 'Test',
           ${`window-${studentId}@example.invalid`}, ${fixture.department_id},
           'Integration test', 'undergraduate', 2026, 120, 'active')
      `
      await sql`
        insert into course_offerings
          (id, course_catalog_id, semester_id, section_code, capacity, status)
        values (${offeringId}, ${fixture.catalog_id}, ${fixture.semester_id}, ${`WIN-${offeringId.slice(0, 8)}`}, 1, 'open')
      `
      const context = request()
      await sql`update system_settings set value = 'false'::jsonb where key = 'registration_enabled'`
      await expect(
        repository.register(actor!, { studentId, offeringId }, context),
      ).resolves.toMatchObject({
        ok: false,
        code: 'REGISTRATION_DISABLED',
      })
      await sql`update system_settings set value = 'true'::jsonb where key = 'registration_enabled'`
      await sql`
        update semesters
        set registration_starts_at = now() - interval '2 days',
            registration_ends_at = now() - interval '1 day'
        where id = ${fixture.semester_id}
      `
      await expect(
        repository.register(actor!, { studentId, offeringId }, context),
      ).resolves.toMatchObject({
        ok: false,
        code: 'REGISTRATION_WINDOW_CLOSED',
      })
    } finally {
      await sql`
        update system_settings set value = to_jsonb(${Boolean(originalSetting.value)}),
          version = ${originalSetting.version} where key = 'registration_enabled'
      `
      await sql`
        update semesters set registration_starts_at = ${originalWindow.starts},
          registration_ends_at = ${originalWindow.ends} where id = ${fixture.semester_id}
      `
      await sql.begin(async (transaction) => {
        await transaction`select set_config('app.allow_hard_delete', 'on', true)`
        await transaction`delete from course_offerings where id = ${offeringId}`
        await transaction`delete from students where id = ${studentId}`
      })
    }
  })

  it('supports dropped re-registration and serializes same-student schedule conflicts', async () => {
    const { getPostgresRepository } = await import('@/lib/server/repositories/postgres-repository')
    const repository = getPostgresRepository()
    const actor = await repository.findCredentialByEmail('staff@northstar-demo.invalid')
    const fixture = await currentFixture()
    const studentId = randomUUID()
    const firstOfferingId = randomUUID()
    const secondOfferingId = randomUUID()
    const requestContext = request()
    const [originalWindow] = await sql<Array<{ starts: Date; ends: Date }>>`
      select registration_starts_at as starts, registration_ends_at as ends
      from semesters where id = ${fixture.semester_id}
    `
    try {
      await sql`
        update semesters set registration_starts_at = now() - interval '1 day',
          registration_ends_at = now() + interval '1 day' where id = ${fixture.semester_id}
      `
      await sql`
        insert into students
          (id, university_id, first_name, last_name, email, department_id,
           program, degree_level, cohort_year, required_credits, status)
        values (${studentId}, ${`NDU-IT-${studentId.slice(0, 8)}`}, 'Schedule', 'Test',
          ${`schedule-${studentId}@example.invalid`}, ${fixture.department_id},
          'Integration test', 'undergraduate', 2026, 120, 'active')
      `
      await sql`
        insert into course_offerings
          (id, course_catalog_id, semester_id, section_code, capacity, status)
        values
          (${firstOfferingId}, ${fixture.catalog_id}, ${fixture.semester_id}, ${`SC-A-${firstOfferingId.slice(0, 6)}`}, 1, 'open'),
          (${secondOfferingId}, ${fixture.catalog_id}, ${fixture.semester_id}, ${`SC-B-${secondOfferingId.slice(0, 6)}`}, 1, 'open')
      `
      await sql`
        insert into offering_meetings (offering_id, day_of_week, starts_at, ends_at, room)
        values (${firstOfferingId}, 1, '09:00', '10:00', 'Test Room A'),
               (${secondOfferingId}, 1, '09:30', '10:30', 'Test Room B')
      `
      const [firstResult, secondResult] = await Promise.all([
        repository.register(actor!, { studentId, offeringId: firstOfferingId }, requestContext),
        repository.register(actor!, { studentId, offeringId: secondOfferingId }, request()),
      ])
      expect(
        [firstResult, secondResult].filter((result) => result.status === 'registered'),
      ).toHaveLength(1)
      expect(
        [firstResult, secondResult].find((result) => result.code === 'SCHEDULE_CONFLICT'),
      ).toBeDefined()
      const registered = firstResult.status === 'registered' ? firstResult : secondResult
      const dropped = await repository.drop(
        actor!,
        { registrationId: registered.registrationId!, expectedVersion: 1 },
        request(),
      )
      expect(dropped.code).toBe('DROPPED')
      const reRegistered = await repository.register(
        actor!,
        {
          studentId,
          offeringId: registered.status === 'registered' ? firstOfferingId : secondOfferingId,
        },
        request(),
      )
      expect(reRegistered).toMatchObject({ ok: true, status: 'registered' })
    } finally {
      await sql.begin(async (transaction) => {
        await transaction`select set_config('app.allow_hard_delete', 'on', true)`
        await transaction`
          delete from notifications where entity_id in (
            select id from registrations where student_id = ${studentId}
          )
        `
        await transaction`delete from registrations where student_id = ${studentId}`
        await transaction`delete from offering_meetings where offering_id in (${firstOfferingId}, ${secondOfferingId})`
        await transaction`delete from course_offerings where id in (${firstOfferingId}, ${secondOfferingId})`
        await transaction`delete from students where id = ${studentId}`
      })
      await sql`
        update semesters set registration_starts_at = ${originalWindow.starts},
          registration_ends_at = ${originalWindow.ends} where id = ${fixture.semester_id}
      `
    }
  })
})
