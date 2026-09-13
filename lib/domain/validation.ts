import { z } from 'zod'

export type FieldErrors<T> = Partial<Record<keyof T, string>>

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const HH_MM_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/

export const identifierSchema = z
  .string()
  .trim()
  .min(1, 'Identifier is required.')
  .max(128, 'Identifier is too long.')
  .regex(IDENTIFIER_PATTERN, 'Identifier contains unsupported characters.')

function isRealIsoDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

export const isoDateSchema = z
  .string()
  .regex(ISO_DATE_PATTERN, 'Use an ISO date in YYYY-MM-DD format.')
  .refine(isRealIsoDate, 'Enter a valid date.')

export const timeOfDaySchema = z
  .string()
  .regex(HH_MM_PATTERN, 'Use a 24-hour time in HH:MM format.')

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} is too long.`)

const optionalText = (max: number) => z.string().trim().max(max).optional()
const nullableOptionalText = (max: number) => z.string().trim().max(max).nullable().optional()

export const meetingPatternSchema = z
  .object({
    dayOfWeek: z.enum([
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ]),
    startsAt: timeOfDaySchema,
    endsAt: timeOfDaySchema,
    room: requiredText('Room', 120),
  })
  .strict()
  .refine((meeting) => meeting.startsAt < meeting.endsAt, {
    message: 'Meeting end time must be after its start time.',
    path: ['endsAt'],
  })

export const createStudentCommandSchema = z
  .object({
    universityId: z
      .string()
      .trim()
      .regex(/^MU-\d{4}-\d{4,5}$/, 'Format must be MU-YYYY-NNNNN.'),
    firstName: requiredText('First name', 100),
    lastName: requiredText('Last name', 100),
    email: z
      .string()
      .trim()
      .email('Enter a valid email address.')
      .max(254)
      .transform((v) => v.toLowerCase()),
    phone: nullableOptionalText(40),
    dateOfBirth: isoDateSchema,
    gender: z.enum(['female', 'male', 'nonbinary', 'undisclosed']),
    departmentId: identifierSchema,
    program: requiredText('Program', 160),
    degreeLevel: z.enum(['undergraduate', 'graduate', 'doctoral']),
    cohortYear: z.number().int().min(1900).max(2200),
    advisorId: identifierSchema.nullable().optional(),
    city: nullableOptionalText(120),
    country: nullableOptionalText(120),
    notes: nullableOptionalText(2_000),
  })
  .strict()

const studentProfileFields = {
  firstName: requiredText('First name', 100).optional(),
  lastName: requiredText('Last name', 100).optional(),
  email: z
    .string()
    .trim()
    .email('Enter a valid email address.')
    .max(254)
    .transform((v) => v.toLowerCase())
    .optional(),
  phone: nullableOptionalText(40),
  dateOfBirth: isoDateSchema.optional(),
  gender: z.enum(['female', 'male', 'nonbinary', 'undisclosed']).optional(),
  departmentId: identifierSchema.optional(),
  program: requiredText('Program', 160).optional(),
  degreeLevel: z.enum(['undergraduate', 'graduate', 'doctoral']).optional(),
  cohortYear: z.number().int().min(1900).max(2200).optional(),
  advisorId: identifierSchema.nullable().optional(),
  city: nullableOptionalText(120),
  country: nullableOptionalText(120),
  notes: nullableOptionalText(2_000),
} as const

export const updateStudentProfileCommandSchema = z
  .object({ studentId: identifierSchema, ...studentProfileFields })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'studentId'), {
    message: 'At least one profile field must be supplied.',
  })

export const changeStudentStandingCommandSchema = z
  .object({
    studentId: identifierSchema,
    standing: z.enum(['good', 'probation', 'suspended', 'graduated', 'withdrawn']),
    reason: requiredText('Reason', 500),
  })
  .strict()

export const archiveStudentCommandSchema = z
  .object({
    studentId: identifierSchema,
    reason: requiredText('Reason', 500),
  })
  .strict()

export const createCourseCatalogCommandSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2,8}-\d{2,4}$/, 'Format must be DEPT-NNN (for example, CS-301).'),
    title: requiredText('Course title', 200),
    departmentId: identifierSchema,
    credits: z.number().int().min(0).max(30),
    level: z.enum(['100', '200', '300', '400', '500', '600']),
    description: optionalText(4_000),
    prerequisiteCourseIds: z.array(identifierSchema).max(30).default([]),
  })
  .strict()
  .refine(
    (value) => new Set(value.prerequisiteCourseIds).size === value.prerequisiteCourseIds.length,
    {
      message: 'Prerequisite courses must be unique.',
      path: ['prerequisiteCourseIds'],
    },
  )

export const createCourseOfferingCommandSchema = z
  .object({
    courseCatalogId: identifierSchema,
    semesterId: identifierSchema,
    instructorId: identifierSchema.nullable().optional(),
    capacity: z.number().int().min(0).max(10_000),
    meetings: z.array(meetingPatternSchema).max(30).default([]),
  })
  .strict()

export const registerStudentCommandSchema = z
  .object({
    studentId: identifierSchema,
    offeringId: identifierSchema,
  })
  .strict()

export const dropRegistrationCommandSchema = z
  .object({
    registrationId: identifierSchema,
    reason: optionalText(500),
  })
  .strict()

export const recordGradeCommandSchema = z
  .object({
    registrationId: identifierSchema,
    grade: z.enum(['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'IP', 'W']),
  })
  .strict()

export const setCurrentSemesterCommandSchema = z.object({ semesterId: identifierSchema }).strict()

export const setUserRoleCommandSchema = z
  .object({
    userId: identifierSchema,
    role: z.enum(['administrator', 'staff', 'viewer']),
    expectedVersion: z.coerce.number().int().positive(),
  })
  .strict()

export const updateInstitutionSettingsCommandSchema = z
  .object({
    institutionName: requiredText('Institution name', 200).optional(),
    registrationEnabled: z.boolean().optional(),
    maxCreditsPerSemester: z.number().int().min(0).max(60).optional(),
    gradingScale: z.enum(['4.0', '5.0']).optional(),
    timezone: requiredText('Timezone', 100).optional(),
    contactEmail: z
      .string()
      .trim()
      .email('Enter a valid email address.')
      .max(254)
      .transform((v) => v.toLowerCase())
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one setting must be supplied.',
  })

export const loginCommandSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email('Enter a valid email address.')
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1, 'Password is required.').max(1_024, 'Password is too long.'),
  })
  .strict()

export type CreateStudentCommand = z.infer<typeof createStudentCommandSchema>
export type UpdateStudentProfileCommand = z.infer<typeof updateStudentProfileCommandSchema>
export type ChangeStudentStandingCommand = z.infer<typeof changeStudentStandingCommandSchema>
export type ArchiveStudentCommand = z.infer<typeof archiveStudentCommandSchema>
export type CreateCourseCatalogCommand = z.infer<typeof createCourseCatalogCommandSchema>
export type CreateCourseOfferingCommand = z.infer<typeof createCourseOfferingCommandSchema>
export type RegisterStudentCommand = z.infer<typeof registerStudentCommandSchema>
export type DropRegistrationCommand = z.infer<typeof dropRegistrationCommandSchema>
export type RecordGradeCommand = z.infer<typeof recordGradeCommandSchema>
export type SetCurrentSemesterCommand = z.infer<typeof setCurrentSemesterCommandSchema>
export type SetUserRoleCommand = z.infer<typeof setUserRoleCommandSchema>
export type UpdateInstitutionSettingsCommand = z.infer<
  typeof updateInstitutionSettingsCommandSchema
>
export type LoginCommand = z.infer<typeof loginCommandSchema>

// PascalCase aliases make schemas easy to discover beside their command types.
export const CreateStudentCommandSchema = createStudentCommandSchema
export const UpdateStudentProfileCommandSchema = updateStudentProfileCommandSchema
export const ChangeStudentStandingCommandSchema = changeStudentStandingCommandSchema
export const ArchiveStudentCommandSchema = archiveStudentCommandSchema
export const CreateCourseCatalogCommandSchema = createCourseCatalogCommandSchema
export const CreateCourseOfferingCommandSchema = createCourseOfferingCommandSchema
export const RegisterStudentCommandSchema = registerStudentCommandSchema
export const DropRegistrationCommandSchema = dropRegistrationCommandSchema
export const RecordGradeCommandSchema = recordGradeCommandSchema
export const SetCurrentSemesterCommandSchema = setCurrentSemesterCommandSchema
export const SetUserRoleCommandSchema = setUserRoleCommandSchema
export const UpdateInstitutionSettingsCommandSchema = updateInstitutionSettingsCommandSchema
export const LoginCommandSchema = loginCommandSchema

export const commandSchemas = Object.freeze({
  createStudent: createStudentCommandSchema,
  updateStudentProfile: updateStudentProfileCommandSchema,
  changeStudentStanding: changeStudentStandingCommandSchema,
  archiveStudent: archiveStudentCommandSchema,
  createCourseCatalog: createCourseCatalogCommandSchema,
  createCourseOffering: createCourseOfferingCommandSchema,
  registerStudent: registerStudentCommandSchema,
  dropRegistration: dropRegistrationCommandSchema,
  recordGrade: recordGradeCommandSchema,
  setCurrentSemester: setCurrentSemesterCommandSchema,
  setUserRole: setUserRoleCommandSchema,
  updateInstitutionSettings: updateInstitutionSettingsCommandSchema,
  login: loginCommandSchema,
})

// Legacy form helpers retained for the prototype components during migration.
export const required = (value: unknown, label = 'This field') =>
  value === null || value === undefined || String(value).trim() === ''
    ? `${label} is required.`
    : null

export const isEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : 'Enter a valid email address.'

export const isPhone = (value: string) =>
  value.trim() === '' || /^[+()\d\s-]{7,}$/.test(value.trim())
    ? null
    : 'Enter a valid phone number.'

export const inRange = (value: number, min: number, max: number, label = 'Value') =>
  Number.isFinite(value) && value >= min && value <= max
    ? null
    : `${label} must be between ${min} and ${max}.`

export const isUniversityId = (value: string) =>
  /^MU-\d{4}-\d{4,5}$/.test(value.trim()) ? null : 'Format must be MU-YYYY-NNNNN.'

export const isEmployeeId = (value: string) =>
  /^FAC-\d{4,5}$/.test(value.trim()) ? null : 'Format must be FAC-NNNNN.'

export const isCourseCode = (value: string) =>
  /^[A-Z]{2,5}-\d{2,4}$/.test(value.trim()) ? null : 'Format must be DEPT-NNN (e.g. CS-301).'

export const isPastDate = (value: string, label = 'Date') => {
  if (!value) return `${label} is required.`
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Enter a valid date.'
  return date.getTime() < Date.now() ? null : `${label} must be in the past.`
}

export function hasErrors<T>(errors: FieldErrors<T>): boolean {
  return Object.values(errors).some((value) => value != null && value !== '')
}
