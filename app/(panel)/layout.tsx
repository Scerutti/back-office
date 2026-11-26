import { Suspense } from 'react'
import CoreDashboard from '@/components/core/core-dashboard'
import { LoadingState } from '@/components/core/shared'

// Shell del panel: sesión, navegación y providers. Cada sección es una ruta propia, así funcionan
// el refresh, atrás/adelante y los links directos. Las secciones leen filtros y detalles abiertos
// de la query string (useSearchParams), por eso van dentro de un Suspense.
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <CoreDashboard><Suspense fallback={<LoadingState />}>{children}</Suspense></CoreDashboard>
}
