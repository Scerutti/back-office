# Integración del panel con Href.Core

## Arquitectura

```
Navegador ──cookie HttpOnly──► BFF (rutas de servidor de Next.js) ──HTTPS──► Href.Core
```

| Ruta del BFF | Qué hace |
|---|---|
| `POST /api/auth/login` | Si el navegador ya tenía una cookie de refresh, primero cierra esa sesión en Core (`POST /api/auth/logout`) para no dejarla activa 30 días. Después llama a `POST /api/auth/login` de Core con `X-App-Key`, `X-App-Secret`, `X-End-User-Ip` y el `User-Agent` del navegador, y guarda los tokens en cookies HttpOnly. |
| `GET /api/auth/session` | Devuelve nombre y email (claims del JWT). Si el token vence en menos de 60 s, hace refresh. |
| `POST /api/auth/logout` | `POST /api/auth/logout` de Core (headers M2M + IP) y borra las cookies. |
| `/api/core/<ruta>` | Proxy hacia las rutas de admin de Core, con Bearer y el `User-Agent` del navegador (Core lo registra en la auditoría). Tiene una lista de rutas permitidas: las M2M (`/api/auth/*`, `/api/notifications`, `/api/apps/me`) quedan bloqueadas. |

- Los tokens van en las cookies `hc_access` y `hc_refresh` (`HttpOnly; SameSite=Lax; Path=/api`, y `Secure` en producción). Nunca se usa `localStorage`.
- **Refresh**: se hace cuando faltan menos de 60 s para que venza el token, o ante un 401 (en ese caso se reintenta una sola vez). Se serializa por refresh token: las requests que llegan en paralelo comparten una única llamada, y el par nuevo se recuerda 5 minutos para las requests que llegan tarde con la cookie vieja. Siempre se guarda el refresh token nuevo.
  - *Límite:* este mapa vive en la memoria del proceso. Si hay varias instancias del BFF, hacen falta sticky sessions o un store compartido (Redis).
- **403 `Auth.AdminRequired`** → logout en Core, se borran las cookies y aparece el login con "Sin permisos".
- **Refresh rechazado (401/403)** → login, con el mensaje que corresponde al `errorCode`.
- **`User-Agent`**: en login, refresh y logout el BFF reenvía el `User-Agent` del navegador (recortado a 512 caracteres). Core lo guarda en la sesión: sin esto, todas las sesiones del panel figuraban como `node`.
- **`X-End-User-Ip`**: se toma de `X-Real-IP` o de la última entrada de `X-Forwarded-For`, y se valida que sea una IP. Si el panel corre detrás de más de un proxy, hay que revisar este punto en `lib/server/core-auth.ts` (`endUserIp`).
- **CSRF**: las rutas del BFF rechazan requests de otro origen (`Bff.InvalidOrigin`).

## Tipos

Los tipos salen de `lib/core-api/schema.d.ts`, que se genera desde el contrato con:

```
npm run gen:api
```

`lib/core-api/types.ts` solo define alias legibles. El BFF usa `openapi-fetch` tipado para login, refresh y logout.

## Variables de entorno

Ver `.env.example`: `CORE_API_URL`, `CORE_APP_KEY` (`core`) y `CORE_APP_SECRET`. Solo se leen en el servidor. Están protegidas con `server-only` y nunca llevan el prefijo `NEXT_PUBLIC_`.

## Correr en local

```
copy .env.example .env.local   # completar los valores
npm install
npm run dev                     # http://localhost:3000
npm run typecheck
```
