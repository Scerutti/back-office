'use client'

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, History, LockKeyhole, Plus, RefreshCw, Trash2, UnlockKeyhole, X } from 'lucide-react'
import useSWR, { mutate as globalMutate } from 'swr'
import { CoreApiError, coreJson, fetcher, jsonBody, logout, seg } from '@/lib/core-client'
import { errorField } from '@/lib/error-messages'
import { RESERVED_APP_KEY, RESERVED_ROLE_NAME, USER_STATUS, toNumber, type CoreApp, type CoreLockUser, type CoreReplaceUserRoles, type CoreRevokeSessions, type CoreRole, type CoreUpdateUser, type CoreUser, type CoreUserDetail, type CoreUserPage, type CoreUserSession } from '@/lib/core-api/types'
import { formatUtc } from './overview-apps'
import { DangerButton, DisabledReason, EmptyState, ErrorNotice, Field, LoadingState, Modal, PageHeading, Panel, PrimaryButton, SecondaryButton, StatusBadge, fieldError, formLevelError, isCurrentUser, useConfirm, useCurrentSession, useDialogBehavior } from './shared'
import { useToast } from './toast'
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
  const confirm = useConfirm()
  const toast = useToast()
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
    <PageHeading eyebrow="IDENTIDAD · DIRECTORIO" title="Usuarios" description="Administrá identidades globales, estados y accesos a aplicaciones." action={<PrimaryButton onClick={() => setCreating(true)}><Plus aria-hidden="true" /> Crear usuario</PrimaryButton>} />
    {error ? <ErrorNotice error={error} /> : null}
    <div className="core-toolbar core-user-toolbar"><label className="core-search"><span className="sr-only">Buscar por email o nombre</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o email…" /></label><select className="core-select" value={status} onChange={(event) => setParams({ estado: event.target.value, pagina: null })} aria-label="Filtrar por estado"><option value="">Todos los estados</option><option value={USER_STATUS.Active}>Activos</option><option value={USER_STATUS.Locked}>Bloqueados</option></select><span className="core-result-count">{data ? `${toNumber(data.totalCount).toLocaleString('es-AR')} usuarios` : '—'}</span><button type="button" className="core-icon-button" aria-label="Actualizar usuarios" onClick={() => void refresh()}><RefreshCw aria-hidden="true" /></button></div>
    <Panel className="core-table-panel">{isLoading && !data ? <LoadingState /> : !data?.items.length ? <EmptyState title="No se encontraron usuarios" detail="Probá con otros filtros de búsqueda." /> : <div className="core-table-scroll"><table className="core-table"><thead><tr><th>USUARIO</th><th>EMAIL</th><th>ESTADO</th><th>EMAIL VERIFICADO</th><th>ÚLTIMO ACCESO</th><th>CREADO</th><th>ACCIONES</th></tr></thead><tbody>{data.items.map((user) => {
      const self = isCurrentUser(session, user)
      return <tr key={user.id}><td><button type="button" className="core-link-button" onClick={() => setParams({ id: user.id })}>{user.fullName}</button>{self && <small className="core-cell-subtitle">Vos</small>}</td><td>{user.email}</td><td><StatusBadge tone={user.status === USER_STATUS.Active ? 'success' : 'warning'}>{user.status}</StatusBadge></td><td>{user.emailVerifiedAtUtc ? <StatusBadge tone="success">Verificado</StatusBadge> : <StatusBadge tone="warning">No verificado</StatusBadge>}</td><td>{formatUtc(user.lastLoginAtUtc)}</td><td>{formatUtc(user.createdAtUtc)}</td><td><div className="core-action-group"><SecondaryButton onClick={() => setParams({ id: user.id })} aria-label={`Ver detalle de ${user.fullName}`}>Detalle</SecondaryButton><LockButton user={user} self={self} onDone={refresh} confirm={confirm} /></div></td></tr>
    })}</tbody></table></div>}</Panel>
    {data && (() => { const pageSize = toNumber(data.pageSize); const total = toNumber(data.totalCount); return <div className="core-pagination"><span>Mostrando {data.items.length ? ((page - 1) * pageSize + 1).toLocaleString('es-AR') : 0}–{Math.min(page * pageSize, total).toLocaleString('es-AR')} de {total.toLocaleString('es-AR')}</span><div><SecondaryButton disabled={page <= 1} onClick={() => setParams({ pagina: page - 1 > 1 ? String(page - 1) : null })}><ChevronLeft aria-hidden="true" /> Anterior</SecondaryButton><span>Página {toNumber(data.page)}</span><SecondaryButton disabled={page * pageSize >= total} onClick={() => setParams({ pagina: String(page + 1) })}>Siguiente <ChevronRight aria-hidden="true" /></SecondaryButton></div></div> })()}
    {creating && <CreateUserModal onClose={() => setCreating(false)} onDone={async (message) => { setCreating(false); toast.success(message); await refresh() }} />}
    {selectedUserId && <UserDrawer key={selectedUserId} userId={selectedUserId} onClose={() => setParams({ id: null })} onChanged={() => void refresh()} />}
  </>
}

/** Bloquear / desbloquear con confirmación (el bloqueo pide el motivo en el mismo modal). */
function LockButton({ user, self, onDone, confirm }: { user: Pick<CoreUser, 'id' | 'fullName' | 'status'>; self: boolean; onDone: () => unknown; confirm: ReturnType<typeof useConfirm> }) {
  const toast = useToast()
  const locked = user.status === USER_STATUS.Locked
  function run() {
    void confirm(locked ? {
      title: 'Desbloquear usuario',
      message: <p>¿Desbloquear a <strong>{user.fullName}</strong>? Va a poder volver a iniciar sesión.</p>,
      confirmLabel: 'Desbloquear',
      action: async () => { await coreJson<CoreUser>(`api/users/${seg(user.id)}/unlock`, { method: 'POST' }); toast.success('Usuario desbloqueado.'); await onDone() },
      onError: onDone,
    } : {
      title: 'Bloquear usuario',
      message: <p>¿Bloquear a <strong>{user.fullName}</strong>? No va a poder iniciar sesión y se cierran todas sus sesiones activas.</p>,
      confirmLabel: 'Bloquear',
      danger: true,
      reason: { label: 'Motivo del bloqueo', maxLength: LOCK_REASON_MAX },
      action: async (reason) => { await coreJson<CoreUser>(`api/users/${seg(user.id)}/lock`, { method: 'POST', ...jsonBody({ reason: reason || null } satisfies CoreLockUser) }); toast.success('Usuario bloqueado. Se cerraron sus sesiones.'); await onDone() },
      errors: { messages: { 'Authorization.LastAdmin': 'No se puede bloquear al último administrador activo.' } },
      onError: onDone,
    })
  }
  return <DisabledReason reason={self && !locked ? SELF.lock : null}><SecondaryButton disabled={self && !locked} onClick={run}>{locked ? <><UnlockKeyhole aria-hidden="true" /> Desbloquear</> : <><LockKeyhole aria-hidden="true" /> Bloquear</>}</SecondaryButton></DisabledReason>
}

/** Quitar el acceso de un usuario a una app (también le saca los roles de esa app). */
function useRemoveAccess(userId: string, userName: string, onSaved: () => unknown) {
  const confirm = useConfirm()
  const toast = useToast()
  return (app: { appKey: string; name: string }) => void confirm({
    title: 'Quitar acceso',
    message: <p>¿Quitarle a <strong>{userName}</strong> el acceso a <strong>{app.name}</strong>? Pierde todos sus roles en esa aplicación.</p>,
    confirmLabel: 'Quitar acceso',
    danger: true,
    action: async () => {
      await coreJson(`api/apps/${seg(app.appKey)}/users/${seg(userId)}`, { method: 'DELETE' })
      toast.success('Acceso quitado.')
      await onSaved()
    },
    errors: { messages: { 'Authorization.LastAdmin': 'No se puede quitar el acceso al último administrador activo de Core.' } },
    onError: onSaved,
  })
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timeout)
  }, [value, delay])
  return debounced
}

const EDIT_FIELDS = ['email', 'fullName'] as const

function UserDrawer({ userId, onClose, onChanged }: { userId: string; onClose: () => void; onChanged: () => void }) {
  const { data: user, error, isLoading, mutate: refreshUserDetail } = useSWR<UserDetail>(`api/users/${seg(userId)}`, fetcher<UserDetail>, { shouldRetryOnError: false })
  const { data: sessions, error: sessionsError, mutate: refreshSessions } = useSWR<CoreUserSession[]>(user ? `api/users/${seg(userId)}/sessions` : null, fetcher<CoreUserSession[]>)
  const currentSession = useCurrentSession()
  const confirm = useConfirm()
  const toast = useToast()
  const self = isCurrentUser(currentSession, user)
  const drawerRef = useRef<HTMLElement>(null)
  const handleDrawerKeyDown = useDialogBehavior(drawerRef, onClose)
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // Error de un campo del formulario de edición (los demás van como toast).
  const [formError, setFormError] = useState<unknown>(null)
  const refreshUser = async () => { await refreshUserDetail(); onChanged() }
  const removeAccess = useRemoveAccess(userId, user?.fullName ?? '', refreshUser)

  // 404 al abrir el detalle: el usuario no existe (o lo borraron). Se avisa y se vuelve a la lista.
  const notFound = error instanceof CoreApiError && error.status === 404
  useEffect(() => {
    if (!notFound) return
    toast.fromError(error, { messages: { 'Users.NotFound': 'El usuario no existe.' } })
    onChanged(); onClose()
  }, [notFound])

  /** Errores de las acciones sobre el usuario: si ya no existe, se cierra el detalle. */
  function onActionError(caught: unknown) {
    if (caught instanceof CoreApiError && caught.errorCode === 'Users.NotFound') { onChanged(); onClose(); return }
    void refreshUser()
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || busy) return
    const form = new FormData(event.currentTarget)
    const email = self ? user.email : String(form.get('email')).trim()
    const fullName = String(form.get('fullName')).trim()
    const emailChanged = email.toLowerCase() !== user.email.toLowerCase()
    const errors = { messages: { 'Authorization.LastAdmin': 'No se puede cambiar el email del último administrador activo: Core se quedaría sin administradores.' } }
    const save = async () => {
      await coreJson<CoreUser>(`api/users/${seg(user.id)}`, { method: 'PUT', ...jsonBody({ email, fullName } satisfies CoreUpdateUser) })
      toast.success(emailChanged ? 'Usuario actualizado. El nuevo email queda sin verificar.' : 'Usuario actualizado.')
      setEditOpen(false); setFormError(null)
      await refreshUser()
    }
    setFormError(null)
    if (emailChanged) {
      await confirm({
        title: 'Cambiar email',
        message: <><p>¿Cambiar el email de <strong>{user.fullName}</strong> a <strong>{email}</strong>?</p><p>Se pierde la verificación actual: el usuario va a tener que verificar el nuevo email.</p></>,
        confirmLabel: 'Cambiar email',
        // Un error de campo (email o nombre inválido) vuelve al formulario de edición, debajo del campo.
        action: async () => { try { await save() } catch (caught) { if (errorField(caught)) { setFormError(caught); return } throw caught } },
        errors,
        onError: onActionError,
      })
      return
    }
    setBusy(true)
    try { await save() } catch (caught) { toast.formError(caught, EDIT_FIELDS, setFormError, errors); if (!errorField(caught)) onActionError(caught) }
    finally { setBusy(false) }
  }

  // La API no cierra una sesión suelta: cierra todas, o todas las de una app (?appKey=).
  function revokeSessions(appKey?: string) {
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
        const revoked = toNumber(result.revokedSessions)
        if (revoked > 0) toast.success(revoked === 1 ? 'Se cerró 1 sesión.' : `Se cerraron ${revoked} sesiones.`)
        else toast.info('El usuario no tenía sesiones activas.')
        await refreshSessions()
      },
      errors: { messages: { 'Applications.NotFound': 'La aplicación no existe.' } },
      onError: onActionError,
    })
  }

  function deleteUser() {
    if (!user) return
    void confirm({
      title: 'Eliminar usuario',
      message: <><p>¿Eliminar a <strong>{user.fullName}</strong> ({user.email})?</p><p>Esta acción no se puede deshacer. El usuario y sus sesiones se eliminan; el historial de auditoría se conserva.</p></>,
      confirmLabel: 'Eliminar usuario',
      danger: true,
      action: async () => {
        await coreJson(`api/users/${seg(user.id)}`, { method: 'DELETE' })
        toast.success('Usuario eliminado.')
        // Se saca de la caché local (detalle y sesiones) antes de volver a la lista.
        void globalMutate((key) => typeof key === 'string' && key.startsWith(`api/users/${seg(user.id)}`), undefined, { revalidate: false })
        onChanged(); onClose()
      },
      onError: onActionError,
    })
  }

  const shell = (label: { labelledBy?: string; label?: string }, content: ReactNode) => <div className="core-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><aside ref={drawerRef} tabIndex={-1} onKeyDown={handleDrawerKeyDown} onMouseDown={(event) => event.stopPropagation()} className="core-drawer" role="dialog" aria-modal="true" aria-labelledby={label.labelledBy} aria-label={label.label}>{content}</aside></div>

  if (isLoading || notFound) return shell({ label: 'Cargando detalle de usuario' }, <><button type="button" className="core-icon-button core-drawer-close" aria-label="Cerrar" onClick={onClose}><X aria-hidden="true" /></button><LoadingState /></>)
  if (error || !user) return shell({ label: 'Detalle de usuario' }, <><button type="button" className="core-icon-button core-drawer-close" aria-label="Cerrar" onClick={onClose}><X aria-hidden="true" /></button><ErrorNotice error={error ?? new Error('No se encontró el usuario.')} /></>)

  const sessionCount = sessions?.length ?? 0
  const locked = user.status === USER_STATUS.Locked
  const applications = user.applications ?? []
  const deleteReason = self ? 'No podés eliminar tu propio usuario.' : !locked ? 'Bloqueá al usuario para poder eliminarlo.' : applications.length ? 'Quitale el acceso a todas las aplicaciones para poder eliminarlo.' : null
  const editFormError = formLevelError(formError, EDIT_FIELDS)
  return shell({ labelledBy: 'user-detail-heading' }, <>
    <header className="core-drawer-head"><div><p className="core-eyebrow">DIRECTORIO DE IDENTIDAD</p><h2 id="user-detail-heading">Detalle de usuario</h2></div><button type="button" className="core-icon-button" aria-label="Cerrar detalle" onClick={onClose}><X aria-hidden="true" /></button></header>
    <div className="core-drawer-content"><div className="core-user-identity"><div className="core-avatar">{user.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div><div><strong>{user.fullName}{self && ' (vos)'}</strong><span>{user.email}</span></div><StatusBadge tone={user.status === USER_STATUS.Active ? 'success' : 'warning'}>{user.status}</StatusBadge></div>
      <section className="core-detail-section"><div className="core-section-title"><h3>Datos personales</h3><div className="core-action-group"><LockButton user={user} self={self} confirm={confirm} onDone={refreshUser} /><SecondaryButton onClick={() => { setFormError(null); setEditOpen(true) }}>Editar</SecondaryButton></div></div><p><span>Nombre completo</span><strong>{user.fullName}</strong></p><p><span>Email</span><strong>{user.email}</strong></p><p><span>Verificación</span><strong>{user.emailVerifiedAtUtc ? `Verificado · ${formatUtc(user.emailVerifiedAtUtc)}` : 'No verificado'}</strong></p><p><span>Creado</span><strong>{formatUtc(user.createdAtUtc)}</strong></p>{locked && <p><span>Bloqueado</span><strong>{formatUtc(user.lockedAtUtc)}{user.lockReason ? ` · ${user.lockReason}` : ''}</strong></p>}</section>
      {!user.emailVerifiedAtUtc && <PendingInvitation key={applications.map((app) => app.appKey).join('|')} user={user} onChanged={refreshUser} />}
      <section className="core-detail-section"><div className="core-section-title"><h3>Aplicaciones y roles</h3></div>{applications.length ? applications.map((app) => <AccessEditor key={app.appKey} userId={user.id} self={self} app={app} onRemove={() => removeAccess(app)} onSaved={refreshUser} />) : <EmptyState title="Sin accesos asignados" detail="Este usuario todavía no tiene aplicaciones." />}<GrantAccess userId={user.id} assigned={applications.map((app) => app.appKey)} onSaved={refreshUser} /></section>
      <section className="core-detail-section"><div className="core-section-title"><div><h3>Sesiones activas</h3><p>{sessionCount} {sessionCount === 1 ? 'sesión' : 'sesiones'}</p></div><DisabledReason reason={sessions && !sessionCount ? 'No tiene sesiones activas.' : null}><SecondaryButton disabled={!sessionCount} onClick={() => revokeSessions()}>Cerrar sesiones</SecondaryButton></DisabledReason></div>{sessionsError && <ErrorNotice error={sessionsError} />}{sessions?.length ? sessions.map((session) => <div className="core-session-row" key={session.familyId}><div><strong>{session.appKey}</strong><small>{session.ipAddress || '—'} · {session.userAgent || '—'}</small><small>Inicio {formatUtc(session.startedAtUtc)} · Última renovación {formatUtc(session.lastRotatedAtUtc)} · Vence {formatUtc(session.expiresAtUtc)}</small></div><SecondaryButton onClick={() => revokeSessions(session.appKey)} aria-label={`Cerrar todas las sesiones de ${session.appKey}`}>Cerrar</SecondaryButton></div>) : !sessionsError && <EmptyState title="No hay sesiones activas" detail="Las sesiones vigentes aparecerán aquí." />}</section>
      <section className="core-detail-section"><div className="core-section-title"><h3>Historial</h3></div><Link className="core-history-link" href={userHistoryHref(user.id)}><History aria-hidden="true" /> Ver eventos de este usuario en Auditoría</Link><p className="core-detail-note">Incluye los eventos sobre el usuario (bloqueos, cambios de datos, sesiones) y las acciones que hizo él. Los cambios de acceso a aplicaciones se registran con el id del acceso, no del usuario: se ven en Auditoría con <code>entityType = UserApplicationAccess</code>.</p></section>
      <section className="core-detail-section core-danger-zone"><div className="core-section-title"><div><h3>Eliminar usuario</h3><p>Para eliminarlo, el usuario tiene que estar bloqueado y sin acceso a ninguna aplicación.</p></div><DisabledReason reason={deleteReason}><DangerButton disabled={Boolean(deleteReason)} onClick={deleteUser}><Trash2 aria-hidden="true" /> Eliminar</DangerButton></DisabledReason></div>
        <ul className="core-checklist">
          <li className={locked ? 'is-done' : ''}>{locked ? 'Bloqueado' : 'Bloqueá al usuario para poder eliminarlo.'}</li>
          <li className={applications.length ? '' : 'is-done'}>{applications.length ? `Todavía tiene acceso a ${applications.length} ${applications.length === 1 ? 'aplicación' : 'aplicaciones'}:` : 'Sin acceso a aplicaciones'}</li>
        </ul>
        {applications.length > 0 && !self && <div className="core-danger-apps">{applications.map((app) => <div key={app.appKey}><span><strong>{app.name}</strong> <code>{app.appKey}</code></span><SecondaryButton onClick={() => removeAccess(app)} aria-label={`Quitar acceso a ${app.name}`}>Quitar acceso</SecondaryButton></div>)}</div>}
      </section>
    </div>
    {editOpen && <Modal title="Editar usuario" onClose={() => { if (!busy) { setEditOpen(false); setFormError(null) } }}>{editFormError ? <ErrorNotice error={editFormError} /> : null}<form className="core-form" onSubmit={saveUser}><Field label="Nombre completo" error={fieldError(formError, 'fullName')}><input className="core-input" name="fullName" defaultValue={user.fullName} required maxLength={150} /></Field><Field label="Email" error={fieldError(formError, 'email')} hint={self ? SELF.email : 'Si cambia el email, el usuario pierde la verificación actual.'}><input className="core-input" type="email" name="email" defaultValue={user.email} required maxLength={320} readOnly={self} aria-readonly={self} /></Field><div className="core-form-actions"><SecondaryButton disabled={busy} onClick={() => { setEditOpen(false); setFormError(null) }}>Cancelar</SecondaryButton><PrimaryButton type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</PrimaryButton></div></form></Modal>}
  </>)
}

function AccessEditor({ userId, self, app, onRemove, onSaved }: { userId: string; self: boolean; app: UserDetail['applications'][number]; onRemove: () => void; onSaved: () => Promise<unknown> }) {
  const { data: roles, error } = useSWR<CoreRole[]>(`api/apps/${seg(app.appKey)}/roles`, fetcher<CoreRole[]>)
  const toast = useToast()
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
    setBusy(true)
    try {
      await coreJson(`api/apps/${seg(app.appKey)}/users/${seg(userId)}/roles`, { method: 'PUT', ...jsonBody({ roleIds: selected } satisfies CoreReplaceUserRoles) })
      setSavedKey(selected.join('|'))
      toast.success('Roles actualizados.')
      await onSaved()
    } catch (caught) {
      toast.fromError(caught, { messages: { 'Authorization.LastAdmin': 'Con esos roles, Core se queda sin administradores activos.' } })
      await onSaved()
    } finally { setBusy(false) }
  }

  return <div className="core-access-card"><div className="core-access-title"><strong>{app.name}</strong><code>{app.appKey}</code></div>{error && <ErrorNotice error={error} />}{roles ? <RoleCheckboxes roles={roles} selected={selected} onChange={setSelected} lockedReason={(role) => (protectedRole(role) ? SELF.adminRole : null)} /> : !error && <LoadingState label="Cargando roles…" />}<div className="core-access-actions"><DisabledReason reason={self && isCore ? SELF.removeCore : null}><SecondaryButton disabled={busy || (self && isCore)} onClick={onRemove}>Quitar acceso</SecondaryButton></DisabledReason><PrimaryButton disabled={busy || !roles || selected.join('|') === currentKey} onClick={() => void saveRoles()}>{busy ? 'Guardando…' : 'Guardar roles'}</PrimaryButton></div></div>
}


// Dar acceso a una app que el usuario todavía no tiene: se eligen los roles antes de confirmar
// (el predeterminado viene tildado) y se manda PUT .../users/{userId}/roles con esos ids.
function GrantAccess({ userId, assigned, onSaved }: { userId: string; assigned: string[]; onSaved: () => Promise<unknown> }) {
  const { data: apps } = useSWR<CoreApp[]>('api/apps', fetcher<CoreApp[]>)
  const [appKey, setAppKey] = useState('')
  const available = (apps ?? []).filter((app) => !assigned.includes(app.appKey))
  if (!available.length) return null

  return <div className="core-access-card"><div className="core-access-title"><strong>Dar acceso a otra aplicación</strong></div><select className="core-select core-grant-select" aria-label="Aplicación" value={appKey} onChange={(event) => setAppKey(event.target.value)}><option value="">Seleccioná una aplicación</option>{available.map((app) => <option key={app.appKey} value={app.appKey}>{app.name} · {app.appKey}</option>)}</select>{appKey && <GrantRoles key={appKey} appKey={appKey} userId={userId} onDone={async () => { setAppKey(''); await onSaved() }} />}</div>
}

function GrantRoles({ appKey, userId, onDone }: { appKey: string; userId: string; onDone: () => Promise<unknown> }) {
  const { data: roles, error } = useSWR<CoreRole[]>(`api/apps/${seg(appKey)}/roles`, fetcher<CoreRole[]>)
  const toast = useToast()
  const [selected, setSelected] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const effective = selected ?? roles?.filter((role) => role.isDefault).map((role) => role.id) ?? []

  async function grant() {
    setBusy(true)
    try {
      await coreJson(`api/apps/${seg(appKey)}/users/${seg(userId)}/roles`, { method: 'PUT', ...jsonBody({ roleIds: effective } satisfies CoreReplaceUserRoles) })
      toast.success('Acceso otorgado.')
      await onDone()
    } catch (caught) {
      toast.fromError(caught, { messages: { 'Authorization.LastAdmin': 'Con esos roles, Core se queda sin administradores activos.' } })
      // Si otro admin ya le dio acceso, se refresca para mostrarlo.
      if (caught instanceof CoreApiError && caught.errorCode === 'Authorization.AccessAlreadyGranted') await onDone()
    } finally { setBusy(false) }
  }

  return <div className="core-grant-roles">{error && <ErrorNotice error={error} />}{roles ? <><p className="core-detail-note">Roles que va a tener en <code>{appKey}</code>{roles.some((role) => role.isDefault) ? ' (el predeterminado ya viene tildado)' : ''}:</p><RoleCheckboxes roles={roles} selected={effective} onChange={setSelected} /></> : !error && <LoadingState label="Cargando roles…" />}<div className="core-access-actions"><PrimaryButton disabled={busy || !roles} onClick={() => void grant()}>{busy ? 'Dando acceso…' : effective.length ? `Dar acceso con ${effective.length} ${effective.length === 1 ? 'rol' : 'roles'}` : 'Dar acceso sin roles'}</PrimaryButton></div></div>
}
