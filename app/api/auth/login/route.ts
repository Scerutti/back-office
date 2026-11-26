import { NextRequest, NextResponse } from 'next/server'
import { authContext, bffError, coreLogin, coreLogout, isSameOrigin, newCorrelationId, problemResponse, readRefreshCookie, requireConfig, sessionPayload, setTokenCookies } from '@/lib/server/core-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const correlationId = newCorrelationId()
  if (!isSameOrigin(request)) return bffError(403, 'Bff.InvalidOrigin', correlationId)
  const configured = requireConfig(correlationId)
  if ('response' in configured) return configured.response

  let body: { email?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return bffError(400, 'Bff.InvalidRequest', correlationId)
  }
  if (typeof body.email !== 'string' || typeof body.password !== 'string' || !body.email.trim() || !body.password || body.email.length > 320 || body.password.length > 128) {
    return bffError(400, 'Bff.InvalidRequest', correlationId)
  }

  const ctx = authContext(request, correlationId)
  // Si el navegador ya tenía una sesión, se cierra en Core antes de abrir la nueva: si no, la familia
  // de refresh tokens anterior queda activa hasta que vence (30 días).
  const previousRefresh = readRefreshCookie(request)
  if (previousRefresh) await coreLogout(configured.config, ctx, previousRefresh)

  const outcome = await coreLogin(configured.config, ctx, body.email.trim(), body.password)
  if (!outcome.ok) return problemResponse(outcome.problem, outcome.retryAfter ? { 'Retry-After': outcome.retryAfter } : undefined)

  const response = NextResponse.json({ session: sessionPayload(outcome.tokens.accessToken, configured.config) })
  response.headers.set('Cache-Control', 'no-store')
  setTokenCookies(response, outcome.tokens)
  return response
}
