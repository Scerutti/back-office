import { Suspense } from 'react'
import type { Metadata } from 'next'
import { AcceptInvitation } from '@/components/core/accept-invitation'

export const metadata: Metadata = { title: 'Aceptar invitación · HREF Core' }

// Página pública (sin sesión): el admin invitado a `core` llega desde el email con ?token=… y
// elige su contraseña. Lee el token con useSearchParams, por eso va dentro de un Suspense.
export default function Page() {
  return <Suspense fallback={null}><AcceptInvitation /></Suspense>
}
