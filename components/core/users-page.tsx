'use client'

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, History, LockKeyhole, Plus, RefreshCw, UnlockKeyhole, X } from 'lucide-react'
import useSWR from 'swr'
import { coreJson, fetcher, jsonBody, logout, seg } from '@/lib/core-client'
import { RESERVED_APP_KEY, RESERVED_ROLE_NAME, USER_STATUS, toNumber, type CoreApp, type CoreLockUser, type CoreReplaceUserRoles, type CoreRevokeSessions, type CoreRole, type CoreUpdateUser, type CoreUser, type CoreUserDetail, type CoreUserPage, type CoreUserSession } from '@/lib/core-api/types'
import { formatUtc } from './overview-apps'
import { DisabledReason, EmptyState, ErrorNotice, Field, LoadingState, Modal, PageErrorNotice, PageHeading, Panel, PrimaryButton, SecondaryButton, StatusBadge, isCurrentUser, useConfirm, useCurrentSession, useDialogBehavior } from './shared'
import { useUrlParams, userHistoryHref } from './url-state'
import { CreateUserModal, PendingInvitation, RoleCheckboxes } from './user-invitations'

const PAGE_SIZE = 20
const LOCK_REASON_MAX = 500

type UserDetail = CoreUserDetail

// Motivos para no ofrecerle al admin acciones sobre su propio usuario. Core igual responde 409
// Authorization.LastAdmin si una acción dejaría el sistema sin administradores.
const SELF = {
  lock: 'No podés bloquear tu propio usuario: perderías el acceso al panel.',
  removeCore: 'No podés quitarte el acceso a core: perderías el acceso al panel.',
  adminRole: 'No podés quitarte el rol admin de core: perderías el acceso al panel.',
  email: 'No podés cambiar tu propio email desde acá: se pierde la verificación y te quedarías sin acceso al panel.',
}

export function UsersPage() {
  const [params, setParams] = useUrlParams()
  const urlSearch = params.get('q') ?? ''
  const statusParam = params.get('estado')
  const status = statusParam === USER_STATUS.Active || statusParam === USER_STATUS.Locked ? statusParam : ''
  const page = Math.max(1, Number(params.get('pagina')) || 1)
  const selectedUserId = params.get('id')
  const [search, setSearch] = useState(urlSearch)
  const [creating, setCreating] = useState(false)
  const [pageNotice, setPageNotice] = useState('')
  const [errorAction, setErrorAction] = useState<unknown>(null)
  const confirm = useConfirm()
  const session = useCurrentSession()

  // La búsqueda vive en la URL (?q=) con debounce; atrás/adelante actualizan el input.
  const debouncedSearch = useDebouncedValue(search, 300)
  useEffect(() => { setSearch(urlSearch) }, [urlSearch])
  useEffect(() => {
    if (debouncedSearch.trim() !== urlSearch) setParams({ q: debouncedSearch.trim(), pagina: null }, 'replace')
    // Solo reacciona al texto ya estabilizado (no a cada cambio de la URL).
  }, [debouncedSearch])

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
  if (urlSearch.trim()) query.set('search', urlSearch.trim())
  if (status) query.set('status', status)
  const key = `api/users?${query.toString()}`
  const { data, error, isLoading, mutate: refresh } = useSWR<CoreUserPage>(key, fetcher<CoreUserPage>, { keepPreviousData: true })

  return <>
    <PageHeading eyebrow="IDENTIDAD · DIRECTORIO" title="Usuarios" description="Administrá identidades globales, estados y accesos a aplicaciones." action={<PrimaryButton onClick={() => { setErrorAction(null); setPageNotice(''); setCreating(true) }}><Plus aria-hidden="true" /> Crear usuario</PrimaryButton>} />
    {error ? <ErrorNotice error={error} /> : null}<PageErrorNotice error={errorAction} onDismiss={() => setErrorAction(null)} />{pageNotice && <p className="core-success-note core-page-notice" role="status">{pageNotice}</p>}
    <div className="core-toolbar core-user-toolbar"><label className="core-search"><span className="sr-only">Buscar por email o nombre</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o email…" /></label><select className="core-select" value={status} onChange={(event) => setParams({ estado: event.target.value, pagina: null })} aria-label="Filtrar por estado"><option value="">Todos los estados</option><option value={USER_STATUS.Active}>Activos</option><option value={USER_STATUS.Locked}>Bloqueados</option></select><span className="core-result-count">{data ? `${toNumber(data.totalCount).toLocaleString('es-AR')} usuarios` : '—'}</span><button type="button" className="core-icon-button" aria-label="Actualizar usuarios" onClick={() => void refresh()}><RefreshCw aria-hidden="true" /></button></div>
    <Panel className="core-table-panel">{isLoading && !data ? <LoadingState /> : !data?.items.length ? <EmptyState title="No se encontraron usuarios" detail="Probá con otros filtros de búsqueda." /> : <div className="core-table-scroll"><table className="core-table"><thead><tr><th>USUARIO</th><th>EMAIL</th><th>ESTADO</th><th>EMAIL VERIFICADO</th><th>ÚLTIMO ACCESO</th><th>CREADO</th><th>ACCIONES</th></tr></thead><tbody>{data.items.map((user) => {
      const self = isCurrentUser(session, user)
      return <tr key={user.id}><td><button type="button" className="core-link-button" onClick={() => setParams({ id: user.id })}>{user.fullName}</button>{self && <small className="core-cell-subtitle">Vos</small>}</td><td>{user.email}</td><td><StatusBadge tone={user.status === USER_STATUS.Active ? 'success' : 'warning'}>{user.status}</StatusBadge></td><td>{user.emailVerifiedAtUtc ? <StatusBadge tone="success">Verificado</StatusBadge> : <StatusBadge tone="warning">No verificado</StatusBadge>}</td><td>{formatUtc(user.lastLoginAtUtc)}</td><td>{formatUtc(user.createdAtUtc)}</td><td><div className="core-action-group"><SecondaryButton onClick={() => setParams({ id: user.id })} aria-label={`Ver detalle de ${user.fullName}`}>Detalle</SecondaryButton><LockButton user={user} self={self} onDone={refresh} confirm={confirm} /></div></td></tr>
    })}</tbody></table></div>}</Panel>
    {data && (() => { const pageSize = toNumber(data.pageSize); const total = toNumber(data.totalCount); return <div className="core-pagination"><span>Mostrando {data.items.length ? ((page - 1) * pageSize + 1).toLocaleString('es-AR') : 0}–{Math.min(page * pageSize, total).toLocaleString('es-AR')} de {total.toLocaleString('es-AR')}</span><div><SecondaryButton disabled={page <= 1} onClick={() => setParams({ pagina: page - 1 > 1 ? String(page - 1) : null })}><ChevronLeft aria-hidden="true" /> Anterior</SecondaryButton><span>Página {toNumber(data.page)}</span><SecondaryButton disabled={page * pageSize >= total} onClick={() => setParams({ pagina: String(page + 1) })}>Siguiente <ChevronRight aria-hidden="true" /></SecondaryButton></div></div> })()}
    {creating && <CreateUserModal onClose={() => setCreating(false)} onDone={async (message) => { setCreating(false); setPageNotice(message); await refresh() }} />}
    {selectedUserId && <UserDrawer key={selectedUserId} userId={selectedUserId} onClose={() => setParams({ id: null })} onChanged={() => void refresh()} />}
  </>
}

/** Bloquear / desbloquear con confirmación (el bloqueo pide el motivo en el mismo modal). */
function LockButton({ user, self, onDone, confirm }: { user: Pick<CoreUser, 'id' | 'fullName' | 'status'>; self: boolean; onDone: () => unknown; confirm: ReturnType<typeof useConfirm> }) {
  const locked = user.status === USER_STATUS.Locked
  function run() {
    // No hay borrado de usuarios en la API (DELETE da 405): se bloquean y desbloquean.
    void confirm(locked ? {
      title: 'Desbloquear usuario',
      message: <p>¿Desbloquear a <strong>{user.fullName}</strong>? Va a poder volver a iniciar sesión.</p>,
      confirmLabel: 'Desbloquear',
      action: async () => { await coreJson<CoreUser>(`api/users/${seg(user.id)}/unlock`, { method: 'POST' }); await onDone() },
    } : {
      title: 'Bloquear usuario',
      message: <p>¿Bloquear a <strong>{user.fullName}</strong>? No va a poder iniciar sesión y se cierran todas sus sesiones activas.</p>,
      confirmLabel: 'Bloquear',
      danger: true,
      reason: { label: 'Motivo del bloqueo', maxLength: LOCK_REASON_MAX },
      action: async (reason) => { await coreJson<CoreUser>(`api/users/${seg(user.id)}/lock`, { method: 'POST', ...jsonBody({ reason: reason || null } satisfies CoreLockUser) }); await onDone() },
    })
  }
  return <DisabledReason reason={self && !locked ? SELF.lock : null}><SecondaryButton disabled={self && !locked} onClick={run}>{locked ? <><UnlockKeyhole aria-hidden="true" /> Desbloquear</> : <><LockKeyhole aria-hidden="true" /> Bloquear</>}</SecondaryButton></DisabledReason>
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timeout)
  }, [value, delay])
  return debounced
}

function UserDrawer({ userId, onClose, onChanged }: { userId: string; onClose: () => void; onChanged: () => void }) {
  const { data: user, error, isLoading, mutate: refreshUserDetail } = useSWR<UserDetail>(`api/users/${seg(userId)}`, fetcher<UserDetail>)
  const { data: sessions, error: sessionsError, mutate: refreshSessions } = useSWR<CoreUserSession[]>(`api/users/${seg(userId)}/sessions`, fetcher<CoreUserSession[]>)
  const currentSession = useCurrentSession()
  const confirm = useConfirm()
  const self = isCurrentUser(currentSession, user)
  const drawerRef = useRef<HTMLElement>(null)
  const handleDrawerKeyDown = useDialogBehavior(drawerRef, onClose)
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  // Los errores de acciones del panel lateral se muestran adentro (el banner de la página queda tapado).
  const [actionError, setActionError] = useState<unknown>(null)
  const refreshUser = async () => { await refreshUserDetail(); onChanged() }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || busy) return
    const form = new FormData(event.currentTarget)
    const email = self ? user.email : String(form.get('email')).trim()
    const fullName = String(form.get('fullName')).trim()
    const save = async () => {
      await coreJson<CoreUser>(`api/users/${seg(user.id)}`, { method: 'PUT', ...jsonBody({ email, fullName } satisfies CoreUpdateUser) })
      await refreshUser(); setEditOpen(false); setNotice('Datos actualizados.')
    }
    setActionError(null)
    if (email.toLowerCase() !== user.email.toLowerCase()) {
      await confirm({
        title: 'Cambiar email',
        message: <><p>¿Cambiar el email de <strong>{user.fullName}</strong> a <strong>{email}</strong>?</p><p>Se pierde la verificación actual: el usuario va a tener que verificar el nuevo email.</p></>,
        confirmLabel: 'Cambiar email',
        action: save,
      })
      return
    }
    setBusy(true)
    try { await save() } catch (caught) { setActionError(caught) }
    finally { setBusy(false) }
  }

  // La API no cierra una sesión suelta: cierra todas, o todas las de una app (?appKey=).
  function revokeSessions(appKey?: string) {
    setActionError(null)
    const query = appKey ? `?appKey=${seg(appKey)}` : ''
    const endsOwnPanelSession = self && (!appKey || appKey === RESERVED_APP_KEY)
    const count = appKey ? (sessions ?? []).filter((session) => session.appKey === appKey).length : (sessions ?? []).length
    void confirm({
      title: 'Cerrar sesiones',
      message: <><p>{appKey ? <>¿Cerrar las {count} {count === 1 ? 'sesión' : 'sesiones'} de <strong>{user?.fullName}</strong> en <strong>{appKey}</strong>? Core no permite cerrar una sola: se cierran todas las de esa aplicación.</> : <>¿Cerrar las {count} sesiones activas de <strong>{user?.fullName}</strong>?</>}</p>{endsOwnPanelSession && <span className="core-confirm-warning">Incluye tu sesión actual del panel: al confirmar vas a volver a la pantalla de inicio de sesión.</span>}</>,
      confirmLabel: 'Cerrar sesiones',
      danger: true,
      action: async () => {
        const result = await coreJson<CoreRevokeSessions>(`api/users/${seg(userId)}/sessions${query}`, { method: 'DELETE' })
        // Si se cerró la propia sesión del panel, el access token sigue valiendo unos minutos y el corte
        // llegaría recién en el próximo refresh: se sale ya, para que quede claro qué pasó.
        if (endsOwnPanelSession) { await logout(); return }
        await refreshSessions(); setNotice(`Sesiones revocadas: ${toNumber(result.revokedSessions)}.`)
      },
    })
  }

  const shell = (label: { labelledBy?: string; label?: string }, content: ReactNode) => <div className="core-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><aside ref={drawerRef} tabIndex={-1} onKeyDown={handleDrawerKeyDown} onMouseDown={(event) => event.stopPropagation()} className="core-drawer" role="dialog" aria-modal="true" aria-labelledby={label.labelledBy} aria-label={label.label}>{content}</aside></div>

  if (isLoading) return shell({ label: 'Cargando detalle de usuario' }, <><button type="button" className="core-icon-button core-drawer-close" aria-label="Cerrar" onClick={onClose}><X aria-hidden="true" /></button><LoadingState /></>)
  if (error || !user) return shell({ label: 'Detalle de usuario' }, <><button type="button" className="core-icon-button core-drawer-close" aria-label="Cerrar" onClick={onClose}><X aria-hidden="true" /></button><ErrorNotice error={error ?? new Error('No se encontró el usuario.')} /></>)

  const sessionCount = sessions?.length ?? 0
  return shell({ labelledBy: 'user-detail-heading' }, <>
    <header className="core-drawer-head"><div><p className="core-eyebrow">DIRECTORIO DE IDENTIDAD</p><h2 id="user-detail-heading">Detalle de usuario</h2></div><button type="button" className="core-icon-button" aria-label="Cerrar detalle" onClick={onClose}><X aria-hidden="true" /></button></header>
    <div className="core-drawer-content"><div className="core-user-identity"><div className="core-avatar">{user.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div><div><strong>{user.fullName}{self && ' (vos)'}</strong><span>{user.email}</span></div><StatusBadge tone={user.status === USER_STATUS.Active ? 'success' : 'warning'}>{user.status}</StatusBadge></div>
      {!editOpen && actionError ? <ErrorNotice error={actionError} onDismiss={() => setActionError(null)} /> : null}
      {notice && <p className="core-success-note" role="status">{notice}</p>}
      <section className="core-detail-section"><div className="core-section-title"><h3>Datos personales</h3><div className="core-action-group"><LockButton user={user} self={self} confirm={confirm} onDone={async () => { setNotice(''); await refreshUser() }} /><SecondaryButton onClick={() => { setActionError(null); setEditOpen(true) }}>Editar</SecondaryButton></div></div><p><span>Nombre completo</span><strong>{user.fullName}</strong></p><p><span>Email</span><strong>{user.email}</strong></p><p><span>Verificación</span><strong>{user.emailVerifiedAtUtc ? `Verificado · ${formatUtc(user.emailVerifiedAtUtc)}` : 'No verificado'}</strong></p><p><span>Creado</span><strong>{formatUtc(user.createdAtUtc)}</strong></p>{user.status === USER_STATUS.Locked && <p><span>Bloqueado</span><strong>{formatUtc(user.lockedAtUtc)}{user.lockReason ? ` · ${user.lockReason}` : ''}</strong></p>}</section>
      {!user.emailVerifiedAtUtc && <PendingInvitation key={user.applications.map((app) => app.appKey).join('|')} user={user} onError={setActionError} onSent={(message) => { setActionError(null); setNotice(message) }} />}
      <section className="core-detail-section"><div className="core-section-title"><h3>Aplicaciones y roles</h3></div>{user.applications?.length ? user.applications.map((app) => <AccessEditor key={app.appKey} userId={user.id} userName={user.fullName} self={self} app={app} onError={setActionError} onSaved={refreshUser} />) : <EmptyState title="Sin accesos asignados" detail="Este usuario todavía no tiene aplicaciones." />}<GrantAccess userId={user.id} assigned={user.applications.map((app) => app.appKey)} onError={setActionError} onSaved={refreshUser} /></section>
      <section className="core-detail-section"><div className="core-section-title"><div><h3>Sesiones activas</h3><p>{sessionCount} {sessionCount === 1 ? 'sesión' : 'sesiones'}</p></div><DisabledReason reason={sessions && !sessionCount ? 'No tiene sesiones activas.' : null}><SecondaryButton disabled={!sessionCount} onClick={() => revokeSessions()}>Cerrar sesiones</SecondaryButton></DisabledReason></div>{sessionsError && <ErrorNotice error={sessionsError} />}{sessions?.length ? sessions.map((session) => <div className="core-session-row" key={session.familyId}><div><strong>{session.appKey}</strong><small>{session.ipAddress || '—'} · {session.userAgent || '—'}</small><small>Inicio {formatUtc(session.startedAtUtc)} · Última renovación {formatUtc(session.lastRotatedAtUtc)} · Vence {formatUtc(session.expiresAtUtc)}</small></div><SecondaryButton onClick={() => revokeSessions(session.appKey)} aria-label={`Cerrar todas las sesiones de ${session.appKey}`}>Cerrar</SecondaryButton></div>) : !sessionsError && <EmptyState title="No hay sesiones activas" detail="Las sesiones vigentes aparecerán aquí." />}</section>
      <section className="core-detail-section"><div className="core-section-title"><h3>Historial</h3></div><Link className="core-history-link" href={userHistoryHref(user.id)}><History aria-hidden="true" /> Ver eventos de este usuario en Auditoría</Link><p className="core-detail-note">Incluye los eventos sobre el usuario (bloqueos, cambios de datos, sesiones) y las acciones que hizo él. Los cambios de acceso a aplicaciones se registran con el id del acceso, no del usuario: se ven en Auditoría con <code>entityType = UserApplicationAccess</code>.</p></section>
    </div>
    {editOpen && <Modal title="Editar usuario" onClose={() => { if (!busy) { setEditOpen(false); setActionError(null) } }}>{actionError ? <ErrorNotice error={actionError} /> : null}<form className="core-form" onSubmit={saveUser}><Field label="Nombre completo"><input className="core-input" name="fullName" defaultValue={user.fullName} required maxLength={200} /></Field><Field label="Email" hint={self ? SELF.email : 'Si cambia el email, el usuario pierde la verificación actual.'}><input className="core-input" type="email" name="email" defaultValue={user.email} required maxLength={320} readOnly={self} aria-readonly={self} /></Field><div className="core-form-actions"><SecondaryButton disabled={busy} onClick={() => { setEditOpen(false); setActionError(null) }}>Cancelar</SecondaryButton><PrimaryButton type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</PrimaryButton></div></form></Modal>}
  </>)
}

function AccessEditor({ userId, userName, self, app, onError, onSaved }: { userId: string; userName: string; self: boolean; app: UserDetail['applications'][number]; onError: (error: unknown) => void; onSaved: () => Promise<unknown> }) {
  const { data: roles, error } = useSWR<CoreRole[]>(`api/apps/${seg(app.appKey)}/roles`, fetcher<CoreRole[]>)
  const confirm = useConfirm()
  // El detalle del usuario trae los NOMBRES de sus roles; el PUT pide ids. Se resuelven con la lista de roles.
  const currentRoleIds = useMemo(() => (app.roles ?? []).map((name) => roles?.find((item) => item.name === name)?.id ?? '').filter(Boolean), [app.roles, roles])
  const [selected, setSelected] = useState<string[]>([])
  const [savedKey, setSavedKey] = useState('')
  const [busy, setBusy] = useState(false)
  const currentKey = currentRoleIds.join('|')
  useEffect(() => {
    if (savedKey !== currentKey) setSelected(currentRoleIds)
  }, [currentKey, currentRoleIds, savedKey])
  const isCore = app.appKey === RESERVED_APP_KEY
  const protectedRole = (role: CoreRole) => self && isCore && role.name.toLowerCase() === RESERVED_ROLE_NAME && currentRoleIds.includes(role.id)

  async function saveRoles() {
    setBusy(true); onError(null)
    try {
      await coreJson(`api/apps/${seg(app.appKey)}/users/${seg(userId)}/roles`, { method: 'PUT', ...jsonBody({ roleIds: selected } satisfies CoreReplaceUserRoles) })
      setSavedKey(selected.join('|'))
      await onSaved()
    } catch (caught) { onError(caught) }
    finally { setBusy(false) }
  }

  function removeAccess() {
    onError(null)
    void confirm({
      title: 'Quitar acceso',
      message: <p>¿Quitarle a <strong>{userName}</strong> el acceso a <strong>{app.name}</strong>? Pierde todos sus roles en esa aplicación.</p>,
      confirmLabel: 'Quitar acceso',
      danger: true,
      action: async () => {
        await coreJson(`api/apps/${seg(app.appKey)}/users/${seg(userId)}`, { method: 'DELETE' })
        await onSaved()
      },
    })
  }

  return <div className="core-access-card"><div className="core-access-title"><strong>{app.name}</strong><code>{app.appKey}</code></div>{error && <ErrorNotice error={error} />}{roles ? <RoleCheckboxes roles={roles} selected={selected} onChange={setSelected} lockedReason={(role) => (protectedRole(role) ? SELF.adminRole : null)} /> : !error && <LoadingState label="Cargando roles…" />}<div className="core-access-actions"><DisabledReason reason={self && isCore ? SELF.removeCore : null}><SecondaryButton disabled={busy || (self && isCore)} onClick={removeAccess}>Quitar acceso</SecondaryButton></DisabledReason><PrimaryButton disabled={busy || !roles || selected.join('|') === currentKey} onClick={() => void saveRoles()}>{busy ? 'Guardando…' : 'Guardar roles'}</PrimaryButton></div></div>
}


// Dar acceso a una app que el usuario todavía no tiene: se eligen los roles antes de confirmar
// (el predeterminado viene tildado) y se manda PUT .../users/{userId}/roles con esos ids.
function GrantAccess({ userId, assigned, onError, onSaved }: { userId: string; assigned: string[]; onError: (error: unknown) => void; onSaved: () => Promise<unknown> }) {
  const { data: apps } = useSWR<CoreApp[]>('api/apps', fetcher<CoreApp[]>)
  const [appKey, setAppKey] = useState('')
  const available = (apps ?? []).filter((app) => !assigned.includes(app.appKey))
  if (!available.length) return null

  return <div className="core-access-card"><div className="core-access-title"><strong>Dar acceso a otra aplicación</strong></div><select className="core-select core-grant-select" aria-label="Aplicación" value={appKey} onChange={(event) => setAppKey(event.target.value)}><option value="">Seleccioná una aplicación</option>{available.map((app) => <option key={app.appKey} value={app.appKey}>{app.name} · {app.appKey}</option>)}</select>{appKey && <GrantRoles key={appKey} appKey={appKey} userId={userId} onError={onError} onDone={async () => { setAppKey(''); await onSaved() }} />}</div>
}

function GrantRoles({ appKey, userId, onError, onDone }: { appKey: string; userId: string; onError: (error: unknown) => void; onDone: () => Promise<unknown> }) {
  const { data: roles, error } = useSWR<CoreRole[]>(`api/apps/${seg(appKey)}/roles`, fetcher<CoreRole[]>)
  const [selected, setSelected] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const effective = selected ?? roles?.filter((role) => role.isDefault).map((role) => role.id) ?? []

  async function grant() {
    setBusy(true); onError(null)
    try {
      await coreJson(`api/apps/${seg(appKey)}/users/${seg(userId)}/roles`, { method: 'PUT', ...jsonBody({ roleIds: effective } satisfies CoreReplaceUserRoles) })
      await onDone()
    } catch (caught) { onError(caught) }
    finally { setBusy(false) }
  }

  return <div className="core-grant-roles">{error && <ErrorNotice error={error} />}{roles ? <><p className="core-detail-note">Roles que va a tener en <code>{appKey}</code>{roles.some((role) => role.isDefault) ? ' (el predeterminado ya viene tildado)' : ''}:</p><RoleCheckboxes roles={roles} selected={effective} onChange={setSelected} /></> : !error && <LoadingState label="Cargando roles…" />}<div className="core-access-actions"><PrimaryButton disabled={busy || !roles} onClick={() => void grant()}>{busy ? 'Dando acceso…' : effective.length ? `Dar acceso con ${effective.length} ${effective.length === 1 ? 'rol' : 'roles'}` : 'Dar acceso sin roles'}</PrimaryButton></div></div>
}
