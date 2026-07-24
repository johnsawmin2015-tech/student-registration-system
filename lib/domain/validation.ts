// Lightweight field validators used by the forms. Returns an error string or null.

export type FieldErrors<T> = Partial<Record<keyof T, string>>

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
  /^MU-\d{4}-\d{4,5}$/.test(value.trim())
    ? null
    : 'Format must be MU-YYYY-NNNNN.'

export const isEmployeeId = (value: string) =>
  /^FAC-\d{4,5}$/.test(value.trim()) ? null : 'Format must be FAC-NNNNN.'

export const isCourseCode = (value: string) =>
  /^[A-Z]{2,5}-\d{2,4}$/.test(value.trim())
    ? null
    : 'Format must be DEPT-NNN (e.g. CS-301).'

export const isPastDate = (value: string, label = 'Date') => {
  if (!value) return `${label} is required.`
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'Enter a valid date.'
  return d.getTime() < Date.now() ? null : `${label} must be in the past.`
}

export function hasErrors<T>(errors: FieldErrors<T>): boolean {
  return Object.values(errors).some((v) => v != null && v !== '')
}
