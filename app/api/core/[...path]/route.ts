import { NextRequest, NextResponse } from 'next/server'
import {
  bffError, coreLogout, endSession, endUserIp, isSameOrigin, newCorrelationId, normalizeProblem,
  refreshEndsSession, refreshTokens, requireConfig, resolveAccess, setTokenCookies, problemResponse,
} from '@/lib/server/core-auth'
import type { CoreTokenResponse } from '@/lib/core-api/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Proxy del BFF hacia Href.Core. El navegador llama a /api/core/<ruta de la API>; el BFF agrega
 * el Bearer guardado en la cookie HttpOnly, renueva el token si hace falta y reintenta UNA vez
 * ante un 401. Solo se permiten las rutas de admin que usa el panel (guía, sección 6): las rutas
 * M2M de las apps satélite (/api/auth/*, /api/notifications, /api/apps/me) quedan afuera.
 */
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
const SEG = '[^/]+'
const RULES: Array<{ pattern: RegExp; methods: Method[]; bearer: boolean }> = [
  { pattern: /^health$/, methods: ['GET'], bearer: false },
  { pattern: /^\.well-known\/jwks\.json$/, methods: ['GET'], bearer: false },
  { pattern: /^api\/apps$/, methods: ['GET', 'POST'], bearer: true },
  { pattern: /^api\/apps\/(?!me$)[^/]+$/, methods: ['GET', 'PUT'], bearer: true },
  { pattern: new RegExp(`^api/apps/${SEG}/status$`), methods: ['PATCH'], bearer: true },
  { pattern: new RegExp(`^api/apps/${SEG}/secret/rotate$`), methods: ['POST'], bearer: true },
  { pattern: new RegExp(`^api/apps/${SEG}/permissions$`), methods: ['GET', 'POST'], bearer: true },
  { pattern: new RegExp(`^api/apps/${SEG}/permissions/${SEG}$`), methods: ['GET', 'PUT', 'DELETE'], bearer: true },
  { pattern: new RegExp(`^api/apps/${SEG}/roles$`), methods: ['GET', 'POST'], bearer: true },
  { pattern: new RegExp(`^api/apps/${SEG}/roles/${SEG}$`), methods: ['GET', 'PUT', 'DELETE'], bearer: true },
  { pattern: new RegExp(`^api/apps/${SEG}/roles/${SEG}/permissions$`), methods: ['PUT'], bearer: true },
  { pattern: new RegExp(`^api/apps/${SEG}/users$`), methods: ['GET'], bearer: true },
  { pattern: new RegExp(`^api/apps/${SEG}/users/${SEG}$`), methods: ['DELETE'], bearer: true },
  { pattern: new RegExp(`^api/apps/${SEG}/users/${SEG}/roles$`), methods: ['PUT'], bearer: true },
  { pattern: /^api\/users$/, methods: ['GET', 'POST'], bearer: true },
  { pattern: new RegExp(`^api/users/${SEG}$`), methods: ['GET', 'PUT'], bearer: true },
  { pattern: new RegExp(`^api/users/${SEG}/(lock|unlock)$`), methods: ['POST'], bearer: true },
  { pattern: new RegExp(`^api/users/${SEG}/sessions$`), methods: ['GET', 'DELETE'], bearer: true },
  { pattern: /^api\/notifications\/templates$/, methods: ['GET', 'POST'], bearer: true },
  { pattern: new RegExp(`^api/notifications/templates/${SEG}$`), methods: ['GET', 'PUT', 'DELETE'], bearer: true },
  { pattern: new RegExp(`^api/notifications/templates/${SEG}/preview$`), methods: ['POST'], bearer: true },
  { pattern: /^api\/audit-logs(\/export)?$/, methods: ['GET'], bearer: true },
]
const MAX_BODY_BYTES = 8 * 1024 * 1024 // límite de la API para plantillas (413 Request.TooLarge)
const PASS_HEADERS = ['content-type', 'content-disposition', 'retry-after', 'x-correlation-id']

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const correlationId = newCorrelationId()
  if (!isSameOrigin(request)) return bffError(403, 'Bff.InvalidOrigin', correlationId)
  const configured = requireConfig(correlationId)
  if ('response' in configured) return configured.response
  const { config } = configured

  const { path } = await context.params
  if (!path?.length || path.some((s) => !s || s === '.' || s === '..' || s.includes('/') || s.includes('\\'))) {
    return bffError(400, 'Bff.InvalidPath', correlationId)
  }
  const joined = path.join('/')
  const rule = RULES.find((r) => r.pattern.test(joined))
  if (!rule) return bffError(404, 'Bff.PathNotAllowed', correlationId)
  if (!rule.methods.includes(request.method as Method)) return bffError(405, 'Bff.MethodNotAllowed', correlationId)

  const ctx = { ip: endUserIp(request), correlationId }
  const access = await resolveAccess(request, config, ctx)
  if (!access.ok) return access.response
  let rotated: CoreTokenResponse | null = access.rotated
  let refreshToken = access.refreshToken

  let body: ArrayBuffer | undefined
  if (request.method !== 'GET' && request.method !== 'DELETE') {
    body = await request.arrayBuffer()
    if (body.byteLength > MAX_BODY_BYTES) return bffError(413, 'Request.TooLarge', correlationId)
  }

  const target = `${config.baseUrl}/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`
  const send = (accessToken: string) => {
    const headers = new Headers({ Accept: request.headers.get('accept') ?? 'application/json', 'X-Correlation-Id': correlationId })
    if (rule.bearer) headers.set('Authorization', `Bearer ${accessToken}`)
    const contentType = request.headers.get('content-type')
    if (body && contentType) headers.set('Content-Type', contentType)
    return fetch(target, { method: request.method, headers, body, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(60_000) })
  }

  let upstream: Response
  try {
    upstream = await send(access.accessToken)
    // 401 (Auth.InvalidToken): refresh y reintentar UNA vez. Si ya se renovó en esta request, al login.
    if (upstream.status === 401 && rule.bearer) {
      const problem = normalizeProblem(401, await upstream.json().catch(() => null), upstream.headers.get('X-Correlation-Id'))
      if (rotated || !refreshToken) return endSession(problem)
      const outcome = await refreshTokens(config, ctx, refreshToken)
      if (!outcome.ok) return refreshEndsSession(outcome.problem) ? endSession(outcome.problem) : problemResponse(outcome.problem)
      rotated = outcome.tokens
      refreshToken = outcome.tokens.refreshToken
      upstream = await send(outcome.tokens.accessToken)
      if (upstream.status === 401) return endSession(normalizeProblem(401, await upstream.json().catch(() => null), upstream.headers.get('X-Correlation-Id')))
    }
  } catch {
    return bffError(502, 'Bff.CoreUnavailable', correlationId)
  }

  // 403 Auth.AdminRequired: el usuario no es admin → "Sin permisos" y cerrar la sesión.
  if (upstream.status === 403) {
    const problem = normalizeProblem(403, await upstream.json().catch(() => null), upstream.headers.get('X-Correlation-Id'))
    if (problem.errorCode === 'Auth.AdminRequired') {
      if (refreshToken) await coreLogout(config, ctx, refreshToken)
      return endSession(problem)
    }
    return withCookies(problemResponse(problem), rotated)
  }

  const headers = new Headers({ 'Cache-Control': 'no-store' })
  for (const name of PASS_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }
  const response = new NextResponse(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers })
  return withCookies(response, rotated)
}

function withCookies(response: NextResponse, rotated: CoreTokenResponse | null) {
  // Siempre guardar el refresh token nuevo y descartar el viejo.
  if (rotated) setTokenCookies(response, rotated)
  return response
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
