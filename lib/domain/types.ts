// Core domain types for the Meridian University Management System prototype.
// These interfaces model the entities and are the source of truth for the app.
// In production these would map to MongoDB documents / SQL rows.

export type Role = 'admin' | 'staff' | 'viewer'

export type EntityStatus = 'active' | 'inactive' | 'archived'

export type StudentStanding =
  | 'good'
  | 'probation'
  | 'suspended'
  | 'graduated'
  | 'withdrawn'

export type EnrollmentState = 'enrolled' | 'leave' | 'graduated' | 'withdrawn'

export type FacultyRank =
  | 'professor'
  | 'associate'
  | 'assistant'
  | 'lecturer'
  | 'adjunct'

export type EmploymentType = 'full-time' | 'part-time' | 'visiting'

export type RegistrationStatus =
  | 'registered'
  | 'waitlisted'
  | 'dropped'
  | 'completed'

export type LetterGrade =
  | 'A'
  | 'A-'
  | 'B+'
  | 'B'
  | 'B-'
  | 'C+'
  | 'C'
  | 'C-'
  | 'D'
  | 'F'
  | 'IP' // in progress
  | 'W'

export type TermSeason = 'Fall' | 'Spring' | 'Summer'

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
  | 'export'
  | 'settings'

export type AuditEntity =
  | 'student'
  | 'faculty'
  | 'department'
  | 'course'
  | 'registration'
  | 'semester'
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
  universityId: string // e.g. MU-2024-00123
  firstName: string
  lastName: string
  email: string
  phone: string
  dateOfBirth: string // ISO date
  gender: 'female' | 'male' | 'nonbinary' | 'undisclosed'
  departmentId: string
  program: string
  degreeLevel: 'undergraduate' | 'graduate' | 'doctoral'
  cohortYear: number
  advisorId: string | null
  gpa: number // 0 - 4.0
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
  employeeId: string // e.g. FAC-00421
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
  code: string // e.g. CS
  name: string
  faculty: string // school / faculty grouping e.g. "Faculty of Engineering"
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
  code: string // e.g. CS-301
  title: string
  departmentId: string
  instructorId: string | null
  credits: number
  level: '100' | '200' | '300' | '400' | '500' | '600'
  capacity: number
  schedule: string // e.g. "Mon/Wed 10:00-11:30"
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
  name: string // e.g. "Fall 2025"
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
