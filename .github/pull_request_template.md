<!--
Base: develop. Solo los releases van a main (develop → main).
Título: Conventional Commits, describe solo el cambio y no nombra ramas. Ej.: fix(users): pedir el motivo del bloqueo en el modal
Release con cambio de versión: chore: release vX.Y.Z
-->

Closes #

## Qué cambia y por qué

<!-- El problema (o riesgo) que ve el usuario y cómo lo resuelve este PR. -->

## Cambios

- 

## Release (versión)

- [ ] No cambia la versión.
- [ ] Sube la versión a x.y.z (`package.json`).
- [ ] Incluye cambios visibles para los administradores del panel.

## Verificación

- [ ] `npm run typecheck` sin errores.
- [ ] `npm run build` sin errores.
- [ ] Prueba manual en el navegador contra la API (indicar contra qué entorno de Core).
- [ ] Si cambia la UI: capturas antes / después.

Para probar:

1. 

## Antes de mergear

- [ ] Sin secretos (`.env.local`, client secrets, tokens) ni valores reales en `.env.example`.
- [ ] Sin `console.log` ni código de depuración.
- [ ] Sin archivos locales (`.env*`, `.next/`, logs, configuración personal del editor).
- [ ] Si cambió el contrato de Core: `npm run gen:api` y `lib/core-api/schema.d.ts` commiteado.
- [ ] Pasos manuales pendientes (variables de entorno, configuración en Core):
