import { NextRequest, NextResponse } from 'next/server'
import { endUserIp, newCorrelationId, requireConfig, resolveAccess, sessionPayload, setTokenCookies } from '@/lib/server/core-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Quién está logueado. No hay `/me` para el admin: se decodifican los claims del access token. */
export async function GET(request: NextRequest) {
  const correlationId = newCorrelationId()
  const configured = requireConfig(correlationId)
  if ('response' in configured) return configured.response

  const access = await resolveAccess(request, configured.config, { ip: endUserIp(request), correlationId })
  if (!access.ok) return access.response

  const response = NextResponse.json({ session: sessionPayload(access.accessToken, configured.config) })
  response.headers.set('Cache-Control', 'no-store')
  if (access.rotated) setTokenCookies(response, access.rotated)
  return response
}
