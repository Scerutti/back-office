'use client'

import { useState, useSyncExternalStore } from 'react'
import { Activity, AppWindow, ChevronRight, LogOut, Mail, Shield, ShieldCheck, Users } from 'lucide-react'
import useSWR from 'swr'
import { CoreSession, SESSION_KEY, fetchSession, logout as bffLogout, sessionEndedStore } from '@/lib/core-client'
import { LoginForm } from './login-form'
import { OverviewPage, AppsPage } from './overview-apps'
import { UsersPage } from './users-page'
import { AccessControlPage } from './access-control-page'
import { TemplatesPage } from './templates-page'
import { AuditPage } from './audit-page'
import { SecurityPage } from './security-page'
import { LoadingState } from './shared'

type View = 'Resumen general' | 'Aplicaciones' | 'Usuarios' | 'Roles y permisos' | 'Templates de email' | 'Auditoría' | 'Seguridad'
const navigation: Array<{ label: string; items: Array<{ name: View; icon: typeof Activity }> }> = [
  { label: 'WORKSPACE', items: [{ name: 'Resumen general', icon: Activity }, { name: 'Aplicaciones', icon: AppWindow }] },
  { label: 'IDENTIDAD & ACCESOS', items: [{ name: 'Usuarios', icon: Users }, { name: 'Roles y permisos', icon: ShieldCheck }] },
  { label: 'OPERACIONES', items: [{ name: 'Templates de email', icon: Mail }, { name: 'Auditoría', icon: Activity }, { name: 'Seguridad', icon: Shield }] },
]

export default function CoreDashboard() {
  const { data: session, error: sessionError, isLoading, mutate: setSession } = useSWR<CoreSession | null>(SESSION_KEY, fetchSession, { shouldRetryOnError: false, revalidateOnFocus: false })
  const endedError = useSyncExternalStore(sessionEndedStore.subscribe, sessionEndedStore.get, () => null)
  const [view, setView] = useState<View>('Resumen general')
  const [loggingOut, setLoggingOut] = useState(false)

  if (isLoading || loggingOut) return <main className="core-boot"><LoadingState label={loggingOut ? 'Cerrando sesión…' : 'Verificando sesión…'} /></main>
  if (!session) {
    return <LoginForm initialError={endedError ?? sessionError ?? null} onAuthenticated={(nextSession) => { void setSession(nextSession, { revalidate: false }) }} />
  }

  async function logout() {
    setLoggingOut(true)
    try { await bffLogout() } finally { setLoggingOut(false) }
  }

  return <div className="core-shell">
    <aside className="core-sidebar">
      <div className="core-brand"><span className="brand-mark"><span>H</span></span><div><strong>HREF <b>Core</b></strong><small>CONTROL PLANE</small></div><span className="core-version">ADMIN</span></div>
      <div className="core-workspace"><div className="core-workspace-icon">HC</div><div><strong>HREF Solutions</strong><small>Workspace principal</small></div><ChevronRight aria-hidden="true" /></div>
      <nav className="core-nav" aria-label="Navegación principal">{navigation.map((group) => <div className="core-nav-group" key={group.label}><p>{group.label}</p>{group.items.map(({ name, icon: Icon }) => <button key={name} type="button" className={`core-nav-item${view === name ? ' is-active' : ''}`} aria-label={name} title={name} aria-current={view === name ? 'page' : undefined} onClick={() => setView(name)}><Icon aria-hidden="true" /><span>{name}</span></button>)}</div>)}</nav>
      <div className="core-sidebar-bottom"><div className="core-account"><div className="core-avatar core-avatar-small">{(session.name || session.email).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div><div className="core-account-copy"><strong>{session.name || session.email}</strong><small>{session.email}</small></div><button className="core-icon-button" type="button" aria-label="Cerrar sesión" onClick={() => void logout()}><LogOut aria-hidden="true" /></button></div></div>
    </aside>
    <section className="core-main-column"><header className="core-topbar"><div className="core-breadcrumbs"><span>HREF Core</span><ChevronRight aria-hidden="true" /><strong>{view}</strong></div><div className="core-topbar-user"><span className="core-topbar-label">BACKOFFICE</span><span className="core-topbar-divider" /><span>{session.name || session.email}</span><button type="button" className="core-icon-button core-mobile-logout" aria-label="Cerrar sesión" onClick={() => void logout()}><LogOut aria-hidden="true" /></button></div></header>
      <main className="core-content">{view === 'Resumen general' && <OverviewPage />}{view === 'Aplicaciones' && <AppsPage />}{view === 'Usuarios' && <UsersPage />}{view === 'Roles y permisos' && <AccessControlPage />}{view === 'Templates de email' && <TemplatesPage />}{view === 'Auditoría' && <AuditPage />}{view === 'Seguridad' && <SecurityPage jwksUrl={session.jwksUrl} />}</main>
    </section>
  </div>
}
