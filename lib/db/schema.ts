import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

const citext = customType<{ data: string }>({
  dataType() {
    return 'citext'
  },
})

export const entityStatusEnum = pgEnum('entity_status', ['active', 'inactive', 'archived'])
export const genderEnum = pgEnum('gender', ['female', 'male', 'nonbinary', 'undisclosed'])
export const degreeLevelEnum = pgEnum('degree_level', ['undergraduate', 'graduate', 'doctoral'])
export const studentStandingEnum = pgEnum('student_standing', [
  'good',
  'probation',
  'suspended',
  'graduated',
  'withdrawn',
])
export const enrollmentStateEnum = pgEnum('enrollment_state', [
  'enrolled',
  'leave',
  'graduated',
  'withdrawn',
])
export const facultyRankEnum = pgEnum('faculty_rank', [
  'professor',
  'associate',
  'assistant',
  'lecturer',
  'adjunct',
])
export const employmentTypeEnum = pgEnum('employment_type', ['full-time', 'part-time', 'visiting'])
export const semesterSeasonEnum = pgEnum('semester_season', ['fall', 'spring', 'summer'])
export const semesterStatusEnum = pgEnum('semester_status', [
  'planned',
  'active',
  'closed',
  'archived',
])
export const courseOfferingStatusEnum = pgEnum('course_offering_status', [
  'draft',
  'open',
  'closed',
  'cancelled',
  'archived',
])
export const registrationStatusEnum = pgEnum('registration_status', [
  'registered',
  'waitlisted',
  'dropped',
  'completed',
])
export const letterGradeEnum = pgEnum('letter_grade', [
  'A',
  'A-',
  'B+',
  'B',
  'B-',
  'C+',
  'C',
  'C-',
  'D',
  'F',
  'IP',
  'W',
])
export const completedCourseSourceEnum = pgEnum('completed_course_source', [
  'institutional',
  'transfer',
  'exam',
])
export const holdTypeEnum = pgEnum('student_hold_type', [
  'academic',
  'administrative',
  'financial',
  'conduct',
  'health',
])
export const holdStatusEnum = pgEnum('student_hold_status', ['active', 'released', 'expired'])
export const notificationLevelEnum = pgEnum('notification_level', [
  'info',
  'success',
  'warning',
  'critical',
])
export const loginAttemptOutcomeEnum = pgEnum('login_attempt_outcome', [
  'success',
  'failure',
  'locked',
  'rate_limited',
])
export const auditOutcomeEnum = pgEnum('audit_outcome', ['success', 'denied', 'failure'])
export const settingValueTypeEnum = pgEnum('setting_value_type', [
  'boolean',
  'number',
  'string',
  'json',
])

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: citext('email').notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 160 }).notNull(),
    title: varchar('title', { length: 160 }),
    status: entityStatusEnum('status').default('active').notNull(),
    isDisabled: boolean('is_disabled').default(false).notNull(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    uniqueIndex('users_email_unique').on(table.email),
    check('users_version_positive', sql`${table.version} >= 1`),
    check(
      'users_archived_state_consistent',
      sql`(${table.status} = 'archived') = (${table.archivedAt} is not null)`,
    ),
  ],
)

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: varchar('key', { length: 64 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description').notNull(),
    isSystem: boolean('is_system').default(false).notNull(),
    status: entityStatusEnum('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    uniqueIndex('roles_key_unique').on(table.key),
    check('roles_version_positive', sql`${table.version} >= 1`),
    check(
      'roles_archived_state_consistent',
      sql`(${table.status} = 'archived') = (${table.archivedAt} is not null)`,
    ),
  ],
)

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: varchar('key', { length: 100 }).notNull(),
    description: text('description').notNull(),
    status: entityStatusEnum('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    uniqueIndex('permissions_key_unique').on(table.key),
    check('permissions_version_positive', sql`${table.version} >= 1`),
    check(
      'permissions_archived_state_consistent',
      sql`(${table.status} = 'archived') = (${table.archivedAt} is not null)`,
    ),
  ],
)

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    grantedByUserId: uuid('granted_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    unique('user_roles_user_role_unique').on(table.userId, table.roleId),
    index('user_roles_user_active_idx')
      .on(table.userId)
      .where(sql`${table.revokedAt} is null`),
  ],
)

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    grantedByUserId: uuid('granted_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    unique('role_permissions_role_permission_unique').on(table.roleId, table.permissionId),
    index('role_permissions_role_active_idx')
      .on(table.roleId)
      .where(sql`${table.revokedAt} is null`),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    csrfTokenHash: varchar('csrf_token_hash', { length: 128 }).notNull(),
    sessionFamilyId: uuid('session_family_id').notNull(),
    rotatedFromSessionId: uuid('rotated_from_session_id').references(
      (): AnyPgColumn => sessions.id,
      { onDelete: 'restrict', onUpdate: 'restrict' },
    ),
    ipHash: varchar('ip_hash', { length: 128 }),
    userAgentSummary: varchar('user_agent_summary', { length: 255 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokeReason: varchar('revoke_reason', { length: 160 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_active_idx')
      .on(table.userId, table.expiresAt)
      .where(sql`${table.revokedAt} is null`),
    check('sessions_version_positive', sql`${table.version} >= 1`),
    check(
      'sessions_expiry_after_creation',
      sql`${table.expiresAt} > ${table.createdAt} and ${table.idleExpiresAt} > ${table.createdAt}`,
    ),
    check(
      'sessions_revocation_consistent',
      sql`(${table.revokedAt} is null and ${table.revokeReason} is null) or ${table.revokedAt} is not null`,
    ),
  ],
)

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    emailHash: varchar('email_hash', { length: 128 }).notNull(),
    ipHash: varchar('ip_hash', { length: 128 }).notNull(),
    outcome: loginAttemptOutcomeEnum('outcome').notNull(),
    requestId: uuid('request_id').notNull(),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('login_attempts_rate_limit_idx').on(table.emailHash, table.ipHash, table.attemptedAt),
    index('login_attempts_user_idx').on(table.userId, table.attemptedAt),
  ],
)

export const departments = pgTable(
  'departments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: citext('code').notNull(),
    name: varchar('name', { length: 180 }).notNull(),
    schoolName: varchar('school_name', { length: 180 }).notNull(),
    chairFacultyId: uuid('chair_faculty_id').references((): AnyPgColumn => faculty.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    building: varchar('building', { length: 180 }),
    contactEmail: citext('contact_email'),
    description: text('description').notNull(),
    status: entityStatusEnum('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    uniqueIndex('departments_code_unique').on(table.code),
    uniqueIndex('departments_name_unique').on(table.name),
    check('departments_version_positive', sql`${table.version} >= 1`),
    check(
      'departments_archived_state_consistent',
      sql`(${table.status} = 'archived') = (${table.archivedAt} is not null)`,
    ),
  ],
)

export const faculty = pgTable(
  'faculty',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    employeeId: citext('employee_id').notNull(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    email: citext('email').notNull(),
    phone: varchar('phone', { length: 40 }),
    departmentId: uuid('department_id')
      .notNull()
      .references((): AnyPgColumn => departments.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    rank: facultyRankEnum('rank').notNull(),
    employmentType: employmentTypeEnum('employment_type').notNull(),
    office: varchar('office', { length: 120 }),
    specialization: varchar('specialization', { length: 180 }),
    hiredOn: date('hired_on', { mode: 'string' }),
    notes: text('notes').default('').notNull(),
    status: entityStatusEnum('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    uniqueIndex('faculty_employee_id_unique').on(table.employeeId),
    uniqueIndex('faculty_email_unique').on(table.email),
    uniqueIndex('faculty_user_id_unique')
      .on(table.userId)
      .where(sql`${table.userId} is not null`),
    unique('faculty_department_identity_unique').on(table.departmentId, table.id),
    index('faculty_department_status_idx').on(table.departmentId, table.status),
    check('faculty_version_positive', sql`${table.version} >= 1`),
    check(
      'faculty_archived_state_consistent',
      sql`(${table.status} = 'archived') = (${table.archivedAt} is not null)`,
    ),
  ],
)

export const students = pgTable(
  'students',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    universityId: citext('university_id').notNull(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    email: citext('email').notNull(),
    phone: varchar('phone', { length: 40 }),
    dateOfBirth: date('date_of_birth', { mode: 'string' }),
    gender: genderEnum('gender').default('undisclosed').notNull(),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    advisorId: uuid('advisor_id').references(() => faculty.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    program: varchar('program', { length: 180 }).notNull(),
    degreeLevel: degreeLevelEnum('degree_level').notNull(),
    cohortYear: smallint('cohort_year').notNull(),
    gpa: numeric('gpa', { precision: 3, scale: 2 }).default('0').notNull(),
    requiredCredits: numeric('required_credits', {
      precision: 6,
      scale: 1,
    }).notNull(),
    standing: studentStandingEnum('standing').default('good').notNull(),
    enrollmentState: enrollmentStateEnum('enrollment_state').default('enrolled').notNull(),
    city: varchar('city', { length: 120 }),
    country: varchar('country', { length: 120 }),
    notes: text('notes').default('').notNull(),
    status: entityStatusEnum('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    uniqueIndex('students_university_id_unique').on(table.universityId),
    uniqueIndex('students_email_unique').on(table.email),
    uniqueIndex('students_user_id_unique')
      .on(table.userId)
      .where(sql`${table.userId} is not null`),
    foreignKey({
      name: 'students_advisor_same_department_fk',
      columns: [table.departmentId, table.advisorId],
      foreignColumns: [faculty.departmentId, faculty.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('students_department_status_idx').on(table.departmentId, table.status),
    check('students_gpa_range', sql`${table.gpa} between 0 and 4.00`),
    check('students_required_credits_nonnegative', sql`${table.requiredCredits} >= 0`),
    check('students_cohort_year_range', sql`${table.cohortYear} between 1900 and 2200`),
    check('students_version_positive', sql`${table.version} >= 1`),
    check(
      'students_archived_state_consistent',
      sql`(${table.status} = 'archived') = (${table.archivedAt} is not null)`,
    ),
  ],
)

export const courseCatalog = pgTable(
  'course_catalog',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: citext('code').notNull(),
    title: varchar('title', { length: 240 }).notNull(),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    description: text('description').notNull(),
    credits: numeric('credits', { precision: 4, scale: 1 }).notNull(),
    level: smallint('level').notNull(),
    status: entityStatusEnum('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    uniqueIndex('course_catalog_code_unique').on(table.code),
    index('course_catalog_department_status_idx').on(table.departmentId, table.status),
    check('course_catalog_credits_positive', sql`${table.credits} > 0 and ${table.credits} <= 30`),
    check('course_catalog_level_range', sql`${table.level} between 0 and 999`),
    check('course_catalog_version_positive', sql`${table.version} >= 1`),
    check(
      'course_catalog_archived_state_consistent',
      sql`(${table.status} = 'archived') = (${table.archivedAt} is not null)`,
    ),
  ],
)

export const prerequisites = pgTable(
  'prerequisites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseCatalogId: uuid('course_catalog_id')
      .notNull()
      .references(() => courseCatalog.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    prerequisiteCourseCatalogId: uuid('prerequisite_course_catalog_id')
      .notNull()
      .references(() => courseCatalog.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    minimumGrade: letterGradeEnum('minimum_grade'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('prerequisites_course_pair_unique').on(
      table.courseCatalogId,
      table.prerequisiteCourseCatalogId,
    ),
    check(
      'prerequisites_not_self_referential',
      sql`${table.courseCatalogId} <> ${table.prerequisiteCourseCatalogId}`,
    ),
    check(
      'prerequisites_minimum_grade_final',
      sql`${table.minimumGrade} is null or ${table.minimumGrade} not in ('IP', 'W')`,
    ),
  ],
)

export const semesters = pgTable(
  'semesters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: citext('code').notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    season: semesterSeasonEnum('season').notNull(),
    year: smallint('year').notNull(),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }).notNull(),
    registrationStartsAt: timestamp('registration_starts_at', {
      withTimezone: true,
    }).notNull(),
    registrationEndsAt: timestamp('registration_ends_at', {
      withTimezone: true,
    }).notNull(),
    isCurrent: boolean('is_current').default(false).notNull(),
    status: semesterStatusEnum('status').default('planned').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    uniqueIndex('semesters_code_unique').on(table.code),
    uniqueIndex('semesters_one_current_unique')
      .on(table.isCurrent)
      .where(sql`${table.isCurrent} = true`),
    check(
      'semesters_date_order',
      sql`${table.startsOn} <= ${table.endsOn} and ${table.registrationStartsAt} < ${table.registrationEndsAt}`,
    ),
    check('semesters_year_range', sql`${table.year} between 1900 and 2200`),
    check('semesters_version_positive', sql`${table.version} >= 1`),
    check(
      'semesters_current_not_archived',
      sql`not (${table.isCurrent} and ${table.status} = 'archived')`,
    ),
    check(
      'semesters_archived_state_consistent',
      sql`(${table.status} = 'archived') = (${table.archivedAt} is not null)`,
    ),
  ],
)

export const courseOfferings = pgTable(
  'course_offerings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseCatalogId: uuid('course_catalog_id')
      .notNull()
      .references(() => courseCatalog.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    semesterId: uuid('semester_id')
      .notNull()
      .references(() => semesters.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    instructorId: uuid('instructor_id').references(() => faculty.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    sectionCode: citext('section_code').notNull(),
    capacity: integer('capacity').notNull(),
    room: varchar('room', { length: 120 }),
    status: courseOfferingStatusEnum('status').default('draft').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    unique('course_offerings_course_term_section_unique').on(
      table.courseCatalogId,
      table.semesterId,
      table.sectionCode,
    ),
    unique('course_offerings_id_semester_unique').on(table.id, table.semesterId),
    index('course_offerings_semester_status_idx').on(table.semesterId, table.status),
    check('course_offerings_capacity_nonnegative', sql`${table.capacity} >= 0`),
    check('course_offerings_version_positive', sql`${table.version} >= 1`),
    check(
      'course_offerings_archived_state_consistent',
      sql`(${table.status} = 'archived') = (${table.archivedAt} is not null)`,
    ),
  ],
)

export const offeringMeetings = pgTable(
  'offering_meetings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    offeringId: uuid('offering_id')
      .notNull()
      .references(() => courseOfferings.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    dayOfWeek: smallint('day_of_week').notNull(),
    startsAt: time('starts_at').notNull(),
    endsAt: time('ends_at').notNull(),
    room: varchar('room', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('offering_meetings_slot_unique').on(
      table.offeringId,
      table.dayOfWeek,
      table.startsAt,
      table.endsAt,
    ),
    index('offering_meetings_conflict_idx').on(table.dayOfWeek, table.startsAt, table.endsAt),
    check('offering_meetings_day_range', sql`${table.dayOfWeek} between 0 and 6`),
    check('offering_meetings_time_order', sql`${table.startsAt} < ${table.endsAt}`),
  ],
)

export const registrations = pgTable(
  'registrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    offeringId: uuid('offering_id').notNull(),
    semesterId: uuid('semester_id').notNull(),
    status: registrationStatusEnum('status').notNull(),
    waitlistPosition: integer('waitlist_position'),
    grade: letterGradeEnum('grade'),
    registeredAt: timestamp('registered_at', { withTimezone: true }).defaultNow().notNull(),
    droppedAt: timestamp('dropped_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    foreignKey({
      name: 'registrations_offering_semester_fk',
      columns: [table.offeringId, table.semesterId],
      foreignColumns: [courseOfferings.id, courseOfferings.semesterId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique('registrations_student_offering_unique').on(table.studentId, table.offeringId),
    uniqueIndex('registrations_offering_waitlist_position_unique')
      .on(table.offeringId, table.waitlistPosition)
      .where(sql`${table.waitlistPosition} is not null`),
    index('registrations_semester_status_idx').on(table.semesterId, table.status),
    index('registrations_student_status_idx').on(table.studentId, table.status),
    check(
      'registrations_waitlist_state_consistent',
      sql`(${table.status} = 'waitlisted' and ${table.waitlistPosition} is not null and ${table.waitlistPosition} > 0) or (${table.status} <> 'waitlisted' and ${table.waitlistPosition} is null)`,
    ),
    check(
      'registrations_grade_state_consistent',
      sql`
        (${table.status} = 'completed' and ${table.grade} is not null and ${table.grade} not in ('IP', 'W'))
        or (${table.status} = 'dropped' and (${table.grade} is null or ${table.grade} = 'W'))
        or (${table.status} = 'registered' and (${table.grade} is null or ${table.grade} = 'IP'))
        or (${table.status} = 'waitlisted' and ${table.grade} is null)
      `,
    ),
    check(
      'registrations_lifecycle_timestamps_consistent',
      sql`
        (${table.status} = 'dropped' and ${table.droppedAt} is not null and ${table.completedAt} is null)
        or (${table.status} = 'completed' and ${table.completedAt} is not null and ${table.droppedAt} is null)
        or (${table.status} in ('registered', 'waitlisted') and ${table.droppedAt} is null and ${table.completedAt} is null)
      `,
    ),
    check('registrations_version_positive', sql`${table.version} >= 1`),
  ],
)

export const completedCourses = pgTable(
  'completed_courses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    courseCatalogId: uuid('course_catalog_id')
      .notNull()
      .references(() => courseCatalog.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    registrationId: uuid('registration_id').references(() => registrations.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    semesterId: uuid('semester_id').references(() => semesters.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    source: completedCourseSourceEnum('source').notNull(),
    grade: letterGradeEnum('grade').notNull(),
    gradePoints: numeric('grade_points', { precision: 3, scale: 2 }).notNull(),
    creditsEarned: numeric('credits_earned', {
      precision: 4,
      scale: 1,
    }).notNull(),
    completedOn: date('completed_on', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    uniqueIndex('completed_courses_registration_unique')
      .on(table.registrationId)
      .where(sql`${table.registrationId} is not null`),
    index('completed_courses_prerequisite_lookup_idx').on(table.studentId, table.courseCatalogId),
    check('completed_courses_grade_final', sql`${table.grade} not in ('IP', 'W')`),
    check('completed_courses_grade_points_range', sql`${table.gradePoints} between 0 and 4.00`),
    check('completed_courses_credits_nonnegative', sql`${table.creditsEarned} >= 0`),
    check('completed_courses_version_positive', sql`${table.version} >= 1`),
  ],
)

export const studentHolds = pgTable(
  'student_holds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    type: holdTypeEnum('type').notNull(),
    status: holdStatusEnum('status').default('active').notNull(),
    blocksRegistration: boolean('blocks_registration').default(true).notNull(),
    reason: varchar('reason', { length: 240 }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releasedByUserId: uuid('released_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    index('student_holds_active_lookup_idx')
      .on(table.studentId, table.blocksRegistration)
      .where(sql`${table.status} = 'active'`),
    check(
      'student_holds_expiry_after_start',
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.startsAt}`,
    ),
    check(
      'student_holds_release_consistent',
      sql`(${table.status} = 'released') = (${table.releasedAt} is not null)`,
    ),
    check('student_holds_version_positive', sql`${table.version} >= 1`),
  ],
)

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    level: notificationLevelEnum('level').default('info').notNull(),
    title: varchar('title', { length: 180 }).notNull(),
    message: text('message').notNull(),
    entityType: varchar('entity_type', { length: 64 }),
    entityId: uuid('entity_id'),
    href: varchar('href', { length: 500 }),
    readAt: timestamp('read_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    index('notifications_recipient_unread_idx')
      .on(table.recipientUserId, table.createdAt)
      .where(sql`${table.readAt} is null and ${table.archivedAt} is null`),
    check('notifications_version_positive', sql`${table.version} >= 1`),
    check(
      'notifications_entity_reference_consistent',
      sql`(${table.entityType} is null) = (${table.entityId} is null)`,
    ),
  ],
)

export const systemSettings = pgTable(
  'system_settings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: varchar('key', { length: 100 }).notNull(),
    valueType: settingValueTypeEnum('value_type').notNull(),
    value: jsonb('value').$type<unknown>().notNull(),
    description: text('description').notNull(),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    uniqueIndex('system_settings_key_unique').on(table.key),
    check('system_settings_version_positive', sql`${table.version} >= 1`),
    check(
      'system_settings_json_type_matches',
      sql`
        (${table.valueType} = 'boolean' and jsonb_typeof(${table.value}) = 'boolean')
        or (${table.valueType} = 'number' and jsonb_typeof(${table.value}) = 'number')
        or (${table.valueType} = 'string' and jsonb_typeof(${table.value}) = 'string')
        or (${table.valueType} = 'json' and jsonb_typeof(${table.value}) in ('object', 'array'))
      `,
    ),
  ],
)

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    actorRoleKey: varchar('actor_role_key', { length: 64 }).notNull(),
    action: varchar('action', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 64 }).notNull(),
    entityId: varchar('entity_id', { length: 255 }),
    requestId: uuid('request_id').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    outcome: auditOutcomeEnum('outcome').notNull(),
    changeSummary: jsonb('change_summary').$type<Record<string, unknown>>().default({}).notNull(),
    sourceMetadata: jsonb('source_metadata').$type<Record<string, unknown>>().default({}).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_events_occurred_at_idx').on(table.occurredAt),
    index('audit_events_actor_idx').on(table.actorUserId, table.occurredAt),
    index('audit_events_entity_idx').on(table.entityType, table.entityId, table.occurredAt),
    index('audit_events_correlation_idx').on(table.correlationId),
  ],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Role = typeof roles.$inferSelect
export type Permission = typeof permissions.$inferSelect
export type Student = typeof students.$inferSelect
export type FacultyMember = typeof faculty.$inferSelect
export type Department = typeof departments.$inferSelect
export type CourseCatalogEntry = typeof courseCatalog.$inferSelect
export type CourseOffering = typeof courseOfferings.$inferSelect
export type Semester = typeof semesters.$inferSelect
export type Registration = typeof registrations.$inferSelect
export type AuditEvent = typeof auditEvents.$inferSelect
