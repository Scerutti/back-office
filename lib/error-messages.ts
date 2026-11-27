import { CoreApiError } from './core-client'

// Mensajes y tipo de aviso por `errorCode` (anexo de toasts de Core, "Reglas generales").
// Se decide primero por el status y después por el `errorCode`; nunca por `title` ni `detail`.

export type Tone = 'success' | 'info' | 'warning' | 'error'

/** Textos y tonos propios de una llamada, para los códigos cuyo texto cambia según el endpoint. */
export type ErrorOverrides = { messages?: Record<string, string>; tones?: Record<string, Tone> }

const MESSAGES: Record<string, string> = {
  // Auth (login / refresh / sesión)
  'Auth.InvalidCredentials': 'Email o contraseña incorrectos.',
  'Auth.UserLocked': 'Tu usuario está bloqueado. Contactá a un administrador.',
  'Auth.EmailNotVerified': 'Tenés que verificar tu email antes de ingresar.',
  'Auth.NoAccessToApplication': 'Tu usuario no tiene acceso al backoffice.',
  'Auth.AdminRequired': 'No tenés permisos de administrador.',
  'Auth.InvalidToken': 'Tu sesión expiró. Ingresá de nuevo.',
  'Auth.InvalidRefreshToken': 'Tu sesión expiró. Ingresá de nuevo.',
  'Auth.RefreshTokenExpired': 'Tu sesión expiró. Ingresá de nuevo.',
  'Auth.RefreshTokenRevoked': 'Tu sesión expiró. Ingresá de nuevo.',
  'Auth.RefreshTokenReused': 'Por seguridad cerramos tu sesión. Ingresá de nuevo.',
  'Auth.InvalidAppCredentials': 'El servidor del panel no tiene bien configuradas las credenciales de la app core.',
  'Auth.ApplicationSuspended': 'El backoffice está deshabilitado.',
  'Auth.InvalidCallbackUrl': 'No se pudo generar el link: la URL de la página de aceptación no es válida (tiene que ser una URL completa, http o https).',
  'Auth.InvalidOneTimeToken': 'La invitación es inválida, venció o ya fue usada. Pedile a un administrador que te la reenvíe.',
  'RateLimit.Exceeded': 'Demasiados intentos.',
  'Request.TooLarge': 'El contenido es demasiado grande.',
  // Aplicaciones
  'Applications.InvalidAppKey': 'El key debe tener de 3 a 50 caracteres: minúsculas, números y guiones.',
  'Applications.InvalidName': 'El nombre es obligatorio, de hasta 100 caracteres.',
  'Applications.InvalidDescription': 'La descripción puede tener hasta 500 caracteres.',
  'Applications.InvalidStatus': 'Estado de aplicación inválido.',
  'Applications.AppKeyTaken': 'Ya existe una aplicación con ese key.',
  'Applications.NotFound': 'La aplicación ya no existe.',
  'Applications.AlreadyActive': 'La aplicación ya estaba en ese estado.',
  'Applications.AlreadySuspended': 'La aplicación ya estaba en ese estado.',
  'Applications.Reserved': 'La aplicación core está reservada: no se puede suspender, eliminar ni abrir al autorregistro.',
  'Applications.DeleteRequiresSuspended': 'Suspendé la aplicación antes de eliminarla.',
  'Applications.HasUserAccesses': 'Quitá el acceso a todos los usuarios antes de eliminarla.',
  // Permisos, roles y accesos
  'Authorization.LastAdmin': 'No se puede: Core se quedaría sin administradores activos.',
  'Authorization.InvalidPermissionKey': 'El key debe ser en minúsculas, por ejemplo orders.read, de hasta 100 caracteres.',
  'Authorization.InvalidDescription': 'La descripción puede tener hasta 500 caracteres.',
  'Authorization.PermissionKeyTaken': 'Ya existe un permiso con ese key en esta aplicación.',
  'Authorization.PermissionNotFound': 'El permiso ya no existe.',
  'Authorization.InvalidRoleName': 'El nombre es obligatorio, de una línea y de hasta 100 caracteres.',
  'Authorization.RoleNameTaken': 'Ya existe un rol con ese nombre. No se distinguen mayúsculas.',
  'Authorization.RoleNotFound': 'El rol ya no existe.',
  'Authorization.InvalidPermissionKeys': 'La lista de permisos no es válida.',
  'Authorization.UnknownPermissions': 'Algunos permisos ya no existen. Refrescá.',
  'Authorization.InvalidRoleIds': 'La lista de roles no es válida.',
  'Authorization.UnknownRoles': 'Alguno de los roles ya no existe. Refrescá y volvé a elegir.',
  'Authorization.AccessAlreadyGranted': 'Otro administrador le dio acceso al mismo tiempo. Refrescá.',
  'Authorization.AccessNotFound': 'El usuario ya no tenía acceso.',
  'Authorization.Reserved': 'El permiso core.admin y el rol admin de core están reservados.',
  'Authorization.InvalidPage': 'Página inválida.',
  'Authorization.InvalidPageSize': 'Tamaño de página inválido.',
  // Usuarios
  'Users.InvalidEmail': 'Email inválido.',
  'Users.InvalidFullName': 'El nombre es obligatorio, de una sola línea y de hasta 150 caracteres.',
  'Users.WeakPassword': 'La contraseña debe tener entre 10 y 128 caracteres.',
  'Users.EmailTaken': 'Ya existe un usuario con ese email.',
  'Users.NotFound': 'El usuario ya no existe.',
  'Users.InvalidLockReason': 'El motivo puede tener hasta 500 caracteres.',
  'Users.AlreadyLocked': 'El usuario ya estaba bloqueado.',
  'Users.NotLocked': 'El usuario no estaba bloqueado.',
  'Users.EmailAlreadyVerified': 'El usuario ya activó su cuenta.',
  'Users.InvalidSearch': 'La búsqueda debe ser de una línea y de hasta 254 caracteres.',
  'Users.InvalidStatus': 'Estado de usuario inválido.',
  'Users.InvalidPage': 'Página inválida.',
  'Users.InvalidPageSize': 'Tamaño de página inválido.',
  'Users.DeleteRequiresLocked': 'Bloqueá al usuario antes de eliminarlo.',
  'Users.HasApplicationAccesses': 'Quitale el acceso a todas las aplicaciones antes de eliminarlo.',
  // Templates
  'Templates.InvalidKey': 'El key debe ser un slug en minúsculas.',
  'Templates.InvalidName': 'El nombre no es válido.',
  'Templates.InvalidDescription': 'La descripción no es válida.',
  'Templates.InvalidSubject': 'El asunto no es válido.',
  'Templates.InvalidHtmlBody': 'El cuerpo no es válido.',
  'Templates.InvalidTextBody': 'El cuerpo no es válido.',
  'Templates.ContentTooLarge': 'El contenido es demasiado grande.',
  'Templates.KeyTaken': 'Ya existe un template con ese key.',
  'Templates.NotFound': 'El template ya no existe.',
  'Templates.SystemTemplate': 'Los templates de sistema no se pueden eliminar.',
  'Templates.MissingRequiredPlaceholders': 'Faltan variables obligatorias del template de sistema.',
  'Templates.UnknownPlaceholders': 'El template usa variables que no existen.',
  'Templates.SystemTemplateNotRenderable': 'El template de sistema no se puede renderizar con estos cambios.',
  'Templates.MissingVariables': 'Completá todas las variables para la vista previa.',
  'Templates.DuplicateVariables': 'Hay variables repetidas.',
  'Templates.RenderedContentTooLarge': 'El resultado es demasiado grande.',
  // Auditoría
  'AuditLogs.InvalidPage': 'Página inválida.',
  'AuditLogs.InvalidPageSize': 'Tamaño de página inválido.',
  'AuditLogs.InvalidDate': 'Fecha inválida.',
  'AuditLogs.InvalidRange': 'La fecha "desde" tiene que ser anterior o igual a "hasta".',
  'AuditLogs.InvalidActorType': 'Hay un filtro inválido.',
  'AuditLogs.InvalidApplicationId': 'Hay un filtro inválido.',
  'AuditLogs.InvalidFilter': 'Hay un filtro inválido.',
  'AuditLogs.InvalidFormat': 'Formato de exportación inválido.',
  'AuditLogs.ExportTooLarge': 'La exportación supera el máximo de filas. Acotá el rango de fechas o los filtros.',
  // Errores del propio BFF
  'Bff.NotConfigured': 'Falta configurar CORE_API_URL y CORE_APP_SECRET en el servidor del panel.',
  'Bff.CoreUnavailable': 'No se pudo conectar con Href.Core. Probá de nuevo.',
  'Bff.InvalidUpstreamResponse': 'Href.Core devolvió una respuesta inesperada.',
  'Bff.SessionRequired': 'Tu sesión expiró. Ingresá de nuevo.',
  'Bff.InvalidOrigin': 'Solicitud rechazada por origen inválido.',
  'Bff.InvalidRequest': 'Los datos enviados no son válidos.',
  Validation: 'Los datos enviados no son válidos.',
}

/**
 * Tono por código cuando no es el que corresponde a su status (404/409/429 → warning, el resto →
 * error): los "ya estaba así" son info y algunos 400 que el usuario resuelve refrescando, warning.
 */
const TONES: Record<string, Tone> = {
  'Auth.EmailNotVerified': 'warning',
  'Auth.InvalidToken': 'info',
  'Auth.InvalidRefreshToken': 'info',
  'Auth.RefreshTokenExpired': 'info',
  'Auth.RefreshTokenRevoked': 'info',
  'Auth.RefreshTokenReused': 'warning',
  'Bff.SessionRequired': 'info',
  'Users.AlreadyLocked': 'info',
  'Users.NotLocked': 'info',
  'Users.EmailAlreadyVerified': 'info',
  'Applications.AlreadyActive': 'info',
  'Applications.AlreadySuspended': 'info',
  'Authorization.AccessAlreadyGranted': 'info',
  'Authorization.AccessNotFound': 'info',
  'Authorization.UnknownRoles': 'warning',
  'Authorization.UnknownPermissions': 'warning',
  'Templates.MissingRequiredPlaceholders': 'warning',
  'Templates.UnknownPlaceholders': 'warning',
  'Templates.MissingVariables': 'warning',
  'AuditLogs.ExportTooLarge': 'warning',
}

/** Códigos que corresponden a un campo del formulario: se muestran debajo del campo, no como toast. */
const FIELDS: Record<string, string> = {
  'Users.InvalidEmail': 'email',
  'Users.InvalidFullName': 'fullName',
  'Users.WeakPassword': 'password',
  'Users.InvalidLockReason': 'reason',
  'Users.InvalidSearch': 'search',
  'Applications.InvalidAppKey': 'appKey',
  'Applications.InvalidName': 'name',
  'Applications.InvalidDescription': 'description',
  'Authorization.InvalidPermissionKey': 'key',
  'Authorization.InvalidDescription': 'description',
  'Authorization.InvalidRoleName': 'name',
  'Templates.InvalidKey': 'key',
  'Templates.InvalidName': 'name',
  'Templates.InvalidDescription': 'description',
  'Templates.InvalidSubject': 'subject',
  'Templates.InvalidHtmlBody': 'htmlBody',
  'Templates.InvalidTextBody': 'textBody',
  'AuditLogs.InvalidDate': 'from',
  'AuditLogs.InvalidRange': 'from',
}

function retrySeconds(error: CoreApiError) {
  const value = error.retryAfter ?? ''
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds)
  const date = Date.parse(value)
  return date > Date.now() ? Math.ceil((date - Date.now()) / 1000) : 0
}

export function errorMessage(error: unknown, overrides?: ErrorOverrides): string {
  if (!(error instanceof CoreApiError)) return 'Ocurrió un error inesperado. Probá de nuevo.'
  const custom = overrides?.messages?.[error.errorCode]
  if (custom) return custom
  if (error.errorCode === 'RateLimit.Exceeded') {
    const seconds = retrySeconds(error)
    return seconds ? `Demasiados intentos. Probá de nuevo en ${seconds} segundos.` : 'Demasiados intentos. Esperá un momento.'
  }
  const known = MESSAGES[error.errorCode]
  if (known) return known
  if (error.status === 404) return 'El recurso ya no existe.'
  if (error.status === 401) return 'Tu sesión expiró. Ingresá de nuevo.'
  if (error.status === 403) return 'No tenés permisos de administrador.'
  if (error.status === 413) return 'El contenido es demasiado grande.'
  if (error.status === 400) return 'Los datos enviados no son válidos.'
  if (error.status >= 500) return 'Ocurrió un error inesperado. Probá de nuevo.'
  return 'No se pudo completar la solicitud.'
}

/** Tipo de aviso para un error (reglas generales del anexo de toasts). */
export function errorTone(error: unknown, overrides?: ErrorOverrides): Tone {
  if (!(error instanceof CoreApiError)) return 'error'
  const tone = overrides?.tones?.[error.errorCode] ?? TONES[error.errorCode]
  if (tone) return tone
  if (error.status === 404 || error.status === 409 || error.status === 429) return 'warning'
  return 'error'
}

/** Campo del formulario al que pertenece el error, o `null` si va como toast. */
export function errorField(error: unknown): string | null {
  return error instanceof CoreApiError ? FIELDS[error.errorCode] ?? null : null
}
