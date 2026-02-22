/**
 * Safe logging utility for development only
 * Prevents sensitive data from being logged in production
 */

const isDev = import.meta.env.DEV

// Safe log - only logs in development
export function log(tag: string, message: string, data?: Record<string, unknown>): void {
  if (!isDev) return

  const safeData = data ? { ...data } : {}
  // Remove sensitive fields
  delete safeData.token
  delete safeData.accessToken
  delete safeData.apiKey
  delete safeData.key
  delete safeData.authorization
  delete safeData.password

  const hasData = Object.keys(safeData).length > 0
  console.log(`[${tag}] ${message}`, hasData ? JSON.stringify(safeData) : '')
}

// Warn - only in development
export function warn(tag: string, message: string, data?: Record<string, unknown>): void {
  if (!isDev) return
  log(tag, `WARN: ${message}`, data)
}

// Error - always log errors but sanitize data
export function logError(tag: string, message: string, error?: unknown): void {
  const errorMessage = error instanceof Error ? error.message : String(error || '')
  // Don't log sensitive error details in production
  if (isDev) {
    console.error(`[${tag}] ${message}`, errorMessage)
  }
}
