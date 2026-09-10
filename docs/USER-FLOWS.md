# USER-FLOWS.md

# Personal Finance Runway — User Flows

## 1. Propósito

Este documento describe los flujos principales de uso del MVP.

El objetivo es definir:

- qué intenta hacer el usuario;
- qué información ve;
- qué decisiones toma;
- qué validaciones ocurren;
- qué servicios participan;
- qué datos se persisten;
- qué métricas se recalculan.

Debe respetar:

- `VISION.md`
- `DOMAIN.md`
- `MVP.md`
- `ARCHITECTURE.md`
- `DATA-MODEL.md`

No define diseño visual final.

No define componentes específicos.

No define todavía contratos HTTP completos.

---

# 2b. Acceso (M10.5)

```text
Abrir app
↓
GET /api/auth/me (credentials include)
↓
loading → no queries financieras, no Dashboard
↓
unauthenticated → /login
authenticated → app
```

Login: `POST /api/auth/login` → cookie `pf_sid` → `GET /me` → `/`.

Logout (header Salir): `POST /api/auth/logout` → cache limpia → `/login`.

401 en request protegida: sesión unauthenticated, cache TanStack Query limpia, redirect `/login`. No se muestra como QueryStatus de negocio.

No hay signup público.

---

# 2. Principios UX

Los flujos deben respetar:

1. Registrar un gasto debe ser rápido.
2. Mobile prioriza captura.
3. Desktop prioriza análisis.
4. Las operaciones financieras importantes requieren confirmación clara.
5. AI nunca guarda movimientos automáticamente.
6. Los cálculos críticos son determinísticos.
7. El usuario debe entender qué cuenta o fondo se afecta.
8. Los fondos reservados deben mantenerse claramente separados.
9. Ninguna simulación modifica datos reales.
10. Los errores deben poder corregirse sin perder trazabilidad.

---

# 3. Flujo general de navegación

```text
App
↓
Dashboard (Home)
├── Registrar
├── Cuentas
├── Movimientos
├── Tarjetas
├── Transferencias / Mover dinero
├── Presupuestos
├── Vivienda
├── Inversiones
├── Simulaciones
├── AI Assistant
└── (privacidad de montos — toggle local)
```

En mobile (P1 bottom nav):

```text
Inicio · Registrar · Movimientos · Cuentas · Más
Más → Inversiones, Vivienda, Tarjetas, Transferencias,
      Presupuestos, Simulaciones, Asistente, Salir
```

Privacy mode (ojo): oculta montos en Home, Cuentas, Vivienda, Inversiones, Tarjetas
(y cualquier pantalla que use `<Money>`). Persistencia local `pf.privacy.hideAmounts`.

En desktop:

```text
Sidebar
+
Dashboard completo
```

M5.4 — acceso a Vivienda (decisión UX):

En mobile el header no agrega Vivienda como link horizontal extra.

```text
Inicio
Registrar
Más → Presupuestos, Vivienda
```

En desktop, si el ancho alcanza, Presupuestos y Vivienda son links visibles junto a Inicio y Registrar. No hay sidebar todavía.

---

# 4. Primera apertura

## Objetivo

Configurar el sistema para comenzar a utilizarlo.

Flujo:

```text
Abrir app
↓
No existe configuración inicial
↓
Onboarding
↓
Crear usuario lógico
↓
Configurar capital inicial
↓
Configurar cuentas base
↓
Configurar vivienda
↓
Crear categorías iniciales
↓
Dashboard
```

---

# 5. Onboarding — usuario

Campos mínimos:

```text
Nombre
Timezone
```

Email:

```text
opcional inicialmente
```

Timezone inicial sugerida:

```text
America/Argentina/Buenos_Aires
```

Resultado:

```text
User creado
```

---

# 6. Onboarding — capital inicial

Pantalla:

```text
¿Con cuánto capital querés comenzar?
```

Inputs:

```text
Monto
Moneda
Cuenta destino
Descripción
```

Ejemplo:

```text
ARS 39.000.000
Fondo indemnización ARS
```

Acción:

```text
Guardar capital inicial
```

Resultado:

```text
Account creada si no existe
+
Transaction INCOME
```

---

# 7. Onboarding — cuentas base

Proponer:

```text
Fondo principal ARS
Fondo vivienda USD
Cuenta operativa ARS
Broker ARS
Broker USD
```

El usuario puede:

- aceptar;
- renombrar;
- omitir cuentas no utilizadas.

No forzar todas.

---

# 8. Onboarding — vivienda

Pregunta:

```text
¿Querés configurar una obligación de vivienda?
```

Si NO:

```text
Continuar
```

Si SÍ:

Inputs:

```text
Nombre
Moneda
Monto cuota
Cuotas pendientes
Día vencimiento opcional
Cuenta reserva
```

Resultado:

```text
HousingObligation
```

---

# 9. Onboarding — categorías

Crear categorías iniciales automáticamente.

Ejemplo:

```text
Supermercado
Comida
Nafta
Guardería
Casa
Seguros
Servicios
Salud
Gym
Suscripciones
Hija
Ocio
Otros
```

Luego:

```text
Ir al dashboard
```

---

# 10. Dashboard — carga inicial

Al abrir Dashboard:

```text
Frontend
↓
GET Financial Summary
↓
FinancialService
↓
Repositories
↓
PostgreSQL
↓
Response
```

Debe devolver:

```text
Capital ARS
Capital USD
Gastos mes
Ingresos propios mes
Reintegros
Consumo fondo
Runway
Cobertura vivienda
Inversiones activas
Próximo vencimiento
Presupuestos principales
```

---

# 11. Dashboard — estado vacío

Si no hay movimientos:

```text
Todavía no registraste movimientos.
```

CTA:

```text
+ Registrar primer movimiento
```

No mostrar ceros confusos en todos los widgets.

---

# 11b. Dashboard — cobertura vivienda

El widget de vivienda no viene de FinancialSummary. Compone:

```text
GET /api/housing
GET /api/housing/:id/coverage
```

Selección: primera obligación `ACTIVE` en el orden del backend (`name` ASC, `createdAt` ASC). No agregar obligaciones.

Copy:

```text
Vivienda {currency}
8,00 cuotas cubiertas
USD 8.800 reservados (opcional)
```

Sin obligación activa: “Sin configurar”. Sin reserva: “Sin reserva configurada”. `coveredInstallments = "0.00"` se muestra como 0,00 cuotas. Null no es 0.

Si Housing falla, el resumen financiero sigue visible.

---

# 12. Registrar gasto — flujo manual rápido

Objetivo:

Registrar gasto en menos de 10 segundos.

Flujo:

```text
Dashboard
↓
+ Registrar
↓
Gasto | Ingreso | Transferencia
↓
(si Gasto) Importe → Categoría → Guardar
```

Tabs en `/registrar` (P0.12.1):

```text
Gasto
Ingreso
Transferencia
```

Transferencia (manual, sin AI):

```text
Desde
Hacia
Monto
Fecha
Descripción opcional
```

Copy auxiliar: “Mové dinero entre tus cuentas sin registrarlo como gasto o ingreso.”

Destino: cuentas activas, misma currency que origen, excluye origen. Sin FX acá (FX sigue en `/transfers`). Persiste vía `POST /api/transfers` (misma autoridad que Mover dinero).

Defaults (gasto/ingreso):

```text
Moneda = ARS
Fecha = ahora
Cuenta = última utilizada
Método = último utilizado
isFixed = false
Reintegrable = false
```

---

# 13. Registrar gasto — flujo completo

Inputs:

```text
Importe
Moneda
Categoría
Descripción
Fecha
Cuenta
Método de pago
Gasto fijo
Reintegrable
```

Acción:

```text
Guardar
```

Backend:

```text
TransactionController
↓
TransactionService.createExpense()
↓
validaciones
↓
TransactionRepository
↓
DB
```

---

# 14. Validaciones — gasto

Validar:

```text
amount > 0
```

```text
account exists
```

```text
category exists
```

```text
account.userId == currentUser
```

```text
category.userId == currentUser
```

```text
currency == account.currency
```

```text
account.isActive == true
```

```text
category.isActive == true
```

```text
category.type == EXPENSE o BOTH
```

`categoryId` es obligatorio en `createExpense`.

Si falla:

```text
No guardar
+
Mostrar error
```

---

# 15. Resultado — gasto guardado

Después de guardar:

```text
Toast:
Gasto registrado
```

Actualizar:

```text
Saldo cuenta
Gasto mensual
Presupuesto
Consumo fondo
Runway
```

No recalcular mediante AI.

---

# 16. Registrar gasto con AI

Entrada:

```text
super 75 mil
```

Flujo:

```text
Quick AI Input
↓
POST /api/ai/parse-transaction  { text }
↓
AiController (M8.3, sin persistir)
↓
CategoryService (M8.4.1, READ ONLY)
↓
TransactionParserService (categorías permitidas)
↓
OpenAIClient / Structured Output
↓
Proposal (categoryHint canónico o null)
↓
Preview (M8.4)
```

El matching final `categoryHint` → Category es determinístico (nombre exacto, case-insensitive, match único).

Ejemplo M8.4.1: `"gasté 15 mil en la panadería"` con categoría existente `Comida` debe proponer `categoryHint = "Comida"`, no `"panadería"`. La cuenta no se selecciona si el texto no la menciona.

Preview:

```text
Gasto
Supermercado
ARS 75.000
Hoy
```

Acciones:

```text
Guardar
Editar
Cancelar
```

---

# 17. Confirmación AI

Si usuario presiona:

```text
Guardar
```

entonces:

```text
POST /api/transactions
```

La persistencia ocurre usando el flujo normal de TransactionService.

OpenAI no participa en el guardado final.

La UI de M8.4 vive en `/registrar` (“Registrar con texto”). Preview de una propuesta; Guardar llama `POST /api/transactions`. Editar reutiliza el formulario manual. Cancelar vuelve al input y conserva el texto.

M8.5 muestra N cards apiladas. Cada propuesta tiene estado de UI (pending / editing / saved / discarded / error). Guardar y Descartar son por ítem. No hay “Guardar todos”.

---

# 18. Edición de propuesta AI

Si AI interpreta incorrectamente:

```text
super 75 mil
```

como categoría:

```text
Comida
```

el usuario puede cambiar:

```text
Comida
→
Supermercado
```

y luego confirmar.

La corrección no necesita reconsultar OpenAI.

---

# 19. AI — múltiples movimientos

Input:

```text
pagué 54k del gym y 48 lucas de nafta
```

Resultado:

```text
1.
Gym
ARS 54.000

2.
Nafta
ARS 48.000
```

Acciones M8.5:

```text
Por propuesta: Editar / Guardar / Descartar
Cancelar el input completo
```

No hay “Guardar todos”. La confirmación es individual porque cada propuesta puede necesitar cuenta o categoría distinta.

---

# 20. Guardar múltiples movimientos AI

Cada propuesta confirmada:

```text
Frontend
↓
POST /api/transactions
```

No hay `POST /api/ai/confirm-all`. OpenAI no escribe DB.

La persistencia es independiente por movimiento. Un error al guardar el movimiento 2 no revierte el 1 ni descarta el 3. La UI permite retry o editar el que falló.

No se usa transacción DB de lote en M8.5.

---

# 21. Registrar ingreso

Flujo:

```text
+ Registrar
↓
Ingreso
```

Inputs:

```text
Monto
Moneda
Categoría
Descripción
Cuenta destino
Fecha
```

Ejemplos:

```text
Prestación
Trabajo freelance
Salario futuro
Ingreso extraordinario
```

Resultado:

```text
Transaction.type = INCOME
```

---

# 22. Regla — ingreso propio

El ingreso registrado forma parte del flujo personal.

No registrar como ingreso propio dinero de otra persona salvo que realmente ingrese al patrimonio del usuario.

La futura asociación con `Person` no cambia automáticamente esta regla.

---

# 23. Registrar reintegro

Desde:

```text
Detalle gasto
↓
Registrar reintegro
```

Inputs:

```text
Monto
Fecha
Cuenta receptora
Descripción opcional
```

Backend:

```text
TransactionService.registerReimbursement()
```

---

# 24. Reintegro — validaciones

Calcular:

```text
pending =
expense.amount
-
sum(existing reimbursements)
```

Validar:

```text
reimbursement > 0
```

y:

```text
reimbursement <= pending
```

Salvo futura confirmación explícita de sobre-reintegro.

---

# 25. Reintegro parcial

Ejemplo:

```text
Gasto:
100.000

Reintegro:
40.000
```

Resultado:

```text
reimbursementStatus = PARTIAL
```

Gasto neto:

```text
60.000
```

---

# 26. Reintegro completo

Si suma reintegros:

```text
100.000
```

Resultado:

```text
reimbursementStatus = COMPLETED
```

Gasto neto:

```text
0
```

---

# 27. Movimientos — listado

Ruta (M7.7):

```text
/transactions
```

Nombre visible: Movimientos.

Mostrar:

```text
Fecha
Descripción
Categoría
Tipo
Importe
Moneda
Cuenta
Estado
incomeKind si aplica
```

Filtros:

```text
Mes/año
Tipo
Cuenta
Categoría
Estado
```

Mes sin año filtra ese mes calendario en todos los años. Año + mes acota a ese período.

La alta de movimientos sigue en `/registrar`. Esta pantalla no crea Transactions.

Editar y Anular sólo para tipos que el backend permite. Piernas inmutables (TRANSFER, CURRENCY_EXCHANGE, HOUSING_PAYMENT, INVESTMENT_*) no muestran esas acciones.

Mobile: Inicio · Más · Registrar. El menú Más incluye Movimientos, Cuentas, Mover dinero, Presupuestos, Vivienda, Inversiones, Simulaciones, Asistente.

Desktop: Inicio, Movimientos, Cuentas, Mover dinero, Presupuestos, Vivienda, Inversiones, Simulaciones, Asistente, Registrar.

---

# 28. Movimiento — detalle

Al abrir (detalle local en M7.7, sin GET nuevo):

```text
/transactions
```

Mostrar:

```text
Tipo
Importe
Moneda
Cuenta
Categoría
Descripción
Fecha
Medio de pago
Estado
Reintegros relacionados
Metadata visible relevante
```

Acciones:

```text
Editar
Anular
Registrar reintegro si aplica
```

---

# 29. Editar gasto

Flujo:

```text
Detalle
↓
Editar
↓
Modificar
↓
Guardar
```

Backend:

```text
PATCH transaction
```

Validar nuevamente reglas de negocio.

Después:

```text
recalcular métricas
```

---

# 30. Anular movimiento

Flujo:

```text
Detalle
↓
Anular
↓
Confirmar
```

Mensaje:

```text
Este movimiento dejará de participar en los cálculos.
El historial se conservará.
```

Resultado:

```text
status = VOIDED
```

---

# 31. Compra con tarjeta de crédito

## 31.1 Legacy MVP1 (LEAVE)

```text
Registrar gasto
↓
PaymentMethod = CREDIT_CARD
↓
accountId de una cuenta
↓
Guardar
```

El gasto debitaba la cuenta en la fecha de compra. Esos movimientos **no se migran** en P0.

## 31.2 Flujo MVP2 (objetivo)

```text
Elegir tarjeta (CreditCard)
↓
Crear CreditCardPurchase (+ installments)
↓
Reconocer cuota(s) → EXPENSE (creditCardId, accountId null)
↓
Gasto del período / categoría / presupuesto
↓
currentCardDebt ↑  (o futureInstallmentCommitment si aún no reconocida)
```

La cuenta bancaria **no** disminuye en la compra.

## 31.3 Tarjetas UI + recurrentes (P0.13)

Ruta:

```text
/cards
```

- Card heroes visuales (nombre, emisor, marca, moneda, deuda, cierre, vencimiento, feeStatus humano).
- Cargos recurrentes: estimado vs confirmado del mes **separados** de `currentCardDebt`.
- “Registrar este mes” → confirm explícito → `EXPENSE` tarjeta.
- Sin PAN/CVV. Sin auto-posting.

Ejemplo contado:

```text
Supermercado
ARS 75.000
Visa Santander
```

Ejemplo cuotas: impacto mensual por cuota reconocida (`MVP2-DECISIONES-P0.md` F2/F5).

---

# 32. Pago del resumen de tarjeta

El pago **nunca** se registra como `EXPENSE` nuevo (evita doble contabilización).

## MVP2 (objetivo)

```text
Elegir cuenta origen
↓
Elegir tarjeta
↓
CREDIT_CARD_PAYMENT (total o parcial)
↓
Saldo cuenta ↓
currentCardDebt ↓
Gasto del período sin cambio
```

Sin modelo de pasivo implementado aún en código: ver `MVP2-BACKLOG.md` P0.10.

---

# 33. Crear presupuesto

Ruta:

```text
/budgets
```

Acción:

```text
Nuevo presupuesto
```

Inputs:

```text
Categoría
Mes
Moneda
Monto
```

Ejemplo:

```text
Nafta
09/2026
ARS 200.000
```

Validar:

```text
amount > 0
category exists
category.userId == currentUser
category.isActive
category type EXPENSE o BOTH
UNIQUE(user, category, currency, year, month)
```

`amount = 0` se rechaza. Sin presupuesto = no existe Budget.

---

# 34. Presupuesto — visualización

Mostrar:

```text
Presupuesto
Gastado neto
Disponible
% utilizado
Ritmo esperado
```

Ejemplo:

```text
Nafta
200.000

Gastado
145.000

Disponible
55.000

Uso
72,5%
```

---

# 35. Spending Pace

Backend calcula:

```text
monthProgress
budgetProgress
```

Ejemplo:

```text
monthProgress = 40%
budgetProgress = 72%
```

Estado:

```text
ABOVE_EXPECTED_PACE
```

Frontend:

```text
Estás gastando más rápido de lo previsto.
```

---

# 36. Editar presupuesto

Flujo:

```text
Presupuesto
↓
Editar
↓
Cambiar monto
↓
Guardar
```

Los gastos existentes no cambian.

Sólo cambia el monto del presupuesto.

No se editan categoría, moneda, año ni mes.

Validar:

```text
amount > 0
```

---

# 37. Crear cuenta

Ruta (M7.6):

```text
/accounts
```

Nombre visible: Cuentas.

Inputs:

```text
Nombre
Tipo
Moneda
```

Ejemplo:

```text
Broker ARS
INVESTMENT
ARS
```

Cuenta nueva desde la UI:

```text
initialBalance = 0
```

La UI no pide saldo inicial. El capital se incorpora después como `Transaction` `INCOME` + `incomeKind CAPITAL` desde `/registrar`. El saldo mostrado es el balance derivado del backend (`GET /api/accounts/:id/balance`), no `initialBalance`.

No se cambia `currency` desde la UI: rompería el historial de movimientos.

Mobile: Inicio · Más · Registrar. El menú Más incluye Cuentas, Presupuestos, Vivienda, Inversiones, Simulaciones, Asistente.

Desktop: Inicio, Cuentas, Presupuestos, Vivienda, Inversiones, Simulaciones, Asistente, Registrar. Si el ancho no alcanza, se mantiene Más para no desbordar.

---

# 38. Ajuste de saldo

Si existe diferencia entre realidad y app:

```text
Cuenta
↓
Ajustar saldo
```

No editar saldo directamente.

Crear:

```text
Transaction.type = ADJUSTMENT
```

La UI debe dejar claro que es una corrección manual.

---

# 38b. Mover dinero — UI

Ruta (M7.9):

```text
/transfers
```

Nombre visible: Mover dinero.

Operaciones:

```text
Transferencia
Cambio de moneda
```

Sólo un formulario visible. No es el flujo de alta de `/registrar`.

Transferencia:

```text
Cuenta origen
Cuenta destino
Importe
Fecha
```

Sólo cuentas activas, misma moneda y destino distinto de origen. El saldo origen se lee de `GET /api/accounts/:id/balance`.

Cambio de moneda:

```text
Cuenta origen
Cuenta destino
Importe origen
Cotización ARS por USD
Fecha
```

Copy bajo cotización: “ARS necesarios por cada USD 1.” Preview “Entregás / Recibís” no es autoridad; el backend confirma el importe final. No crea EXPENSE ni INCOME.

---

# 39. Transferencia misma moneda

Ejemplo:

```text
Cuenta operativa ARS
→
Broker ARS
```

Endpoint:

```text
POST /api/transfers
```

Inputs:

```text
sourceAccountId
destinationAccountId
amount
occurredAt opcional
description opcional
idempotencyKey requerido (≥ 8)
```

El backend genera `transferId` y `direction`. El cliente no los envía.

Listado lógico:

```text
GET /api/transfers
GET /api/transfers/:id
```

Validar:

```text
same currency
cuentas activas del mismo user
origen ≠ destino
```

No se rechaza por saldo insuficiente (el origen puede quedar negativo). Locks FOR UPDATE en orden UUID.

No se permite cambio de moneda en este flujo (FX → `/transfers` currency-exchange / `POST /api/currency-exchanges`).

UI (M7.9): `/transfers` con operación Transferencia. También tab Transferencia en `/registrar` (P0.12.1) → mismo endpoint. Movimientos agrupa OUT+IN; CSV mantiene 2 filas físicas.

---

# 40. Transferencia — ejecución

Service:

```text
TransactionService.createTransfer()
↓
DB transaction
↓
Out movement
+
In movement
```

Ambos lados deben confirmarse o revertirse juntos.

Cada pierna:

```text
type = TRANSFER
categoryId = null
relatedTransactionId = null
```

Metadata:

```text
OUT: { transferId, direction: "OUT" }
IN:  { transferId, direction: "IN" }
```

No editar ni anular una pierna con `PATCH /api/transactions/:id` ni `POST /api/transactions/:id/void`.

---

# 41. Cambio de moneda

Endpoint:

```text
POST /api/currency-exchanges
```

Inputs del cliente:

```text
fromAccountId
toAccountId
fromAmount
exchangeRate
description opcional
occurredAt opcional
```

El cliente no envía `toAmount`, monedas, `type` ni metadata. El backend los deriva.

Soporta:

```text
ARS → USD
USD → ARS
```

`exchangeRate` es siempre ARS por 1 USD.

```text
ARS → USD: toAmount = fromAmount / exchangeRate
USD → ARS: toAmount = fromAmount * exchangeRate
```

`toAmount` se redondea a 2 decimales con ROUND_HALF_UP.

UI (M7.9): `/transfers` con operación Cambio de moneda. El preview de “Entregás / Recibís” usa las mismas reglas; el backend es la autoridad.

---

# 42. Compra de USD — ejemplo

```text
Origen:
Fondo ARS
1.500.000

Destino:
Fondo USD
0

exchangeRate:
1500.000000

toAmount:
1.000,00 USD
```

---

# 43. Cambio de moneda — validaciones

Validar:

```text
fromAccount y toAccount propias, activas y distintas
fromCurrency != toCurrency
par ARS/USD o USD/ARS
fromAmount > 0
exchangeRate > 0
fromAccount balance >= fromAmount
```

---

# 44. Cambio de moneda — persistencia

En una única transacción DB:

```text
CurrencyExchange
+
CURRENCY_EXCHANGE OUT
+
CURRENCY_EXCHANGE IN
```

Metadata:

```text
OUT: { currencyExchangeId, direction: "OUT" }
IN:  { currencyExchangeId, direction: "IN" }
```

Si algo falla:

```text
rollback completo
```

No editar ni anular una pierna con `PATCH /api/transactions/:id` ni `POST /api/transactions/:id/void`.

---

# 45. Vivienda — dashboard

Ruta:

```text
/housing
```

Mostrar:

```text
Cuota mensual
Cuotas pendientes
USD reservados
Cobertura
Próximo vencimiento
Historial de pagos
```

Lectura HTTP:

```text
GET /api/housing/:id/coverage
GET /api/housing/:id/payments
```

La UI no recalcula cobertura. El historial sale de `HousingPayment`, no de Transactions.

---

# 46. Registrar pago vivienda

Acción:

```text
Registrar cuota
```

Inputs:

```text
Monto
Fecha
Cuenta
Número cuota opcional
```

Default:

```text
Monto = installmentAmount
```

El monto es un input. Si se omite, usa `installmentAmount`. No hay regla que exija igualdad con la cuota.

Body HTTP (`POST /api/housing/:id/payments`):

```text
accountId
amount (opcional; default installmentAmount)
occurredAt (opcional)
installmentNumber (opcional)
```

El backend deriva `currency`, `type`, `status`, `categoryId`, `metadata`, ids y pertenencia.

No aceptar `userId`, `currency`, `type`, `status`, `metadata`, `housingPaymentId` ni `housingObligationId` en el body.

---

# 47. Pago vivienda — validaciones

Validar:

```text
housing obligation active
```

```text
remainingInstallments > 0
```

```text
currency == obligation.currency
```

```text
account.currency == obligation.currency
```

```text
account balance >= amount
```

---

# 48. Pago vivienda — persistencia

DB transaction:

```text
Transaction
+
HousingPayment
+
HousingObligation remainingInstallments - 1
```

La `Transaction` es `HOUSING_PAYMENT`, `categoryId` null, metadata `{ housingPaymentId, housingObligationId }`.

Si falla cualquiera: rollback total.

No desactivar automáticamente la obligación cuando `remainingInstallments` llega a 0.

`HOUSING_PAYMENT` no se edita ni anula con endpoints genéricos de Transaction (`HOUSING_PAYMENT_IMMUTABLE`).

Resultado:

```text
Actualizar cobertura
Actualizar cuotas pendientes
Actualizar fondo reserva
```

---

# 49. Vivienda — cobertura

Ejemplo:

```text
Reserva:
USD 11.000

Cuota:
USD 1.100
```

Resultado:

```text
10.00 cuotas cubiertas
```

No usar AI.

---

# 50. Vivienda — reserva insuficiente

Ejemplo:

```text
Reserva:
USD 2.000

Cuota:
USD 1.100
```

Mostrar:

```text
Cobertura:
1.82 cuotas
```

`2000 / 1100` se redondea a 2 decimales con ROUND_HALF_UP.

Puede existir alerta visual.

No bloquear.

---

# 51. Inversiones — listado

Ruta:

```text
/investments
```

Secciones:

```text
Activas
Próximos vencimientos
Finalizadas
```

Mostrar:

```text
Capital
Moneda
TNA
Inicio
Vencimiento
Rendimiento esperado
Estado
```

Listado: `GET /api/investments`. ACTIVE primero, luego más recientes. Sin `GET /:id` en este flujo: el detalle vive en la card.

La TNA se muestra como porcentaje (fracción `0.300000` → `30%`).

---

# 52. Crear caución

Acción:

```text
Nueva caución
```

Inputs:

```text
Cuenta origen
Moneda
Capital
TNA (porcentaje; el cliente envía fracción)
Fecha inicio
Fecha vencimiento
Notas
```

El usuario ingresa la tasa como porcentaje humano (`30` → backend `"0.300000"`). El preview de días/interés estimado es visual; `expectedReturn` persistido lo calcula el backend.

---

# 53. Crear caución — cálculo preview

Antes de guardar:

```text
Días
Interés estimado
Monto estimado final
```

Cálculo determinístico:

```text
principal * annualRate * days / 365
```

`days` = diferencia de fechas calendario en `America/Argentina/Buenos_Aires`, no inclusiva.

```text
01/09/2026 → 08/09/2026 = 7
01/09/2026 → 01/09/2026 = 0
```

No usar `(timestampDifference / 86400000)`. ROUND_HALF_UP a 2 decimales.

---

# 54. Crear caución — validaciones

Validar:

```text
principal > 0
```

```text
annualRate >= 0
```

```text
calendarDate(maturityDate) >= calendarDate(startDate)
en America/Argentina/Buenos_Aires
mismo día permitido (days = 0)
```

```text
account.currency == investment.currency
```

```text
available balance >= principal
```

---

# 55. Crear caución — persistencia

DB transaction:

```text
Investment ACTIVE
+
Investment outflow
```

`INVESTMENT_OUTFLOW`: débito, `categoryId` null, metadata `{ investmentId }`. No entra en métricas operativas ni budgets. PATCH/VOID genéricos se rechazan.

Luego actualizar:

```text
Capital disponible
Capital invertido
Runway si corresponde
```

---

# 56. Caución — detalle

Mostrar:

```text
Capital
TNA
Días
Inicio
Vencimiento
Rendimiento esperado
Estado
Notas
```

Acciones según estado:

```text
Registrar vencimiento
Renovar
Cancelar draft
```

---

# 57. Vencimiento caución

Acción:

```text
Registrar retorno
```

Inputs:

```text
destinationAccountId
capitalReturned
actualReturn
occurredAt
```

Para `CAUCION`: `capitalReturned` debe ser igual a `principal`. `actualReturn >= 0`. Cuenta destino: propia, activa, misma moneda. `occurredAt` calendario ART `>= maturityDate`.

---

# 58. Vencimiento — persistencia

`POST /api/investments/:id/mature`

DB transaction atómica:

```text
Investment status = MATURED
actualReturn = interés real
+
INVESTMENT_PRINCIPAL_RETURN  (crédito, amount = principal)
+
INVESTMENT_RETURN            (crédito, amount = actualReturn, si > 0)
```

Si `actualReturn = "0.00"`: sólo `INVESTMENT_PRINCIPAL_RETURN`. No Transaction de monto cero.

Sólo `ACTIVE`. Un segundo mature se rechaza sin crear movimientos.

Ambos movimientos: `categoryId` null, metadata `{ investmentId }`, inmutables vía PATCH/VOID genéricos.

---

# 59. Renovar caución

`POST /api/investments/:id/renew`

Inputs:

```text
accountId
renewalPrincipal
actualReturn
annualRate
occurredAt
maturityDate
notes?
```

No enviar `capitalReturned` ni `startDate` ni `renewedFromInvestmentId`.

`renewalPrincipal > 0` y `<= principal` original (todo o parcial). `actualReturn >= 0`. Nueva tasa en fracción. `occurredAt` calendario ART `>= maturityDate` original. Nueva `maturityDate` calendario ART `>= occurredAt`. `startDate` de la nueva = `occurredAt`.

DB transaction atómica:

```text
INVESTMENT_PRINCIPAL_RETURN  (original)
INVESTMENT_RETURN            (original, si actualReturn > 0)
original status = RENEWED
actualReturn original
nueva Investment ACTIVE CAUCION
renewedFromInvestmentId = original.id
INVESTMENT_OUTFLOW           (nueva)
```

El interés no se capitaliza. La misma cuenta recibe y vuelve a colocar. Segundo renew sobre la original se rechaza.

No modificar silenciosamente la original (salvo status y actualReturn).

---

# 60. Dashboard — consumo fondo

Mostrar:

```text
Gastos netos
Ingresos propios operativos
Consumo del fondo
```

El cálculo debe excluir movimientos que no representen consumo operativo, como:

```text
transferencias
compra de USD
capital inicial
movimiento interno de inversión
```

La semántica exacta se documentará también en Business Rules si se crea dicho documento.

---

# 61. Runway — cálculo

Usuario abre Dashboard.

Backend:

```text
FinancialService.calculateRunway()
```

Usa:

```text
Fondos ARS disponibles (CASH + BANK + FUND, activas)
Promedio de hasta 3 meses calendario cerrados válidos anteriores al mes del resumen. El mes corriente no entra al promedio mientras esté abierto.
```

Mes válido: al menos un `EXPENSE` `ACTIVE` `ARS`. Consumo 0 en un mes válido entra al promedio.

No incluye automáticamente:

```text
Fondo vivienda USD
HOUSING_RESERVE
INVESTMENT
OTHER
```

---

# 62. Runway — sin historial suficiente

Si no hay consumo mensual válido:

Mostrar:

```text
Sin datos suficientes para estimar runway.
```

No mostrar:

```text
∞
```

ni inventar promedios.

---

# 63. Simulación — sin trabajo por N meses

M7.2 implementa el caso de uso en `SimulationService.simulateMonthsWithoutIncome`. Reutiliza primitives de M7.1 y el baseline de `FinancialService`.

M7.5 expone la UI en `/simulations` y `POST /api/simulations` (`type: MONTHS_WITHOUT_INCOME`). No persiste resultados.

Input del caso de uso:

```text
userId
year
month
months
timeZone
```

Ejemplo:

```text
months = 6
```

Backend:

```text
SimulationService.simulateMonthsWithoutIncome({
  userId,
  year,
  month,
  months,
  timeZone
})
```

Hipótesis:

```text
monthlyIncomeARS = 0
consumo = averageMonthlyFundConsumption real
sin ajuste de gastos
sin vivienda
sin inversiones futuras
```

Resultado:

```text
baseline: capital disponible / promedio / runway actual
projection: ingreso 0 / consumo del promedio / consumido / restante / mes de agotamiento / runway posterior
```

No mostrar cobertura vivienda (M7.4). Si el promedio es `null`, no inventar proyección.

---

# 64. Simulación — nuevo empleo

M7.3 implementa el caso de uso en `SimulationService.simulateNewJobScenario`. Reutiliza primitives de M7.1 y el baseline de `FinancialService`.

M7.5 lo ejecuta desde `/simulations` vía `POST /api/simulations` (`type: NEW_JOB`). No persiste resultados.

Input del caso de uso:

```text
userId
year
month
monthsUntilJob
totalMonths
newMonthlyIncomeARS
expenseChangeFraction
timeZone
```

Ejemplo:

```text
monthsUntilJob = 3
totalMonths = 12
newMonthlyIncomeARS = 3500000.00
expenseChangeFraction = -0.100000
```

Backend:

```text
SimulationService.simulateNewJobScenario({ ... })
```

Hipótesis:

```text
meses 1–N: income = 0
meses N+1–total: income = newMonthlyIncomeARS
consumo = average ajustado por expenseChangeFraction (ambos tramos)
operating income histórico no se proyecta
sin vivienda
sin inversiones futuras
```

Resultado:

```text
baseline
consumo ajustado
phase1 / phase2
consumido total
restante
agotamiento global
runway posterior (draw post-empleo)
```

Si el promedio es `null`, no inventar proyección.

---

# 65. Simulación — reserva vivienda

M7.4 implementa el caso de uso en `SimulationService.simulateHousingReserve`. Reutiliza `HousingService.getCoverage`, `FinancialService.getFinancialSummary` y `convertUsdToArs`. No compra USD.

M7.5 lo ejecuta desde `/simulations` vía `POST /api/simulations` (`type: HOUSING_RESERVE`). El selector de obligación usa `GET /api/housing`. No persiste resultados.

Input del caso de uso:

```text
userId
housingObligationId
targetInstallments
exchangeRateARSPerUSD
year
month
timeZone
```

Ejemplo:

```text
targetInstallments = 10
exchangeRateARSPerUSD = 1500
```

Hipótesis:

```text
objetivo USD = cuota * target
reserva = sólo reserveAccountId
null/negativo → effective 0
ARS requeridos = faltante USD * FX explícito
remaining ARS es hipotético
runway real no se recalcula
```

Resultado:

```text
target / current / effective / missing / excess USD
ARS requeridos
ARS disponibles
ARS restantes hipotéticos
ARS shortfall
canFullyFund
cobertura actual (referencia)
runway actual (referencia)
```

---

# 66. Simulación — regla crítica

Al presionar:

```text
Simular
```

NO crear:

```text
Transaction
CurrencyExchange
Investment
HousingPayment
```

La simulación es read-only.

M7.5 — pantalla `/simulations`:

```text
Título: Simulaciones
Copy: Probá escenarios sin modificar tus datos reales.
Disclaimer: Las simulaciones no modifican tus movimientos ni saldos.
Selector: Sin ingresos | Nuevo empleo | Reserva vivienda
CTA: Simular
```

Mobile: cards y formularios verticales, sin tablas. El tab Más incluye Cuentas, Presupuestos, Vivienda, Inversiones, Simulaciones, Asistente. Desktop: Inicio, Cuentas, Presupuestos, Vivienda, Inversiones, Simulaciones, Asistente, Registrar.

HTTP:

```text
POST /api/simulations
```

Body discriminado por `type`. `userId` no viaja en el cliente; el backend usa el usuario configurado. `timeZone` es la constante del producto (`America/Argentina/Buenos_Aires`), no la del navegador.

El frontend no duplica fórmulas. El porcentaje de gastos se convierte de humano (`-10`) a fracción (`-0.100000`) antes del POST.

---

# 66.5 Asistente financiero — UI

Ruta: `/assistant`

```text
Título: Asistente financiero
Copy: Preguntá sobre tus números. La app calcula; la IA te los explica.
CTA: Preguntar
```

Flujo:

```text
usuario escribe pregunta
↓
POST /api/ai/chat  { "message": "..." }
↓
{ "answer": "..." }
↓
mostrar respuesta
```

No es un chatbot con historial. Sin sidebar. Sin persistencia. Cada request es independiente. La sesión visual muestra la última pregunta y la última respuesta.

Click en una pregunta sugerida completa el input; no llama al backend hasta Preguntar (o Ctrl/Cmd + Enter).

Loading: “Analizando tus datos...”. El error del asistente no rompe el resto de la app.

Navegación: link Asistente en desktop y en Más (mobile).

M9.4 — preguntas sugeridas de simulación (parámetros completos; el click no envía):

- ¿Qué pasa si no tengo ingresos por 6 meses?
- ¿Qué pasa si consigo trabajo en 3 meses cobrando 3500000.00 por mes durante 12 meses?
- ¿Cuánto me quedaría si separo 8 cuotas de vivienda al tipo de cambio 1400?

La UI de `/simulations` sigue siendo la pantalla determinística. El asistente es otra forma de acceder a SimulationService, no un reemplazo.

---

# 67. AI Assistant — pregunta factual

Input:

```text
¿Cuánto gasté este mes?
```

Flujo:

```text
AIController
↓
AIService
↓
OpenAI
↓
tool call
↓
get_month_summary → FinancialService.getFinancialSummary
↓
resultado
↓
OpenAI explanation
```

---

# 68. AI Assistant — pregunta por categoría

Input:

```text
¿Cuánto gasté en supermercado?
```

Tool:

```text
get_transactions (categoryName)
```

Resultado AI:

```text
Este mes gastaste ARS X en supermercado.
```

AI no consulta DB directamente.

---

# 69. AI Assistant — vivienda

Input:

```text
¿Cuántas cuotas tengo cubiertas?
```

Tool:

```text
get_housing_summary → HousingService.getCoverage()
```

AI explica el resultado.

---

# 70. AI Assistant — inversiones

Input:

```text
¿Cuánto rindieron mis cauciones este mes?
```

Tool:

```text
InvestmentService.getRealizedReturn(...)
```

AI explica.

No recalcula tasas por su cuenta si ya existen datos reales.

---

# 71. AI Assistant — simulación

Input:

```text
¿Qué pasa si no consigo trabajo durante 6 meses?
```

OpenAI debe solicitar:

```text
simulate_no_income { months: 6, year, month }
```

SimulationService calcula. El assistant explica el resultado como escenario, no como hecho aplicado.

Otros mapeos:

- nuevo empleo → `simulate_new_job` (`monthsUntilJob`, `totalMonths`, `newMonthlyIncomeARS`; no inventar salario)
- reserva de vivienda → `simulate_housing_reserve` (`targetInstallments`, `exchangeRateARSPerUSD`; no inventar FX)

Si falta un parámetro obligatorio, pedir aclaración. No persistir Scenario. No mutar cuentas.

---

# 72. AI Assistant — dato faltante

Input:

```text
¿Cuánto voy a ganar con una caución mañana?
```

Si no existe:

```text
capital
tasa
plazo
```

AI debe indicar que faltan datos.

No inventarlos.

---

# 73. AI Assistant — acciones prohibidas

Si usuario escribe:

```text
Invertí 5 millones en una caución
```

AI puede:

- interpretar intención;
- preparar draft;
- pedir datos faltantes;
- mostrar preview.

No puede ejecutar automáticamente la inversión.

---

# 74. Error OpenAI

Si OpenAI falla:

```text
El asistente no está disponible temporalmente.
```

Acciones:

```text
Reintentar
Registrar manualmente
Volver
```

La app sigue operativa.

---

# 75. Configuración — categorías

Ruta:

```text
/settings/categories
```

Acciones:

```text
Crear
Renombrar
Desactivar
Reactivar
```

No eliminar físicamente categorías utilizadas.

---

# 76. Configuración — cuentas

Ruta (M7.6):

```text
/accounts
```

Acciones:

```text
Crear
Renombrar
Cambiar tipo
Desactivar
Reactivar
```

No eliminar físicamente cuentas con movimientos. No hard delete. Una cuenta inactiva sigue visible en `/accounts` y no aparece para movimientos nuevos (`account.isActive`).

---

# 77. Configuración — vivienda

Ruta:

```text
/settings/housing
```

Permitir:

```text
Editar nombre
Monto cuota
Día vencimiento
Cuenta reserva
```

Cambiar cantidad de cuotas pendientes requiere advertencia porque afecta proyecciones.

---

# 78. Configuración — datos personales

MVP:

```text
Nombre
Timezone
```

Auth se definirá por arquitectura/deployment.

---

# 79. Mobile — gasto rápido

Flujo ideal:

```text
Abrir PWA
↓
Tap + Registrar
↓
75.000
↓
Supermercado
↓
Guardar
```

Objetivo:

pocos taps.

No exigir descripción.

---

# 80. Mobile — AI rápido

Flujo:

```text
Abrir PWA
↓
Input rápido
↓
"super 75 mil"
↓
Preview
↓
Guardar
```

Debe ser uno de los caminos más rápidos de toda la aplicación.

---

# 81. Desktop — revisión financiera

Flujo:

```text
Abrir Dashboard
↓
Revisar capital
↓
Revisar gastos
↓
Revisar budgets
↓
Revisar vivienda
↓
Revisar inversiones
↓
Simular próximos meses
```

Desktop prioriza contexto sobre velocidad de captura.

---

# 82. Exportar CSV

Ruta:

```text
/transactions
```

Acción:

```text
Exportar CSV
```

Filtros activos deben poder aplicarse al export. Los query params son los mismos que el listado: `year`, `month`, `type`, `accountId`, `categoryId`, `status`. Sin filtros se exportan todos los movimientos del usuario, igual que el listado.

Campos:

```text
Fecha
Tipo
Categoría
Descripción
Importe
Moneda
Cuenta
Estado
Clasificación
Reembolso
Medio de pago
```

Fecha en `YYYY-MM-DD` (calendario del timezone del usuario). Importe como decimal del dominio. Nombres de cuenta/categoría, no IDs. No se exporta `userId`.

Formato del archivo: UTF-8 con BOM, delimitador `;` (compatible con Excel en español/Argentina). No se agrega la fila `sep=;` para no insertar una fila basura en Google Sheets u otros consumidores. Las comas dentro de textos se conservan; `;`, comillas y saltos de línea se escapan.

---

# 83. Estado sin conexión

Si la PWA está abierta sin conexión:

Mostrar:

```text
Sin conexión
```

Puede visualizarse shell cacheada.

En MVP no permitir asumir que un movimiento quedó guardado offline.

Si intenta guardar:

```text
Necesitás conexión para registrar este movimiento.
```

---

# 84. Error de persistencia

Ejemplo:

```text
POST transaction
↓
500
```

Frontend:

```text
No pudimos guardar el movimiento.
Intentá nuevamente.
```

El formulario debe conservar la información cargada.

---

# 85. Doble submit

Al presionar Guardar:

```text
disable submit
+
loading
```

para evitar duplicados.

En operaciones críticas considerar idempotencia futura si fuera necesario.

---

# 86. Confirmaciones

Requieren confirmación explícita:

```text
Anular movimiento
Cambio de moneda
Registrar pago vivienda
Crear inversión
Registrar vencimiento
Renovación
```

Gasto cotidiano normal no necesita confirmación adicional si fue ingresado manualmente.

AI sí necesita preview.

---

# 87. Feedback de éxito

Usar mensajes cortos:

```text
Gasto registrado.
```

```text
Reintegro registrado.
```

```text
Caución creada.
```

```text
Pago de vivienda registrado.
```

Evitar diálogos innecesarios.

---

# 88. Future Person flow — fuera de MVP

Futuro posible:

```text
Movimiento
↓
Persona asociada
```

Ejemplo:

```text
Pagado por: Pareja
```

Esto no debe modificar automáticamente:

```text
capital propio
runway
ingresos propios
```

hasta que se defina formalmente la semántica.

---

# 89. Flujo de cálculo tras mutación

Después de cualquier movimiento financiero:

```text
Persist
↓
Invalidate relevant queries
↓
Re-fetch
↓
Dashboard actualizado
```

Con TanStack Query:

```text
invalidate:
transactions
accounts
financial-summary
budgets
housing
investments
```

según operación.

---

# 90. Flujo gasto → presupuesto

```text
Create expense
↓
Transaction saved
↓
Budget query invalidated
↓
BudgetService recalculates
↓
UI progress updated
```

No persistir manualmente `spent`.

---

# 91. Flujo gasto → runway

```text
Expense saved
↓
Financial summary invalidated
↓
Monthly consumption recalculated
↓
Runway recalculated
```

---

# 92. Flujo reintegro → runway

```text
Reimbursement saved
↓
Net expense decreases
↓
Fund consumption recalculated
↓
Runway recalculated
```

---

# 93. Flujo inversión → capital

```text
Investment created
↓
Available balance changes
↓
Invested capital increases
↓
Dashboard updates
```

El movimiento de inversión no debe contarse como gasto de consumo.

---

# 94. Flujo cambio de moneda → vivienda

```text
Currency exchange
ARS → USD
↓
USD housing reserve increases
↓
Housing coverage recalculated
```

No contar compra de USD como gasto operativo.

---

# 95. Flujo pago vivienda → cobertura

```text
Housing payment
↓
Reserve balance decreases
↓
Remaining installments decreases
↓
Coverage recalculated
```

La UI debe mostrar ambos cambios.

---

# 96. Flujo capital inicial

```text
Initial setup
↓
Create fund account
↓
Create capital transaction
↓
Dashboard
```

El capital inicial NO debe considerarse ingreso operativo mensual para cálculo de consumo del fondo.

---

# 97. Flujo ingreso futuro

Si se registra un salario futuro:

```text
INCOME
```

sí puede afectar consumo mensual y runway según reglas financieras.

Debe distinguirse de:

```text
capital inicial
```

y otros movimientos extraordinarios.

Esta distinción deberá formalizarse en reglas de negocio antes de implementación definitiva de runway.

---

# 98. Pendientes de definición derivados de estos flujos

Antes de implementar cálculos finales deben definirse con precisión:

1. Diferencia entre ingreso operativo e ingreso de capital.
2. Semántica exacta de transferencias.
3. Semántica exacta del capital colocado en inversión.
4. Cómo clasificar pagos de vivienda en gasto total vs consumo del fondo. CERRADO: `HOUSING_PAYMENT` no entra en gasto bruto/neto, ingreso operativo, consumo del fondo ni budgets.
5. Tratamiento futuro completo de tarjetas de crédito. CERRADO a nivel producto: `MVP2.md` + `MVP2-DECISIONES-P0.md` (F1–F8). Implementación pendiente (`MVP2-BACKLOG.md`).
6. Asociación futura de personas a movimientos.

Estas decisiones no bloquean UI inicial, pero sí deben resolverse antes de implementar métricas financieras definitivas.

---

# 99. Criterio de aceptación de un flujo

Un flujo se considera correctamente implementado si:

1. puede completarse desde UI;
2. valida inputs;
3. respeta Services;
4. no accede directo a DB desde Controller;
5. persiste correctamente;
6. maneja error;
7. actualiza estado visual;
8. mantiene trazabilidad;
9. recalcula métricas afectadas;
10. funciona en mobile y desktop cuando corresponde.

---

# 100. Regla SDD

`USER-FLOWS.md` define cómo debe comportarse el producto durante las interacciones principales.

Cursor/AI no debe:

- inventar pasos adicionales innecesarios;
- auto-confirmar operaciones AI;
- saltar validaciones;
- guardar simulaciones como datos reales;
- duplicar gastos al pagar tarjeta;
- tratar transferencias como consumo;
- tratar inversiones como gasto operativo;
- mezclar patrimonio de terceros sin especificación.

Si un flujo cambia:

```text
User need
↓
VISION / MVP
↓
DOMAIN si corresponde
↓
USER-FLOWS
↓
DATA-MODEL si corresponde
↓
BACKLOG
↓
Implementation
```
