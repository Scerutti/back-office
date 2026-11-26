import { NextRequest } from 'next/server'
import { authContext, bffError, coreAcceptInvitation, isSameOrigin, newCorrelationId, problemResponse, requireConfig } from '@/lib/server/core-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Página pública /aceptar-invitacion: el admin invitado a `core` elige su contraseña. No requiere
 * sesión. El proxy /api/core bloquea /api/auth/*, por eso esta ruta propia con credenciales M2M.
 */
export async function POST(request: NextRequest) {
  const correlationId = newCorrelationId()
  if (!isSameOrigin(request)) return bffError(403, 'Bff.InvalidOrigin', correlationId)
  const configured = requireConfig(correlationId)
  if ('response' in configured) return configured.response

  let body: { token?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return bffError(400, 'Bff.InvalidRequest', correlationId)
  }
  if (typeof body.token !== 'string' || typeof body.password !== 'string' || !body.token || body.token.length > 1024 || !body.password || body.password.length > 128) {
    return bffError(400, 'Bff.InvalidRequest', correlationId)
  }

  const outcome = await coreAcceptInvitation(configured.config, authContext(request, correlationId), body.token, body.password)
  if (!outcome.ok) return problemResponse(outcome.problem, outcome.retryAfter ? { 'Retry-After': outcome.retryAfter } : undefined)
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
