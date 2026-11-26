'use client'

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LockKeyhole, Plus, RefreshCw, ShieldCheck, UnlockKeyhole, X } from 'lucide-react'
import useSWR from 'swr'
import { coreJson, fetcher, jsonBody, seg } from '@/lib/core-client'
import { USER_STATUS, toNumber, type CoreApp, type CoreCreateUser, type CoreLockUser, type CoreReplaceUserRoles, type CoreRevokeSessions, type CoreRole, type CoreUpdateUser, type CoreUser, type CoreUserDetail, type CoreUserPage, type CoreUserSession } from '@/lib/core-api/types'
import { formatUtc } from './overview-apps'
import { EmptyState, ErrorNotice, Field, LoadingState, Modal, PageHeading, Panel, PrimaryButton, SecondaryButton, StatusBadge } from './shared'

const PAGE_SIZE = 20

type UserDetail = CoreUserDetail

export function UsersPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'Active' | 'Locked' | ''>('')
  const [page, setPage] = useState(1)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [errorAction, setErrorAction] = useState<unknown>(null)
  const debouncedSearch = useDebouncedValue(search, 250)
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
  if (debouncedSearch.trim()) query.set('search', debouncedSearch.trim())
  if (status) query.set('status', status)
  const key = `api/users?${query.toString()}`
  const { data, error, isLoading, mutate: refresh } = useSWR<CoreUserPage>(key, fetcher<CoreUserPage>)

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload: CoreCreateUser = { email: String(form.get('email')).trim(), fullName: String(form.get('fullName')).trim(), password: String(form.get('password')) }
    setErrorAction(null)
    try {
      await coreJson<CoreUser>('api/users', { method: 'POST', ...jsonBody(payload) })
      setCreating(false)
      await refresh()
    } catch (caught) { setErrorAction(caught) }
  }

  async function toggleLock(user: CoreUser) {
    // No hay borrado de usuarios en la API (DELETE da 405): se bloquean y desbloquean.
    const action = user.status === USER_STATUS.Locked ? 'unlock' : 'lock'
    if (action === 'lock' && !window.confirm(`Bloquear a ${user.fullName}? Se cerrarán todas sus sesiones activas.`)) return
    const reason = action === 'lock' ? window.prompt('Motivo del bloqueo (opcional):') : null
    if (action === 'lock' && reason === null) return
    setErrorAction(null)
    try {
      await coreJson<CoreUser>(`api/users/${seg(user.id)}/${action}`, action === 'lock' ? { method: 'POST', ...jsonBody({ reason: reason?.trim() || null } satisfies CoreLockUser) } : { method: 'POST' })
      await refresh()
    } catch (caught) { setErrorAction(caught) }
  }

  return <>
    <PageHeading eyebrow="IDENTIDAD · DIRECTORIO" title="Usuarios" description="Administrá identidades globales, estados y accesos a aplicaciones." action={<PrimaryButton onClick={() => { setErrorAction(null); setCreating(true) }}><Plus aria-hidden="true" /> Crear usuario</PrimaryButton>} />
    {error ? <ErrorNotice error={error} /> : null}{errorAction ? <ErrorNotice error={errorAction} onDismiss={() => setErrorAction(null)} /> : null}
    <div className="core-toolbar core-user-toolbar"><label className="core-search"><span className="sr-only">Buscar por email o nombre</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Buscar por nombre o email…" /></label><select className="core-select" value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1) }} aria-label="Filtrar por estado"><option value="">Todos los estados</option><option value={USER_STATUS.Active}>Activos</option><option value={USER_STATUS.Locked}>Bloqueados</option></select><span className="core-result-count">{data ? `${toNumber(data.totalCount).toLocaleString('es-AR')} usuarios` : '—'}</span><button type="button" className="core-icon-button" aria-label="Actualizar usuarios" onClick={() => void refresh()}><RefreshCw aria-hidden="true" /></button></div>
    <Panel className="core-table-panel">{isLoading ? <LoadingState /> : !data?.items.length ? <EmptyState title="No se encontraron usuarios" detail="Probá con otros filtros de búsqueda." /> : <div className="core-table-scroll"><table className="core-table"><thead><tr><th>USUARIO</th><th>EMAIL</th><th>ESTADO</th><th>EMAIL VERIFICADO</th><th>ÚLTIMO ACCESO</th><th>CREADO</th><th>ACCIONES</th></tr></thead><tbody>{data.items.map((user) => <tr key={user.id}><td><button type="button" className="core-link-button" onClick={() => setSelectedUserId(user.id)}>{user.fullName}</button></td><td>{user.email}</td><td><StatusBadge tone={user.status === USER_STATUS.Active ? 'success' : 'warning'}>{user.status}</StatusBadge></td><td>{user.emailVerifiedAtUtc ? <StatusBadge tone="success">Verificado</StatusBadge> : <StatusBadge tone="warning">No verificado</StatusBadge>}</td><td>{formatUtc(user.lastLoginAtUtc)}</td><td>{formatUtc(user.createdAtUtc)}</td><td><div className="core-action-group"><SecondaryButton onClick={() => setSelectedUserId(user.id)}>Detalle</SecondaryButton><SecondaryButton onClick={() => void toggleLock(user)}>{user.status === USER_STATUS.Locked ? <><UnlockKeyhole aria-hidden="true" /> Desbloquear</> : <><LockKeyhole aria-hidden="true" /> Bloquear</>}</SecondaryButton></div></td></tr>)}</tbody></table></div>}</Panel>
    {data && (() => { const pageSize = toNumber(data.pageSize); const total = toNumber(data.totalCount); return <div className="core-pagination"><span>Mostrando {data.items.length ? ((page - 1) * pageSize + 1).toLocaleString('es-AR') : 0}–{Math.min(page * pageSize, total).toLocaleString('es-AR')} de {total.toLocaleString('es-AR')}</span><div><SecondaryButton disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft aria-hidden="true" /> Anterior</SecondaryButton><span>Página {toNumber(data.page)}</span><SecondaryButton disabled={page * pageSize >= total} onClick={() => setPage((current) => current + 1)}>Siguiente <ChevronRight aria-hidden="true" /></SecondaryButton></div></div> })()}
    {creating && <Modal title="Crear usuario" onClose={() => setCreating(false)}>{errorAction ? <ErrorNotice error={errorAction} /> : null}<form className="core-form" onSubmit={createUser}><Field label="Email"><input type="email" name="email" className="core-input" autoComplete="email" required maxLength={320} /></Field><Field label="Nombre completo"><input name="fullName" className="core-input" required maxLength={200} /></Field><Field label="Contraseña inicial" hint="Entre 10 y 128 caracteres. La cuenta se crea con el email verificado."><input type="password" name="password" className="core-input" autoComplete="new-password" required minLength={10} maxLength={128} /></Field><div className="core-inline-note"><ShieldCheck aria-hidden="true" /> No se enviará una invitación por correo.</div><div className="core-form-actions"><SecondaryButton onClick={() => setCreating(false)}>Cancelar</SecondaryButton><PrimaryButton type="submit">Crear usuario</PrimaryButton></div></form></Modal>}
    {selectedUserId && <UserDrawer userId={selectedUserId} onClose={() => { setSelectedUserId(null); setErrorAction(null) }} onError={setErrorAction} />}
  </>
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timeout)
  }, [value, delay])
  return debounced
}

function UserDrawer({ userId, onClose, onError }: { userId: string; onClose: () => void; onError: (error: unknown) => void }) {
  const { data: user, error, isLoading, mutate: refreshUser } = useSWR<UserDetail>(`api/users/${seg(userId)}`, fetcher<UserDetail>)
  const { data: sessions, error: sessionsError, mutate: refreshSessions } = useSWR<CoreUserSession[]>(`api/users/${seg(userId)}/sessions`, fetcher<CoreUserSession[]>)
  const drawerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    drawerRef.current?.focus()
    return () => { if (previous instanceof HTMLElement) previous.focus() }
  }, [])
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')).trim()
    const fullName = String(form.get('fullName')).trim()
    if (email !== user.email && !window.confirm('Al cambiar el email se pierde la verificación actual. ¿Continuar?')) return
    setBusy(true); onError(null)
    try {
      await coreJson<CoreUser>(`api/users/${seg(user.id)}`, { method: 'PUT', ...jsonBody({ email, fullName } satisfies CoreUpdateUser) })
      await refreshUser(); setEditOpen(false); setNotice('Datos actualizados.')
    } catch (caught) { onError(caught) }
    finally { setBusy(false) }
  }

  async function revokeSessions(appKey?: string) {
    if (!window.confirm(appKey ? `Cerrar todas las sesiones de ${appKey}?` : 'Cerrar todas las sesiones activas de este usuario?')) return
    setBusy(true); onError(null)
    const query = appKey ? `?appKey=${seg(appKey)}` : ''
    try {
      const result = await coreJson<CoreRevokeSessions>(`api/users/${seg(userId)}/sessions${query}`, { method: 'DELETE' })
      await refreshSessions(); setNotice(`Sesiones revocadas: ${toNumber(result.revokedSessions)}.`)
    } catch (caught) { onError(caught) }
    finally { setBusy(false) }
  }

  function handleDrawerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key !== 'Tab' || editOpen || !drawerRef.current) return
    const focusable = drawerRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (document.activeElement === drawerRef.current) { event.preventDefault(); (event.shiftKey ? last : first)?.focus() }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  if (isLoading) return <div className="core-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><aside ref={drawerRef} tabIndex={-1} onKeyDown={handleDrawerKeyDown} className="core-drawer" role="dialog" aria-modal="true" aria-label="Cargando detalle de usuario"><button className="core-icon-button core-drawer-close" aria-label="Cerrar" onClick={onClose}><X /></button><LoadingState /></aside></div>
  if (error || !user) return <div className="core-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><aside ref={drawerRef} tabIndex={-1} onKeyDown={handleDrawerKeyDown} className="core-drawer" role="dialog" aria-modal="true" aria-label="Detalle de usuario"><button className="core-icon-button core-drawer-close" aria-label="Cerrar" onClick={onClose}><X /></button><ErrorNotice error={error ?? new Error('No se encontró el usuario.')} /></aside></div>

  return <div className="core-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><aside ref={drawerRef} tabIndex={-1} onKeyDown={handleDrawerKeyDown} className="core-drawer" role="dialog" aria-modal="true" aria-labelledby="user-detail-heading" onMouseDown={(event) => event.stopPropagation()}>
    <header className="core-drawer-head"><div><p className="core-eyebrow">DIRECTORIO DE IDENTIDAD</p><h2 id="user-detail-heading">Detalle de usuario</h2></div><button className="core-icon-button" aria-label="Cerrar detalle" onClick={onClose}><X aria-hidden="true" /></button></header>
    <div className="core-drawer-content"><div className="core-user-identity"><div className="core-avatar">{user.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div><div><strong>{user.fullName}</strong><span>{user.email}</span></div><StatusBadge tone={user.status === USER_STATUS.Active ? 'success' : 'warning'}>{user.status}</StatusBadge></div>
      {notice && <p className="core-success-note" role="status">{notice}</p>}
      <section className="core-detail-section"><div className="core-section-title"><h3>Datos personales</h3><SecondaryButton onClick={() => setEditOpen(true)}>Editar</SecondaryButton></div><p><span>Nombre completo</span><strong>{user.fullName}</strong></p><p><span>Email</span><strong>{user.email}</strong></p><p><span>Verificación</span><strong>{user.emailVerifiedAtUtc ? `Verificado · ${formatUtc(user.emailVerifiedAtUtc)}` : 'No verificado'}</strong></p><p><span>Creado</span><strong>{formatUtc(user.createdAtUtc)}</strong></p>{user.status === USER_STATUS.Locked && <p><span>Bloqueado</span><strong>{formatUtc(user.lockedAtUtc)}{user.lockReason ? ` · ${user.lockReason}` : ''}</strong></p>}</section>
      <section className="core-detail-section"><div className="core-section-title"><h3>Aplicaciones y roles</h3></div>{user.applications?.length ? user.applications.map((app) => <AccessEditor key={app.appKey} userId={user.id} app={app} onError={onError} onSaved={refreshUser} />) : <EmptyState title="Sin accesos asignados" detail="Este usuario todavía no tiene aplicaciones." />}<GrantAccess userId={user.id} assigned={user.applications.map((app) => app.appKey)} onError={onError} onSaved={refreshUser} /></section>
      <section className="core-detail-section"><div className="core-section-title"><div><h3>Sesiones activas</h3><p>{sessions?.length ?? 0} sesiones</p></div><SecondaryButton disabled={busy || !sessions?.length} onClick={() => void revokeSessions()}>Cerrar sesiones</SecondaryButton></div>{sessionsError && <ErrorNotice error={sessionsError} />}{sessions?.length ? sessions.map((session) => <div className="core-session-row" key={session.familyId}><div><strong>{session.appKey}</strong><small>{session.ipAddress || '—'} · {session.userAgent || '—'}</small><small>Inicio {formatUtc(session.startedAtUtc)} · Última renovación {formatUtc(session.lastRotatedAtUtc)} · Vence {formatUtc(session.expiresAtUtc)}</small></div><SecondaryButton disabled={busy} onClick={() => void revokeSessions(session.appKey)}>Cerrar</SecondaryButton></div>) : !sessionsError && <EmptyState title="No hay sesiones activas" detail="Las sesiones vigentes aparecerán aquí." />}</section>
    </div>
    {editOpen && <Modal title="Editar usuario" onClose={() => setEditOpen(false)}>{<form className="core-form" onSubmit={saveUser}><Field label="Nombre completo"><input className="core-input" name="fullName" defaultValue={user.fullName} required maxLength={200} /></Field><Field label="Email"><input className="core-input" type="email" name="email" defaultValue={user.email} required maxLength={320} /></Field><div className="core-inline-note">Si cambia el email, el usuario pierde la verificación actual.</div><div className="core-form-actions"><SecondaryButton onClick={() => setEditOpen(false)}>Cancelar</SecondaryButton><PrimaryButton type="submit" disabled={busy}>Guardar cambios</PrimaryButton></div></form>}</Modal>}
  </aside></div>
}

function AccessEditor({ userId, app, onError, onSaved }: { userId: string; app: UserDetail['applications'][number]; onError: (error: unknown) => void; onSaved: () => Promise<unknown> }) {
  const { data: roles, error } = useSWR<CoreRole[]>(`api/apps/${seg(app.appKey)}/roles`, fetcher<CoreRole[]>)
  // El detalle del usuario trae los NOMBRES de sus roles; el PUT pide ids. Se resuelven con la lista de roles.
  const currentRoleIds = useMemo(() => (app.roles ?? []).map((name) => roles?.find((item) => item.name === name)?.id ?? '').filter(Boolean), [app.roles, roles])
  const [selected, setSelected] = useState<string[]>([])
  const [savedKey, setSavedKey] = useState('')
  const [busy, setBusy] = useState(false)
  const currentKey = currentRoleIds.join('|')
  useEffect(() => {
    if (savedKey !== currentKey) setSelected(currentRoleIds)
  }, [currentKey, currentRoleIds, savedKey])

  async function saveRoles() {
    setBusy(true); onError(null)
    try {
      await coreJson(`api/apps/${seg(app.appKey)}/users/${seg(userId)}/roles`, { method: 'PUT', ...jsonBody({ roleIds: selected } satisfies CoreReplaceUserRoles) })
      setSavedKey(selected.join('|'))
      await onSaved()
    } catch (caught) { onError(caught) }
    finally { setBusy(false) }
  }

  async function removeAccess() {
    if (!window.confirm(`Quitar el acceso de ${app.name}?`)) return
    setBusy(true); onError(null)
    try {
      await coreJson(`api/apps/${seg(app.appKey)}/users/${seg(userId)}`, { method: 'DELETE' })
      await onSaved()
    } catch (caught) { onError(caught) }
    finally { setBusy(false) }
  }

  return <div className="core-access-card"><div className="core-access-title"><strong>{app.name}</strong><code>{app.appKey}</code></div>{error && <ErrorNotice error={error} />}{roles ? <div className="core-role-checkboxes">{roles.map((role) => { const id = role.id; return <label key={id}><input type="checkbox" checked={selected.includes(id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, id] : current.filter((value) => value !== id))} /><span>{role.name}{role.isDefault && <small>Predeterminado</small>}</span></label> })}</div> : !error && <LoadingState label="Cargando roles…" />}<div className="core-access-actions"><SecondaryButton disabled={busy} onClick={() => void removeAccess()}>Quitar acceso</SecondaryButton><PrimaryButton disabled={busy || !roles || selected.join('|') === currentKey} onClick={() => void saveRoles()}>Guardar roles</PrimaryButton></div></div>
}

// Dar acceso a una app que el usuario todavía no tiene: PUT .../users/{userId}/roles con roleIds vacío
// (la API lo permite); después los roles se eligen en la tarjeta de esa app.
function GrantAccess({ userId, assigned, onError, onSaved }: { userId: string; assigned: string[]; onError: (error: unknown) => void; onSaved: () => Promise<unknown> }) {
  const { data: apps } = useSWR<CoreApp[]>('api/apps', fetcher<CoreApp[]>)
  const [appKey, setAppKey] = useState('')
  const [busy, setBusy] = useState(false)
  const available = (apps ?? []).filter((app) => !assigned.includes(app.appKey))
  if (!available.length) return null

  async function grant() {
    if (!appKey) return
    setBusy(true); onError(null)
    try {
      await coreJson(`api/apps/${seg(appKey)}/users/${seg(userId)}/roles`, { method: 'PUT', ...jsonBody({ roleIds: [] } satisfies CoreReplaceUserRoles) })
      setAppKey('')
      await onSaved()
    } catch (caught) { onError(caught) }
    finally { setBusy(false) }
  }

  return <div className="core-access-card"><div className="core-access-title"><strong>Dar acceso a otra aplicación</strong></div><div className="core-access-actions"><select className="core-select" aria-label="Aplicación" value={appKey} onChange={(event) => setAppKey(event.target.value)}><option value="">Seleccioná una aplicación</option>{available.map((app) => <option key={app.appKey} value={app.appKey}>{app.name} · {app.appKey}</option>)}</select><PrimaryButton disabled={busy || !appKey} onClick={() => void grant()}>Dar acceso</PrimaryButton></div></div>
}
