'use client'

// Cliente del navegador. SOLO habla con el BFF (/api/auth/* y /api/core/*): nunca con Href.Core
// directo y nunca ve tokens (viven en cookies HttpOnly). El refresh lo hace el BFF.
import { mutate as globalMutate } from 'swr'

export type CoreSession = { userId: string; name: string; email: string; expiresAt: number; jwksUrl: string }

export const SESSION_KEY = 'href-core-session'

export class CoreApiError extends Error {
  status: number
  errorCode: string
  correlationId: string
  retryAfter: string | null
  fieldErrors: Record<string, string[]> | null

  constructor(status: number, body: Record<string, unknown>, retryAfter: string | null, headerCorrelationId?: string | null) {
    super(typeof body.title === 'string' ? body.title : 'No se pudo completar la solicitud.')
    this.name = 'CoreApiError'
    this.status = status
    // Los 400 de validación del framework (ValidationProblemDetails) no traen errorCode.
    this.errorCode = typeof body.errorCode === 'string' ? body.errorCode : body.errors ? 'Validation' : `Http.${status}`
    this.correlationId = typeof body.correlationId === 'string' ? body.correlationId : headerCorrelationId ?? 'no-disponible'
    this.retryAfter = retryAfter
    this.fieldErrors = body.errors && typeof body.errors === 'object' ? (body.errors as Record<string, string[]>) : null
  }
}

async function toError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  return new CoreApiError(response.status, body, response.headers.get('Retry-After'), response.headers.get('X-Correlation-Id'))
}

// --- Fin de sesión (refresh rechazado, 401 tras reintento, 403 Auth.AdminRequired) ----------
let endedError: CoreApiError | null = null
const listeners = new Set<() => void>()
export const sessionEndedStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  get: () => endedError,
  clear() { endedError = null; listeners.forEach((l) => l()) },
}

function clearAllData() {
  // Borra todo el caché de SWR (datos del usuario anterior), incluida la sesión.
  return globalMutate(() => true, undefined, { revalidate: false })
}

function sessionEnded(error: CoreApiError) {
  endedError = error
  listeners.forEach((l) => l())
  void clearAllData()
}

// --- Auth --------------------------------------------------------------------------------------
export async function fetchSession(): Promise<CoreSession | null> {
  const response = await fetch('/api/auth/session', { cache: 'no-store' })
  if (response.status === 401) return null
  if (!response.ok) throw await toError(response)
  return ((await response.json()) as { session: CoreSession }).session
}

export async function login(email: string, password: string): Promise<CoreSession> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  })
  if (!response.ok) throw await toError(response)
  await clearAllData()
  sessionEndedStore.clear()
  return ((await response.json()) as { session: CoreSession }).session
}

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' }).catch(() => undefined)
  await clearAllData()
}

// --- Llamadas a la API vía BFF -------------------------------------------------------------------
export async function coreFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`/api/core/${path.replace(/^\/+/, '')}`, { ...init, cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) {
    const error = await toError(response)
    if (response.headers.get('X-Session-Ended')) sessionEnded(error)
    throw error
  }
  return response
}

export async function coreJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await coreFetch(path, init)
  if (response.status === 204) return undefined as T
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const fetcher = <T,>(key: string) => coreJson<T>(key)

export function jsonBody(value: unknown): RequestInit {
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }
}

export const seg = encodeURIComponent
