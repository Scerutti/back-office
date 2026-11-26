# HREF Core · Backoffice

Panel de administración de la API **Href.Core**. Desde acá los administradores gestionan:

- **Aplicaciones**: alta, edición, suspensión y rotación del client secret.
- **Usuarios**: alta, bloqueo, accesos a aplicaciones, roles y sesiones activas.
- **Roles y permisos** de cada aplicación (matriz rol × permiso).
- **Templates de email**, con vista previa.
- **Auditoría**: búsqueda con filtros y exportación a CSV o JSON.
- **Seguridad**: claves públicas (JWKS) que publica Core.

Está hecho con Next.js 16 (App Router), React 19 y SWR. Los tipos de la API se generan desde el contrato OpenAPI de Core.

## Arquitectura

```
Navegador ──cookies HttpOnly──► BFF (rutas de servidor de Next.js, app/api) ──HTTPS──► Href.Core
```

- El navegador **solo** habla con el BFF (`/api/auth/*` y `/api/core/*`). Nunca llama a Core directo y nunca ve los tokens.
- El BFF guarda el access token y el refresh token en cookies `HttpOnly` (`SameSite=Lax`, `Path=/api`, `Secure` en producción). No se usa `localStorage`.
- Para login, refresh y logout, el BFF llama a Core como la app reservada `core` (con `X-App-Key` y `X-App-Secret`). También reenvía la IP (`X-End-User-Ip`) y el `User-Agent` del navegador.
- `/api/core/<ruta>` es un proxy hacia las rutas de admin de Core. Agrega el Bearer y renueva el token cuando hace falta. Solo acepta las rutas de una lista blanca.
- Las rutas del BFF rechazan las requests de otro origen (protección CSRF).

El detalle (refresh serializado, manejo de errores, límites) está en [INTEGRACION.md](INTEGRACION.md).

### Rutas del panel

Cada sección tiene su URL. Los detalles abiertos y los filtros van en la query string, así funcionan el refresh, atrás/adelante y los links directos.

| Ruta | Sección |
|---|---|
| `/` | Resumen general |
| `/aplicaciones` | Aplicaciones |
| `/usuarios?id=<userId>` | Usuarios (con el detalle de un usuario abierto) |
| `/roles?app=<appKey>` | Roles y permisos de una aplicación |
| `/templates?key=<templateKey>` | Templates de email |
| `/auditoria?entityType=…&entityId=…` | Auditoría con filtros (`?usuario=<userId>` muestra el historial de un usuario) |
| `/seguridad` | Seguridad (JWKS) |

### Estructura

```
app/
  (panel)/          páginas del panel (una carpeta por sección) y su layout
  api/auth/         login, sesión y logout del BFF
  api/core/         proxy hacia Href.Core
components/core/    pantallas y componentes compartidos del panel
lib/core-api/       tipos generados desde el contrato (schema.d.ts) y alias (types.ts)
lib/server/         código que solo corre en el servidor (configuración y auth del BFF)
```

## Requisitos

- Node.js 20.9 o superior.
- npm.
- Acceso a una instancia de Href.Core y el client secret de la app `core` (lo da el equipo de Core).

## Variables de entorno

Se leen **solo en el servidor**. Nunca llevan el prefijo `NEXT_PUBLIC_`: con ese prefijo quedarían en el código que descarga el navegador.

| Variable | Descripción | Ejemplo |
|---|---|---|
| `CORE_API_URL` | URL base de la API Href.Core. En producción tiene que ser `https`. | `https://core.example.com` |
| `CORE_APP_KEY` | App key del panel. Siempre `core`. | `core` |
| `CORE_APP_SECRET` | Client secret de la app `core`. | (lo da el equipo de Core) |

`.env.example` tiene la plantilla. Los valores reales van en `.env.local`, que no se sube al repositorio.

> Si rotás el secret de la app `core` desde el panel, el valor anterior deja de funcionar en el acto. Actualizá `CORE_APP_SECRET` en el servidor enseguida: hasta entonces nadie puede iniciar sesión.

## Correr en local

```powershell
copy .env.example .env.local   # completar los valores
npm install
npm run dev                     # http://localhost:3000
```

Para iniciar sesión, el usuario tiene que tener el rol `admin` en la app `core`.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Levanta el panel en modo desarrollo (http://localhost:3000). |
| `npm run build` | Compila para producción. Falla si hay errores de TypeScript. |
| `npm start` | Sirve el build de producción. |
| `npm run typecheck` | Corre `tsc --noEmit`. |
| `npm run gen:api` | Regenera `lib/core-api/schema.d.ts` desde el contrato OpenAPI de Core en producción. Correlo cuando Core publique una versión nueva y commiteá el resultado. |

## Flujo de ramas y PRs

- `main`: solo recibe releases (PR de `develop` a `main`).
- `develop`: rama de integración y rama por defecto.
- Todo trabajo sale de `develop` en una rama con prefijo:
  - `feat/…` para funcionalidad nueva;
  - `fix/…` para correcciones;
  - `docs/…` para documentación;
  - `chore/…` para mantenimiento (dependencias, configuración, tipos regenerados).
- Cada rama vuelve a `develop` con un PR que completa la plantilla (`.github/pull_request_template.md`).
- Título del PR y commits en formato [Conventional Commits](https://www.conventionalcommits.org/): por ejemplo, `fix(users): pedir el motivo del bloqueo en el modal`.
- Antes de pedir revisión: `npm run typecheck` y `npm run build` sin errores, y prueba manual en el navegador contra la API (con capturas si cambia la UI).
- Nunca se commitean secretos ni archivos locales (`.env.local`, logs, configuración personal del editor).

## Deploy

El panel necesita un servidor Node.js: el BFF corre en las rutas de servidor de Next.js, así que no se puede publicar como sitio estático.

1. Configurar `CORE_API_URL` (con `https`), `CORE_APP_KEY` y `CORE_APP_SECRET` en el entorno del host.
2. `npm ci`
3. `npm run build`
4. `npm start` (o el comando equivalente de la plataforma).

Tené en cuenta:

- **Una sola instancia, o sticky sessions.** El BFF recuerda los refresh en curso en la memoria del proceso. Con varias instancias hace falta sticky sessions o un store compartido (ver [INTEGRACION.md](INTEGRACION.md)).
- **Proxy y `X-End-User-Ip`.** La IP del usuario se toma de `X-Real-IP` o de la última entrada de `X-Forwarded-For`. Si hay más de un proxy adelante, revisá `endUserIp` en `lib/server/core-auth.ts`.
- **Vercel Analytics** se carga solo en producción (`@vercel/analytics`).
