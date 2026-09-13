import type { Capability, Role, UserRole } from './types'

export type { Capability } from './types'

export const ALL_CAPABILITIES = [
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
] as const satisfies readonly Capability[]

const STAFF_CAPABILITIES = [
  'records:read',
  'students:write',
  'faculty:write',
  'departments:write',
  'courses:write',
  'registrations:manage',
  'reports:read',
  'exports:create',
  'notifications:write',
] as const satisfies readonly Capability[]

const VIEWER_CAPABILITIES = [
  'records:read',
  'reports:read',
  'audit:read',
] as const satisfies readonly Capability[]

/** Serializable, immutable policy definition. Enforcement must still occur server-side. */
export const ROLE_CAPABILITIES: Readonly<Record<UserRole, readonly Capability[]>> = Object.freeze({
  administrator: Object.freeze([...ALL_CAPABILITIES]),
  staff: Object.freeze([...STAFF_CAPABILITIES]),
  viewer: Object.freeze([...VIEWER_CAPABILITIES]),
})

const capabilitySets: Readonly<Record<UserRole, ReadonlySet<Capability>>> = {
  administrator: new Set(ROLE_CAPABILITIES.administrator),
  staff: new Set(ROLE_CAPABILITIES.staff),
  viewer: new Set(ROLE_CAPABILITIES.viewer),
}

export function isUserRole(value: unknown): value is UserRole {
  return value === 'administrator' || value === 'staff' || value === 'viewer'
}

export function normalizeUserRole(value: unknown): UserRole | null {
  if (value === 'admin') return 'administrator'
  return isUserRole(value) ? value : null
}

export function hasCapability(role: unknown, capability: Capability): boolean {
  const normalizedRole = normalizeUserRole(role)
  return normalizedRole ? capabilitySets[normalizedRole].has(capability) : false
}

export class AuthorizationError extends Error {
  readonly code = 'FORBIDDEN'
  readonly status = 403
  readonly capability: Capability

  constructor(capability: Capability) {
    super('You do not have permission to perform this action.')
    this.name = 'AuthorizationError'
    this.capability = capability
  }
}

export function assertCapability(
  role: unknown,
  capability: Capability,
): asserts role is UserRole | Role {
  if (!hasCapability(role, capability)) throw new AuthorizationError(capability)
}

export interface PermissionActor {
  id?: string | null
  role?: UserRole | Role | string | null
  authenticated?: boolean
}

export class AuthenticationError extends Error {
  readonly code = 'UNAUTHENTICATED'
  readonly status = 401

  constructor() {
    super('Authentication is required.')
    this.name = 'AuthenticationError'
  }
}

export function assertActorCapability(
  actor: PermissionActor | null | undefined,
  capability: Capability,
): asserts actor is PermissionActor & { id: string; role: UserRole | Role; authenticated: true } {
  if (!actor?.authenticated || !actor.id) throw new AuthenticationError()
  assertCapability(actor.role, capability)
}

/** @deprecated Compatibility adapter for the browser-only prototype. */
export type LegacyCapability =
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

const LEGACY_CAPABILITY_MAP: Readonly<Record<LegacyCapability, Capability>> = {
  view: 'records:read',
  'student.create': 'students:write',
  'student.edit': 'students:write',
  'student.delete': 'students:write',
  'faculty.create': 'faculty:write',
  'faculty.edit': 'faculty:write',
  'faculty.delete': 'faculty:write',
  'department.create': 'departments:write',
  'department.edit': 'departments:write',
  'department.delete': 'departments:write',
  'course.create': 'courses:write',
  'course.edit': 'courses:write',
  'course.delete': 'courses:write',
  'registration.manage': 'registrations:manage',
  'settings.manage': 'settings:manage',
  export: 'exports:create',
}

const ADMIN_ONLY_LEGACY = new Set<LegacyCapability>([
  'student.delete',
  'faculty.delete',
  'department.delete',
  'course.delete',
])

/** @deprecated Use {@link hasCapability} with production capability names. */
export function can(role: UserRole | Role, capability: Capability | LegacyCapability): boolean {
  if (capability in LEGACY_CAPABILITY_MAP) {
    if (ADMIN_ONLY_LEGACY.has(capability as LegacyCapability)) {
      return normalizeUserRole(role) === 'administrator'
    }
    return hasCapability(role, LEGACY_CAPABILITY_MAP[capability as LegacyCapability])
  }
  return hasCapability(role, capability as Capability)
}

export const roleLabels: Readonly<Record<UserRole | Role, string>> = {
  administrator: 'Administrator',
  admin: 'Administrator',
  staff: 'Staff',
  viewer: 'Viewer',
}

export const roleDescriptions: Readonly<Record<UserRole | Role, string>> = {
  administrator: 'Full institutional administration and controlled security operations.',
  admin: 'Full institutional administration and controlled security operations.',
  staff: 'Academic record and registration management without security administration.',
  viewer: 'Read-only institutional reporting and audit access.',
}
