'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Plus, Save, ShieldCheck, Trash2 } from 'lucide-react'
import useSWR from 'swr'
import { coreJson, fetcher, jsonBody, seg } from '@/lib/core-client'
import { RESERVED_APP_KEY, RESERVED_PERMISSION_KEY, RESERVED_ROLE_NAME, type CoreApp, type CoreCreatePermission, type CoreCreateRole, type CorePermission, type CoreRole, type CoreUpdatePermission, type CoreUpdateRole } from '@/lib/core-api/types'
import { CheckRow, EmptyState, ErrorNotice, Field, LoadingState, Modal, PageErrorNotice, PageHeading, Panel, PrimaryButton, SecondaryButton, StatusBadge, useConfirm } from './shared'
import { useUrlParams } from './url-state'

const roleId = (role: CoreRole) => role.id
// Reglas de la app reservada `core` (guía, sección 5): no se borra core.admin ni el rol admin,
// y el rol admin no puede perder core.admin. La API responde 409 Authorization.Reserved.
const isReservedRole = (appKey: string, role: CoreRole) => appKey === RESERVED_APP_KEY && role.name.toLowerCase() === RESERVED_ROLE_NAME
const isReservedPermission = (appKey: string, key: string) => appKey === RESERVED_APP_KEY && key === RESERVED_PERMISSION_KEY
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
  const [errorAction, setErrorAction] = useState<unknown>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (roles) setEditState(Object.fromEntries(roles.map((role) => [roleId(role), role.permissionKeys ?? []])))
  }, [roles])

  async function saveMatrix(role: CoreRole) {
    const id = roleId(role)
    setSaving(id); setErrorAction(null)
    try {
      await coreJson<CoreRole>(`api/apps/${seg(selectedAppKey)}/roles/${seg(id)}/permissions`, { method: 'PUT', ...jsonBody({ permissionKeys: editState[id] ?? [] }) })
      await refreshRoles()
    } catch (caught) { setErrorAction(caught) }
    finally { setSaving(null) }
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const editing = roleModal !== 'new' && roleModal !== null ? roleModal : null
    const payload: CoreUpdateRole = { name: String(form.get('name')).trim(), description: String(form.get('description')).trim() || null, isDefault: form.get('isDefault') === 'on' }
    setErrorAction(null); setSaving('role')
    try {
      if (payload.isDefault && roles) {
        // Comportamiento del mockup: un solo rol predeterminado por app. El contrato no dice si la
        // API desmarca el anterior sola, así que se desmarca explícitamente.
        const currentDefault = roles.find((role) => role.isDefault && (!editing || roleId(role) !== roleId(editing)))
        if (currentDefault) await coreJson<CoreRole>(`api/apps/${seg(selectedAppKey)}/roles/${seg(roleId(currentDefault))}`, { method: 'PUT', ...jsonBody({ name: currentDefault.name, description: currentDefault.description, isDefault: false } satisfies CoreUpdateRole) })
      }
      if (editing) await coreJson<CoreRole>(`api/apps/${seg(selectedAppKey)}/roles/${seg(roleId(editing))}`, { method: 'PUT', ...jsonBody(payload) })
      else await coreJson<CoreRole>(`api/apps/${seg(selectedAppKey)}/roles`, { method: 'POST', ...jsonBody({ ...payload, permissionKeys: [] } satisfies CoreCreateRole) })
      await refreshRoles(); setRoleModal(null)
    } catch (caught) { setErrorAction(caught) }
    finally { setSaving(null) }
  }

  function deleteRole(role: CoreRole) {
    if (isReservedRole(selectedAppKey, role)) return
    setErrorAction(null)
    void confirm({
      title: 'Eliminar rol',
      message: <p>¿Eliminar el rol <strong>{role.name}</strong> de <code>{selectedAppKey}</code>? También se quita de los usuarios que lo tienen.</p>,
      confirmLabel: 'Eliminar rol',
      danger: true,
      action: async () => { await coreJson(`api/apps/${seg(selectedAppKey)}/roles/${seg(roleId(role))}`, { method: 'DELETE' }); await refreshRoles() },
    })
  }

  async function savePermission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const editing = permissionModal !== 'new' && permissionModal !== null ? permissionModal : null
    const payload: CoreCreatePermission = { key: String(form.get('key')).trim(), description: String(form.get('description')).trim() || null }
    setErrorAction(null); setSaving('permission')
    try {
      if (editing) await coreJson<CorePermission>(`api/apps/${seg(selectedAppKey)}/permissions/${seg(editing.key)}`, { method: 'PUT', ...jsonBody({ description: payload.description } satisfies CoreUpdatePermission) })
      else await coreJson<CorePermission>(`api/apps/${seg(selectedAppKey)}/permissions`, { method: 'POST', ...jsonBody(payload) })
      await refreshPermissions(); setPermissionModal(null)
    } catch (caught) { setErrorAction(caught) }
    finally { setSaving(null) }
  }

  function deletePermission(permission: CorePermission) {
    if (isReservedPermission(selectedAppKey, permission.key)) return
    setErrorAction(null)
    void confirm({
      title: 'Eliminar permiso',
      message: <p>¿Eliminar el permiso <code>{permission.key}</code>? Se quita de todos los roles que lo incluyen.</p>,
      confirmLabel: 'Eliminar permiso',
      danger: true,
      action: async () => { await coreJson(`api/apps/${seg(selectedAppKey)}/permissions/${seg(permission.key)}`, { method: 'DELETE' }); await refreshPermissions(); await refreshRoles() },
    })
  }

  const viewError = appsError ?? rolesError ?? permissionsError
  return <>
    <PageHeading eyebrow="IDENTIDAD · AUTORIZACIÓN" title="Roles y permisos" description="Configurá los permisos y la matriz de roles para una aplicación." />
    {viewError ? <ErrorNotice error={viewError} /> : null}<PageErrorNotice error={errorAction} onDismiss={() => setErrorAction(null)} />
    <div className="core-selector-bar"><label htmlFor="app-scope">Aplicación</label><select id="app-scope" className="core-select core-app-select" value={selectedAppKey} onChange={(event) => setParams({ app: event.target.value })}><option value="" disabled>Seleccioná una aplicación</option>{apps?.map((app) => <option key={app.appKey} value={app.appKey}>{app.name} · {app.appKey}</option>)}</select><StatusBadge>{selectedAppKey || 'Sin aplicación'}</StatusBadge></div>
    {!selectedAppKey ? <EmptyState title="No hay aplicaciones disponibles" /> : !roles || !permissions ? <LoadingState /> : <div className="core-access-layout">
      <Panel className="core-permission-panel"><div className="core-panel-heading"><div><h2>Permisos</h2><p>{permissions.length} permisos de {selectedAppKey}</p></div><PrimaryButton onClick={() => { setErrorAction(null); setPermissionModal('new') }}><Plus aria-hidden="true" /> Crear permiso</PrimaryButton></div>{permissions.length ? <div className="core-permission-list">{permissions.map((permission) => <div className="core-permission-item" key={permission.key}><div><code>{permission.key}</code><span>{permission.description}</span></div><div><SecondaryButton onClick={() => { setErrorAction(null); setPermissionModal(permission) }} aria-label={`Editar permiso ${permission.key}`}>Editar</SecondaryButton><SecondaryButton disabled={isReservedPermission(selectedAppKey, permission.key)} onClick={() => deletePermission(permission)} aria-label={`Borrar permiso ${permission.key}`}><Trash2 aria-hidden="true" /> Borrar</SecondaryButton></div></div>)}</div> : <EmptyState title="No hay permisos" detail="Agregá los permisos disponibles para esta aplicación." />}</Panel>
      <Panel className="core-matrix-panel"><div className="core-panel-heading"><div><h2>Matriz rol × permiso</h2><p>Cambiá los permisos y guardá el conjunto completo por rol.</p></div><PrimaryButton onClick={() => { setErrorAction(null); setRoleModal('new') }}><Plus aria-hidden="true" /> Crear rol</PrimaryButton></div>{roles.length ? <div className="core-matrix-wrap"><table className="core-matrix"><thead><tr><th>ROL</th>{permissions.map((permission) => <th key={permission.key}><code title={permission.description ?? undefined}>{permission.key}</code></th>)}<th>ACCIONES</th></tr></thead><tbody>{roles.map((role) => { const id = roleId(role); const selected = editState[id] ?? []; return <tr key={id}><th><div className="core-role-name"><strong>{role.name}</strong>{role.isDefault && <StatusBadge tone="success">Default</StatusBadge>}<small>{role.description}</small></div></th>{permissions.map((permission) => <td key={permission.key}><input type="checkbox" aria-label={`${role.name}: ${permission.key}`} checked={selected.includes(permission.key)} disabled={isReservedRole(selectedAppKey, role) && isReservedPermission(selectedAppKey, permission.key)} onChange={(event) => setEditState((current) => ({ ...current, [id]: event.target.checked ? [...selected, permission.key] : selected.filter((key) => key !== permission.key) }))} /></td>)}<td><div className="core-action-group"><SecondaryButton onClick={() => { setErrorAction(null); setRoleModal(role) }} aria-label={`Editar rol ${role.name}`}>Editar</SecondaryButton><SecondaryButton disabled={isReservedRole(selectedAppKey, role)} onClick={() => deleteRole(role)} aria-label={`Borrar rol ${role.name}`}>Borrar</SecondaryButton><PrimaryButton disabled={saving === id || JSON.stringify(selected) === JSON.stringify(role.permissionKeys ?? [])} onClick={() => void saveMatrix(role)} aria-label={`Guardar permisos del rol ${role.name}`}><Save aria-hidden="true" /> {saving === id ? 'Guardando…' : 'Guardar'}</PrimaryButton></div></td></tr> })}</tbody></table></div> : <EmptyState title="No hay roles" detail="Creá un rol para empezar a asignar permisos." />}</Panel>
    </div>}
    {roleModal && <Modal title={roleModal === 'new' ? 'Crear rol' : 'Editar rol'} onClose={() => { if (saving !== 'role') { setRoleModal(null); setErrorAction(null) } }}>{errorAction ? <ErrorNotice error={errorAction} /> : null}<form className="core-form" onSubmit={saveRole}><Field label="Nombre"><input className="core-input" name="name" defaultValue={roleModal === 'new' ? '' : roleModal.name} required maxLength={100} /></Field><Field label="Descripción"><textarea className="core-input core-textarea" name="description" defaultValue={roleModal === 'new' ? '' : roleModal.description ?? ''} maxLength={500} /></Field><CheckRow name="isDefault" label="Rol predeterminado" detail="Se asigna al dar acceso a la aplicación. Solo puede haber uno por aplicación." defaultChecked={roleModal !== 'new' && roleModal.isDefault} /><div className="core-form-actions"><SecondaryButton disabled={saving === 'role'} onClick={() => { setRoleModal(null); setErrorAction(null) }}>Cancelar</SecondaryButton><PrimaryButton type="submit" disabled={saving === 'role'}>{saving === 'role' ? 'Guardando…' : 'Guardar rol'}</PrimaryButton></div></form></Modal>}
    {permissionModal && <Modal title={permissionModal === 'new' ? 'Crear permiso' : 'Editar permiso'} onClose={() => { if (saving !== 'permission') { setPermissionModal(null); setErrorAction(null) } }}>{errorAction ? <ErrorNotice error={errorAction} /> : null}<form className="core-form" onSubmit={savePermission}><Field label="Key" hint={permissionModal === 'new' ? PERMISSION_KEY_RULE : 'El identificador no se puede cambiar.'}><input className="core-input" name="key" defaultValue={permissionModal === 'new' ? '' : permissionModal.key} required maxLength={100} pattern="[a-z0-9]+(?:[._:\-][a-z0-9]+)*" title="Minúsculas y números separados por . _ : o -" readOnly={permissionModal !== 'new'} autoComplete="off" spellCheck={false} /></Field><Field label="Descripción"><textarea className="core-input core-textarea" name="description" defaultValue={permissionModal === 'new' ? '' : permissionModal.description ?? ''} maxLength={500} /></Field><div className="core-form-actions"><SecondaryButton disabled={saving === 'permission'} onClick={() => { setPermissionModal(null); setErrorAction(null) }}>Cancelar</SecondaryButton><PrimaryButton type="submit" disabled={saving === 'permission'}>{saving === 'permission' ? 'Guardando…' : 'Guardar permiso'}</PrimaryButton></div></form></Modal>}
  </>
}
