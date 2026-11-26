import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import { NextRequest, NextResponse } from 'next/server'
import createClient from 'openapi-fetch'
import type { paths } from '@/lib/core-api/schema'
import type { CoreTokenResponse } from '@/lib/core-api/types'
import { coreConfig, type CoreConfig } from './config'

// ---------------------------------------------------------------------------
// Cookies de sesión del BFF. Los tokens de Href.Core viven solo en cookies HttpOnly,
// limitadas a /api (las rutas del BFF). El JS del navegador nunca los ve.
// ---------------------------------------------------------------------------
const ACCESS_COOKIE = 'hc_access'
const REFRESH_COOKIE = 'hc_refresh'
const COOKIE_PATH = '/api'
const MAX_TOKEN_LENGTH = 16_384
/** Renovar el access token cuando falten menos de 60 s (guía, sección 3.3). */
const REFRESH_MARGIN_MS = 60_000
/** Header que le avisa al navegador que la sesión terminó y tiene que volver al login. */
export const SESSION_ENDED_HEADER = 'X-Session-Ended'

const cookieBase = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: COOKIE_PATH,
})

export function setTokenCookies(response: NextResponse, tokens: CoreTokenResponse) {
  const expiresIn = Number(tokens.expiresIn)
  const refreshMaxAge = Math.floor((Date.parse(tokens.refreshTokenExpiresAtUtc) - Date.now()) / 1000)
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, { ...cookieBase(), maxAge: Math.max(1, expiresIn) })
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, { ...cookieBase(), maxAge: Math.max(1, refreshMaxAge) })
}

export function clearTokenCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, '', { ...cookieBase(), maxAge: 0 })
  response.cookies.set(REFRESH_COOKIE, '', { ...cookieBase(), maxAge: 0 })
}

function cookieToken(request: NextRequest, name: string) {
  const value = request.cookies.get(name)?.value
  return value && value.length <= MAX_TOKEN_LENGTH ? value : null
}
export const readAccessCookie = (request: NextRequest) => cookieToken(request, ACCESS_COOKIE)
export const readRefreshCookie = (request: NextRequest) => cookieToken(request, REFRESH_COOKIE)

// ---------------------------------------------------------------------------
// Utilidades de request
// ---------------------------------------------------------------------------

/** Protección CSRF: las rutas del BFF solo aceptan requests del mismo origen. */
export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin) return origin === request.nextUrl.origin
  if (request.method === 'GET' || request.method === 'HEAD') return true
  return request.headers.get('sec-fetch-site') === 'same-origin'
}

/**
 * IP del usuario del navegador para `X-End-User-Ip`. Se toma `X-Real-IP` (lo pone la plataforma
 * de hosting) o la última entrada de `X-Forwarded-For` (la agrega el proxy más cercano; las
 * primeras las puede inventar el cliente). Tiene que ser una sola IP válida: si no, no se manda.
 */
export function endUserIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',').reverse() ?? []
  for (const candidate of [request.headers.get('x-real-ip'), ...forwarded]) {
    const value = candidate?.trim()
    if (value && isIP(value)) return value
  }
  return null
}

export const newCorrelationId = (): string => randomUUID()

/**
 * User-Agent del navegador. Core lo guarda en la sesión (familia de refresh tokens): si el BFF no lo
 * reenvía, todas las sesiones del panel figuran como `node`. Se recorta para no reenviar valores enormes.
 */
export function endUserAgent(request: NextRequest): string | null {
  const value = request.headers.get('user-agent')?.trim()
  return value ? value.slice(0, 512) : null
}

/** Contexto de las llamadas M2M a /api/auth/*: IP y User-Agent del navegador, y correlation id. */
export function authContext(request: NextRequest, correlationId: string): AuthContext {
  return { ip: endUserIp(request), userAgent: endUserAgent(request), correlationId }
}

type JwtClaims = { exp?: number; name?: unknown; email?: unknown; sub?: unknown }

/** Solo decodifica el payload para mostrar nombre/email; la autorización la decide la API. */
export function decodeClaims(token: string): JwtClaims | null {
  try {
    const payload = token.split('.')[1]
    return payload ? (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as JwtClaims) : null
  } catch {
    return null
  }
}

const tokenExpiresAt = (token: string) => {
  const exp = decodeClaims(token)?.exp
  return typeof exp === 'number' ? exp * 1000 : 0
}

export function sessionPayload(accessToken: string, config: CoreConfig) {
  const claims = decodeClaims(accessToken) ?? {}
  return {
    userId: typeof claims.sub === 'string' ? claims.sub : '',
    name: typeof claims.name === 'string' ? claims.name : '',
    email: typeof claims.email === 'string' ? claims.email : '',
    expiresAt: tokenExpiresAt(accessToken),
    jwksUrl: `${config.baseUrl}/.well-known/jwks.json`,
  }
}

// ---------------------------------------------------------------------------
// Errores: el navegador siempre recibe { errorCode, correlationId, ... } (forma ProblemDetails).
// ---------------------------------------------------------------------------
export type Problem = { status: number; errorCode?: string; correlationId?: string; title?: string; detail?: string; errors?: Record<string, string[]> }

export function normalizeProblem(status: number, body: unknown, correlationId?: string | null): Problem {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  return {
    status,
    errorCode: typeof source.errorCode === 'string' ? source.errorCode : undefined,
    correlationId: typeof source.correlationId === 'string' ? source.correlationId : correlationId ?? undefined,
    title: typeof source.title === 'string' ? source.title : undefined,
    detail: typeof source.detail === 'string' ? source.detail : undefined,
    errors: source.errors && typeof source.errors === 'object' ? (source.errors as Record<string, string[]>) : undefined,
  }
}

export function problemResponse(problem: Problem, headers?: HeadersInit) {
  const response = NextResponse.json(problem, { status: problem.status, headers })
  response.headers.set('Content-Type', 'application/problem+json')
  if (problem.correlationId) response.headers.set('X-Correlation-Id', problem.correlationId)
  return response
}

/** Error generado por el propio BFF (no por la API). Códigos con prefijo `Bff.`. */
export const bffError = (status: number, errorCode: string, correlationId: string = newCorrelationId()) =>
  problemResponse({ status, errorCode, correlationId })

/** Termina la sesión del BFF: borra cookies y avisa al navegador para que muestre el login. */
export function endSession(problem: Problem) {
  const response = problemResponse(problem)
  response.headers.set(SESSION_ENDED_HEADER, '1')
  clearTokenCookies(response)
  return response
}

// ---------------------------------------------------------------------------
// Llamadas M2M a /api/auth/* (login, refresh, logout) con el cliente tipado del contrato.
// Siempre con X-App-Key, X-App-Secret y X-End-User-Ip.
// ---------------------------------------------------------------------------
export type AuthContext = { ip: string | null; userAgent: string | null; correlationId: string }

function authClient(config: CoreConfig, ctx: AuthContext) {
  const headers: Record<string, string> = {
    'X-App-Key': config.appKey,
    'X-App-Secret': config.appSecret,
    'X-Correlation-Id': ctx.correlationId,
  }
  if (ctx.ip) headers['X-End-User-Ip'] = ctx.ip
  if (ctx.userAgent) headers['User-Agent'] = ctx.userAgent
  return createClient<paths>({ baseUrl: config.baseUrl, headers, cache: 'no-store' })
}

export type AuthOutcome =
  | { ok: true; tokens: CoreTokenResponse }
  | { ok: false; problem: Problem; retryAfter?: string | null }

async function readOutcome(result: { data?: CoreTokenResponse; error?: unknown; response: Response }): Promise<AuthOutcome> {
  const correlationId = result.response.headers.get('X-Correlation-Id')
  if (!result.response.ok) {
    return { ok: false, problem: normalizeProblem(result.response.status, result.error, correlationId), retryAfter: result.response.headers.get('Retry-After') }
  }
  const tokens = result.data
  if (!tokens || typeof tokens.accessToken !== 'string' || typeof tokens.refreshToken !== 'string' || !Number.isFinite(Date.parse(tokens.refreshTokenExpiresAtUtc))) {
    return { ok: false, problem: { status: 502, errorCode: 'Bff.InvalidUpstreamResponse', correlationId: correlationId ?? undefined } }
  }
  return { ok: true, tokens }
}

const unavailable = (correlationId: string): AuthOutcome => ({ ok: false, problem: { status: 502, errorCode: 'Bff.CoreUnavailable', correlationId } })

export async function coreLogin(config: CoreConfig, ctx: AuthContext, email: string, password: string): Promise<AuthOutcome> {
  try {
    const result = await authClient(config, ctx).POST('/api/auth/login', { body: { email, password }, signal: AbortSignal.timeout(20_000) })
    return readOutcome(result)
  } catch {
    return unavailable(ctx.correlationId)
  }
}

export async function coreLogout(config: CoreConfig, ctx: AuthContext, refreshToken: string) {
  try {
    await authClient(config, ctx).POST('/api/auth/logout', { body: { refreshToken }, signal: AbortSignal.timeout(10_000) })
  } catch {
    // La sesión local se borra igual aunque la API no responda.
  }
}

/**
 * Acepta una invitación a `core`: Core fija la contraseña y verifica el email. Es una ruta M2M
 * (/api/auth/*), así que va con las credenciales de la app `core`, no por el proxy de admin.
 */
export async function coreAcceptInvitation(config: CoreConfig, ctx: AuthContext, token: string, password: string): Promise<{ ok: true } | { ok: false; problem: Problem; retryAfter?: string | null }> {
  try {
    const result = await authClient(config, ctx).POST('/api/auth/accept-invitation', { body: { token, password }, signal: AbortSignal.timeout(20_000) })
    if (result.response.ok) return { ok: true }
    return { ok: false, problem: normalizeProblem(result.response.status, result.error, result.response.headers.get('X-Correlation-Id')), retryAfter: result.response.headers.get('Retry-After') }
  } catch {
    return { ok: false, problem: { status: 502, errorCode: 'Bff.CoreUnavailable', correlationId: ctx.correlationId } }
  }
}

// ---------------------------------------------------------------------------
// Refresh serializado por sesión.
// Cada refresh token se puede usar UNA sola vez: si dos requests en paralelo lo usan, la API
// revoca toda la sesión (Auth.RefreshTokenReused). Por eso todas las requests que traen el mismo
// refresh token comparten una única promesa, y el resultado se recuerda unos minutos para las
// requests que llegan tarde con la cookie vieja (reciben el par nuevo en vez de reusar el viejo).
// Nota: el mapa vive en memoria del proceso. Con varias instancias del BFF hace falta sticky
// sessions o mover este mapa a un store compartido (Redis).
// ---------------------------------------------------------------------------
type RefreshEntry = { promise: Promise<AuthOutcome>; expiresAt: number }
const runtime = globalThis as typeof globalThis & { __coreRefreshes?: Map<string, RefreshEntry> }
const refreshes = (runtime.__coreRefreshes ??= new Map())
const REMEMBER_SUCCESS_MS = 5 * 60_000
const REMEMBER_FAILURE_MS = 30_000

export function refreshTokens(config: CoreConfig, ctx: AuthContext, refreshToken: string): Promise<AuthOutcome> {
  const now = Date.now()
  for (const [key, entry] of refreshes) if (entry.expiresAt <= now) refreshes.delete(key)

  const key = createHash('sha256').update(refreshToken).digest('hex')
  const existing = refreshes.get(key)
  if (existing) return existing.promise

  const entry: RefreshEntry = { promise: Promise.resolve(null as never), expiresAt: Number.POSITIVE_INFINITY }
  entry.promise = (async (): Promise<AuthOutcome> => {
    try {
      const result = await authClient(config, ctx).POST('/api/auth/refresh', { body: { refreshToken }, signal: AbortSignal.timeout(20_000) })
      return await readOutcome(result)
    } catch {
      return unavailable(ctx.correlationId)
    }
  })()
  refreshes.set(key, entry)
  void entry.promise.then((outcome) => {
    // Un fallo transitorio (red, 5xx, 429) no se recuerda: se puede reintentar con el mismo token.
    const definitive = outcome.ok || outcome.problem.status === 401 || outcome.problem.status === 403
    if (!definitive) refreshes.delete(key)
    else entry.expiresAt = Date.now() + (outcome.ok ? REMEMBER_SUCCESS_MS : REMEMBER_FAILURE_MS)
  })
  return entry.promise
}

/** 401/403 del refresh → mandar al login (guía 3.4). El resto (429, 5xx) no cierra la sesión. */
export const refreshEndsSession = (problem: Problem) => problem.status === 401 || problem.status === 403

export type AccessResult =
  | { ok: true; accessToken: string; refreshToken: string | null; rotated: CoreTokenResponse | null }
  | { ok: false; response: NextResponse }

/**
 * Devuelve un access token usable para esta request. Si falta o vence en menos de 60 s,
 * hace refresh (serializado) y devuelve el par nuevo en `rotated` para guardarlo en cookies.
 */
export async function resolveAccess(request: NextRequest, config: CoreConfig, ctx: AuthContext): Promise<AccessResult> {
  const accessToken = readAccessCookie(request)
  const refreshToken = readRefreshCookie(request)
  const expiresAt = accessToken ? tokenExpiresAt(accessToken) : 0

  if (accessToken && expiresAt > Date.now() + REFRESH_MARGIN_MS) return { ok: true, accessToken, refreshToken, rotated: null }
  if (!refreshToken) {
    if (accessToken && expiresAt > Date.now()) return { ok: true, accessToken, refreshToken, rotated: null }
    return { ok: false, response: endSession({ status: 401, errorCode: 'Bff.SessionRequired', correlationId: ctx.correlationId }) }
  }

  const outcome = await refreshTokens(config, ctx, refreshToken)
  if (outcome.ok) return { ok: true, accessToken: outcome.tokens.accessToken, refreshToken: outcome.tokens.refreshToken, rotated: outcome.tokens }
  if (refreshEndsSession(outcome.problem)) return { ok: false, response: endSession(outcome.problem) }
  // Fallo transitorio: si el access token todavía sirve, se sigue usando.
  if (accessToken && expiresAt > Date.now()) return { ok: true, accessToken, refreshToken, rotated: null }
  return { ok: false, response: problemResponse(outcome.problem, outcome.retryAfter ? { 'Retry-After': outcome.retryAfter } : undefined) }
}

export function requireConfig(correlationId: string): { config: CoreConfig } | { response: NextResponse } {
  const config = coreConfig()
  return config ? { config } : { response: bffError(503, 'Bff.NotConfigured', correlationId) }
}
