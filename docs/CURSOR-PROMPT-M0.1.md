# CURSOR-PROMPT-M0.1.md

# Task M0.1 — Crear monorepo

Quiero que implementes exclusivamente la tarea `M0.1 — Crear monorepo` definida en `docs/BACKLOG.md`.

## Antes de comenzar

Leé:

```text
docs/VISION.md
docs/ARCHITECTURE.md
docs/BACKLOG.md
docs/CURSOR-INSTRUCTIONS.md
```

No avances a ninguna otra tarea del backlog.

---

## Objetivo

Crear la estructura base del monorepo:

```text
personal-finance/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   └── shared/
├── docs/
├── package.json
├── .gitignore
└── README.md
```

Los documentos existentes deben permanecer dentro de:

```text
docs/
```

No borres ni reescribas documentación SDD existente salvo que sea estrictamente necesario para corregir una ruta/referencia.

---

## Decisiones ya tomadas

Frontend:

```text
Next.js
TypeScript
```

Backend:

```text
Express
TypeScript
```

Arquitectura backend futura:

```text
Controller
↓
Service
↓
Repository
```

Base futura:

```text
PostgreSQL + Prisma
```

Pero IMPORTANTE:

`M0.1` no debe implementar todavía PostgreSQL, Prisma, controllers, services ni repositories.

Eso pertenece a tareas posteriores.

---

## Workspace

Configurá un workspace simple.

Preferencia:

```text
npm workspaces
```

salvo que el repositorio existente ya utilice otro package manager de manera clara.

No agregar Turborepo, Nx u otra herramienta de monorepo.

---

## apps/web

Crear una aplicación Next.js mínima con:

```text
TypeScript
App Router
```

Debe poder iniciar en desarrollo.

No implementar todavía:

- dashboard financiero;
- PWA;
- TanStack Query;
- UI library;
- autenticación;
- features financieras.

Una página inicial mínima es suficiente.

---

## apps/api

Crear una aplicación Node.js + Express + TypeScript mínima.

En esta tarea alcanza con que:

- compile;
- pueda iniciar;
- tenga estructura mínima.

El endpoint `/health` pertenece a `M0.2`, por lo tanto NO implementarlo en M0.1.

---

## packages/shared

Crear package TypeScript mínimo.

No agregar todavía enums financieros ni contratos que no sean necesarios para comprobar que el workspace funciona.

---

## Scripts raíz

Agregar scripts útiles para ejecutar los proyectos.

Ejemplo conceptual:

```text
dev:web
dev:api
build:web
build:api
typecheck
```

Podés adaptar nombres si existe una convención mejor, pero mantenelos simples.

No agregar tooling innecesario.

---

## README

Crear README breve con:

- objetivo del proyecto;
- estructura;
- requisitos;
- cómo instalar;
- cómo iniciar web;
- cómo iniciar API.

No duplicar toda la documentación de `/docs`.

---

## .gitignore

Debe cubrir como mínimo:

```text
node_modules
.next
dist
.env
.env.local
coverage
```

No ignorar `.env.example`.

---

## Validación requerida

Antes de finalizar:

1. instalar dependencias;
2. comprobar que el workspace resuelve correctamente;
3. ejecutar typecheck;
4. ejecutar builds disponibles;
5. corregir errores de M0.1.

No implementar M0.2 para hacer pasar tests.

---

## Restricciones

NO:

- Prisma;
- PostgreSQL;
- OpenAI;
- PWA;
- auth;
- Docker obligatorio;
- Redux;
- CQRS;
- microservices;
- lógica financiera;
- endpoints financieros;
- `/health`.

No agregar features fuera de alcance.

---

## Backlog

Si todo queda correcto:

actualizá solamente:

```text
M0.1 — Crear monorepo
```

de:

```text
TODO
```

a:

```text
DONE
```

No cambies el estado de M0.2 ni otras tareas.

---

## Respuesta final

Al terminar respondé exactamente con esta estructura:

```text
Tarea:
M0.1 — Crear monorepo

Estado:
DONE | IN_PROGRESS | BLOCKED

Implementado:
- ...

Archivos principales:
- ...

Validaciones ejecutadas:
- ...

Tests:
- ...

Decisiones / observaciones:
- ...

Siguiente tarea sugerida:
M0.2 — Backend Express base
```

No implementes M0.2.
