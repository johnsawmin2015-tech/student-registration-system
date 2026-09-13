import 'server-only'

type LogLevel = 'info' | 'warn' | 'error'

interface SafeLogContext {
  requestId?: string
  action?: string
  entityType?: string
  entityId?: string
  outcome?: string
  errorCode?: string
  dataMode?: string
}

function write(level: LogLevel, message: string, context: SafeLogContext = {}) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  })
  if (level === 'error') console.error(entry)
  else if (level === 'warn') console.warn(entry)
  else console.info(entry)
}

export const logger = {
  info: (message: string, context?: SafeLogContext) => write('info', message, context),
  warn: (message: string, context?: SafeLogContext) => write('warn', message, context),
  error: (message: string, context?: SafeLogContext) => write('error', message, context),
}
