import axios from 'axios'

export interface RetryOptions {
  maxRetries?: number
  initialDelay?: number
  maxDelay?: number
  backoffMultiplier?: number
  jitter?: boolean
  shouldRetry?: (error: unknown) => boolean
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: isRetryableError,
}

export function isRetryableError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status

    if (status === 429 || status === 504) return true

    if (!error.response && error.code) {
      const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED']
      return retryableCodes.includes(error.code)
    }

    if (error.code === 'ECONNABORTED') return true

    return false
  }

  if (error instanceof Error) {
    return error.message.includes('timeout') || error.message.includes('ECONNRESET')
  }

  return false
}

function calculateDelay(
  attempt: number,
  initialDelay: number,
  backoffMultiplier: number,
  maxDelay: number,
  jitter: boolean
): number {
  const exponentialDelay = initialDelay * Math.pow(backoffMultiplier, attempt)
  const cappedDelay = Math.min(exponentialDelay, maxDelay)

  if (jitter) {
    const jitterAmount = cappedDelay * 0.1
    return cappedDelay + (Math.random() * jitterAmount * 2 - jitterAmount)
  }

  return cappedDelay
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: unknown

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      const shouldRetry = opts.shouldRetry(error)
      const hasRetriesLeft = attempt < opts.maxRetries

      if (!shouldRetry || !hasRetriesLeft) {
        throw error
      }

      const delay = calculateDelay(attempt, opts.initialDelay, opts.backoffMultiplier, opts.maxDelay, opts.jitter)

      const errorMsg = axios.isAxiosError(error)
        ? `HTTP ${error.response?.status || 'network error'}`
        : error instanceof Error
          ? error.message
          : String(error)

      console.warn(`[retry] Attempt ${attempt + 1} failed (${errorMsg}), retrying after ${Math.round(delay)}ms`)

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}
