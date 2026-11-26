import { NextRequest, NextResponse } from 'next/server'
import { authContext, bffError, clearTokenCookies, coreLogout, isSameOrigin, newCorrelationId, readRefreshCookie } from '@/lib/server/core-auth'
import { coreConfig } from '@/lib/server/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const correlationId = newCorrelationId()
  if (!isSameOrigin(request)) return bffError(403, 'Bff.InvalidOrigin', correlationId)
  const config = coreConfig()
  const refreshToken = readRefreshCookie(request)
  if (config && refreshToken) await coreLogout(config, authContext(request, correlationId), refreshToken)
  // La API siempre responde 204; la sesión del BFF se borra en cualquier caso.
  const response = new NextResponse(null, { status: 204 })
  clearTokenCookies(response)
  return response
}
