'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Plus, Save, ShieldCheck, Trash2 } from 'lucide-react'
import useSWR from 'swr'
import { CoreApiError, coreJson, fetcher, jsonBody, seg } from '@/lib/core-client'
import { RESERVED_APP_KEY, RESERVED_PERMISSION_KEY, RESERVED_ROLE_NAME, type CoreApp, type CoreCreatePermission, type CoreCreateRole, type CorePermission, type CoreRole, type CoreUpdatePermission, type CoreUpdateRole } from '@/lib/core-api/types'
import { CheckRow, EmptyState, ErrorNotice, Field, LoadingState, Modal, PageHeading, Panel, PrimaryButton, SecondaryButton, StatusBadge, fieldError, formLevelError, useConfirm } from './shared'
import { useToast } from './toast'
import { useUrlParams } from './url-state'

const roleId = (role: CoreRole) => role.id
// Reglas de la app reservada `core` (guía, sección 5): no se borra core.admin ni el rol admin,
// y el rol admin no puede perder core.admin. La API responde 409 Authorization.Reserved.
const isReservedRole = (appKey: string, role: CoreRole) => appKey === RESERVED_APP_KEY && role.name.toLowerCase() === RESERVED_ROLE_NAME
const isReservedPermission = (appKey: string, key: string) => appKey === RESERVED_APP_KEY && key === RESERVED_PERMISSION_KEY
const ROLE_FIELDS = ['name', 'description'] as const
const PERMISSION_FIELDS = ['key', 'description'] as const
const isNotFound = (error: unknown) => error instanceof CoreApiError && error.status === 404
const PERMISSION_KEY_RULE = <>Hasta 100 caracteres: minúsculas y números, separados por <code>.</code> <code>_</code> <code>:</code> o <code>-</code>. Ejemplo: <code>facturas.leer</code>. No se puede cambiar después de crear.</>

export function AccessControlPage() {
  const { data: apps, error: appsError } = useSWR<CoreApp[]>('api/apps', fetcher<CoreApp[]>)
  // La app seleccionada vive en la URL (?app=), así funcionan refresh, atrás/adelante y links directos.
  const [params, setParams] = useUrlParams()
  const appKey = params.get('app') ?? ''
  const selectedAppKey = appKey || apps?.[0]?.appKey || ''
  const confirm = useConfirm()
  const rolesKey = selectedAppKey ? `api/apps/${seg(selectedAppKey)}/roles` : null
  const permissionsKey = selectedAppKey ? `api/apps/${seg(selectedAppKey)}/permissions` : null
  const { data: roles, error: rolesError, mutate: refreshRoles } = useSWR<CoreRole[]>(rolesKey, fetcher<CoreRole[]>)
  const { data: permissions, error: permissionsError, mutate: refreshPermissions } = useSWR<CorePermission[]>(permissionsKey, fetcher<CorePermission[]>)
  const [editState, setEditState] = useState<Record<string, string[]>>({})
  const [roleModal, setRoleModal] = useState<CoreRole | 'new' | null>(null)
  const [permissionModal, setPermissionModal] = useState<CorePermission | 'new' | null>(null)
  // Error de un campo del modal abierto (los demás van como toast).
  const [formError, setFormError] = useState<unknown>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    if (roles) setEditState(Object.fromEntries(roles.map((role) => [roleId(role), role.permissionKeys ?? []])))
  }, [roles])

  async function saveMatrix(role: CoreRole) {
    const id = roleId(role)
    setSaving(id)
    try {
      await coreJson<CoreRole>(`api/apps/${seg(selectedAppKey)}/roles/${seg(id)}/permissions`, { method: 'PUT', ...jsonBody({ permissionKeys: editState[id] ?? [] }) })
      toast.success('Permisos del rol actualizados.')
      await refreshRoles()
    } catch (caught) {
      toast.fromError(caught, { messages: {
        'Authorization.Reserved': 'El rol admin de core tiene que conservar core.admin.',
        'Authorization.LastAdmin': 'Si se quita core.admin a este rol, Core se queda sin administradores activos.',
        'Applications.NotFound': 'El rol ya no existe.',
      } })
      if (isNotFound(caught)) void Promise.all([refreshRoles(), refreshPermissions()])
    } finally { setSaving(null) }
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const editing = roleModal !== 'new' && roleModal !== null ? roleModal : null
    const payload: CoreUpdateRole = { name: String(form.get('name')).trim(), description: String(form.get('description')).trim() || null, isDefault: form.get('isDefault') === 'on' }
    setFormError(null); setSaving('role')
    try {
      if (payload.isDefault && roles) {
        // Comportamiento del mockup: un solo rol predeterminado por app. El contrato no dice si la
        // API desmarca el anterior sola, así que se desmarca explícitamente.
        const currentDefault = roles.find((role) => role.isDefault && (!editing || roleId(role) !== roleId(editing)))
        if (currentDefault) await coreJson<CoreRole>(`api/apps/${seg(selectedAppKey)}/roles/${seg(roleId(currentDefault))}`, { method: 'PUT', ...jsonBody({ name: currentDefault.name, description: currentDefault.description, isDefault: false } satisfies CoreUpdateRole) })
      }
      if (editing) {
        await coreJson<CoreRole>(`api/apps/${seg(selectedAppKey)}/roles/${seg(roleId(editing))}`, { method: 'PUT', ...jsonBody(payload) })
        toast.success('Rol actualizado.')
      } else {
        await coreJson<CoreRole>(`api/apps/${seg(selectedAppKey)}/roles`, { method: 'POST', ...jsonBody({ ...payload, permissionKeys: [] } satisfies CoreCreateRole) })
        toast.success(payload.isDefault ? 'Rol creado. Ahora es el rol por defecto.' : 'Rol creado.')
      }
      await refreshRoles(); setRoleModal(null)
    } catch (caught) {
      toast.formError(caught, ROLE_FIELDS, setFormError, { messages: { 'Applications.NotFound': editing ? 'El rol ya no existe.' : 'La aplicación ya no existe.' } })
      if (isNotFound(caught)) { setRoleModal(null); void refreshRoles() }
    } finally { setSaving(null) }
  }

  function deleteRole(role: CoreRole) {
    if (isReservedRole(selectedAppKey, role)) return
    void confirm({
      title: 'Eliminar rol',
      message: <p>¿Eliminar el rol <strong>{role.name}</strong> de <code>{selectedAppKey}</code>? También se quita de los usuarios que lo tienen.</p>,
      confirmLabel: 'Eliminar rol',
      danger: true,
      action: async () => { await coreJson(`api/apps/${seg(selectedAppKey)}/roles/${seg(roleId(role))}`, { method: 'DELETE' }); toast.success('Rol eliminado. Se quitó a los usuarios que lo tenían.'); await refreshRoles() },
      errors: { messages: {
        'Authorization.Reserved': 'El rol admin de core no se puede eliminar.',
        'Authorization.LastAdmin': 'Si se elimina este rol, Core se queda sin administradores activos.',
        'Applications.NotFound': 'El rol ya no existe.',
      } },
      onError: () => refreshRoles(),
    })
  }

  async function savePermission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const editing = permissionModal !== 'new' && permissionModal !== null ? permissionModal : null
    const payload: CoreCreatePermission = { key: String(form.get('key')).trim(), description: String(form.get('description')).trim() || null }
    setFormError(null); setSaving('permission')
    try {
      if (editing) {
        await coreJson<CorePermission>(`api/apps/${seg(selectedAppKey)}/permissions/${seg(editing.key)}`, { method: 'PUT', ...jsonBody({ description: payload.description } satisfies CoreUpdatePermission) })
        toast.success('Permiso actualizado.')
      } else {
        await coreJson<CorePermission>(`api/apps/${seg(selectedAppKey)}/permissions`, { method: 'POST', ...jsonBody(payload) })
        toast.success('Permiso creado.')
      }
      await refreshPermissions(); setPermissionModal(null)
    } catch (caught) {
      const gone = editing ? 'El permiso o la aplicación ya no existen.' : 'La aplicación ya no existe.'
      toast.formError(caught, PERMISSION_FIELDS, setFormError, { messages: { 'Applications.NotFound': gone, 'Authorization.PermissionNotFound': gone } })
      if (isNotFound(caught)) { setPermissionModal(null); void refreshPermissions() }
    } finally { setSaving(null) }
  }

  function deletePermission(permission: CorePermission) {
    if (isReservedPermission(selectedAppKey, permission.key)) return
    void confirm({
      title: 'Eliminar permiso',
      message: <p>¿Eliminar el permiso <code>{permission.key}</code>? Se quita de todos los roles que lo incluyen.</p>,
      confirmLabel: 'Eliminar permiso',
      danger: true,
      action: async () => { await coreJson(`api/apps/${seg(selectedAppKey)}/permissions/${seg(permission.key)}`, { method: 'DELETE' }); toast.success('Permiso eliminado. Se quitó de los roles que lo tenían.'); await refreshPermissions(); await refreshRoles() },
      errors: { messages: {
        'Authorization.Reserved': 'El permiso core.admin no se puede eliminar.',
        'Applications.NotFound': 'El permiso ya no existe.',
      } },
      onError: () => Promise.all([refreshPermissions(), refreshRoles()]),
    })
  }

  const viewError = appsError ?? rolesError ?? permissionsError
  return <>
    <PageHeading eyebrow="IDENTIDAD · AUTORIZACIÓN" title="Roles y permisos" description="Configurá los permisos y la matriz de roles para una aplicación." />
    {viewError ? <ErrorNotice error={viewError} /> : null}
    <div className="core-selector-bar"><label htmlFor="app-scope">Aplicación</label><select id="app-scope" className="core-select core-app-select" value={selectedAppKey} onChange={(event) => setParams({ app: event.target.value })}><option value="" disabled>Seleccioná una aplicación</option>{apps?.map((app) => <option key={app.appKey} value={app.appKey}>{app.name} · {app.appKey}</option>)}</select><StatusBadge>{selectedAppKey || 'Sin aplicación'}</StatusBadge></div>
    {!selectedAppKey ? <EmptyState title="No hay aplicaciones disponibles" /> : !roles || !permissions ? <LoadingState /> : <div className="core-access-layout">
      <Panel className="core-permission-panel"><div className="core-panel-heading"><div><h2>Permisos</h2><p>{permissions.length} permisos de {selectedAppKey}</p></div><PrimaryButton onClick={() => { setFormError(null); setPermissionModal('new') }}><Plus aria-hidden="true" /> Crear permiso</PrimaryButton></div>{permissions.length ? <div className="core-permission-list">{permissions.map((permission) => <div className="core-permission-item" key={permission.key}><div><code>{permission.key}</code><span>{permission.description}</span></div><div><SecondaryButton onClick={() => { setFormError(null); setPermissionModal(permission) }} aria-label={`Editar permiso ${permission.key}`}>Editar</SecondaryButton><SecondaryButton disabled={isReservedPermission(selectedAppKey, permission.key)} onClick={() => deletePermission(permission)} aria-label={`Borrar permiso ${permission.key}`}><Trash2 aria-hidden="true" /> Borrar</SecondaryButton></div></div>)}</div> : <EmptyState title="No hay permisos" detail="Agregá los permisos disponibles para esta aplicación." />}</Panel>
      <Panel className="core-matrix-panel"><div className="core-panel-heading"><div><h2>Matriz rol × permiso</h2><p>Cambiá los permisos y guardá el conjunto completo por rol.</p></div><PrimaryButton onClick={() => { setFormError(null); setRoleModal('new') }}><Plus aria-hidden="true" /> Crear rol</PrimaryButton></div>{roles.length ? <div className="core-matrix-wrap"><table className="core-matrix"><thead><tr><th>ROL</th>{permissions.map((permission) => <th key={permission.key}><code title={permission.description ?? undefined}>{permission.key}</code></th>)}<th>ACCIONES</th></tr></thead><tbody>{roles.map((role) => { const id = roleId(role); const selected = editState[id] ?? []; return <tr key={id}><th><div className="core-role-name"><strong>{role.name}</strong>{role.isDefault && <StatusBadge tone="success">Default</StatusBadge>}<small>{role.description}</small></div></th>{permissions.map((permission) => <td key={permission.key}><input type="checkbox" aria-label={`${role.name}: ${permission.key}`} checked={selected.includes(permission.key)} disabled={isReservedRole(selectedAppKey, role) && isReservedPermission(selectedAppKey, permission.key)} onChange={(event) => setEditState((current) => ({ ...current, [id]: event.target.checked ? [...selected, permission.key] : selected.filter((key) => key !== permission.key) }))} /></td>)}<td><div className="core-action-group"><SecondaryButton onClick={() => { setFormError(null); setRoleModal(role) }} aria-label={`Editar rol ${role.name}`}>Editar</SecondaryButton><SecondaryButton disabled={isReservedRole(selectedAppKey, role)} onClick={() => deleteRole(role)} aria-label={`Borrar rol ${role.name}`}>Borrar</SecondaryButton><PrimaryButton disabled={saving === id || JSON.stringify(selected) === JSON.stringify(role.permissionKeys ?? [])} onClick={() => void saveMatrix(role)} aria-label={`Guardar permisos del rol ${role.name}`}><Save aria-hidden="true" /> {saving === id ? 'Guardando…' : 'Guardar'}</PrimaryButton></div></td></tr> })}</tbody></table></div> : <EmptyState title="No hay roles" detail="Creá un rol para empezar a asignar permisos." />}</Panel>
    </div>}
    {roleModal && <Modal title={roleModal === 'new' ? 'Crear rol' : 'Editar rol'} onClose={() => { if (saving !== 'role') { setRoleModal(null); setFormError(null) } }}>{formLevelError(formError, ROLE_FIELDS) ? <ErrorNotice error={formError} /> : null}<form className="core-form" onSubmit={saveRole}><Field label="Nombre" error={fieldError(formError, 'name')}><input className="core-input" name="name" defaultValue={roleModal === 'new' ? '' : roleModal.name} required maxLength={100} /></Field><Field label="Descripción" error={fieldError(formError, 'description')}><textarea className="core-input core-textarea" name="description" defaultValue={roleModal === 'new' ? '' : roleModal.description ?? ''} maxLength={500} /></Field><CheckRow name="isDefault" label="Rol predeterminado" detail="Se asigna al dar acceso a la aplicación. Solo puede haber uno por aplicación." defaultChecked={roleModal !== 'new' && roleModal.isDefault} /><div className="core-form-actions"><SecondaryButton disabled={saving === 'role'} onClick={() => { setRoleModal(null); setFormError(null) }}>Cancelar</SecondaryButton><PrimaryButton type="submit" disabled={saving === 'role'}>{saving === 'role' ? 'Guardando…' : 'Guardar rol'}</PrimaryButton></div></form></Modal>}
    {permissionModal && <Modal title={permissionModal === 'new' ? 'Crear permiso' : 'Editar permiso'} onClose={() => { if (saving !== 'permission') { setPermissionModal(null); setFormError(null) } }}>{formLevelError(formError, PERMISSION_FIELDS) ? <ErrorNotice error={formError} /> : null}<form className="core-form" onSubmit={savePermission}><Field label="Key" error={fieldError(formError, 'key')} hint={permissionModal === 'new' ? PERMISSION_KEY_RULE : 'El identificador no se puede cambiar.'}><input className="core-input" name="key" defaultValue={permissionModal === 'new' ? '' : permissionModal.key} required maxLength={100} pattern="[a-z0-9]+(?:[._:\-][a-z0-9]+)*" title="Minúsculas y números separados por . _ : o -" readOnly={permissionModal !== 'new'} autoComplete="off" spellCheck={false} /></Field><Field label="Descripción" error={fieldError(formError, 'description')}><textarea className="core-input core-textarea" name="description" defaultValue={permissionModal === 'new' ? '' : permissionModal.description ?? ''} maxLength={500} /></Field><div className="core-form-actions"><SecondaryButton disabled={saving === 'permission'} onClick={() => { setPermissionModal(null); setFormError(null) }}>Cancelar</SecondaryButton><PrimaryButton type="submit" disabled={saving === 'permission'}>{saving === 'permission' ? 'Guardando…' : 'Guardar permiso'}</PrimaryButton></div></form></Modal>}
  </>
}
