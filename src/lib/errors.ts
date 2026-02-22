/**
 * 统一错误处理工具
 */

// 应用错误类
export class AppError extends Error {
  code: string
  statusCode: number

  constructor(
    message: string,
    code = 'UNKNOWN_ERROR',
    statusCode = 500
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
  }
}

// 网络错误
export class NetworkError extends AppError {
  constructor(message = '网络连接失败，请检查网络') {
    super(message, 'NETWORK_ERROR', 0)
    this.name = 'NetworkError'
  }
}

// API 错误
export class ApiError extends AppError {
  constructor(message: string, statusCode = 500) {
    super(message, 'API_ERROR', statusCode)
    this.name = 'ApiError'
  }
}

// 从未知错误中提取消息
export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message
  }
  if (error instanceof Error) {
    // 处理常见的网络错误
    if (error.message.includes('fetch') || error.message.includes('network')) {
      return '网络连接失败，请检查网络'
    }
    if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      return '请求超时，请稍后重试'
    }
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return '发生未知错误'
}

// 判断是否为网络错误
export function isNetworkError(error: unknown): boolean {
  if (error instanceof NetworkError) return true
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch')
  }
  return false
}

// 判断是否为超时错误
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return msg.includes('timeout') || msg.includes('aborted')
  }
  return false
}
