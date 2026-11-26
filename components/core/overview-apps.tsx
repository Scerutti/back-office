'use client'

import { FormEvent, useMemo, useState } from 'react'
import { Activity, AppWindow, Check, Copy, KeyRound, Plus, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import useSWR, { mutate } from 'swr'
import { coreJson, CoreApiError, fetcher, jsonBody, seg } from '@/lib/core-client'
import { APP_STATUS, RESERVED_APP_KEY, toNumber, type CoreApp, type CoreAppCreated, type CoreAppUserPage, type CoreAuditPage, type CoreCreateApp, type CoreHealth, type CoreRotateSecret, type CoreUpdateApp, type CoreUserPage } from '@/lib/core-api/types'
import { EmptyState, ErrorNotice, Field, LoadingState, Modal, PageHeading, Panel, PrimaryButton, SecondaryButton, StatusBadge } from './shared'

// GET /health responde 503 con { status: "Unhealthy", database: "Unhealthy" } si la base no contesta.
async function fetchHealth(): Promise<CoreHealth> {
  try {
    return await coreJson<CoreHealth>('health')
  } catch (error) {
    if (error instanceof CoreApiError && error.status === 503 && error.errorCode === 'Http.503') return { status: 'Unhealthy', database: 'Unhealthy' }
    throw error
  }
}

export function OverviewPage() {
  const health = useSWR<CoreHealth>('health', fetchHealth)
  const apps = useSWR<CoreApp[]>('api/apps', fetcher<CoreApp[]>)
  const users = useSWR<CoreUserPage>('api/users?pageSize=1', fetcher<CoreUserPage>)
  const audit = useSWR<CoreAuditPage>('api/audit-logs?pageSize=10', fetcher<CoreAuditPage>)
  const errors = [health.error, apps.error, users.error, audit.error].filter(Boolean)
  if (!health.data || !apps.data || !users.data || !audit.data) {
    return <><PageHeading eyebrow="SISTEMA · RESUMEN" title="Resumen general" description="Estado actual y actividad reciente de HREF Core." />{errors.map((error, index) => <ErrorNotice key={index} error={error} />)}{errors.length ? <EmptyState title="Resumen incompleto" detail="No se pudieron cargar todos los datos reales de HREF Core." /> : <LoadingState />}</>
  }

  return <>
    <PageHeading eyebrow="SISTEMA · RESUMEN" title="Resumen general" description="Estado actual y actividad reciente de HREF Core." />
    {errors.map((error, index) => <ErrorNotice key={index} error={error} />)}
    <>
      <div className="core-summary-grid">
        <Panel className="core-summary-card"><div className="core-summary-label"><Activity aria-hidden="true" /> Estado general</div><div className="core-summary-value"><StatusBadge tone={health.data.status === 'Healthy' ? 'success' : 'danger'}>{health.data.status}</StatusBadge></div><p>Base de datos: <StatusBadge tone={health.data.database === 'Healthy' ? 'success' : 'danger'}>{health.data.database}</StatusBadge></p></Panel>
        <Panel className="core-summary-card"><div className="core-summary-label"><AppWindow aria-hidden="true" /> Aplicaciones</div><div className="core-summary-value">{apps.data.length}</div><p>Aplicaciones registradas en Core</p></Panel>
        <Panel className="core-summary-card"><div className="core-summary-label"><Users aria-hidden="true" /> Usuarios</div><div className="core-summary-value">{toNumber(users.data.totalCount).toLocaleString('es-AR')}</div><p>Identidades globales</p></Panel>
      </div>
      <Panel className="core-recent-panel"><div className="core-panel-heading"><div><h2>Actividad reciente</h2><p>Últimos eventos registrados en auditoría</p></div><button type="button" className="core-icon-button" aria-label="Actualizar actividad" onClick={() => void mutate('api/audit-logs?pageSize=10')}><RefreshCw aria-hidden="true" /></button></div>
        {!audit.data.items.length ? <EmptyState title="Todavía no hay actividad" detail="Los eventos aparecerán cuando Core registre auditoría." /> : <div className="core-recent-list">{audit.data.items.map((event, index) => <div className="core-recent-row" key={`${event.correlationId}-${index}`}><div className="core-recent-icon"><Activity aria-hidden="true" /></div><div className="core-recent-main"><strong>{event.action}</strong><span>{event.actorType}{event.actorId ? ` · ${event.actorId}` : ''}{event.entityType ? ` · ${event.entityType} ${event.entityId ?? ''}` : ''}</span></div><div className="core-recent-meta"><code>{event.appKey || '—'}</code><time>{formatUtc(event.occurredAtUtc)}</time></div></div>)}</div>}
      </Panel>
    </>
  </>
}

export function formatUtc(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return '—'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) + ' UTC'
}

function AppUserCount({ appKey }: { appKey: string }) {
  const { data, error } = useSWR<CoreAppUserPage>(`api/apps/${seg(appKey)}/users?pageSize=1`, fetcher<CoreAppUserPage>)
  if (error instanceof CoreApiError) return <span className="core-inline-api-error" title={error.message}>Error · {error.errorCode} · {error.correlationId}</span>
  if (error) return <span>—</span>
  return <span>{data ? toNumber(data.totalCount).toLocaleString('es-AR') : '…'}</span>
}

export function AppsPage() {
  const { data: apps, error, isLoading, mutate: refreshApps } = useSWR<CoreApp[]>('api/apps', fetcher<CoreApp[]>)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<CoreApp | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [secretCopied, setSecretCopied] = useState(false)
  const [errorAction, setErrorAction] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const filtered = useMemo(() => (apps ?? []).filter((app) => `${app.name} ${app.appKey}`.toLowerCase().includes(search.toLowerCase())), [apps, search])

  async function saveApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const appKey = String(form.get('appKey') ?? '').trim()
    const payload: CoreCreateApp = {
      appKey,
      name: String(form.get('name') ?? '').trim(),
      description: String(form.get('description') ?? '').trim() || null,
      allowSelfRegistration: appKey === RESERVED_APP_KEY ? false : form.get('allowSelfRegistration') === 'on',
    }
    setPending(true); setErrorAction(null)
    try {
      if (editing) {
        const update: CoreUpdateApp = { name: payload.name, description: payload.description, allowSelfRegistration: payload.allowSelfRegistration }
        await coreJson<CoreApp>(`api/apps/${seg(editing.appKey)}`, { method: 'PUT', ...jsonBody(update) })
      } else {
        // 201 trae clientSecret: se muestra UNA sola vez en el modal y no se guarda en ningún lado.
        const result = await coreJson<CoreAppCreated>('api/apps', { method: 'POST', ...jsonBody(payload) })
        setSecret(result.clientSecret); setSecretCopied(false)
      }
      await refreshApps()
      setFormOpen(false)
    } catch (caught) { setErrorAction(caught) }
    finally { setPending(false) }
  }

  async function changeStatus(app: CoreApp) {
    if (app.appKey === RESERVED_APP_KEY) return
    const nextStatus = app.status === APP_STATUS.Active ? APP_STATUS.Suspended : APP_STATUS.Active
    if (!window.confirm(`${nextStatus === APP_STATUS.Suspended ? 'Suspender' : 'Activar'} ${app.name}?`)) return
    setErrorAction(null)
    try {
      await coreJson<CoreApp>(`api/apps/${seg(app.appKey)}/status`, { method: 'PATCH', ...jsonBody({ status: nextStatus }) })
      await refreshApps()
    } catch (caught) { setErrorAction(caught) }
  }

  async function rotateSecret(app: CoreApp) {
    const coreWarning = app.appKey === RESERVED_APP_KEY
      ? '\n\nATENCIÓN: es la app core. Este panel usa ese secreto (CORE_APP_SECRET): hasta que actualices la variable de entorno del servidor nadie va a poder iniciar sesión.'
      : ''
    if (!window.confirm(`Rotar el secret de ${app.name}? El secret anterior dejará de funcionar inmediatamente.${coreWarning}`)) return
    setErrorAction(null)
    try {
      const result = await coreJson<CoreRotateSecret>(`api/apps/${seg(app.appKey)}/secret/rotate`, { method: 'POST' })
      setSecret(result.clientSecret); setSecretCopied(false)
      await refreshApps()
    } catch (caught) { setErrorAction(caught) }
  }

  return <>
    <PageHeading eyebrow="IDENTIDAD · CLIENTES" title="Aplicaciones" description="Administrá las aplicaciones conectadas a HREF Core." action={<PrimaryButton onClick={() => { setEditing(null); setErrorAction(null); setFormOpen(true) }}><Plus aria-hidden="true" /> Nueva aplicación</PrimaryButton>} />
    {error ? <ErrorNotice error={error} /> : null}{errorAction ? <ErrorNotice error={errorAction} onDismiss={() => setErrorAction(null)} /> : null}
    <div className="core-toolbar"><label className="core-search"><span className="sr-only">Buscar aplicaciones</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o appKey…" /></label><span className="core-result-count">{filtered.length} aplicaciones</span></div>
    <Panel className="core-table-panel">{isLoading ? <LoadingState /> : filtered.length === 0 ? <EmptyState /> : <div className="core-table-scroll"><table className="core-table"><thead><tr><th>APLICACIÓN</th><th>APP KEY</th><th>ESTADO</th><th>AUTO REGISTRO</th><th>USUARIOS</th><th>SECRET ROTADO</th><th>CREADA</th><th>ACCIONES</th></tr></thead><tbody>{filtered.map((app) => <tr key={app.appKey}><td><strong>{app.name}</strong>{app.description && <small className="core-cell-subtitle">{app.description}</small>}</td><td><code>{app.appKey}</code></td><td><StatusBadge tone={app.status === APP_STATUS.Active ? 'success' : 'warning'}>{app.status}</StatusBadge></td><td>{app.appKey === RESERVED_APP_KEY ? 'No permitido' : app.allowSelfRegistration ? 'Permitido' : 'No permitido'}</td><td><AppUserCount appKey={app.appKey} /></td><td>{formatUtc(app.clientSecretRotatedAtUtc)}</td><td>{formatUtc(app.createdAtUtc)}</td><td><div className="core-action-group"><SecondaryButton onClick={() => { setEditing(app); setErrorAction(null); setFormOpen(true) }}>Editar</SecondaryButton><SecondaryButton onClick={() => void changeStatus(app)} disabled={app.appKey === RESERVED_APP_KEY}>{app.status === APP_STATUS.Active ? 'Suspender' : 'Activar'}</SecondaryButton><SecondaryButton onClick={() => void rotateSecret(app)}><KeyRound aria-hidden="true" /> Rotar secret</SecondaryButton></div></td></tr>)}</tbody></table></div>}</Panel>
    {formOpen && <Modal title={editing ? 'Editar aplicación' : 'Nueva aplicación'} onClose={() => { if (!pending) setFormOpen(false) }}>
      {errorAction ? <ErrorNotice error={errorAction} /> : null}
      <form className="core-form" onSubmit={saveApp}>
        <Field label="App key" hint={editing ? 'El identificador no se puede cambiar.' : 'Slug en minúsculas con guiones; queda fijo al crear.'}><input className="core-input" name="appKey" defaultValue={editing?.appKey ?? ''} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" minLength={3} maxLength={50} required readOnly={Boolean(editing)} /></Field>
        <Field label="Nombre"><input className="core-input" name="name" defaultValue={editing?.name ?? ''} required maxLength={120} /></Field>
        <Field label="Descripción (opcional)"><textarea className="core-input core-textarea" name="description" defaultValue={editing?.description ?? ''} maxLength={500} /></Field>
        <label className="core-check-row"><input type="checkbox" name="allowSelfRegistration" defaultChecked={editing?.allowSelfRegistration ?? false} disabled={editing?.appKey === RESERVED_APP_KEY} /><span><strong>Permitir auto-registro</strong><small>La app core no admite auto-registro.</small></span></label>
        {!editing && <p className="core-inline-note">El client secret aparecerá una sola vez al crear la aplicación.</p>}
        <div className="core-form-actions"><SecondaryButton onClick={() => setFormOpen(false)}>Cancelar</SecondaryButton><PrimaryButton type="submit" disabled={pending}>{pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear aplicación'}</PrimaryButton></div>
      </form>
    </Modal>}
    {secret && <Modal title="Copiá el nuevo client secret" onClose={() => setSecret(null)}><div className="core-one-time-secret"><p>Este valor se muestra una sola vez. Copialo y guardalo en el servidor de la aplicación; no volverá a estar disponible.</p><code>{secret}</code><PrimaryButton onClick={() => void navigator.clipboard?.writeText(secret).then(() => setSecretCopied(true)).catch(() => setSecretCopied(false))}><Copy aria-hidden="true" /> Copiar secret</PrimaryButton>{secretCopied && <StatusBadge tone="success"><Check aria-hidden="true" /> Copiado</StatusBadge>}</div></Modal>}
  </>
}
