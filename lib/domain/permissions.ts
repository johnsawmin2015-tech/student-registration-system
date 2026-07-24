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

export function can(role: Role, capability: Capability): boolean {
  return rolePolicy[role].includes(capability)
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
