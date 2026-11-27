'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Activity, AppWindow, Check, Copy, History, KeyRound, Pencil, Plus, Power, RefreshCw, Trash2, Users } from 'lucide-react'
import useSWR, { mutate } from 'swr'
import { coreJson, CoreApiError, fetcher, jsonBody, seg } from '@/lib/core-client'
import { APP_STATUS, RESERVED_APP_KEY, toNumber, type CoreApp, type CoreAppCreated, type CoreAppUserPage, type CoreAuditPage, type CoreAuditRow, type CoreCreateApp, type CoreHealth, type CoreRotateSecret, type CoreUpdateApp, type CoreUserDetail, type CoreUserPage } from '@/lib/core-api/types'
import { auditActionText, auditActorTypeLabel, auditEntityTypeLabel, describeAuditEntity } from '@/lib/audit-labels'
import { CheckRow, DangerButton, EmptyState, ErrorNotice, Field, LoadingState, Modal, PageHeading, Panel, PrimaryButton, RowActionsMenu, SecondaryButton, StatusBadge, fieldError, formLevelError, useConfirm, useCurrentSession } from './shared'
import { useToast } from './toast'
import { appAuditHref, auditEventHref } from './url-state'

// GET /health responde 503 con { status: "Unhealthy", database: "Unhealthy" } si la base no contesta.
async function fetchHealth(): Promise<CoreHealth> {
  try {
    return await coreJson<CoreHealth>('health')
  } catch (error) {
    if (error instanceof CoreApiError && error.status === 503 && error.errorCode === 'Http.503') return { status: 'Unhealthy', database: 'Unhealthy' }
    throw error
  }
}

const RECENT_KEY = 'api/audit-logs?pageSize=10'
const stableOptions = { revalidateOnFocus: false, revalidateIfStale: false, shouldRetryOnError: false }

export function OverviewPage() {
  const health = useSWR<CoreHealth>('health', fetchHealth)
  const apps = useSWR<CoreApp[]>('api/apps', fetcher<CoreApp[]>)
  const users = useSWR<CoreUserPage>('api/users?pageSize=1', fetcher<CoreUserPage>)
  const audit = useSWR<CoreAuditPage>(RECENT_KEY, fetcher<CoreAuditPage>)
  const errors = [health.error, apps.error, users.error, audit.error].filter(Boolean)
  if (!health.data || !apps.data || !users.data || !audit.data) {
    return <><PageHeading eyebrow="SISTEMA · RESUMEN" title="Resumen general" description="Estado actual y actividad reciente de HREF Core." />{errors.map((error, index) => <ErrorNotice key={index} error={error} />)}{errors.length ? <EmptyState title="Resumen incompleto" detail="No se pudieron cargar todos los datos reales de HREF Core." /> : <LoadingState />}</>
  }

  return <>
    <PageHeading eyebrow="SISTEMA · RESUMEN" title="Resumen general" description="Estado actual y actividad reciente de HREF Core." />
    {errors.map((error, index) => <ErrorNotice key={index} error={error} />)}
    <div className="core-summary-grid">
      <Panel className="core-summary-card"><div className="core-summary-label"><Activity aria-hidden="true" /> Estado general</div><div className="core-summary-value"><StatusBadge tone={health.data.status === 'Healthy' ? 'success' : 'danger'}>{health.data.status}</StatusBadge></div><p>Base de datos: <StatusBadge tone={health.data.database === 'Healthy' ? 'success' : 'danger'}>{health.data.database}</StatusBadge></p></Panel>
      <Panel className="core-summary-card"><div className="core-summary-label"><AppWindow aria-hidden="true" /> Aplicaciones</div><div className="core-summary-value">{apps.data.length}</div><p>Aplicaciones registradas en Core</p></Panel>
      <Panel className="core-summary-card"><div className="core-summary-label"><Users aria-hidden="true" /> Usuarios</div><div className="core-summary-value">{toNumber(users.data.totalCount).toLocaleString('es-AR')}</div><p>Identidades globales</p></Panel>
    </div>
    <Panel className="core-recent-panel"><div className="core-panel-heading"><div><h2>Actividad reciente</h2><p>Últimos eventos registrados en auditoría. Abrí uno para verlo en Auditoría.</p></div><button type="button" className="core-icon-button" aria-label="Actualizar actividad" onClick={() => void mutate(RECENT_KEY)}><RefreshCw aria-hidden="true" /></button></div>
      {!audit.data.items.length ? <EmptyState title="Todavía no hay actividad" detail="Los eventos aparecerán cuando Core registre auditoría." /> : <div className="core-recent-list">{audit.data.items.map((event) => <RecentEvent key={event.id} event={event} apps={apps.data ?? []} />)}</div>}
    </Panel>
  </>
}

/** Email del usuario (se pide `GET /api/users/{id}` una vez y queda en caché). */
export function useUserLabel(userId: string | null | undefined) {
  const session = useCurrentSession()
  const own = Boolean(userId && session?.userId === userId)
  const { data } = useSWR<CoreUserDetail>(userId && !own ? `api/users/${seg(userId)}` : null, fetcher<CoreUserDetail>, stableOptions)
  if (!userId) return null
  if (own) return session?.email || 'vos'
  return data?.email ?? null
}

function RecentEvent({ event, apps }: { event: CoreAuditRow; apps: CoreApp[] }) {
  const entity = describeAuditEntity(event)
  const actorUserId = event.actorType === 'User' ? event.actorId : null
  const actorLabel = useUserLabel(actorUserId)
  const entityUserLabel = useUserLabel(entity.label ? null : entity.userId)
  const appName = event.appKey ? apps.find((app) => app.appKey === event.appKey)?.name : null

  const actor = event.actorType === 'User'
    ? actorLabel ?? 'Usuario'
    : event.actorType === 'Application' && event.actorId
      ? `App ${apps.find((app) => app.appKey === event.actorId)?.name ?? event.actorId}`
      : auditActorTypeLabel(event.actorType)
  const entityLabel = entity.label ?? entityUserLabel
  const entityText = event.entityType ? `${auditEntityTypeLabel(event.entityType)}${entityLabel ? `: ${entityLabel}` : ''}` : ''

  return <div className="core-recent-row"><Link className="core-recent-link" href={auditEventHref(event)} aria-label={`${auditActionText(event)}. Ver en Auditoría`}>
    <div className="core-recent-icon"><Activity aria-hidden="true" /></div>
    <div className="core-recent-main"><strong>{auditActionText(event)}</strong><span>{[actor, entityText].filter(Boolean).join(' · ')}</span></div>
    <div className="core-recent-meta"><code title={event.appKey ?? undefined}>{appName ?? event.appKey ?? '—'}</code><time dateTime={event.occurredAtUtc}>{formatUtc(event.occurredAtUtc)}</time></div>
  </Link></div>
}

export function formatUtc(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return '—'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) + ' UTC'
}

// ---------------------------------------------------------------------------------------------
// Conteo de usuarios por app. La API no lo trae en GET /api/apps, así que se pide por app; para
// no disparar N requests al entrar: solo se pide cuando la fila es visible, de a 3 en paralelo,
// y el resultado queda en caché 5 minutos (no se revalida al volver a la sección).
// ---------------------------------------------------------------------------------------------
const MAX_PARALLEL_COUNTS = 3
let runningCounts = 0
const countQueue: Array<() => void> = []
function limited<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      runningCounts++
      task().then(resolve, reject).finally(() => { runningCounts--; countQueue.shift()?.() })
    }
    if (runningCounts < MAX_PARALLEL_COUNTS) run()
    else countQueue.push(run)
  })
}
const countOptions = { ...stableOptions, dedupingInterval: 5 * 60_000 }

function AppUserCount({ appKey }: { appKey: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node || visible) return
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) setVisible(true) })
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible])
  const key = visible ? appUsersCountKey(appKey) : null
  const { data, error } = useSWR<CoreAppUserPage>(key, (path: string) => limited(() => coreJson<CoreAppUserPage>(path)), countOptions)
  if (error) return <span ref={ref} title={error instanceof CoreApiError ? `${error.errorCode} · ${error.correlationId}` : undefined}>—</span>
  return <span ref={ref} aria-busy={!data}>{data ? toNumber(data.totalCount).toLocaleString('es-AR') : '…'}</span>
}

const APP_FIELDS = ['appKey', 'name', 'description'] as const
const appUsersCountKey = (appKey: string) => `api/apps/${seg(appKey)}/users?pageSize=1`

const APP_KEY_RULE = <>De 3 a 50 caracteres: minúsculas, números y guiones (no al principio ni al final). Ejemplo: <code>mi-app-2</code>. Queda fija al crear.</>

export function AppsPage() {
  const { data: apps, error, isLoading, mutate: refreshApps } = useSWR<CoreApp[]>('api/apps', fetcher<CoreApp[]>)
  const confirm = useConfirm()
  const toast = useToast()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<CoreApp | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [secret, setSecret] = useState<{ appName: string; value: string } | null>(null)
  const [secretCopied, setSecretCopied] = useState(false)
  // Error de un campo del formulario (los demás van como toast).
  const [formError, setFormError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const [deleting, setDeleting] = useState<CoreApp | null>(null)
  const filtered = useMemo(() => (apps ?? []).filter((app) => `${app.name} ${app.appKey}`.toLowerCase().includes(search.toLowerCase())), [apps, search])

  function openForm(app: CoreApp | null) {
    setEditing(app); setFormError(null); setFormOpen(true)
  }
  function closeForm() {
    if (pending) return
    setFormOpen(false); setFormError(null)
  }

  async function saveApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = new FormData(event.currentTarget)
    const appKey = editing?.appKey ?? String(form.get('appKey') ?? '').trim()
    const payload: CoreCreateApp = {
      appKey,
      name: String(form.get('name') ?? '').trim(),
      description: String(form.get('description') ?? '').trim() || null,
      allowSelfRegistration: appKey === RESERVED_APP_KEY ? false : form.get('allowSelfRegistration') === 'on',
    }
    setPending(true); setFormError(null)
    try {
      if (editing) {
        const update: CoreUpdateApp = { name: payload.name, description: payload.description, allowSelfRegistration: payload.allowSelfRegistration }
        await coreJson<CoreApp>(`api/apps/${seg(editing.appKey)}`, { method: 'PUT', ...jsonBody(update) })
        toast.success('Aplicación actualizada.')
      } else {
        // 201 trae clientSecret: se muestra UNA sola vez en el modal y no se guarda en ningún lado.
        const result = await coreJson<CoreAppCreated>('api/apps', { method: 'POST', ...jsonBody(payload) })
        setSecret({ appName: payload.name, value: result.clientSecret }); setSecretCopied(false)
        toast.success('Aplicación creada. Copiá el client secret: no se vuelve a mostrar.')
      }
      await refreshApps()
      setFormOpen(false)
    } catch (caught) {
      toast.formError(caught, APP_FIELDS, setFormError, { messages: { 'Applications.Reserved': 'La aplicación core no puede permitir el autorregistro.' } })
      // Si la app ya no existe, se cierra el formulario y se refresca la lista.
      if (caught instanceof CoreApiError && caught.status === 404) { setFormOpen(false); void refreshApps() }
    } finally { setPending(false) }
  }

  function changeStatus(app: CoreApp) {
    if (app.appKey === RESERVED_APP_KEY) return
    const suspend = app.status === APP_STATUS.Active
    void confirm({
      title: suspend ? 'Suspender aplicación' : 'Activar aplicación',
      message: suspend
        ? <><p>¿Suspender <strong>{app.name}</strong>?</p><p>Sus usuarios no van a poder iniciar sesión ni renovar sus tokens hasta que la vuelvas a activar.</p></>
        : <p>¿Activar <strong>{app.name}</strong>? Sus usuarios van a poder volver a iniciar sesión.</p>,
      confirmLabel: suspend ? 'Suspender' : 'Activar',
      danger: suspend,
      action: async () => {
        await coreJson<CoreApp>(`api/apps/${seg(app.appKey)}/status`, { method: 'PATCH', ...jsonBody({ status: suspend ? APP_STATUS.Suspended : APP_STATUS.Active }) })
        toast.success(suspend ? 'Aplicación suspendida.' : 'Aplicación activada.')
        await refreshApps()
      },
      errors: { messages: { 'Applications.Reserved': 'La aplicación core no se puede suspender.' } },
      onError: () => refreshApps(),
    })
  }

  function rotateSecret(app: CoreApp) {
    const isCore = app.appKey === RESERVED_APP_KEY
    void confirm({
      title: 'Rotar client secret',
      message: <><p>¿Rotar el secret de <strong>{app.name}</strong>? El secret anterior deja de funcionar inmediatamente.</p>{isCore && <span className="core-confirm-warning">Es la app <strong>core</strong>: este panel usa ese secret (<code>CORE_APP_SECRET</code>). Hasta que actualices la variable de entorno del servidor, nadie va a poder iniciar sesión en el panel.</span>}</>,
      confirmLabel: 'Rotar secret',
      danger: true,
      requireText: isCore ? RESERVED_APP_KEY : undefined,
      action: async () => {
        const result = await coreJson<CoreRotateSecret>(`api/apps/${seg(app.appKey)}/secret/rotate`, { method: 'POST' })
        setSecret({ appName: app.name, value: result.clientSecret }); setSecretCopied(false)
        toast.success('Secret rotado. El anterior dejó de funcionar.')
        await refreshApps()
      },
      onError: () => refreshApps(),
    })
  }

  return <>
    <PageHeading eyebrow="IDENTIDAD · CLIENTES" title="Aplicaciones" description="Administrá las aplicaciones conectadas a HREF Core." action={<PrimaryButton onClick={() => openForm(null)}><Plus aria-hidden="true" /> Nueva aplicación</PrimaryButton>} />
    {error ? <ErrorNotice error={error} /> : null}
    <div className="core-toolbar"><label className="core-search"><span className="sr-only">Buscar aplicaciones</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o appKey…" /></label><span className="core-result-count">{filtered.length} aplicaciones</span></div>
    <Panel className="core-table-panel">{isLoading ? <LoadingState /> : filtered.length === 0 ? <EmptyState /> : <div className="core-table-scroll"><table className="core-table core-apps-table"><thead><tr><th>APLICACIÓN</th><th>APP KEY</th><th>ESTADO</th><th className="core-col-secondary">AUTO REGISTRO</th><th>USUARIOS</th><th className="core-col-optional">SECRET ROTADO</th><th className="core-col-optional">CREADA</th><th className="core-sticky-actions"><span className="sr-only">ACCIONES</span></th></tr></thead><tbody>{filtered.map((app) => {
      const isCore = app.appKey === RESERVED_APP_KEY
      return <tr key={app.appKey}>
        <td><div className="core-app-name"><strong title={app.name}>{app.name}</strong>{app.description && <small className="core-cell-subtitle" title={app.description}>{app.description}</small>}</div></td>
        <td><code>{app.appKey}</code></td>
        <td><StatusBadge tone={app.status === APP_STATUS.Active ? 'success' : 'warning'}>{app.status}</StatusBadge></td>
        <td className="core-col-secondary">{!isCore && app.allowSelfRegistration ? 'Permitido' : 'No permitido'}</td>
        <td><AppUserCount appKey={app.appKey} /></td>
        <td className="core-col-optional">{formatUtc(app.clientSecretRotatedAtUtc)}</td>
        <td className="core-col-optional">{formatUtc(app.createdAtUtc)}</td>
        <td className="core-sticky-actions"><RowActionsMenu label={`Acciones de ${app.name}`} actions={[
          { label: 'Editar', icon: <Pencil aria-hidden="true" />, onSelect: () => openForm(app) },
          { label: app.status === APP_STATUS.Active ? 'Suspender' : 'Activar', icon: <Power aria-hidden="true" />, onSelect: () => changeStatus(app), disabled: isCore, reason: 'La app core no se puede suspender.', danger: app.status === APP_STATUS.Active },
          { label: 'Ver auditoría', icon: <History aria-hidden="true" />, onSelect: () => router.push(appAuditHref(app.id)) },
          { label: 'Rotar secret', icon: <KeyRound aria-hidden="true" />, onSelect: () => rotateSecret(app), danger: true },
          // Para core no se muestra: la API responde 409 Applications.Reserved.
          ...(isCore ? [] : [{ label: 'Eliminar', icon: <Trash2 aria-hidden="true" />, onSelect: () => setDeleting(app), disabled: app.status !== APP_STATUS.Suspended, reason: 'Suspendé la aplicación para poder eliminarla.', danger: true }]),
        ]} /></td>
      </tr>
    })}</tbody></table></div>}</Panel>
    {formOpen && <Modal title={editing ? 'Editar aplicación' : 'Nueva aplicación'} onClose={closeForm}>
      {formLevelError(formError, APP_FIELDS) ? <ErrorNotice error={formError} /> : null}
      <form className="core-form" onSubmit={saveApp}>
        <Field label="App key" error={fieldError(formError, 'appKey')} hint={editing ? 'El identificador no se puede cambiar.' : APP_KEY_RULE}><input className="core-input" name="appKey" defaultValue={editing?.appKey ?? ''} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="Minúsculas, números y guiones" minLength={3} maxLength={50} required readOnly={Boolean(editing)} autoComplete="off" spellCheck={false} /></Field>
        <Field label="Nombre" error={fieldError(formError, 'name')}><input className="core-input" name="name" defaultValue={editing?.name ?? ''} required maxLength={100} /></Field>
        <Field label="Descripción (opcional)" error={fieldError(formError, 'description')} hint="Hasta 500 caracteres."><textarea className="core-input core-textarea" name="description" defaultValue={editing?.description ?? ''} maxLength={500} /></Field>
        <CheckRow name="allowSelfRegistration" label="Permitir auto-registro" detail={editing?.appKey === RESERVED_APP_KEY ? 'La app core no admite auto-registro.' : 'Los usuarios pueden registrarse solos en esta aplicación.'} defaultChecked={editing?.allowSelfRegistration ?? false} disabled={editing?.appKey === RESERVED_APP_KEY} />
        {!editing && <p className="core-inline-note">El client secret aparecerá una sola vez al crear la aplicación.</p>}
        <div className="core-form-actions"><SecondaryButton disabled={pending} onClick={closeForm}>Cancelar</SecondaryButton><PrimaryButton type="submit" disabled={pending}>{pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear aplicación'}</PrimaryButton></div>
      </form>
    </Modal>}
    {secret && <Modal title="Copiá el nuevo client secret" dismissible={false} onClose={() => setSecret(null)}><div className="core-one-time-secret"><p>Secret de <strong>{secret.appName}</strong>. Este valor se muestra una sola vez: copialo y guardalo en el servidor de la aplicación, no volverá a estar disponible.</p><code>{secret.value}</code><div className="core-form-actions"><PrimaryButton onClick={() => void navigator.clipboard?.writeText(secret.value).then(() => setSecretCopied(true)).catch(() => setSecretCopied(false))}><Copy aria-hidden="true" /> Copiar secret</PrimaryButton>{secretCopied && <StatusBadge tone="success"><Check aria-hidden="true" /> Copiado</StatusBadge>}<SecondaryButton onClick={() => setSecret(null)}>Ya lo guardé, cerrar</SecondaryButton></div></div></Modal>}
    {deleting && <DeleteAppModal app={deleting} onClose={() => setDeleting(null)} onChanged={() => refreshApps()} />}
  </>
}

const DELETE_USERS_PAGE_SIZE = 50

/**
 * Eliminar una aplicación: tiene que estar suspendida y sin usuarios con acceso. Si todavía tiene
 * usuarios, se listan con "Quitar acceso"; cuando no queda ninguno, se confirma escribiendo el appKey.
 */
function DeleteAppModal({ app, onClose, onChanged }: { app: CoreApp; onClose: () => void; onChanged: () => unknown }) {
  const suspended = app.status === APP_STATUS.Suspended
  const usersKey = suspended ? `api/apps/${seg(app.appKey)}/users?page=1&pageSize=${DELETE_USERS_PAGE_SIZE}` : null
  const { data: users, error, mutate: refreshUsers } = useSWR<CoreAppUserPage>(usersKey, fetcher<CoreAppUserPage>)
  const confirm = useConfirm()
  const toast = useToast()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const total = users ? toNumber(users.totalCount) : null

  async function refreshCounts() {
    await refreshUsers()
    void mutate(appUsersCountKey(app.appKey))
  }

  function removeAccess(user: CoreAppUserPage['items'][number]) {
    void confirm({
      title: 'Quitar acceso',
      message: <p>¿Quitarle a <strong>{user.fullName}</strong> ({user.email}) el acceso a <strong>{app.name}</strong>? Pierde todos sus roles en esa aplicación.</p>,
      confirmLabel: 'Quitar acceso',
      danger: true,
      action: async () => {
        await coreJson(`api/apps/${seg(app.appKey)}/users/${seg(user.userId)}`, { method: 'DELETE' })
        toast.success('Acceso quitado.')
        await refreshCounts()
      },
      errors: { messages: { 'Authorization.LastAdmin': 'No se puede quitar el acceso al último administrador activo de Core.' } },
      onError: refreshCounts,
    })
  }

  async function deleteApp() {
    if (busy || typed.trim() !== app.appKey) return
    setBusy(true)
    try {
      await coreJson(`api/apps/${seg(app.appKey)}`, { method: 'DELETE' })
      toast.success('Aplicación eliminada.')
      void mutate((key) => typeof key === 'string' && key.startsWith(`api/apps/${seg(app.appKey)}/`), undefined, { revalidate: false })
      await onChanged()
      onClose()
    } catch (caught) {
      toast.fromError(caught, { messages: { 'Applications.Reserved': 'La aplicación core no se puede eliminar.' } })
      // 409 por usuarios: se recarga la lista para mostrarlos. Cualquier otro (no existe, no está suspendida): se cierra.
      if (caught instanceof CoreApiError && caught.errorCode === 'Applications.HasUserAccesses') { setTyped(''); await refreshCounts() }
      else { await onChanged(); onClose() }
    } finally { setBusy(false) }
  }

  return <Modal title="Eliminar aplicación" onClose={() => { if (!busy) onClose() }}>
    <div className="core-form">
      <div className="core-confirm-message"><p>Vas a eliminar <strong>{app.name}</strong> (<code>{app.appKey}</code>).</p></div>
      {!suspended ? <span className="core-confirm-warning">Suspendé la aplicación para poder eliminarla.</span>
        : error ? <ErrorNotice error={error} />
        : total === null ? <LoadingState label="Revisando usuarios con acceso…" />
        : total > 0 ? <>
          <span className="core-confirm-warning">Tiene {total.toLocaleString('es-AR')} {total === 1 ? 'usuario' : 'usuarios'} con acceso. Quitá el acceso a todos los usuarios antes de eliminarla.</span>
          <div className="core-danger-apps">{users?.items.map((user) => <div key={user.userId}><span><strong>{user.fullName}</strong> <small>{user.email}</small></span><SecondaryButton onClick={() => removeAccess(user)} aria-label={`Quitar acceso a ${user.fullName}`}>Quitar acceso</SecondaryButton></div>)}</div>
          {total > DELETE_USERS_PAGE_SIZE && <p className="core-detail-note">Se muestran los primeros {DELETE_USERS_PAGE_SIZE}. La lista se actualiza a medida que quitás accesos.</p>}
        </> : <>
          <span className="core-confirm-warning">Se eliminan la aplicación, sus roles y permisos, y las sesiones abiertas. Los emails pendientes se cancelan. El historial de auditoría y de notificaciones se conserva. Esta acción no se puede deshacer.</span>
          <Field label={`Escribí ${app.appKey} para confirmar`}><input className="core-input" value={typed} autoComplete="off" spellCheck={false} onChange={(event) => setTyped(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void deleteApp() } }} /></Field>
        </>}
      <div className="core-form-actions"><SecondaryButton disabled={busy} onClick={onClose}>Cancelar</SecondaryButton><DangerButton disabled={busy || !suspended || total !== 0 || typed.trim() !== app.appKey} onClick={() => void deleteApp()}><Trash2 aria-hidden="true" /> {busy ? 'Eliminando…' : 'Eliminar aplicación'}</DangerButton></div>
    </div>
  </Modal>
}

