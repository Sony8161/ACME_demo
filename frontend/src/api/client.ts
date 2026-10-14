import { keysToCamel, keysToSnake } from './case'

/** Address of the API. Empty VITE_API_URL means "same address as the site" (dev proxy or CloudFront). */
const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/pm-api`

/** Every API failure arrives in one shape: {error: {code, message, details}}. This is that shape as an Error. */
export class ApiError extends Error {
  status: number
  code: string
  details: { field?: string; message: string }[]

  constructor(status: number, code: string, message: string, details: { field?: string; message: string }[] = []) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

let token: string | null = null
let onUnauthorized: () => void = () => {}

export function setToken(value: string | null) {
  token = value
}

/** The auth layer registers what to do when the server says the session is over (expired, revoked). */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

type Query = Record<string, string | number | boolean | undefined | null>

function buildUrl(path: string, query?: Query) {
  const params = new URLSearchParams()
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  })
  const qs = params.toString()
  return `${BASE}${path}${qs ? `?${qs}` : ''}`
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(keysToSnake(body)) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the server. Check your connection and try again.')
  }

  const text = await response.text()
  const data: unknown = text ? JSON.parse(text) : null

  if (!response.ok) {
    const error = keysToCamel<{ error?: { code?: string; message?: string; details?: ApiError['details'] } }>(data).error
    const apiError = new ApiError(
      response.status,
      error?.code ?? 'unknown_error',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details ?? [],
    )
    // A 401 on a signed-in call means the session ended; a failed login is just a wrong password.
    if (response.status === 401 && token && apiError.code !== 'invalid_credentials') onUnauthorized()
    throw apiError
  }
  return keysToCamel<T>(data)
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
}
