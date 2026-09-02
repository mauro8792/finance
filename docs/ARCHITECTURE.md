# ARCHITECTURE.md

# Personal Finance Runway — Architecture

## 1. Objetivo

Este documento define la arquitectura técnica del MVP.

La prioridad es mantener una arquitectura:

- simple;
- entendible;
- fácil de mantener;
- fácil de desplegar;
- suficientemente desacoplada;
- sin sobreingeniería.

La aplicación estará dividida en:

- Frontend web/PWA.
- Backend API.
- Base de datos PostgreSQL.
- Integración externa con OpenAI.

---

# 2. Arquitectura general

```text
┌──────────────────────────────┐
│          Frontend            │
│      Next.js + PWA           │
└──────────────┬───────────────┘
               │ HTTPS / JSON
               ▼
┌──────────────────────────────┐
│         Backend API          │
│    Express + TypeScript      │
│                              │
│ Controller                   │
│    ↓                         │
│ Service                      │
│    ↓                         │
│ Repository                   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│        PostgreSQL DB         │
│      Neon / Render / Local   │
└──────────────────────────────┘

               │
               │ server-side only
               ▼

┌──────────────────────────────┐
│          OpenAI API          │
└──────────────────────────────┘
```

---

# 3. Stack principal

## Frontend

```text
Next.js
TypeScript
React
PWA
```

## Backend

```text
Node.js
Express
TypeScript
```

## Database

```text
PostgreSQL
```

## ORM

Inicialmente:

```text
Prisma
```

La decisión se toma por:

- velocidad de desarrollo;
- schema legible;
- migrations simples;
- buen soporte PostgreSQL;
- buen tipado con TypeScript;
- productividad para MVP.

La capa `Repository` debe evitar que Prisma se propague directamente por toda la aplicación.

Si en el futuro se reemplaza Prisma, el impacto debería concentrarse principalmente en repositories e infraestructura.

---

# 4. Principio arquitectónico

La aplicación utilizará una arquitectura en capas simple.

```text
Controller
↓
Service
↓
Repository
↓
Database
```

Responsabilidades:

```text
Controller
HTTP

Service
Business Logic

Repository
Persistence

Database
Storage
```

No agregar capas adicionales salvo necesidad concreta.

---

# 5. Controller

El Controller se ocupa exclusivamente de HTTP.

Responsabilidades:

- recibir request;
- leer params;
- leer query params;
- leer body;
- ejecutar validación de entrada;
- invocar services;
- mapear resultado a response HTTP;
- mapear errores a códigos HTTP.

El Controller NO debe contener lógica financiera.

Ejemplo incorrecto:

```ts
const balance =
  transactions
    .filter(...)
    .reduce(...)
```

dentro del Controller.

Ejemplo correcto:

```ts
const balance = await accountService.getBalance(accountId)
```

---

# 6. Service

La capa Service contiene la lógica de negocio.

Ejemplos:

```text
crear gasto;
registrar reintegro;
calcular saldo;
calcular consumo del fondo;
calcular cobertura vivienda;
registrar caución;
calcular rendimiento;
procesar vencimiento;
simular escenario.
```

Los Services pueden utilizar uno o más repositories.

Ejemplo:

```text
HousingService
↓
HousingRepository
TransactionRepository
AccountRepository
```

La capa Service es la principal autoridad de reglas de negocio.

---

# 7. Repository

La capa Repository encapsula acceso a datos.

Responsabilidades:

- buscar registros;
- crear registros;
- actualizar registros;
- queries agregadas cuando tenga sentido;
- persistencia;
- transacciones DB.

Ejemplo conceptual:

```ts
interface TransactionRepository {
  create(data): Promise<Transaction>

  findById(id): Promise<Transaction | null>

  findByPeriod(params): Promise<Transaction[]>

  void(id): Promise<void>

  sumExpenses(params): Promise<Decimal>
}
```

El Service no debe necesitar conocer detalles internos de Prisma.

---

# 8. Regla de Prisma

Prisma se utilizará únicamente desde infraestructura/repositories.

Evitar:

```text
Controller
↓
Prisma
```

o:

```text
React Component
↓
Prisma
```

La dirección correcta es:

```text
Controller
↓
Service
↓
Repository
↓
Prisma
↓
PostgreSQL
```

---

# 9. Arquitectura del repositorio

Se utilizará un monorepo simple.

Estructura propuesta:

```text
personal-finance/
│
├── apps/
│   │
│   ├── web/
│   │
│   └── api/
│
├── packages/
│   └── shared/
│
├── docs/
│   ├── VISION.md
│   ├── DOMAIN.md
│   ├── MVP.md
│   └── ARCHITECTURE.md
│
├── package.json
├── .gitignore
└── README.md
```

No utilizar herramientas de monorepo complejas si no son necesarias.

Puede utilizarse npm workspaces o pnpm workspaces.

---

# 10. Frontend structure

Estructura conceptual:

```text
apps/web/
│
├── app/
│   ├── dashboard/
│   ├── accounts/
│   ├── transactions/
│   ├── transfers/
│   ├── budgets/
│   ├── housing/
│   ├── investments/
│   ├── simulations/
│   ├── assistant/
│   └── settings/
│
├── components/
│
├── features/
│   ├── transactions/
│   ├── budgets/
│   ├── housing/
│   ├── investments/
│   └── ai/
│
├── lib/
│   ├── api/
│   ├── formatters/
│   └── utils/
│
├── hooks/
│
├── public/
│
└── package.json
```

La estructura final puede adaptarse a App Router.

---

# 11. Backend structure

```text
apps/api/
│
├── src/
│   │
│   ├── modules/
│   │   │
│   │   ├── accounts/
│   │   │   ├── account.controller.ts
│   │   │   ├── account.service.ts
│   │   │   ├── account.repository.ts
│   │   │   ├── account.routes.ts
│   │   │   ├── account.schema.ts
│   │   │   └── account.types.ts
│   │   │
│   │   ├── transactions/
│   │   │   ├── transaction.controller.ts
│   │   │   ├── transaction.service.ts
│   │   │   ├── transaction.repository.ts
│   │   │   ├── transaction.routes.ts
│   │   │   ├── transaction.schema.ts
│   │   │   └── transaction.types.ts
│   │   │
│   │   ├── categories/
│   │   ├── budgets/
│   │   ├── housing/
│   │   ├── investments/
│   │   ├── simulations/
│   │   │   ├── simulation.service.ts
│   │   │   ├── simulation.types.ts
│   │   │   ├── simulation.controller.ts
│   │   │   ├── simulation.schema.ts
│   │   │   ├── simulation.routes.ts
│   │   ├── financial/
│   │   └── ai/
│   │
│   ├── shared/
│   │   ├── db/
│   │   ├── errors/
│   │   ├── middleware/
│   │   ├── validation/
│   │   ├── logging/
│   │   └── utils/
│   │
│   ├── app.ts
│   └── server.ts
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
└── package.json
```

---

# 12. Organización por módulo

Cada dominio funcional debe vivir en su propio módulo.

Ejemplo:

```text
transactions/
```

contendrá todo lo relacionado con movimientos.

La regla es:

```text
preferir organización por feature
sobre
organización global por tipo técnico.
```

Evitar:

```text
controllers/
services/
repositories/
```

globales con decenas de archivos.

Preferir:

```text
transactions/
accounts/
housing/
investments/
```

---

# 13. Módulos iniciales

MVP:

```text
accounts
transactions
categories
budgets
housing
investments
simulations
financial
ai
```

No crear módulos futuros hasta necesitarlos.

---

# 14. Financial module

`financial` será un módulo especial.

No representa una entidad concreta.

Contendrá cálculos agregados.

Ejemplos:

```ts
getMonthlyGrossExpenses()

getMonthlyNetExpenses()

getMonthlyIncome()

getMonthlyFundConsumption()

getTotalAvailableARS()

calculateRunway()

getFinancialSummary()
```

Puede utilizar múltiples repositories.

---

# 15. FinancialService

Ejemplo conceptual:

```ts
class FinancialService {
  constructor(
    private readonly transactionRepository: TransactionRepository,
    private readonly accountRepository: AccountRepository,
    private readonly housingRepository: HousingRepository,
    private readonly investmentRepository: InvestmentRepository
  ) {}
}
```

Este Service debe concentrar cálculos agregados utilizados por:

- dashboard;
- simulaciones;
- AI assistant.

---

# 16. AI module

Estructura:

```text
ai/
├── ai.controller.ts
├── ai.service.ts
├── ai.routes.ts
├── ai.schema.ts
├── ai.types.ts
├── openai.client.ts
└── tools/
    ├── get-monthly-expenses.tool.ts
    ├── get-fund-consumption.tool.ts
    ├── get-housing-coverage.tool.ts
    └── calculate-runway.tool.ts
```

OpenAI es infraestructura.

No debe contener reglas financieras.

---

# 17. AI architecture

Flujo:

```text
Frontend
↓
AI Controller
↓
AI Service
↓
OpenAI
↓
Tool request
↓
FinancialService / Domain Service
↓
Repository
↓
PostgreSQL
↓
result
↓
OpenAI
↓
final explanation
```

OpenAI nunca accede directamente a PostgreSQL.

---

# 18. AI Transaction Parser

Flujo para:

```text
super 75 mil
```

```text
Frontend
↓
POST /ai/parse-transaction
↓
AIController
↓
AIService
↓
OpenAI Structured Output
↓
ParsedTransaction[]
↓
Frontend Preview
↓
User confirms
↓
POST /transactions
↓
TransactionService
↓
Repository
```

La AI no persiste directamente.

---

# 19. AI confirmation rule

Una salida AI nunca genera automáticamente:

- gasto;
- ingreso;
- reintegro;
- transferencia;
- inversión;
- pago.

Toda mutación requiere un endpoint normal de dominio después de confirmación del usuario.

---

# 20. Shared package

`packages/shared` debe mantenerse pequeño.

Puede incluir:

```text
DTOs
enums compartidos
schemas compartidos
tipos API
```

Ejemplo:

```text
Currency
TransactionType
PaymentMethod
API contracts
```

No colocar lógica de negocio compleja ahí.

---

# 21. Validación

Se utilizará validación schema-based.

Recomendación:

```text
Zod
```

Puede compartirse entre frontend y backend cuando tenga sentido.

Ejemplo:

```ts
const CreateExpenseSchema = z.object({
  amount: z.string(),
  currency: z.enum(["ARS", "USD"]),
  categoryId: z.string().uuid()
})
```

---

# 22. DTOs

Los Controllers no deben trabajar directamente con entidades Prisma.

Utilizar DTOs.

Ejemplo:

```ts
CreateTransactionRequest
TransactionResponse
FinancialSummaryResponse
BudgetView
```

`BudgetView` (create/update/list):

```ts
{
  id: UUID
  category: { id: UUID, name: string }
  currency: "ARS" | "USD"
  amount: string
  year: number
  month: number
  consumption: string
  available: string
  usedPercent: string | null
  spendingPace: {
    elapsedDays: number
    totalDays: number
    monthProgress: string
    budgetProgress: string | null
    aboveExpectedPace: boolean
  }
}
```

Los montos y porcentajes son string. El Controller no recalcula: usa `BudgetService`.

`HousingCoverage` (`HousingService.getCoverage`):

```ts
{
  housingObligationId: UUID
  currency: "ARS" | "USD"
  reserveAccountId: UUID | null
  reserveBalance: string | null
  installmentAmount: string
  remainingInstallments: number
  coveredInstallments: string | null
}
```

`GET /api/housing/:id/coverage` expone este DTO. No persistir. No cap por `remainingInstallments`. Inactiva: se calcula.

`GET /api/housing/:id/payments` lista `HousingPayment` por `paidAt DESC`, `createdAt DESC`.

Evitar exponer detalles internos de DB.

---

# 23. API style

La API será REST.

Ejemplos:

```text
GET    /api/accounts
POST   /api/accounts
GET    /api/accounts/:id/balance
PATCH  /api/accounts/:id
POST   /api/accounts/:id/activate
POST   /api/accounts/:id/deactivate

GET    /api/transactions
POST   /api/transactions
PATCH  /api/transactions/:id
POST   /api/transactions/:id/void
POST   /api/transactions/:id/reimbursements

POST   /api/transfers

POST   /api/currency-exchanges

GET    /api/budgets?year=&month=
POST   /api/budgets
PATCH  /api/budgets/:id

year y month son obligatorios en el listado.

GET    /api/housing
POST   /api/housing
GET    /api/housing/:id/coverage
GET    /api/housing/:id/payments
POST   /api/housing/:id/payments

GET    /api/investments
POST   /api/investments
POST   /api/investments/:id/mature
POST   /api/investments/:id/renew

POST   /api/simulations

POST   /api/ai/parse-transaction
POST   /api/ai/chat
```

Los endpoints finales se documentarán posteriormente.

---

# 24. HTTP status codes

Usar semántica estándar.

Ejemplos:

```text
200 OK
201 Created
204 No Content

400 Bad Request
401 Unauthorized
404 Not Found
409 Conflict
422 Unprocessable Entity
500 Internal Server Error
```

No devolver siempre 200.

---

# 25. Error handling

Definir errores de aplicación.

Ejemplos:

```text
ValidationError
NotFoundError
InsufficientFundsError
BusinessRuleError
ExternalServiceError
```

Los Services pueden lanzar errores de dominio/aplicación.

Middleware global los transforma a HTTP.

---

# 26. Error response

Formato recomendado:

```json
{
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "Saldo insuficiente para realizar la operación."
  }
}
```

No devolver stack traces al frontend.

---

# 27. Database

Base:

```text
PostgreSQL
```

Entornos:

```text
Development:
PostgreSQL local o Neon dev

Production:
Neon o Render PostgreSQL
```

La aplicación utilizará:

```env
DATABASE_URL=
DATABASE_URL_TEST=
```

---

# 28. Database portability

No depender de características propietarias de Neon o Render.

La DB debe funcionar en PostgreSQL estándar.

---

# 29. Prisma schema

El schema Prisma será generado a partir de:

```text
DOMAIN.md
DATA-MODEL.md
```

No debe diseñarse únicamente desde conveniencia de UI.

---

# 30. Migrations

Nunca modificar producción usando:

```text
db push
```

como estrategia principal.

Utilizar migrations versionadas.

Ejemplo:

```text
prisma migrate dev
prisma migrate deploy
```

---

# 31. Seed

Crear seed inicial.

Debe poder generar:

- usuario inicial;
- categorías;
- cuentas base opcionales;
- configuración demo opcional.

No insertar datos personales reales en el repositorio.

---

# 32. Dinero

Nunca utilizar JavaScript floating point como representación persistida final.

DB:

```text
NUMERIC
```

Prisma:

```text
Decimal
```

En API puede serializarse como string cuando sea necesario.

Ejemplo:

```json
{
  "amount": "75000.00"
}
```

---

# 33. Fechas

DB:

```text
TIMESTAMPTZ
```

Backend:

```text
UTC internamente
```

Frontend:

```text
timezone local para visualización
```

---

# 34. Transacciones DB

Operaciones financieras que afecten múltiples registros deben utilizar transacción DB.

Ejemplos:

```text
CurrencyExchange
HousingPayment
Investment start
Investment maturity
Reimbursement registration
```

Ejemplo:

```ts
prisma.$transaction(...)
```

---

# 35. CurrencyExchange transaction

Registrar cambio ARS → USD debe ser atómico.

No puede ocurrir:

```text
descontar ARS
```

sin:

```text
acreditar USD
```

Todo debe confirmar o revertirse.

---

# 36. Housing payment transaction

Debe guardarse atómicamente:

```text
Transaction HOUSING_PAYMENT
HousingPayment
HousingObligation remainingInstallments - 1
```

`Transaction.type = HOUSING_PAYMENT`. `categoryId = null`. Metadata exacta:

```json
{
  "housingPaymentId": "<uuid>",
  "housingObligationId": "<uuid>"
}
```

Signo: débito por tipo. Metadata no determina el signo.

`HOUSING_PAYMENT` no entra en métricas operativas ni budgets.

`PATCH /api/transactions/:id` y `POST /api/transactions/:id/void` rechazan este tipo (`HOUSING_PAYMENT_IMMUTABLE`).

---

# 37. Investment transaction

Inicio de inversión:

```text
Investment
Transaction
```

deben persistirse juntos.

Maturity:

```text
Investment update
Investment return transaction
```

también debe ser atómico.

---

# 38. Frontend data access

React components no deben realizar llamadas HTTP arbitrarias directamente.

Centralizar API client.

Ejemplo:

```text
lib/api/
```

o servicios por feature:

```text
features/transactions/api.ts
```

---

# 39. Frontend server/client boundaries

Next.js puede utilizar Server Components donde aporten valor.

Pero la arquitectura no debe depender de lógica financiera server-side de Next.

La fuente de negocio es Express.

Next.js es cliente de la API.

---

# 40. State management

No agregar Redux inicialmente.

Preferir:

```text
React local state
React Query / TanStack Query
```

para server state.

Si el estado global crece, reevaluar.

---

# 41. Data fetching

Recomendación:

```text
TanStack Query
```

Beneficios:

- cache;
- invalidation;
- loading;
- error states;
- mutations.

No crear infraestructura propia de caching.

---

# 42. UI state

Mantener separado:

```text
Server State
```

de:

```text
UI State
```

Ejemplo:

Server State:

```text
transactions
accounts
budgets
```

UI State:

```text
modal open
selected tab
temporary form
```

---

# 43. PWA

La PWA pertenece exclusivamente al frontend.

Debe incluir:

```text
manifest
icons
service worker
installability
standalone display
```

No implementar offline finance sync en MVP.

---

# 44. Responsive

Mobile:

```text
registro rápido
dashboard resumido
```

Desktop:

```text
análisis
gráficos
inversiones
simulaciones
```

La API es la misma.

---

# 45. OpenAI API key

Debe existir solamente en backend.

```env
OPENAI_API_KEY=
```

Nunca usar:

```text
NEXT_PUBLIC_OPENAI_API_KEY
```

Nunca enviar la API key al browser.

---

# 46. OpenAI client

Crear wrapper propio.

Ejemplo:

```ts
class OpenAIClient {
  parseTransactions(...)
  chat(...)
}
```

El resto del sistema no debería depender directamente del SDK de OpenAI.

---

# 47. External integration abstraction

OpenAI debe considerarse integración externa.

```text
AIService
↓
OpenAIClient
↓
OpenAI SDK
```

Esto permite:

- mock testing;
- cambiar modelos;
- manejar errores;
- cambiar proveedor si fuese necesario.

---

# 48. AI failure

Errores externos no deben romper el dominio.

Si OpenAI falla:

```text
AI Service unavailable
```

pero:

```text
transactions
dashboard
budgets
housing
investments
```

siguen funcionando.

---

# 49. AI timeout

Configurar timeout razonable para OpenAI.

No dejar requests abiertas indefinidamente.

El frontend debe mostrar:

```text
Procesando...
```

y permitir reintento.

---

# 50. Model selection

No hardcodear modelo en múltiples lugares.

Configurar:

```env
OPENAI_MODEL=
```

o una configuración central.

Permite cambiar a modelos más económicos sin modificar lógica.

---

# 51. Cost control AI

El MVP debe minimizar consumo.

Reglas:

- contexto mínimo;
- no enviar historial financiero completo;
- usar tools;
- enviar agregados;
- limitar tokens de respuesta;
- Structured Output para parsing;
- no llamar AI para cálculos determinísticos.

---

# 52. Logging

Backend debe tener logging básico estructurado.

Puede utilizar:

```text
Pino
```

o solución equivalente.

Registrar:

- requests relevantes;
- errores;
- integrations failures.

No loggear:

- API keys;
- secretos;
- datos bancarios sensibles.

---

# 53. Request ID

Cada request debería poder tener identificador.

Ejemplo:

```text
requestId
```

Útil para debug.

No obligatorio en primera tarea, pero recomendable.

---

# 54. Security middleware

Backend:

```text
helmet
cors
rate limiting
body size limits
```

La configuración exacta dependerá del deployment.

---

# 55. CORS

Desarrollo:

```text
localhost web
→
localhost API
```

Producción:

solamente origen oficial del frontend.

No dejar:

```text
Access-Control-Allow-Origin: *
```

en producción sin motivo.

---

# 56. Authentication

La aplicación es personal.

Para MVP no se necesita un sistema complejo de auth.

Pero producción debe impedir acceso público a información financiera.

La estrategia se definirá antes del deployment público.

Opciones futuras:

- login simple;
- magic link;
- auth provider;
- sesión segura.

No implementar OAuth múltiple sin necesidad.

---

# 57. API authorization

Una vez implementada auth:

todo recurso debe verificarse contra:

```text
userId
```

Nunca confiar en userId enviado libremente por frontend.

Debe provenir de sesión/token validado.

---

# 58. Environment structure

Backend:

```env
NODE_ENV=
PORT=
DATABASE_URL=
DATABASE_URL_TEST=
OPENAI_API_KEY=
OPENAI_MODEL=
FRONTEND_URL=
```

Frontend:

```env
NEXT_PUBLIC_API_URL=
```

No duplicar secrets.

---

# 59. Local development

Ejemplo:

```text
web:
http://localhost:3000

api:
http://localhost:3001

postgres:
localhost:5432
personal_finance        # desarrollo / QA manual
personal_finance_test   # npm run test:api
```

M7.8: los tests de integración no pueden usar la DB de desarrollo. `npm run test:api` exige `DATABASE_URL_TEST` y una base cuyo nombre termine en `_test`. No hay fallback silencioso a `DATABASE_URL`.

Puede usarse Docker para PostgreSQL si resulta cómodo.

No es obligatorio containerizar todo el proyecto desde el día uno.

---

# 60. Deployment target

Arquitectura compatible con:

```text
Frontend:
Vercel o Render

Backend:
Render Web Service

Database:
Neon PostgreSQL o Render PostgreSQL
```

No atar el código a ninguno.

---

# 61. Deployment example

```text
Vercel
  ↓
Next.js PWA
  ↓
Render
  ↓
Express API
  ↓
Neon
  ↓
PostgreSQL
```

OpenAI:

```text
Express API
↓
OpenAI API
```

---

# 62. Health check

Backend debe exponer:

```text
GET /health
```

Ejemplo:

```json
{
  "status": "ok"
}
```

Puede incluir chequeo simple DB posteriormente.

---

# 63. API versioning

MVP puede comenzar:

```text
/api
```

No es necesario:

```text
/api/v1
```

hasta que exista una necesidad real de versionado.

Puede adoptarse desde el inicio si se prefiere consistencia.

---

# 64. Testing strategy

Prioridad:

```text
Service tests
```

para lógica financiera.

Luego:

```text
Repository integration tests
```

para operaciones críticas.

E2E:

solamente flujos principales.

---

# 65. Unit tests

Debe testearse especialmente:

```text
FinancialService
BudgetService
HousingService
InvestmentService
SimulationService
```

---

# 66. Repository tests

Especialmente:

```text
transactions
currency exchange
investment lifecycle
reimbursements
```

---

# 67. AI tests

No depender del API real de OpenAI para unit tests.

Mockear:

```text
OpenAIClient
```

Testear:

```text
Structured Output mapping
Tool routing
Confirmation flow
Error handling
```

---

# 68. API tests

Casos prioritarios:

```text
POST transaction
GET transactions
POST reimbursement
POST currency exchange
POST housing payment
POST investment
POST investment maturity
```

---

# 69. Frontend tests

No buscar cobertura exhaustiva.

Priorizar:

```text
Quick Add
AI Preview
Dashboard
Housing Payment
Investment creation
```

---

# 70. No microservices

MVP utilizará un backend único.

```text
Express API
```

No dividir por servicios desplegables.

No crear:

```text
transaction-service
housing-service
ai-service
```

como apps independientes.

Los "services" son módulos internos.

---

# 71. No event bus

No utilizar:

```text
Kafka
RabbitMQ
SNS
SQS
```

en MVP.

Las operaciones son sincrónicas salvo llamadas externas.

---

# 72. No CQRS

No implementar separación de:

```text
commands
queries
handlers
```

salvo necesidad futura demostrable.

---

# 73. No generic repository

Evitar crear abstracciones como:

```ts
GenericRepository<T>
```

si terminan limitando queries reales.

Preferir repositories específicos:

```text
TransactionRepository
AccountRepository
InvestmentRepository
```

---

# 74. No BaseService

Evitar:

```ts
BaseService<T>
```

La lógica financiera es demasiado específica para beneficiarse de CRUD genérico.

---

# 75. Avoid premature abstractions

No crear interfaces únicamente "por si algún día".

Crear abstracciones cuando:

- protegen una dependencia externa;
- facilitan testing;
- representan un contrato real.

Ejemplo válido:

```text
OpenAIClient
```

porque representa proveedor externo.

---

# 76. Repository interfaces

Las interfaces de repository son opcionales.

Si agregarlas mejora testing y claridad:

usar.

Si sólo agregan archivos sin beneficio:

pueden omitirse inicialmente.

Lo importante es respetar:

```text
Service
↓
Repository
```

---

# 77. Transaction boundaries

Las transacciones DB deben controlarse desde Service.

Repository ejecuta persistencia.

Pero Service conoce cuándo múltiples operaciones forman una unidad de negocio.

---

# 78. Example flow — Expense

```text
POST /api/transactions

TransactionController
↓
validate request
↓
TransactionService.createExpense()
↓
validate account
↓
validate category
↓
TransactionRepository.create()
↓
PostgreSQL
↓
response
```

---

# 79. Example flow — Transfer same currency

```text
POST /api/transfers

TransactionController.createTransfer()
↓
TransactionService.createTransfer()
↓
validate accounts, currency, balance
↓
generate transferId
↓
transaction DB
   ├── TRANSFER OUT
   └── TRANSFER IN
↓
response { transferId, out, in }
```

Metadata:

```text
{ transferId, direction: "OUT" | "IN" }
```

PATCH/void de una pierna se rechazan.

---

# 80. Example flow — Currency exchange

```text
POST /api/currency-exchanges

CurrencyExchangeController.create()
↓
CurrencyExchangeService.create()
↓
validate accounts, pair ARS/USD, balance, rate
↓
toAmount = ROUND_HALF_UP(fromAmount / o * exchangeRate)
↓
transaction DB
   ├── CurrencyExchange
   ├── CURRENCY_EXCHANGE OUT
   └── CURRENCY_EXCHANGE IN
↓
response { exchange, out, in }
```

Metadata:

```text
{ currencyExchangeId, direction: "OUT" | "IN" }
```

PATCH/void de una pierna se rechazan.

---

# 81. Example flow — Reimbursement

```text
POST /api/transactions/:id/reimbursements

TransactionController
↓
TransactionService.registerReimbursement()
↓
find original expense
↓
calculate pending amount
↓
validate reimbursement
↓
transaction DB
↓
create reimbursement transaction
↓
update reimbursement status
```

---

# 82. Example flow — Housing payment

HousingController
↓
HousingService.registerPayment()
↓
validate obligation
↓
validate account balance
↓
DB transaction
   ├── create transaction
   ├── create housing payment
   └── decrement remaining installments
↓
response
```

---

# 82. Example flow — Investment

```text
GET /api/investments

InvestmentController.list()
↓
InvestmentService.list()
↓
InvestmentRepository.findByUserId()
↓
sort ACTIVE first, then createdAt desc
↓
response []
```

```text
POST /api/investments

InvestmentController
↓
InvestmentService.create()
↓
validate balance
↓
calculate expected return
↓
DB transaction
   ├── create investment
   └── create investment outflow
↓
response
```

```text
POST /api/investments/:id/mature

body:
  destinationAccountId
  capitalReturned
  actualReturn
  occurredAt

InvestmentController
↓
InvestmentService.mature()
↓
validate ACTIVE, CAUCION, dates, destination, capitalReturned, actualReturn
↓
DB transaction
   ├── create INVESTMENT_PRINCIPAL_RETURN
   ├── create INVESTMENT_RETURN (si actualReturn > 0)
   └── update Investment MATURED + actualReturn
↓
response (investment + destinationAccountId + occurredAt)
```

```text
POST /api/investments/:id/renew

body:
  accountId
  renewalPrincipal
  actualReturn
  annualRate
  occurredAt
  maturityDate
  notes?

InvestmentController
↓
InvestmentService.renew()
↓
validate ACTIVE, CAUCION, dates, account, actualReturn, renewalPrincipal
↓
calculate new expectedReturn
↓
DB transaction
   ├── INVESTMENT_PRINCIPAL_RETURN (original)
   ├── INVESTMENT_RETURN (si actualReturn > 0)
   ├── original → RENEWED + actualReturn
   ├── create new Investment ACTIVE
   └── INVESTMENT_OUTFLOW (nueva)
↓
response (original + newInvestment)
```

---

# 83. Example flow — AI Q&A

User:

```text
¿Cuántas cuotas de la casa tengo cubiertas?
```

Flow:

```text
POST /api/ai/chat
↓
AIController
↓
AIService
↓
OpenAI requests tool
↓
HousingService.getCoverage()
↓
HousingRepository
↓
PostgreSQL
↓
coverage = 9.40
↓
OpenAI
↓
"Actualmente tenés cubiertas aproximadamente 9,4 cuotas."
```

OpenAI explica.

HousingService calcula.

---

# 84. Example flow — Runway AI

User:

```text
¿Qué pasa si no consigo trabajo durante 6 meses?
```

Flow:

```text
AI
↓
simulateMonthsWithoutIncome({ userId, year, month, months, timeZone })
↓
SimulationService (M7.2)
↓
FinancialService.getFinancialSummary  // baseline real
↓
projectCapital + calculateSimulatedRunway  // primitives M7.1
↓
repositories (sólo vía FinancialService)
↓
deterministic result
↓
AI explanation
```

La AI no hace la proyección matemática por su cuenta.

M7.1 sigue exponiendo primitives puras (sin HTTP, sin Repository, sin Prisma, sin clock):

```text
adjustMonthlyConsumption
projectCapital
calculateSimulatedRunway
convertUsdToArs
```

No leen DB. Reciben valores. Siguen siendo determinísticas aunque `SimulationService` reciba `FinancialService` en el constructor: las primitives no lo usan.

M7.2 agrega el escenario `simulateMonthsWithoutIncome` en el mismo `SimulationService`:

1. valida `months` entero `> 0`;
2. obtiene baseline con `FinancialService.getFinancialSummary(userId, year, month, timeZone)`;
3. proyecta con `monthlyIncomeARS = "0.00"` y consumo = `averageMonthlyFundConsumption`;
4. calcula runway posterior con `calculateSimulatedRunway`.

No hay `SimulationScenarioService` extra. No hay Repository de simulaciones. M7.2 no llama HousingService ni InvestmentService.

M7.5 agrega HTTP mínimo:

```text
POST /api/simulations
```

`SimulationController` es thin: valida el body (discriminated union `type`), resuelve el usuario configurado y llama `SimulationService`. No contiene reglas financieras. No persiste `Scenario`. Respuesta: `{ type, result }` con el DTO específico del escenario.

M7.3 agrega `simulateNewJobScenario` en el mismo `SimulationService`:

1. valida `monthsUntilJob >= 0`, `totalMonths > 0`, `monthsUntilJob <= totalMonths`, ingreso `>= 0` y fracción `>= -1`;
2. obtiene baseline con `FinancialService.getFinancialSummary`;
3. ajusta consumo con `adjustMonthlyConsumption` (todo el horizonte);
4. proyecta tramo 1 (`income 0`) y tramo 2 (`newMonthlyIncomeARS`) con `projectCapital`;
5. suma consumos en centavos; depleted global; runway con draw post-empleo (o consumo ajustado si el empleo no entra en el horizonte).

Las primitives siguen siendo determinísticas. M7.3 no llama HousingService ni InvestmentService.

M7.4 agrega `simulateHousingReserve` en el mismo `SimulationService`:

1. valida `targetInstallments` entero `> 0` y FX `> 0`;
2. obtiene `HousingService.getCoverage` (autoridad de reserva y cobertura);
3. rechaza obligaciones que no estén en USD;
4. exige `targetInstallments <= remainingInstallments`;
5. calcula target/missing/excess en USD con centavos;
6. convierte el faltante con `convertUsdToArs`;
7. obtiene `FinancialService.getFinancialSummary` para `totalAvailableARS` y `runwayMonths` de referencia;
8. calcula remaining ARS hipotético, shortfall y `canFullyFund`.

No hay Repository de simulaciones. No llama InvestmentService. No recalcula runway.

M7.5 no cambia esas reglas: sólo expone `POST /api/simulations` y la UI `/simulations`.

M7.6 no cambia reglas financieras ni el modelo Account. Expone la UI `/accounts` sobre los endpoints ya existentes (`GET/POST/PATCH /api/accounts`, `GET /api/accounts/:id/balance`, activate/deactivate). Una cuenta creada desde la UI nace con `initialBalance = 0`. El capital se incorpora con `Transaction` CAPITAL. El saldo de la card es el balance derivado, no `initialBalance`.

M7.7 no cambia reglas financieras ni immutability. Expone la UI `/transactions` sobre `GET/PATCH /api/transactions` y `POST /api/transactions/:id/void`. El listado puede filtrar por mes, tipo, cuenta, categoría y status. No hay paginación nueva. No hay GET por id.

M7.9 no cambia reglas de M2.3/M2.4. Expone la UI `/transfers` sobre `POST /api/transfers` y `POST /api/currency-exchanges`. No crea EXPENSE ni INCOME.

M7.10 no cambia FinancialService ni HousingService. El Dashboard `/` lee `GET /api/housing` y `GET /api/housing/:id/coverage` para reemplazar el placeholder de vivienda. Muestra la primera obligación ACTIVE del listado. No recalcula coverage. Un error de Housing no tapa el resumen financiero.

---

# 84. API documentation

La API debería documentarse.

Puede utilizarse:

```text
OpenAPI / Swagger
```

No es obligatorio en M0.

Agregar antes de considerar API estable.

---

# 85. Formatting

Backend devuelve valores monetarios sin formato visual.

Ejemplo:

```json
{
  "amount": "75000.00",
  "currency": "ARS"
}
```

Frontend decide:

```text
$75.000
```

No formatear moneda en repository.

---

# 86. Business timezone

Guardar timestamps en UTC.

La lógica de "mes actual" debe utilizar timezone configurable del usuario.

Inicialmente:

```text
America/Argentina/Buenos_Aires
```

como configuración de aplicación.

No asumir UTC para cierres mensuales visuales.

---

# 87. Configuration

Crear módulo/config helper central.

Evitar llamadas directas repetidas a:

```ts
process.env
```

por todo el código.

Ejemplo:

```ts
config.databaseUrl
config.openAi.apiKey
```

---

# 88. Startup validation

Al iniciar backend validar variables obligatorias.

Si falta:

```text
DATABASE_URL
```

el servidor no debe iniciar silenciosamente.

Si falta OpenAI:

el servidor puede iniciar, pero AI queda deshabilitada.

---

# 89. Graceful shutdown

Backend debe cerrar conexiones correctamente al recibir:

```text
SIGTERM
SIGINT
```

Especialmente importante en Render.

Cerrar:

- HTTP server;
- Prisma client.

---

# 90. Database connection

Usar una única instancia Prisma por proceso.

No crear:

```text
new PrismaClient()
```

por request.

---

# 91. Neon considerations

Si se utiliza Neon:

- respetar connection limits;
- utilizar connection pooling cuando corresponda;
- revisar string de conexión recomendada.

No incorporar código específico de Neon en dominio.

---

# 92. Render considerations

Si se utiliza Render:

- utilizar health check;
- environment variables;
- migrations durante deployment;
- evitar estado persistente en filesystem local.

---

# 93. File storage

El MVP no requiere file storage.

No agregar:

```text
S3
Cloudinary
Supabase Storage
```

hasta que exista una feature que lo necesite.

---

# 94. Caching

No agregar Redis.

PostgreSQL + TanStack Query son suficientes para MVP.

Si aparecen problemas reales de performance:

medir primero.

---

# 95. Background jobs

No agregar workers inicialmente.

Si futuras features necesitan:

- notificaciones;
- vencimientos automáticos;
- reportes;

se evaluará un job runner.

En MVP los vencimientos se calculan al consultar.

---

# 96. Deployment independence

El código debe poder ejecutarse:

```text
local
Render
Vercel
Neon
otro PostgreSQL
```

sin cambios de dominio.

---

# 97. Architecture decisions summary

Decisiones:

```text
Frontend:
Next.js

Backend:
Express + TypeScript

Database:
PostgreSQL

ORM:
Prisma

Architecture:
Controller → Service → Repository

AI:
OpenAI server-side

Frontend server state:
TanStack Query

Validation:
Zod

Repository:
Monorepo simple

PWA:
Next.js
```

---

# 98. Intencionalmente NO utilizado

```text
NestJS
microservices
CQRS
event sourcing
Kafka
RabbitMQ
Redis
GraphQL
DDD estricto
Hexagonal completa
Clean Architecture ceremonial
generic repositories
BaseService
```

Esto puede cambiar solamente ante una necesidad concreta.

---

# 99. Regla de arquitectura

Cada feature nueva debe responder:

1. ¿A qué módulo pertenece?
2. ¿Qué Controller expone HTTP?
3. ¿Qué Service contiene la regla?
4. ¿Qué Repository necesita persistencia?
5. ¿Necesita realmente una nueva entidad?
6. ¿Puede reutilizar servicios existentes?

No crear nuevas capas por comodidad.

---

# 100. Regla SDD

Este documento es la fuente de verdad de la arquitectura.

Cursor/AI debe respetar:

```text
Controller
↓
Service
↓
Repository
```

No debe:

- acceder directamente a Prisma desde Controllers;
- colocar lógica financiera en routes;
- colocar lógica financiera en frontend;
- permitir que OpenAI acceda directamente a DB;
- crear microservicios;
- introducir patrones arquitectónicos adicionales sin actualizar previamente este documento.

Cualquier cambio arquitectónico requiere:

1. justificar necesidad;
2. actualizar `ARCHITECTURE.md`;
3. actualizar documentación afectada;
4. actualizar backlog;
5. recién después implementar.
