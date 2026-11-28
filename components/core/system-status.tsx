'use client'

import useSWR from 'swr'
import { coreJson, CoreApiError } from '@/lib/core-client'
import type { CoreHealth } from '@/lib/core-api/types'

// GET /health responde 503 con { status: "Unhealthy", database: "Unhealthy" } si la base no contesta.
async function fetchHealth(): Promise<CoreHealth> {
  try {
    return await coreJson<CoreHealth>('health')
  } catch (error) {
    if (error instanceof CoreApiError && error.status === 503 && error.errorCode === 'Http.503') return { status: 'Unhealthy', database: 'Unhealthy' }
    throw error
  }
}

// Se consulta al cargar el panel y después cada 30 minutos (no al volver a la pestaña).
const HEALTH_REFRESH_MS = 30 * 60_000
const healthOptions = { refreshInterval: HEALTH_REFRESH_MS, revalidateOnFocus: false, shouldRetryOnError: false }

/** Estado de HREF Core en el panel lateral, arriba de la cuenta. */
export function SystemStatus() {
  const { data, error } = useSWR<CoreHealth>('health', fetchHealth, healthOptions)
  const tone = error ? 'unknown' : !data ? 'loading' : data.status === 'Healthy' && data.database === 'Healthy' ? 'ok' : 'down'
  const title = tone === 'ok' ? 'Sistema operativo' : tone === 'down' ? 'Sistema con fallas' : tone === 'loading' ? 'Verificando estado…' : 'Estado desconocido'
  const detail = data ? `Base de datos: ${data.database === 'Healthy' ? 'OK' : 'caída'}` : error ? 'No se pudo consultar /health' : 'Consultando /health'
  const hint = error instanceof CoreApiError ? `${detail} · ${error.errorCode} · ${error.correlationId}` : detail
  return <div className={`core-system-status is-${tone}`} role="status" title={`${title}. ${hint}`}>
    <span className="core-system-dot" aria-hidden="true" />
    <div className="core-system-copy"><strong>{title}</strong><small>{detail}</small></div>
  </div>
}
