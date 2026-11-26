import { CoreApiError } from './core-client'

// Mensajes de UI por `errorCode` (guía, sección 4). Los códigos salen de las respuestas de error
// documentadas en /openapi/v1.json. No se usan `title` ni `detail` para decidir el mensaje.
const MESSAGES: Record<string, string> = {
  // Auth (login / refresh / sesión)
  'Auth.InvalidCredentials': 'Email o contraseña incorrectos.',
  'Auth.UserLocked': 'Tu usuario está bloqueado. Contactá a un administrador.',
  'Auth.EmailNotVerified': 'Tu email todavía no está verificado.',
  'Auth.NoAccessToApplication': 'Tu usuario no tiene acceso al panel de Href.Core.',
  'Auth.AdminRequired': 'Sin permisos: tu usuario no es administrador de Href.Core. Se cerró la sesión.',
  'Auth.InvalidToken': 'La sesión venció. Iniciá sesión nuevamente.',
  'Auth.InvalidRefreshToken': 'La sesión venció. Iniciá sesión nuevamente.',
  'Auth.RefreshTokenExpired': 'La sesión venció. Iniciá sesión nuevamente.',
  'Auth.RefreshTokenRevoked': 'La sesión fue cerrada. Iniciá sesión nuevamente.',
  'Auth.RefreshTokenReused': 'La sesión se cerró por seguridad. Iniciá sesión nuevamente.',
  'Auth.InvalidAppCredentials': 'El servidor del panel no tiene bien configuradas las credenciales de la app core.',
  'Auth.ApplicationSuspended': 'La aplicación core está suspendida.',
  'RateLimit.Exceeded': 'Demasiados intentos.',
  'Request.TooLarge': 'El contenido es demasiado grande.',
  // Aplicaciones
  'Applications.InvalidAppKey': 'App key inválida: de 3 a 50 caracteres, minúsculas, números y guiones.',
  'Applications.InvalidName': 'El nombre no es válido.',
  'Applications.InvalidDescription': 'La descripción no es válida.',
  'Applications.InvalidStatus': 'Estado de aplicación inválido.',
  'Applications.AppKeyTaken': 'Ya existe una aplicación con esa app key.',
  'Applications.NotFound': 'La aplicación no existe.',
  'Applications.AlreadyActive': 'La aplicación ya está activa.',
  'Applications.AlreadySuspended': 'La aplicación ya está suspendida.',
  'Applications.Reserved': 'La aplicación core está reservada: no se puede suspender ni abrir al auto-registro.',
  // Permisos, roles y accesos
  'Authorization.LastAdmin': 'No se puede: Core quedaría sin ningún administrador activo con email verificado. Primero dale acceso de admin a otro usuario.',
  'Authorization.InvalidPermissionKey': 'La key del permiso no es válida.',
  'Authorization.InvalidDescription': 'La descripción no es válida.',
  'Authorization.PermissionKeyTaken': 'Ya existe un permiso con esa key en esta aplicación.',
  'Authorization.PermissionNotFound': 'El permiso no existe.',
  'Authorization.InvalidRoleName': 'El nombre del rol no es válido.',
  'Authorization.RoleNameTaken': 'Ya existe un rol con ese nombre en esta aplicación.',
  'Authorization.RoleNotFound': 'El rol no existe.',
  'Authorization.InvalidPermissionKeys': 'La lista de permisos no es válida.',
  'Authorization.UnknownPermissions': 'Algunos permisos no existen en esta aplicación.',
  'Authorization.InvalidRoleIds': 'La lista de roles no es válida.',
  'Authorization.UnknownRoles': 'Algunos roles no existen en esta aplicación.',
  'Authorization.AccessAlreadyGranted': 'Otro administrador acaba de dar este acceso. Actualizá la vista.',
  'Authorization.AccessNotFound': 'El usuario ya no tiene acceso a esta aplicación.',
  'Authorization.Reserved': 'Acción no permitida: el permiso core.admin y el rol admin de core están reservados.',
  'Authorization.InvalidPage': 'Página inválida.',
  'Authorization.InvalidPageSize': 'Tamaño de página inválido.',
  // Usuarios
  'Users.InvalidEmail': 'El email no es válido.',
  'Users.InvalidFullName': 'El nombre completo no es válido.',
  'Users.WeakPassword': 'La contraseña es demasiado débil.',
  'Users.EmailTaken': 'Ya existe un usuario con ese email.',
  'Users.NotFound': 'El usuario no existe.',
  'Users.InvalidLockReason': 'El motivo de bloqueo no es válido.',
  'Users.AlreadyLocked': 'El usuario ya está bloqueado.',
  'Users.NotLocked': 'El usuario no está bloqueado.',
  'Users.InvalidSearch': 'La búsqueda no es válida.',
  'Users.InvalidStatus': 'Estado de usuario inválido.',
  'Users.InvalidPage': 'Página inválida.',
  'Users.InvalidPageSize': 'Tamaño de página inválido.',
  // Plantillas
  'Templates.InvalidKey': 'La key de la plantilla no es válida (slug en minúsculas).',
  'Templates.InvalidName': 'El nombre no es válido.',
  'Templates.InvalidDescription': 'La descripción no es válida.',
  'Templates.InvalidSubject': 'El asunto no es válido.',
  'Templates.InvalidHtmlBody': 'El cuerpo HTML no es válido.',
  'Templates.InvalidTextBody': 'El cuerpo de texto no es válido.',
  'Templates.ContentTooLarge': 'El contenido de la plantilla es demasiado grande.',
  'Templates.KeyTaken': 'Ya existe una plantilla con esa key.',
  'Templates.NotFound': 'La plantilla no existe.',
  'Templates.SystemTemplate': 'Las plantillas de sistema no se pueden borrar.',
  'Templates.MissingRequiredPlaceholders': 'Faltan placeholders obligatorios de la plantilla de sistema.',
  'Templates.UnknownPlaceholders': 'La plantilla usa placeholders que no existen.',
  'Templates.SystemTemplateNotRenderable': 'La plantilla de sistema no se puede renderizar con ese contenido.',
  'Templates.MissingVariables': 'Faltan valores para algunas variables.',
  'Templates.DuplicateVariables': 'Hay variables repetidas.',
  'Templates.RenderedContentTooLarge': 'El email renderizado es demasiado grande.',
  // Auditoría
  'AuditLogs.InvalidPage': 'Página inválida.',
  'AuditLogs.InvalidPageSize': 'Tamaño de página inválido.',
  'AuditLogs.InvalidDate': 'Alguna fecha no es válida.',
  'AuditLogs.InvalidRange': 'El rango de fechas no es válido ("desde" tiene que ser anterior a "hasta").',
  'AuditLogs.InvalidActorType': 'Tipo de actor inválido.',
  'AuditLogs.InvalidFilter': 'Algún filtro no es válido.',
  'AuditLogs.InvalidFormat': 'Formato de exportación inválido.',
  'AuditLogs.ExportTooLarge': 'La exportación supera las 100.000 filas. Acotá los filtros (por ejemplo, el rango de fechas).',
  // Errores del propio BFF
  'Bff.NotConfigured': 'Falta configurar CORE_API_URL y CORE_APP_SECRET en el servidor del panel.',
  'Bff.CoreUnavailable': 'No se pudo conectar con Href.Core. Intentá nuevamente.',
  'Bff.InvalidUpstreamResponse': 'Href.Core devolvió una respuesta inesperada.',
  'Bff.SessionRequired': 'Iniciá sesión para continuar.',
  'Bff.InvalidOrigin': 'Solicitud rechazada por origen inválido.',
  'Bff.InvalidRequest': 'Revisá los datos ingresados.',
}

function retrySeconds(error: CoreApiError) {
  const value = error.retryAfter ?? ''
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds)
  const date = Date.parse(value)
  return date > Date.now() ? Math.ceil((date - Date.now()) / 1000) : 0
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof CoreApiError)) return 'Ocurrió un error inesperado.'
  if (error.errorCode === 'RateLimit.Exceeded') {
    const seconds = retrySeconds(error)
    return seconds ? `Demasiados intentos. Probá de nuevo en ${seconds} segundos.` : 'Demasiados intentos. Esperá un momento.'
  }
  const known = MESSAGES[error.errorCode]
  if (known) return known
  if (error.fieldErrors) {
    const details = Object.entries(error.fieldErrors).map(([field, messages]) => `${field}: ${messages.join(' ')}`).join(' · ')
    return `Revisá los datos ingresados. ${details}`
  }
  if (error.status === 404) return 'El recurso solicitado no existe.'
  if (error.status === 401) return 'La sesión venció. Iniciá sesión nuevamente.'
  if (error.status === 403) return 'No tenés permiso para realizar esta acción.'
  if (error.status >= 500) return 'Error inesperado en el servidor. Si se repite, informá el Correlation ID.'
  return 'No se pudo completar la solicitud.'
}
