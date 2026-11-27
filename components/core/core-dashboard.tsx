'use client'

import { ReactNode, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Tooltip } from '@base-ui/react/tooltip'
import { Activity, AppWindow, ChevronRight, LogOut, Mail, Shield, ShieldCheck, Users } from 'lucide-react'
import useSWR, { SWRConfig } from 'swr'
import { CoreSession, SESSION_KEY, fetchSession, logout as bffLogout, sessionEndedStore } from '@/lib/core-client'
import { LoginForm } from './login-form'
import { ConfirmProvider, LoadingState } from './shared'
import { useToast } from './toast'
import { ROUTES } from './url-state'

type NavItem = { name: string; href: string; icon: typeof Activity }
const navigation: Array<{ label: string; items: NavItem[] }> = [
  { label: 'WORKSPACE', items: [{ name: 'Resumen general', href: ROUTES.overview, icon: Activity }, { name: 'Aplicaciones', href: ROUTES.apps, icon: AppWindow }] },
  { label: 'IDENTIDAD & ACCESOS', items: [{ name: 'Usuarios', href: ROUTES.users, icon: Users }, { name: 'Roles y permisos', href: ROUTES.roles, icon: ShieldCheck }] },
  { label: 'OPERACIONES', items: [{ name: 'Templates de email', href: ROUTES.templates, icon: Mail }, { name: 'Auditoría', href: ROUTES.audit, icon: Activity }, { name: 'Seguridad', href: ROUTES.security, icon: Shield }] },
]
const allItems = navigation.flatMap((group) => group.items)
const activeItem = (pathname: string) => allItems.find((item) => item.href === pathname) ?? allItems.find((item) => item.href !== '/' && pathname.startsWith(`${item.href}/`))

// Caché de SWR del panel: las listas que comparten varias secciones (por ejemplo, `api/apps`)
// no se vuelven a pedir al cambiar de sección si se pidieron hace menos de 10 s.
const swrOptions = { dedupingInterval: 10_000, focusThrottleInterval: 30_000 }

export default function CoreDashboard({ children }: { children: ReactNode }) {
  const { data: session, error: sessionError, isLoading, mutate: setSession } = useSWR<CoreSession | null>(SESSION_KEY, fetchSession, { shouldRetryOnError: false, revalidateOnFocus: false })
  const endedError = useSyncExternalStore(sessionEndedStore.subscribe, sessionEndedStore.get, () => null)
  const pathname = usePathname()
  const current = activeItem(pathname)
  const [loggingOut, setLoggingOut] = useState(false)
  const toast = useToast()

  if (isLoading || loggingOut) return <main className="core-boot"><LoadingState label={loggingOut ? 'Cerrando sesión…' : 'Verificando sesión…'} /></main>
  if (!session) {
    return <LoginForm initialError={endedError ?? sessionError ?? null} onAuthenticated={(nextSession) => { void setSession(nextSession, { revalidate: false }) }} />
  }

  async function logout() {
    setLoggingOut(true)
    try { await bffLogout(); toast.info('Cerraste sesión.') } finally { setLoggingOut(false) }
  }

  return <SWRConfig value={swrOptions}><Tooltip.Provider><ConfirmProvider><div className="core-shell">
    <aside className="core-sidebar">
      <div className="core-brand"><span className="brand-mark"><span>H</span></span><div><strong>HREF <b>Core</b></strong><small>CONTROL PLANE</small></div><span className="core-version">ADMIN</span></div>
      <div className="core-workspace"><div className="core-workspace-icon">HC</div><div><strong>HREF Solutions</strong><small>Workspace principal</small></div><ChevronRight aria-hidden="true" /></div>
      <nav className="core-nav" aria-label="Navegación principal">{navigation.map((group) => <div className="core-nav-group" key={group.label}><p>{group.label}</p>{group.items.map(({ name, href, icon: Icon }) => <Link key={name} href={href} className={`core-nav-item${current?.href === href ? ' is-active' : ''}`} aria-label={name} title={name} aria-current={current?.href === href ? 'page' : undefined}><Icon aria-hidden="true" /><span>{name}</span></Link>)}</div>)}</nav>
      <div className="core-sidebar-bottom"><div className="core-account"><div className="core-avatar core-avatar-small">{(session.name || session.email).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div><div className="core-account-copy"><strong>{session.name || session.email}</strong><small>{session.email}</small></div><button className="core-icon-button" type="button" aria-label="Cerrar sesión" onClick={() => void logout()}><LogOut aria-hidden="true" /></button></div></div>
    </aside>
    <section className="core-main-column"><header className="core-topbar"><div className="core-breadcrumbs"><span>HREF Core</span><ChevronRight aria-hidden="true" /><strong>{current?.name ?? 'Panel'}</strong></div><div className="core-topbar-user"><span className="core-topbar-label">BACKOFFICE</span><span className="core-topbar-divider" /><span>{session.name || session.email}</span><button type="button" className="core-icon-button core-mobile-logout" aria-label="Cerrar sesión" onClick={() => void logout()}><LogOut aria-hidden="true" /></button></div></header>
      <main className="core-content">{children}</main>
    </section>
  </div></ConfirmProvider></Tooltip.Provider></SWRConfig>
}
