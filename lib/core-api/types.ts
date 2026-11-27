// Alias legibles sobre los tipos generados desde /openapi/v1.json (`npm run gen:api`).
// No definir acá formas de la API a mano: si el contrato cambia, se regenera schema.d.ts.
import type { components } from './schema'

type Schemas = components['schemas']

export type CoreApp = Schemas['ApplicationResponse']
export type CoreAppCreated = Schemas['ApplicationCreatedResponse']
export type CoreRotateSecret = Schemas['RotateClientSecretResponse']
export type CoreCreateApp = Schemas['CreateApplicationRequest']
export type CoreUpdateApp = Schemas['UpdateApplicationRequest']
export type CoreUpdateAppStatus = Schemas['UpdateApplicationStatusRequest']

export type CoreUser = Schemas['UserResponse']
export type CoreUserDetail = Schemas['UserDetailResponse']
export type CoreUserPage = Schemas['UserPageResponse']
export type CoreCreateUser = Schemas['CreateUserRequest']
export type CoreUpdateUser = Schemas['UpdateUserRequest']
export type CoreLockUser = Schemas['LockUserRequest']
export type CoreUserSession = Schemas['UserSessionResponse']
export type CoreRevokeSessions = Schemas['RevokeSessionsResponse']
export type CoreInviteUser = Schemas['InviteUserRequest']
export type CoreResendInvitation = Schemas['ResendInvitationRequest']
export type CoreAcceptInvitation = Schemas['AcceptInvitationRequest']

export type CoreRole = Schemas['RoleResponse']
export type CoreCreateRole = Schemas['CreateRoleRequest']
export type CoreUpdateRole = Schemas['UpdateRoleRequest']
export type CoreReplaceRolePermissions = Schemas['ReplaceRolePermissionsRequest']
export type CorePermission = Schemas['PermissionResponse']
export type CoreCreatePermission = Schemas['CreatePermissionRequest']
export type CoreUpdatePermission = Schemas['UpdatePermissionRequest']
export type CoreAppUserPage = Schemas['ApplicationUserPageResponse']
export type CoreReplaceUserRoles = Schemas['ReplaceUserRolesRequest']

export type CoreTemplateSummary = Schemas['EmailTemplateSummaryResponse']
export type CoreTemplate = Schemas['EmailTemplateResponse']
export type CoreCreateTemplate = Schemas['CreateEmailTemplateRequest']
export type CoreUpdateTemplate = Schemas['UpdateEmailTemplateRequest']
export type CorePreviewTemplate = Schemas['PreviewEmailTemplateRequest']
export type CoreTemplatePreview = Schemas['EmailTemplatePreviewResponse']

// Core v0.8.0 (hrefsolutions/Core#129) agrega `applicationId` a cada evento. El contrato publicado
// en producción todavía es el anterior: cuando se regenere schema.d.ts contra v0.8.0, borrar la extensión.
export type CoreAuditRow = Schemas['AuditLogResponse'] & { applicationId?: string | null }
export type CoreAuditPage = Omit<Schemas['AuditLogPageResponse'], 'items'> & { items: CoreAuditRow[] }

export type CoreHealth = Schemas['HealthResponse']
export type CoreJwks = Schemas['JsonWebKeySetResponse']
export type CoreProblem = Schemas['ProblemDetails']
export type CoreTokenResponse = Schemas['TokenResponse']

// Enums: el contrato los publica como `string`; estos son los nombres exactos que documenta
// la guía de integración (sección 5). Mandar otro texto (p. ej. "active") da 400.
export const APP_STATUS = { Active: 'Active', Suspended: 'Suspended' } as const
export const USER_STATUS = { Active: 'Active', Locked: 'Locked' } as const

// El contrato tipa los números de paginación como `number | string` (artefacto de .NET).
export const toNumber = (value: number | string) => (typeof value === 'number' ? value : Number(value))

export const RESERVED_APP_KEY = 'core'
export const RESERVED_PERMISSION_KEY = 'core.admin'
export const RESERVED_ROLE_NAME = 'admin'
