'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/** Rutas de cada sección del panel. */
export const ROUTES = {
  overview: '/',
  apps: '/aplicaciones',
  users: '/usuarios',
  roles: '/roles',
  templates: '/templates',
  audit: '/auditoria',
  security: '/seguridad',
} as const

/** Arma un href con query string, omitiendo los valores vacíos. */
export function hrefWith(path: string, params: Record<string, string | null | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value)
  const text = query.toString()
  return text ? `${path}?${text}` : path
}

/**
 * Estado de la sección en la URL. `push` agrega una entrada al historial (abrir un detalle,
 * cambiar de página); `replace` no (por ejemplo, mientras se tipea una búsqueda).
 */
export function useUrlParams() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const update = useCallback((changes: Record<string, string | null | undefined>, mode: 'push' | 'replace' = 'push') => {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    const text = next.toString()
    const href = text ? `${pathname}?${text}` : pathname
    if (mode === 'replace') router.replace(href, { scroll: false })
    else router.push(href, { scroll: false })
  }, [params, pathname, router])
  return [params, update] as const
}

/**
 * Link a Auditoría para un evento: filtra por su entidad (así se ve el historial completo de esa
 * entidad) y resalta el evento. Si el evento no tiene entidad, filtra por acción y actor.
 */
export function auditEventHref(event: { id: string; action: string; entityType: string | null; entityId: string | null; actorId: string | null }) {
  if (event.entityType && event.entityId) return hrefWith(ROUTES.audit, { entityType: event.entityType, entityId: event.entityId, evento: event.id })
  return hrefWith(ROUTES.audit, { action: event.action, actorId: event.actorId, evento: event.id })
}

/**
 * Auditoría de una aplicación: filtra por su id y no por appKey (si se borra una app y se crea otra
 * con el mismo key, el filtro por appKey mezcla el historial de las dos).
 */
export const appAuditHref = (applicationId: string) => hrefWith(ROUTES.audit, { applicationId })

/** Historial de un usuario en Auditoría: eventos con entityId = usuario o actorId = usuario. */
export const userHistoryHref = (userId: string) => hrefWith(ROUTES.audit, { usuario: userId })
