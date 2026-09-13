export type ErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'STALE_WRITE'
  | 'REGISTRATION_DENIED'
  | 'CONFIGURATION_ERROR'
  | 'INTERNAL_ERROR'

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly details?: Record<string, string>,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function publicError(error: unknown): { code: ErrorCode; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message }
  return { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' }
}
