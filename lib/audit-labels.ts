import type { CoreAuditRow } from './core-api/types'

// Textos legibles para los eventos de auditoría de Href.Core. El contrato publica `action`,
// `entityType` y `actorType` como `string`: estos son los valores que registra Core hoy. Si
// aparece uno nuevo, se muestra humanizado (por ejemplo, `USER_ARCHIVED` → "User archived").

const ACTIONS: Record<string, string> = {
  LOGIN_SUCCEEDED: 'Inicio de sesión',
  LOGIN_FAILED: 'Inicio de sesión fallido',
  LOGOUT: 'Cierre de sesión',
  SESSIONS_REVOKED: 'Sesiones cerradas por un administrador',
  TOKEN_REFRESHED: 'Sesión renovada',
  EMAIL_VERIFIED: 'Email verificado',
  PASSWORD_RESET_REQUESTED: 'Pedido de cambio de contraseña',
  PASSWORD_RESET: 'Contraseña restablecida',
  PASSWORD_CHANGED: 'Contraseña cambiada',
  USER_CREATED: 'Usuario creado',
  USER_REGISTERED: 'Usuario registrado',
  USER_UPDATED: 'Usuario actualizado',
  USER_EMAIL_CHANGED: 'Email de usuario cambiado',
  USER_LOCKED: 'Usuario bloqueado',
  USER_UNLOCKED: 'Usuario desbloqueado',
  APPLICATION_CREATED: 'Aplicación creada',
  APPLICATION_UPDATED: 'Aplicación actualizada',
  APPLICATION_STATUS_CHANGED: 'Estado de aplicación cambiado',
  APPLICATION_SECRET_ROTATED: 'Secret de aplicación rotado',
  ACCESS_GRANTED: 'Acceso a aplicación otorgado',
  ACCESS_REVOKED: 'Acceso a aplicación quitado',
  ACCESS_ROLES_CHANGED: 'Roles de un acceso cambiados',
  ROLE_CREATED: 'Rol creado',
  ROLE_UPDATED: 'Rol actualizado',
  ROLE_DELETED: 'Rol eliminado',
  ROLE_PERMISSIONS_CHANGED: 'Permisos de rol cambiados',
  PERMISSION_CREATED: 'Permiso creado',
  PERMISSION_UPDATED: 'Permiso actualizado',
  PERMISSION_DELETED: 'Permiso eliminado',
  TEMPLATE_CREATED: 'Template creado',
  TEMPLATE_UPDATED: 'Template actualizado',
  TEMPLATE_DELETED: 'Template eliminado',
  NOTIFICATION_QUEUED: 'Email encolado',
  NOTIFICATION_SENT: 'Email enviado',
  NOTIFICATION_FAILED: 'Email fallido',
  AUDIT_LOG_EXPORTED: 'Auditoría exportada',
}

const ENTITY_TYPES: Record<string, string> = {
  User: 'Usuario',
  Application: 'Aplicación',
  Role: 'Rol',
  Permission: 'Permiso',
  UserApplicationAccess: 'Acceso',
  EmailTemplate: 'Template',
  RefreshTokenFamily: 'Sesión',
  Notification: 'Email',
}

const ACTOR_TYPES: Record<string, string> = {
  User: 'Usuario',
  Application: 'Aplicación',
  System: 'Sistema',
  Anonymous: 'Anónimo',
}

function humanize(value: string) {
  const words = value.replace(/[._:-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase()
  return words ? words[0].toUpperCase() + words.slice(1) : value
}

export const auditActionLabel = (action: string) => ACTIONS[action] ?? humanize(action)
export const auditEntityTypeLabel = (entityType: string | null | undefined) => (entityType ? ENTITY_TYPES[entityType] ?? humanize(entityType) : '')
export const auditActorTypeLabel = (actorType: string | null | undefined) => (actorType ? ACTOR_TYPES[actorType] ?? humanize(actorType) : '')
export const AUDIT_ACTIONS = Object.keys(ACTIONS)

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null)
const record = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null)

/**
 * Nombre legible de la entidad, sacado de `newValues`/`oldValues` (Core guarda ahí el estado de la
 * entidad: email del usuario, nombre de la app, key del permiso…). `userId` queda para resolverlo
 * aparte cuando la entidad es un acceso o una sesión (solo traen el id del usuario).
 */
export function describeAuditEntity(row: CoreAuditRow): { label: string | null; userId: string | null } {
  const values = record(row.newValues) ?? record(row.oldValues) ?? {}
  switch (row.entityType) {
    case 'User':
      return { label: text(values.email) ?? text(values.fullName), userId: text(values.email) ? null : row.entityId }
    case 'Application':
      return { label: text(values.name) ?? text(values.appKey), userId: null }
    case 'Role':
      return { label: text(values.name), userId: null }
    case 'Permission':
      return { label: text(values.key), userId: null }
    case 'EmailTemplate':
      return { label: text(values.name) ?? text(values.key), userId: null }
    case 'Notification':
      return { label: text(values.templateKey) ?? text(values.subject), userId: null }
    case 'UserApplicationAccess':
    case 'RefreshTokenFamily':
      return { label: null, userId: text(values.userId) }
    default:
      return { label: null, userId: null }
  }
}
