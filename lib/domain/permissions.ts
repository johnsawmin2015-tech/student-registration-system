import type { Role } from './types'

// Granular capability keys used across the UI to gate actions.
export type Capability =
  | 'view'
  | 'student.create'
  | 'student.edit'
  | 'student.delete'
  | 'faculty.create'
  | 'faculty.edit'
  | 'faculty.delete'
  | 'department.create'
  | 'department.edit'
  | 'department.delete'
  | 'course.create'
  | 'course.edit'
  | 'course.delete'
  | 'registration.manage'
  | 'settings.manage'
  | 'export'

const ALL_MUTATIONS: Capability[] = [
  'student.create', 'student.edit', 'student.delete',
  'faculty.create', 'faculty.edit', 'faculty.delete',
  'department.create', 'department.edit', 'department.delete',
  'course.create', 'course.edit', 'course.delete',
  'registration.manage', 'settings.manage',
]

const rolePolicy: Record<Role, Capability[]> = {
  admin: ['view', 'export', ...ALL_MUTATIONS],
  staff: [
    'view',
    'export',
    'student.create', 'student.edit',
    'faculty.edit',
    'course.edit',
    'department.edit',
    'registration.manage',
  ],
  viewer: ['view'],
}

export type NavKey =
  | 'dashboard' | 'students' | 'faculty' | 'departments' | 'courses'
  | 'registrations' | 'reports' | 'notifications' | 'audit' | 'settings'

const navCapability: Record<NavKey, Capability> = {
  dashboard: 'view', students: 'view', faculty: 'view', departments: 'view',
  courses: 'view', registrations: 'view', reports: 'view', notifications: 'view',
  audit: 'view', settings: 'view',
}

export function can(role: Role, capability: Capability | NavKey, mode?: 'read' | 'write'): boolean {
  if (mode === 'write') {
    if (capability === 'registrations') return rolePolicy[role].includes('registration.manage')
    if (capability === 'settings') return rolePolicy[role].includes('settings.manage')
    return role !== 'viewer'
  }
  const resolved = capability in navCapability ? navCapability[capability as NavKey] : capability as Capability
  return rolePolicy[role].includes(resolved)
}

export function roleLabel(role: Role) {
  return roleLabels[role]
}

export const roleLabels: Record<Role, string> = {
  admin: 'Administrator',
  staff: 'Staff',
  viewer: 'Viewer',
}

export const roleDescriptions: Record<Role, string> = {
  admin: 'Full access to all records, settings, and destructive actions.',
  staff: 'Can manage students, registrations, and edit most records.',
  viewer: 'Read-only access for auditing and reporting.',
}
