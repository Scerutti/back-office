'use client'

import { FormEvent, useState } from 'react'
import { MailPlus, Send, ShieldCheck } from 'lucide-react'
import useSWR from 'swr'
import { coreJson, fetcher, jsonBody, seg } from '@/lib/core-client'
import { RESERVED_APP_KEY, type CoreApp, type CoreCreateUser, type CoreInviteUser, type CoreResendInvitation, type CoreRole, type CoreUser, type CoreUserDetail } from '@/lib/core-api/types'
import { DisabledReason, ErrorNotice, Field, LoadingState, Modal, PrimaryButton, SecondaryButton, StatusBadge } from './shared'

// ---------------------------------------------------------------------------------------------
// URL de la página de aceptación. Para `core` es la página pública de este panel; para las demás
// apps la escribe el admin (se recuerda por app en este navegador, solo como comodidad).
// ---------------------------------------------------------------------------------------------
export const ACCEPT_INVITATION_PATH = '/aceptar-invitacion'
const coreAcceptUrl = () => `${window.location.origin}${ACCEPT_INVITATION_PATH}`
const storageKey = (appKey: string) => `hc-accept-invitation-url:${appKey}`

function rememberedAcceptUrl(appKey: string) {
  if (appKey === RESERVED_APP_KEY) return coreAcceptUrl()
  try { return window.localStorage.getItem(storageKey(appKey)) ?? '' } catch { return '' }
}
function rememberAcceptUrl(appKey: string, url: string) {
  if (appKey === RESERVED_APP_KEY) return
  try { window.localStorage.setItem(storageKey(appKey), url) } catch { /* sin storage: no se recuerda */ }
}

const ACCEPT_URL_HINT = 'Página de esa aplicación donde el usuario elige su contraseña. El email lleva a esta URL con ?token=… agregado. El link vence en 72 horas.'
const CORE_ACCEPT_URL_HINT = 'Para core es la página de aceptación de este panel. El link vence en 72 horas.'

function AcceptUrlField({ appKey, value, onChange }: { appKey: string; value: string; onChange: (value: string) => void }) {
  const isCore = appKey === RESERVED_APP_KEY
  return <Field label="URL de la página de aceptación" hint={isCore ? CORE_ACCEPT_URL_HINT : ACCEPT_URL_HINT}><input className="core-input" type="url" name="acceptInvitationUrl" value={value} readOnly={isCore} required maxLength={2048} placeholder="https://mi-app.example.com/aceptar-invitacion" autoComplete="off" spellCheck={false} onChange={(event) => onChange(event.target.value)} /></Field>
}

export function RoleCheckboxes({ roles, selected, onChange, lockedReason }: { roles: CoreRole[]; selected: string[]; onChange: (next: string[]) => void; lockedReason?: (role: CoreRole) => string | null }) {
  if (!roles.length) return <p className="core-detail-note">Esta aplicación no tiene roles.</p>
  return <div className="core-role-checkboxes">{roles.map((role) => {
    const reason = lockedReason?.(role) ?? null
    const box = <label key={role.id}><input type="checkbox" checked={selected.includes(role.id)} disabled={Boolean(reason)} aria-label={`Rol ${role.name}${role.isDefault ? ' (predeterminado)' : ''}`} onChange={(event) => onChange(event.target.checked ? [...selected, role.id] : selected.filter((value) => value !== role.id))} /><span>{role.name}{role.isDefault && <small>Predeterminado</small>}</span></label>
    return reason ? <DisabledReason key={role.id} reason={reason}>{box}</DisabledReason> : box
  })}</div>
}

// ---------------------------------------------------------------------------------------------
// Crear usuario: invitar por mail (por defecto) o crear con contraseña.
// ---------------------------------------------------------------------------------------------
type Mode = 'invite' | 'password'

export function CreateUserModal({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => Promise<unknown> | void }) {
  const [mode, setMode] = useState<Mode>('invite')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const close = () => { if (!busy) onClose() }

  async function run(action: () => Promise<string>) {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const message = await action()
      await onDone(message)
    } catch (caught) {
      setError(caught)
      setBusy(false)
    }
  }

  return <Modal title="Crear usuario" onClose={close}>
    {error ? <ErrorNotice error={error} /> : null}
    <div className="core-segmented" role="radiogroup" aria-label="Cómo crear el usuario">
      {([['invite', 'Invitar por mail'], ['password', 'Crear con contraseña']] as const).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={mode === value} className={mode === value ? 'is-active' : ''} disabled={busy} onClick={() => { setMode(value); setError(null) }}>{label}</button>)}
    </div>
    {mode === 'invite' ? <InviteForm busy={busy} onCancel={close} onSubmit={run} /> : <PasswordForm busy={busy} onCancel={close} onSubmit={run} />}
  </Modal>
}

type FormProps = { busy: boolean; onCancel: () => void; onSubmit: (action: () => Promise<string>) => void }

function PasswordForm({ busy, onCancel, onSubmit }: FormProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload: CoreCreateUser = { email: String(form.get('email')).trim(), fullName: String(form.get('fullName')).trim(), password: String(form.get('password')) }
    onSubmit(async () => {
      await coreJson<CoreUser>('api/users', { method: 'POST', ...jsonBody(payload) })
      return `Usuario ${payload.email} creado.`
    })
  }
  return <form className="core-form" onSubmit={submit}>
    <Field label="Email"><input type="email" name="email" className="core-input" autoComplete="off" required maxLength={320} /></Field>
    <Field label="Nombre completo"><input name="fullName" className="core-input" required maxLength={200} /></Field>
    <Field label="Contraseña inicial" hint="Entre 10 y 128 caracteres. La cuenta se crea con el email verificado."><input type="password" name="password" className="core-input" autoComplete="new-password" required minLength={10} maxLength={128} /></Field>
    <div className="core-inline-note"><ShieldCheck aria-hidden="true" /> No se envía ningún correo: pasale la contraseña al usuario por un canal seguro.</div>
    <div className="core-form-actions"><SecondaryButton disabled={busy} onClick={onCancel}>Cancelar</SecondaryButton><PrimaryButton type="submit" disabled={busy}>{busy ? 'Creando…' : 'Crear usuario'}</PrimaryButton></div>
  </form>
}

function InviteForm({ busy, onCancel, onSubmit }: FormProps) {
  const { data: apps, error: appsError } = useSWR<CoreApp[]>('api/apps', fetcher<CoreApp[]>)
  const [appKey, setAppKey] = useState('')
  const [acceptUrl, setAcceptUrl] = useState('')
  const [roleIds, setRoleIds] = useState<string[] | null>(null)
  const { data: roles, error: rolesError } = useSWR<CoreRole[]>(appKey ? `api/apps/${seg(appKey)}/roles` : null, fetcher<CoreRole[]>)
  // Hasta que el admin toque los roles, se usa el predeterminado de la app.
  const selectedRoles = roleIds ?? roles?.filter((role) => role.isDefault).map((role) => role.id) ?? []

  function chooseApp(next: string) {
    setAppKey(next); setRoleIds(null); setAcceptUrl(next ? rememberedAcceptUrl(next) : '')
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!appKey || !roles) return
    const form = new FormData(event.currentTarget)
    const payload: CoreInviteUser = { email: String(form.get('email')).trim(), fullName: String(form.get('fullName')).trim(), appKey, roleIds: selectedRoles, acceptInvitationUrl: acceptUrl.trim() }
    onSubmit(async () => {
      await coreJson<CoreUser>('api/users/invitations', { method: 'POST', ...jsonBody(payload) })
      rememberAcceptUrl(appKey, payload.acceptInvitationUrl ?? '')
      return `Invitación enviada a ${payload.email}. El link vence en 72 horas.`
    })
  }

  return <form className="core-form" onSubmit={submit}>
    <Field label="Email"><input type="email" name="email" className="core-input" autoComplete="off" required maxLength={320} /></Field>
    <Field label="Nombre completo"><input name="fullName" className="core-input" required maxLength={200} /></Field>
    {appsError ? <ErrorNotice error={appsError} /> : null}
    <Field label="Aplicación" hint="El usuario recibe acceso a esta aplicación y el email lo lleva a su página de aceptación."><select className="core-input" value={appKey} required onChange={(event) => chooseApp(event.target.value)}><option value="">Seleccioná una aplicación</option>{apps?.map((app) => <option key={app.appKey} value={app.appKey}>{app.name} · {app.appKey}</option>)}</select></Field>
    {appKey && <div className="core-field"><span className="core-field-label">Roles</span>{rolesError ? <ErrorNotice error={rolesError} /> : roles ? <RoleCheckboxes roles={roles} selected={selectedRoles} onChange={setRoleIds} /> : <LoadingState label="Cargando roles…" />}{roles?.some((role) => role.isDefault) && <small>El rol predeterminado ya viene tildado.</small>}</div>}
    {appKey && <AcceptUrlField appKey={appKey} value={acceptUrl} onChange={setAcceptUrl} />}
    <div className="core-inline-note"><MailPlus aria-hidden="true" /> El usuario se crea sin contraseña y con el email sin verificar. Recibe un link para elegir su contraseña.</div>
    <div className="core-form-actions"><SecondaryButton disabled={busy} onClick={onCancel}>Cancelar</SecondaryButton><PrimaryButton type="submit" disabled={busy || !appKey || !roles}>{busy ? 'Enviando…' : 'Enviar invitación'}</PrimaryButton></div>
  </form>
}

// ---------------------------------------------------------------------------------------------
// Detalle de usuario: invitación pendiente (email sin verificar) y reenvío.
// ---------------------------------------------------------------------------------------------
export function PendingInvitation({ user, onError, onSent }: { user: CoreUserDetail; onError: (error: unknown) => void; onSent: (message: string) => void }) {
  const applications = user.applications ?? []
  const initialApp = applications.find((app) => app.appKey === RESERVED_APP_KEY)?.appKey ?? applications[0]?.appKey ?? ''
  const [appKey, setAppKey] = useState(initialApp)
  const [acceptUrl, setAcceptUrl] = useState(() => (initialApp ? rememberedAcceptUrl(initialApp) : ''))
  const [busy, setBusy] = useState(false)

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !appKey) return
    setBusy(true); onError(null)
    try {
      const body: CoreResendInvitation = { appKey, acceptInvitationUrl: acceptUrl.trim() }
      await coreJson(`api/users/${seg(user.id)}/invitations`, { method: 'POST', ...jsonBody(body) })
      rememberAcceptUrl(appKey, acceptUrl.trim())
      onSent(`Invitación reenviada a ${user.email}. Los links anteriores dejaron de funcionar.`)
    } catch (caught) { onError(caught) }
    finally { setBusy(false) }
  }

  return <section className="core-detail-section"><div className="core-section-title"><div><h3>Invitación pendiente</h3><p>El usuario todavía no eligió su contraseña ni verificó su email.</p></div><StatusBadge tone="warning">Pendiente</StatusBadge></div>
    {!applications.length ? <p className="core-detail-note">No tiene acceso a ninguna aplicación. Para reenviar la invitación, primero dale acceso a una.</p> : <form className="core-form" onSubmit={resend}>
      <Field label="Aplicación" hint="El link lleva a la página de aceptación de esta aplicación."><select className="core-input" value={appKey} onChange={(event) => { setAppKey(event.target.value); setAcceptUrl(rememberedAcceptUrl(event.target.value)) }}>{applications.map((app) => <option key={app.appKey} value={app.appKey}>{app.name} · {app.appKey}</option>)}</select></Field>
      <AcceptUrlField appKey={appKey} value={acceptUrl} onChange={setAcceptUrl} />
      <div className="core-form-actions"><PrimaryButton type="submit" disabled={busy || !acceptUrl.trim()}><Send aria-hidden="true" /> {busy ? 'Reenviando…' : 'Reenviar invitación'}</PrimaryButton></div>
    </form>}
  </section>
}
