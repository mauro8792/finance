# DEPLOYMENT.md

Runbook de M10.6. **No aplica infraestructura por sí solo.** Este archivo no crea servicios, dominio ni DB.

## Stack acordado

| Pieza | Proveedor |
|---|---|
| Web | Vercel |
| API | Render Web Service, **1 instancia** |
| DB | Render PostgreSQL de pago (no free para Go-live B) |
| Dominio | `app.<dominio>` + `api.<dominio>` (same-site) |

Cookie `pf_sid` es host-only en la API. Same-site con subdominios del mismo eTLD+1. **No** usar `*.vercel.app` → `*.onrender.com` con datos reales.

## Go-live A vs Go-live B

**A — Aplicación desplegable/operativa (datos no reales)**  
HTTPS, same-site, login, health, migraciones sobre DB **vacía** o de ensayo. Puede ser plan free **solo** para probar el cableado. M10.6 deja el repo listo para A; **no marca A como hecho** hasta que existan los servicios.

**B — Autorizada para datos financieros reales**  
A + instancias de pago (sin sleep), backup **verificado con restore**, retención/PITR comprobada contra el **plan contratado** (no asumir un número de días), user real vía bootstrap, seed QA nunca corrido, checklist de QA en `https://app.` / `https://api.`.

M10.6 **no** es Go-live B.

## Archivos de plataforma (aún no aplicar)

- `render.yaml` — Blueprint API + Postgres. Sincronizarlo **crea** recursos de pago. `autoDeployTrigger: off`, `numInstances: 1`, `healthCheckPath: /health`, `TRUST_PROXY=1`.
- `apps/web/vercel.json` — install/build del monorepo + rewrite `/api/:path*` → API Render (Go-live A gratis, same-origin en Vercel). En Vercel: Root Directory = `apps/web`. `NEXT_PUBLIC_API_URL` en el dashboard **antes** del build (mismo origen del front, no `*.onrender.com`).

## Comandos

```text
# Build
npm ci
npm run build:shared
npm run build:api
npm run build:web

# Release API (prod / staging remoto; NUNCA contra la DB QA local por error)
npm run prisma:migrate:deploy -w api

# Start API
npm run start -w api
# Render inyecta PORT. El proceso escucha 0.0.0.0.

# Nunca en producción
prisma migrate dev
prisma db seed
npm run prisma:seed -w api
```

`prisma` está en `devDependencies`: el `buildCommand` de Render usa `npm ci --include=dev` para que `migrate deploy` exista en preDeploy.

## Envs

Ver `apps/api/.env.example` y `apps/web/.env.example`. Producción API: `NODE_ENV=production`, `WEB_ORIGIN=https://app.<dominio>` (o el origen exacto del front en Go-live A, p. ej. `https://….vercel.app`), `SESSION_SECURE=1`, `SESSION_SECRET` ≥32 (distinto de DEV), `TRUST_PROXY=1` solo en Render, `DATABASE_URL` internal SSL. Web: `NEXT_PUBLIC_API_URL` = origen del front cuando hay rewrite Vercel→Render; con dominio propio, `https://api.<dominio>`.

`BOOTSTRAP_*` no van en el servicio permanente. Solo one-shot.

## Bootstrap auth (DB vacía o un user)

`npm run auth:bootstrap -w api`

- 0 users → crea exactamente 1 (`BOOTSTRAP_NAME` opcional, default `Usuario`).
- 1 user → actualiza email/password del existente (mismo id).
- >1 → FAIL FAST, no escribe.

Password mínimo 12, Argon2id. El script no imprime password ni hash.

Prod: `DATABASE_URL` de prod en el entorno del one-shot (shell local o Shell de Render), nunca commitear. Confirmar `count = 1`. Quitar `BOOTSTRAP_PASSWORD` después.

Reset: `npm run auth:set-password -w api` (exige exactamente 1 user).

## Bootstrap categorías system (one-shot)

Si el user de prod existe pero faltan las categorías base EXPENSE (`is_system=true`), **no** correr `prisma db seed` (seed QA). Usar:

```text
npm run categories:ensure-system -w api -- --dry-run
npm run categories:ensure-system -w api
```

- Exige exactamente 1 user (0 o >1 → FAIL FAST).
- Inserta solo nombres faltantes de `DEFAULT_EXPENSE_CATEGORY_NAMES`.
- No modifica filas existentes (no reactiva, no fuerza `isSystem`, no renombra).
- No toca auth, cuentas ni movimientos.
- Idempotente. Dry-run no escribe.

Prod: mismo `DATABASE_URL` one-shot que bootstrap auth (shell local o Shell de Render). Confirmar dry-run antes del apply.

## Shutdown

`SIGTERM` / `SIGINT`: deja de aceptar conexiones (`server.close`), desconecta Prisma, `exit 0`. Timeout ~25s → `exit 1`. Alineado con `maxShutdownDelaySeconds: 30` en Render.

## Rate limit

Memoria, **una instancia**. No autoscaling de API hasta tener store compartido.

## Backups

Requisito para Go-live B: backups automáticos del plan de Postgres + **restore de prueba** a una DB temporal (login + dashboard). La retención y el PITR **se verifican en el plan real contratado**; este repo no garantiza un número de días.

## Health

`GET /health` público, `{ "status": "ok" }`, sin DB. Path de Render: `/health`.

## QA previa a A / B

A: login, logout, refresh, rutas protegidas, CSRF, CORS, cookie Secure, HTTPS, health, CSV, AI o 503 limpio, dashboard, movimientos.

B: lo de A + restore drill + plan de pago + user real (no dump QA).

## Datos

DB QA local ficticia: no copiar a prod. Datos reales: carga manual en la UI después de B. No `pg_dump` QA → prod.

## Rollback

Web: deploy anterior en Vercel. API: deploy anterior en Render. DB: restore de backup; migrations solo aditivas en el mismo deploy. Prohibido DROP destructivo sin backup + restore de prueba.

## Costos (orden de magnitud, Go-live B)

Vercel Hobby ~0. Render Starter API ~USD 7/mes. Render Postgres pago ~USD 6–7/mes. Dominio ~USD 10–15/año. OpenAI aparte según uso.

## No hacer todavía

Crear servicios, comprar dominio, crear DB prod, migrate/bootstrap contra prod, mezclar QA, cargar plata real.
