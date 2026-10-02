import axios from 'axios'

export const formatError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 'no response'
    const data = error.response?.data
    const message = data != null && typeof data === 'object' ? JSON.stringify(data) : data || error.message
    return `HTTP ${status}: ${message}`
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
