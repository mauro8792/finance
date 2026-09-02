# BACKLOG.md

# Personal Finance Runway — Implementation Backlog

## 1. Propósito

Este documento transforma la especificación en trabajo implementable.

Regla principal:

```text
Una tarea debe ser suficientemente pequeña para que Cursor pueda implementarla, probarla y cerrar sin reinterpretar el producto.
```

No comenzar implementación fuera del backlog sin actualizar primero la especificación.

---

# 2. Estado

Estados permitidos:

```text
TODO
IN_PROGRESS
BLOCKED
DONE
```

Prioridad:

```text
P0
P1
P2
```

---

# 3. M0 — Foundation

## M0.1 — Crear monorepo

**Prioridad:** P0  
**Estado:** DONE

Crear:

```text
apps/web
apps/api
packages/shared
docs
```

Configurar workspaces.

**Aceptación**

- web inicia;
- api inicia;
- TypeScript funciona;
- scripts raíz disponibles.

---

## M0.2 — Backend Express base

**Prioridad:** P0  
**Estado:** DONE

Crear:

```text
app.ts
server.ts
GET /health
error middleware
config
```

**Aceptación**

`GET /health` devuelve 200.

---

## M0.3 — PostgreSQL + Prisma

**Prioridad:** P0  
**Estado:** DONE

- instalar Prisma;
- configurar `DATABASE_URL`;
- PrismaClient singleton;
- migration inicial vacía/base;
- startup validation.

**Aceptación**

API conecta a PostgreSQL.

---

## M0.4 — Frontend Next.js base

**Prioridad:** P0  
**Estado:** DONE

- App Router;
- TypeScript;
- layout;
- navegación base;
- API client.

---

## M0.5 — PWA base

**Prioridad:** P1  
**Estado:** DONE

- manifest;
- icons placeholders;
- standalone;
- installability.

Offline sync fuera de alcance.

---

## M0.6 — Shared package

**Prioridad:** P1  
**Estado:** DONE

Compartir sólo:

- enums;
- DTO contracts;
- schemas realmente compartidos.

---

# 4. M1 — Core Finance

## M1.1 — User

**P0 / DONE**

Implementar:

```text
User model
UserRepository
UserService
seed user
```

Sin auth pública todavía.

---

## M1.2 — Categories

**P0 / DONE**

Implementar:

- Prisma model;
- migration;
- seed;
- repository;
- service;
- controller;
- routes;
- validations.

Endpoints:

```text
GET /api/categories
POST /api/categories
PATCH /api/categories/:id
```

---

## M1.3 — Accounts

**P0 / DONE**

Implementar CRUD mínimo:

```text
GET
POST
PATCH
activate/deactivate
```

No hard delete.

---

## M1.4 — Transactions model

**P0 / DONE**

Implementar schema DB según `DATA-MODEL.md`.

Incluir:

- enums;
- status;
- related transaction;
- metadata;
- indexes.

---

## M1.5 — Registrar gasto

**P0 / DONE**

Flujo completo Controller → Service → Repository.

Tests:

- amount positivo;
- moneda correcta;
- ownership;
- persistencia;
- gasto ACTIVE.

---

## M1.6 — Registrar ingreso

**P0 / DONE**

Soportar:

```text
OPERATING
CAPITAL
```

La primera implementación puede utilizar metadata según `BUSINESS-RULES.md`.

Agregar tests para asegurar que capital inicial no sea ingreso operativo.

---

## M1.7 — Listar movimientos

**P0 / DONE**

Filtros:

- mes;
- tipo;
- categoría;
- moneda.

Orden descendente por fecha.

---

## M1.8 — Editar movimiento

**P1 / DONE**

Validar nuevamente reglas financieras.

---

## M1.9 — Anular movimiento

**P0 / DONE**

Cambiar a:

```text
VOIDED
```

No hard delete.

---

## M1.10 — Account balance

**P0 / DONE**

Implementar cálculo determinístico.

Tests para créditos, débitos y VOIDED.

---

## M1.11 — Quick Add UI

**P0 / DONE**

Mobile-first:

```text
amount
category
save
```

Objetivo UX: <10 segundos.

---

# 5. M2 — Reimbursements + Transfers

## M2.1 — Reintegro

**P0 / DONE**

Crear reintegro relacionado.

Actualizar status:

```text
PENDING
PARTIAL
COMPLETED
```

---

## M2.2 — Gasto neto

**P0 / DONE**

Implementar cálculo:

```text
expense - reimbursements
```

Tests obligatorios.

---

## M2.3 — Transferencia misma moneda

**P0 / DONE**

Implementar operación atómica OUT + IN.

Representación cerrada:

```text
type = TRANSFER
metadata.transferId
metadata.direction = OUT | IN
```

Sin tabla Transfer. Sin `relatedTransactionId`.

---

## M2.4 — CurrencyExchange

**P0 / DONE**

Implementar:

- model;
- migration;
- repository;
- service;
- endpoint;
- DB transaction.

Representación cerrada:

```text
type = CURRENCY_EXCHANGE
metadata.currencyExchangeId
metadata.direction = OUT | IN
exchangeRate = ARS por 1 USD
```

Cliente envía `fromAmount` + `exchangeRate`. Backend calcula `toAmount` (ROUND_HALF_UP).

`POST /api/currency-exchanges`. Sin tabla extra de piernas: `currency_exchanges` + dos Transactions.

---

# 6. M3 — Financial Dashboard

## M3.1 — FinancialService

**P0 / DONE**

Implementar:

```text
getMonthlyGrossExpenses
getMonthlyNetExpenses
getMonthlyOperatingIncome
getMonthlyFundConsumption
getTotalAvailableARS
calculateRunway
getFinancialSummary
```

Respetar `BUSINESS-RULES.md`.

Decisiones cerradas:

```text
totalAvailableARS = CASH + BANK + FUND, ARS, isActive
mes válido = ≥1 EXPENSE ACTIVE ARS
consumo 0 en mes válido entra al promedio
sin mes válido → average y runway null
promedio 0 → runway null
sin HTTP (M3.2)
```

---

## M3.2 — Dashboard API

**P0 / DONE**

Endpoint agregado:

```text
GET /api/financial/summary
```

No hacer múltiples cálculos financieros en frontend.

---

## M3.3 — Dashboard mobile

**P0 / DONE**

Mostrar:

- fondo ARS;
- vivienda USD;
- gasto neto;
- consumo fondo;
- runway;
- CTA registrar.

---

## M3.4 — Dashboard desktop

**P1 / DONE**

Agregar análisis ampliado y gráficos básicos.

---

# 7. M4 — Budgets

## M4.1 — Budget persistence

**P0 / DONE**

Model + migration + repository.

```text
budgets
UNIQUE(user_id, category_id, currency, year, month)
sin HTTP (M4.2.1)
```

---

## M4.2 — BudgetService

**P0 / DONE**

Implementar:

```text
progress
available
spending pace
```

Respetar `BUSINESS-RULES.md`.

```text
consumption = NetExpense(category, month, currency)
progress = consumption / amount * 100
available = amount - consumption (sin clamp)
monthProgress = elapsedDays / totalDays
budgetProgress = consumption / amount
aboveExpectedPace = budgetProgress > monthProgress
sin HTTP (M4.2.1)
```

---

## M4.2.1 — Budget API

**P0 / DONE**

Create, update (sólo amount), list por período y exponer progress/available/spending pace.

```text
POST  /api/budgets
PATCH /api/budgets/:id
GET   /api/budgets?year=&month=
amount > 0 en create/update
sin UI (M4.3)
```

---

## M4.3 — Budget UI

**P1 / DONE**

Crear/editar y visualizar progreso.

Depende de M4.2.1 — Budget API.

```text
ruta /budgets
GET/POST/PATCH BudgetView
sin selector histórico
```

---

# 8. M5 — Housing

## M5.1 — HousingObligation

**P0 / DONE**

Model + migration + CRUD mínimo.

```text
GET    /api/housing
GET    /api/housing/:id
POST   /api/housing
PATCH  /api/housing/:id
sin UI (M5.4)
sin HousingPayment (M5.2)
```

---

## M5.2 — HousingPayment

**P0 / DONE**

Operación atómica:

```text
POST /api/housing/:id/payments
Transaction HOUSING_PAYMENT
HousingPayment
remaining installments - 1
sin cobertura (M5.3)
sin UI (M5.4)
sin edit/void atómico del pago
```

---

## M5.3 — HousingCoverage

**P0 / DONE**

Cálculo determinístico.

```text
HousingService.getCoverage()
sin persistir coverage
```

---

## M5.3.1 — Housing Read API

**P0 / DONE**

```text
GET /api/housing/:id/coverage
GET /api/housing/:id/payments
sin UI (M5.4)
sin reglas financieras nuevas
```

---

## M5.4 — Housing UI

**P1 / DONE**

Depende de M5.3.1 — Housing Read API.

Pantalla `/housing`:

- empty / listado de obligaciones;
- cuota, pendientes, vencimiento, reserva, activa/inactiva;
- cobertura vía `GET /api/housing/:id/coverage` (sin recálculo UI);
- create/update;
- registro de pago;
- historial vía `GET /api/housing/:id/payments`.

Navegación mobile: Más → Vivienda. No se tocó el dashboard `/`.

---

# 9. M6 — Investments

## M6.1 — Investment model

**P0 / DONE**

Model + migration.

```text
tabla investments
enums CAUCION/OTHER y DRAFT/ACTIVE/MATURED/RENEWED/CANCELLED
annual_rate fracción (30% = 0.300000)
account_id = cuenta origen del futuro outflow
sin repository/service/HTTP (M6.2+)
```

---

## M6.2 — Crear caución

**P0 / DONE**

Validar saldo y calcular expected return.

No contar colocación como gasto operativo.

```text
POST /api/investments
Investment ACTIVE + INVESTMENT_OUTFLOW atómico
days = diferencia calendario ART, no inclusiva
expectedReturn ROUND_HALF_UP 2 decimales
sin vencimiento (M6.3)
sin UI (M6.5)
```

---

## M6.3 — Vencimiento

**P0 / DONE**

Registrar:

- principal retornado (`INVESTMENT_PRINCIPAL_RETURN`);
- actual return (`INVESTMENT_RETURN` si > 0);
- status `MATURED`.

```text
POST /api/investments/:id/mature
ACTIVE → MATURED
capitalReturned == principal (CAUCION)
actualReturn >= 0
destinationAccountId del cliente
occurredAt calendario ART >= maturityDate
sin renovación (M6.4)
```

---

## M6.4 — Renovación

**P1 / DONE**

Renovación = vencimiento económico + nueva colocación, atómicos. No hay rollover invisible.

```text
POST /api/investments/:id/renew
ACTIVE → RENEWED + nueva CAUCION ACTIVE
renewalPrincipal > 0 y <= principal
actualReturn >= 0 (no se capitaliza)
misma accountId recibe y vuelve a colocar
startDate nueva = occurredAt
sin UI (M6.5)
```

---

## M6.5 — Investment UI

**P1 / DONE**

Activas, vencimientos y finalizadas.

```text
/investments
GET /api/investments
create / mature / renew sobre contratos M6.2–M6.4
sin simulaciones (M7)
```

---

# 10. M7 — Simulations

## M7.1 — SimulationService

**P0 / DONE**

Primitives puras/read-only. Sin escenarios de producto, sin HTTP, sin persistencia.

```text
adjustMonthlyConsumption
projectCapital
calculateSimulatedRunway
convertUsdToArs
sin simulateMonthsWithoutIncome (M7.2)
```

---

## M7.2 — Sin ingreso N meses

**P0 / DONE**

Escenario read-only «sin ingreso N meses». Reutiliza FinancialService + primitives M7.1. Sin HTTP, sin persistencia, sin housing, sin investments future cashflow.

```text
simulateMonthsWithoutIncome({ userId, year, month, months, timeZone })
monthlyIncomeARS = 0
consumo = averageMonthlyFundConsumption
sin POST /api/simulations
```

---

## M7.3 — Nuevo empleo

**P1 / DONE**

Escenario read-only «nuevo empleo» en dos tramos. Reutiliza FinancialService + primitives M7.1. Sin HTTP, sin persistencia, sin housing, sin investments future cashflow.

```text
simulateNewJobScenario({ userId, year, month, monthsUntilJob, totalMonths, newMonthlyIncomeARS, expenseChangeFraction, timeZone })
phase1 income = 0
phase2 income = newMonthlyIncomeARS
expenseChange aplica a todo el horizonte
sin POST /api/simulations
```

---

## M7.4 — Reserva vivienda

**P1 / DONE**

Escenario read-only «cuántas cuotas reservar». USD-only. Reutiliza HousingService.getCoverage, FinancialService y convertUsdToArs. Sin HTTP, sin persistencia, sin compra USD, sin recalcular runway.

```text
simulateHousingReserve({ userId, housingObligationId, targetInstallments, exchangeRateARSPerUSD, year, month, timeZone })
targetReserve = installment * target
null/negativo reserve => effective 0
sin POST /api/simulations
```

---

## M7.5 — Simulations UI

**P1 / DONE**

Pantalla `/simulations` read-only. `POST /api/simulations` discriminado por `type`. No persiste resultados. No modifica datos financieros.

---

## M7.6 — Accounts UI

**P1 / DONE**

Pantalla `/accounts` para listar, crear, editar y activar/desactivar cuentas. Reutiliza `GET/POST/PATCH /api/accounts` y `GET /api/accounts/:id/balance`. Creación desde UI con `initialBalance = 0`. El capital se incorpora después con `INCOME` + `incomeKind CAPITAL`. Sin seed de indemnización. Sin M8.

---

## M7.7 — Movimientos UI

**P1 / DONE**

Pantalla `/transactions` para consultar y auditar el historial. Reutiliza `GET/PATCH /api/transactions` y `POST /api/transactions/:id/void`. Alta sigue en `/registrar`. No hard delete. No cambia reglas financieras.

---

## M7.8 — QA environment hardening

**P1 / DONE**

Corregir filtro mes/año de `/transactions`. Aislar DB de desarrollo (`personal_finance`) de la DB de tests (`personal_finance_test`). Cleanup DEV-only de fixtures viejos, sin tocar la prueba manual de 40M/2M. Sin M8. Sin reglas financieras nuevas.

---

## M7.9 — Transferencias y cambio de moneda UI

**P1 / DONE**

Pantalla `/transfers` (“Mover dinero”) para transferir entre cuentas de la misma moneda y registrar cambio ARS↔USD. Reutiliza `POST /api/transfers` y `POST /api/currency-exchanges`. No crea EXPENSE/INCOME. No cambia reglas de M2.3/M2.4. Sin M8.

---

## M7.10 — Housing coverage en Dashboard

**P1 / DONE**

Reemplazar el placeholder “Vivienda USD — Aún no disponible” por coverage real. Compone `GET /api/housing` + `GET /api/housing/:id/coverage`. No recalcula HousingCoverage. No cambia FinancialService ni el runway ARS. Sin M8.

---

# 11. M8 — AI Transaction Parser

## M8.1 — OpenAIClient

**P0 / TODO**

Wrapper server-side.

- API key backend;
- model config;
- timeout;
- errors.

---

## M8.2 — Parse transaction schema

**P0 / TODO**

Structured Output validado.

---

## M8.3 — Parser endpoint

**P0 / TODO**

```text
POST /api/ai/parse-transaction
```

No persistir.

---

## M8.4 — AI Quick Input UI

**P0 / TODO**

Input → preview → confirm/edit/cancel.

---

## M8.5 — Multiple parsed transactions

**P1 / TODO**

Soportar múltiples propuestas.

---

# 12. M9 — AI Assistant

## M9.1 — Tool layer

**P0 / TODO**

Exponer Services como tools controladas.

---

## M9.2 — AI chat endpoint

**P0 / TODO**

```text
POST /api/ai/chat
```

---

## M9.3 — Financial Q&A UI

**P1 / TODO**

Chat simple.

No memoria compleja.

---

## M9.4 — Simulation tools

**P1 / TODO**

AI puede invocar SimulationService.

---

# 13. M10 — Polish

## M10.1 — CSV export

**P1 / TODO**

Exportar movimientos con filtros.

---

## M10.2 — Empty/error/loading states

**P0 / TODO**

Todas las pantallas principales.

---

## M10.3 — Responsive review

**P0 / TODO**

Revisar mobile/tablet/desktop.

---

## M10.4 — Security baseline

**P0 / TODO**

- helmet;
- CORS;
- body limits;
- validation;
- secrets;
- logs.

---

## M10.5 — Auth antes de producción pública

**P0 / TODO**

Elegir e implementar mecanismo simple de autenticación.

No desplegar información financiera públicamente sin protección.

---

## M10.6 — Deployment

**P1 / TODO**

Arquitectura objetivo compatible con:

```text
Web: Vercel/Render
API: Render
DB: Neon/Render PostgreSQL
```

---

# 14. Deferred backlog

No implementar todavía:

```text
Person
household/shared finance
credit card liabilities
automatic card installments
bank sync
broker sync
OCR
notifications
offline writes
Excel import
advanced Excel export
multiuser
roles
market predictions
```

---

# 15. Technical debt rule

No crear tareas genéricas tipo:

```text
refactor architecture
improve code
clean everything
```

Toda deuda debe describir:

- problema;
- impacto;
- alcance;
- criterio de aceptación.

---

# 16. Cursor task rule

Cada prompt de implementación debe incluir:

1. tarea del backlog;
2. documentos relevantes;
3. alcance;
4. archivos esperados si se conocen;
5. reglas que no debe romper;
6. tests;
7. criterio de aceptación;
8. instrucción de no avanzar a la siguiente tarea.

---

# 17. Orden inicial recomendado para Cursor

```text
M0.1
M0.2
M0.3
M0.4
M0.6
M1.1
M1.2
M1.3
M1.4
M1.5
M1.6
M1.7
M1.9
M1.10
M1.11
```

Luego continuar milestone por milestone.

---

# 18. Definition of Done global

Una tarea está `DONE` cuando:

- compila;
- funciona;
- respeta SDD;
- tiene validaciones;
- tiene tests cuando contiene lógica financiera;
- no introduce entidades/reglas no documentadas;
- no deja errores conocidos del alcance;
- documentación se actualiza si hubo una decisión nueva.

---

# 19. Regla SDD

El backlog no reemplaza la especificación.

Si Cursor encuentra una contradicción:

```text
STOP
↓
reportar contradicción
↓
actualizar docs
↓
continuar
```

No resolver contradicciones inventando reglas.
