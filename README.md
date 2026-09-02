# Personal Finance Runway

Aplicación personal de gestión financiera para tener claridad sobre el dinero, proteger el capital disponible y tomar mejores decisiones durante una etapa de transición laboral.

La especificación del producto y la arquitectura están en [`docs/`](./docs).

## Estructura

```text
personal-finance/
├── apps/
│   ├── web/          # Frontend Next.js
│   └── api/          # Backend Express
├── packages/
│   └── shared/       # Tipos y contratos compartidos
└── docs/             # Especificación SDD
```

## Requisitos

- Node.js 20 o superior
- npm 10 o superior (workspaces)
- Docker (solo para PostgreSQL local)

## Instalación

```bash
npm install
```

Copiar variables de la API:

```bash
cp apps/api/.env.example apps/api/.env
```

## PostgreSQL local

```bash
docker compose up -d
```

Scripts equivalentes: `npm run db:up`, `npm run db:down`, `npm run db:logs`.

Aplicar migrations y seed:

```bash
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npx prisma db seed --schema apps/api/prisma/schema.prisma
```

## Desarrollo

API (http://localhost:3001):

```bash
npm run dev:api
```

Frontend (http://localhost:3000):

```bash
npm run dev:web
```

## Build

```bash
npm run build:web
npm run build:api
```

Typecheck de todos los workspaces:

```bash
npm run typecheck
```
