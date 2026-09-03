# DOMAIN.md

# Personal Finance Runway — Domain Model

## 1. Propósito

Este documento define el modelo de dominio de la aplicación.

El objetivo es describir las entidades principales, sus responsabilidades, relaciones, invariantes y reglas de negocio.

Este documento NO define todavía:

- componentes visuales;
- endpoints concretos;
- estructura final de carpetas;
- librerías específicas de UI;
- estrategia de deployment;
- implementación detallada de OpenAI.

Sí define:

- conceptos financieros;
- entidades;
- relaciones;
- estados;
- reglas de negocio;
- responsabilidades del dominio;
- persistencia conceptual.

---

# 2. Persistencia

La aplicación utilizará PostgreSQL como base de datos principal.

La persistencia debe permitir posteriormente desplegar la aplicación utilizando proveedores como:

- Neon;
- Render PostgreSQL;
- PostgreSQL administrado equivalente.

El dominio no debe depender de funcionalidades exclusivas de un proveedor específico.

Debe ser portable entre instalaciones PostgreSQL estándar.

---

# 3. Principio principal del dominio

La fuente de verdad no será el saldo bancario.

La fuente de verdad será el conjunto de movimientos registrados en la aplicación.

El sistema debe poder reconstruir el estado financiero a partir de:

- fondos;
- cuentas;
- movimientos;
- obligaciones;
- inversiones;
- presupuestos;
- reintegros.

Los saldos derivados deben calcularse utilizando esos registros.

---

# 4. Usuario

Inicialmente la aplicación tendrá un único usuario.

No es necesario implementar multiusuario en el MVP.

Sin embargo, las entidades principales deberían tener una relación conceptual con un `User` para evitar bloquear una futura evolución.

```ts
User {
  id: UUID
  name: string
  email?: string
  createdAt: DateTime
  updatedAt: DateTime
}
```

Regla:

Toda información financiera pertenece a un usuario.

---

# 5. Account

Una `Account` representa un lugar lógico donde existe dinero.

No necesariamente representa una cuenta bancaria real.

Ejemplos:

- Fondo indemnización ARS
- Fondo vivienda USD
- Cuenta corriente
- Efectivo
- Cuenta broker ARS
- Cuenta broker USD

```ts
Account {
  id: UUID
  userId: UUID
  name: string
  currency: Currency
  type: AccountType
  initialBalance: Decimal
  isActive: boolean
  createdAt: DateTime
  updatedAt: DateTime
}
```

## AccountType

```ts
enum AccountType {
  CASH
  BANK
  FUND
  INVESTMENT
  HOUSING_RESERVE
  OTHER
}
```

---

# 6. Currency

Inicialmente se soportarán:

```ts
enum Currency {
  ARS
  USD
}
```

La moneda es obligatoria en todas las entidades monetarias.

No realizar conversiones automáticas entre ARS y USD.

---

# 7. Transaction

`Transaction` es la entidad central del dominio.

Representa cualquier movimiento de dinero.

Puede ser:

- gasto;
- ingreso;
- transferencia;
- reintegro;
- ajuste;
- movimiento relacionado con inversión.

```ts
Transaction {
  id: UUID
  userId: UUID
  type: TransactionType
  accountId: UUID
  amount: Decimal
  currency: Currency
  categoryId?: UUID
  description?: string
  occurredAt: DateTime
  paymentMethod?: PaymentMethod
  isFixed: boolean
  reimbursementStatus: ReimbursementStatus
  relatedTransactionId?: UUID
  metadata?: JSON
  status: TransactionStatus
  createdAt: DateTime
  updatedAt: DateTime
}
```

## TransactionType

```ts
enum TransactionType {
  EXPENSE
  INCOME
  TRANSFER
  REIMBURSEMENT
  ADJUSTMENT
  INVESTMENT_OUTFLOW
  INVESTMENT_PRINCIPAL_RETURN
  INVESTMENT_RETURN
  CURRENCY_EXCHANGE
  HOUSING_PAYMENT
}
```

---

# 8. Regla de signo

Los importes se almacenan siempre como valores positivos.

El tipo de transacción determina si afecta positiva o negativamente al saldo.

Ejemplo:

```text
EXPENSE 50.000
```

reduce el saldo.

```text
INCOME 50.000
```

aumenta el saldo.

No persistir importes negativos para representar gastos.

`CURRENCY_EXCHANGE` usa `metadata.direction`: OUT débita, IN acredita.

`HOUSING_PAYMENT` es débito. Reduce el saldo de la cuenta usada para pagar. El signo lo determina `Transaction.type`, no la metadata. La metadata es sólo trazabilidad.

`INVESTMENT_OUTFLOW` es débito (capital colocado).

`INVESTMENT_PRINCIPAL_RETURN` es crédito: sólo la devolución del capital. No incluye interés.

`INVESTMENT_RETURN` es crédito: sólo el rendimiento/interés real. No incluye principal.

---

# 9. Expense

`Expense` no necesita necesariamente una tabla independiente.

Puede representarse mediante:

```text
Transaction.type = EXPENSE
```

Un gasto:

- reduce el saldo de una cuenta;
- al registrarse (`createExpense`) debe tener categoría;
- puede ser fijo;
- puede ser reintegrable;
- puede formar parte de un presupuesto.

`Transaction.categoryId` puede ser null en el modelo general para otros `TransactionType` donde la categoría no aplique.

Ejemplo:

```json
{
  "type": "EXPENSE",
  "amount": 75000,
  "currency": "ARS",
  "category": "Supermercado",
  "description": "Compra semanal"
}
```

---

# 10. Income

Un ingreso se representa mediante:

```text
Transaction.type = INCOME
```

Ejemplos:

- prestación por desempleo;
- SUAF;
- trabajo freelance;
- salario futuro;
- ingreso extraordinario;
- venta;
- devolución.

Los ingresos registrados deben pertenecer al usuario.

No se modelan ingresos de terceros como ingresos propios.

---

# 11. Category

Las categorías permiten clasificar movimientos.

```ts
Category {
  id: UUID
  userId: UUID
  name: string
  type: CategoryType
  isSystem: boolean
  isActive: boolean
  createdAt: DateTime
  updatedAt: DateTime
}
```

## CategoryType

```ts
enum CategoryType {
  EXPENSE
  INCOME
  BOTH
}
```

Un movimiento `EXPENSE` sólo puede usar categorías `EXPENSE` o `BOTH`.

No puede usar una categoría `INCOME`.

Categorías iniciales de gasto:

- Supermercado
- Comida
- Nafta
- Guardería
- Casa
- Seguros
- Servicios
- Salud
- Gym
- Suscripciones
- Hija
- Ocio
- Otros

Deben poder crearse nuevas categorías.

---

# 12. PaymentMethod

```ts
enum PaymentMethod {
  CASH
  DEBIT_CARD
  CREDIT_CARD
  BANK_TRANSFER
  DIGITAL_WALLET
  OTHER
}
```

El medio de pago es informativo.

No implica una integración con ese medio.

---

# 13. Reimbursement

Un gasto puede ser reintegrable.

Ejemplo:

```text
Gasto:
ARS 170.000

Posteriormente:
Reintegro ARS 170.000
```

No modificar el gasto original cuando se recibe el reintegro.

Registrar una nueva transacción:

```text
Transaction.type = REIMBURSEMENT
```

y relacionarla mediante:

```text
relatedTransactionId
```

---

# 14. ReimbursementStatus

```ts
enum ReimbursementStatus {
  NONE
  PENDING
  PARTIAL
  COMPLETED
}
```

Reglas:

Si el gasto no es reintegrable:

```text
NONE
```

Si todavía no fue reintegrado:

```text
PENDING
```

Si recibió una parte:

```text
PARTIAL
```

Si fue completamente reintegrado:

```text
COMPLETED
```

---

# 15. Gasto real

El sistema debe diferenciar:

```text
GrossExpense
```

de:

```text
NetExpense
```

Ejemplo:

Gasto bruto:

ARS 170.000

Reintegro:

ARS 170.000

Gasto neto:

ARS 0

La métrica de consumo del fondo debe utilizar principalmente gasto neto.

---

# 16. Fund

Conceptualmente un fondo puede representarse utilizando una `Account`.

No crear una entidad adicional si no existe una necesidad real.

Ejemplos:

```text
Account:
Fondo indemnización ARS

type:
FUND
```

y:

```text
Account:
Fondo vivienda USD

type:
HOUSING_RESERVE
```

---

# 17. Fondo indemnización

La indemnización inicial debe registrarse como un ingreso.

Ejemplo:

```text
INCOME
ARS 40.000.000
Account: Fondo indemnización ARS
```

No guardar el saldo de la indemnización manualmente.

El saldo se deriva de movimientos posteriores.

---

# 18. Transfer

Mover dinero entre cuentas debe generar una transferencia.

Ejemplo:

```text
Fondo ARS
- ARS 16.000.000

Compra USD

Fondo USD
+ USD 11.000
```

Debido a que las monedas son diferentes, esta operación necesita información adicional.

---

# 19. CurrencyExchange

Para operaciones de compra o venta de moneda se utilizará una entidad específica.

```ts
CurrencyExchange {
  id: UUID
  userId: UUID
  fromAccountId: UUID
  toAccountId: UUID
  fromCurrency: Currency
  toCurrency: Currency
  fromAmount: Decimal
  toAmount: Decimal
  exchangeRate: Decimal
  occurredAt: DateTime
  description?: string
  createdAt: DateTime
}
```

Ejemplo:

```text
ARS 16.500.000
→
USD 11.000

Tipo de cambio:
1 USD = ARS 1.500
```

`exchangeRate` siempre significa ARS por 1 USD, en compra y en venta.

```text
ARS → USD: toAmount = fromAmount / exchangeRate
USD → ARS: toAmount = fromAmount * exchangeRate
```

`toAmount` se redondea a 2 decimales con ROUND_HALF_UP.

Las piernas de cuenta son `Transaction.type = CURRENCY_EXCHANGE` con `metadata.currencyExchangeId` y `metadata.direction`.

Regla:

El sistema debe preservar tanto el importe entregado como el importe recibido.

---

# 20. HousingObligation

Representa la obligación financiera de la vivienda.

```ts
HousingObligation {
  id: UUID
  userId: UUID
  name: string
  currency: Currency
  installmentAmount: Decimal
  totalRemainingInstallments: number
  dueDay?: number
  reserveAccountId?: UUID
  isActive: boolean
  createdAt: DateTime
  updatedAt: DateTime
}
```

Ejemplo inicial:

```text
name:
Vivienda

currency:
USD

installmentAmount:
1100

totalRemainingInstallments:
37
```

---

# 21. HousingPayment

Cada cuota efectivamente pagada debe registrarse.

```ts
HousingPayment {
  id: UUID
  housingObligationId: UUID
  accountId: UUID
  amount: Decimal
  currency: Currency
  installmentNumber?: number
  paidAt: DateTime
  transactionId: UUID
  createdAt: DateTime
}
```

También genera exactamente una `Transaction`:

```text
type = HOUSING_PAYMENT
status = ACTIVE
amount = payment amount
currency = HousingObligation.currency
accountId = cuenta usada para pagar
categoryId = null
relatedTransactionId = null
reimbursementStatus = NONE
```

Metadata exacta:

```json
{
  "housingPaymentId": "<uuid>",
  "housingObligationId": "<uuid>"
}
```

No `incomeKind`. No `direction`.

El monto del pago es un input. Si se omite, usa `HousingObligation.installmentAmount`. No hay regla que exija igualdad con la cuota.

`HOUSING_PAYMENT` no participa de gasto bruto, gasto neto, ingreso operativo, consumo del fondo ni presupuestos.

Un `HOUSING_PAYMENT` no se edita ni anula con los endpoints genéricos de `Transaction`. Eso requiere una operación atómica futura.

---

# 22. HousingCoverage

La cantidad de cuotas cubiertas no debe persistirse necesariamente.

Puede calcularse:

```text
housingReserveBalance
/
installmentAmount
```

2 decimales, ROUND_HALF_UP, string. No persistir. No limitar por `remainingInstallments`.

Si `reserveAccountId` es null: `reserveBalance` y `coveredInstallments` son null.

Si `reserveBalance <= 0`: se conserva el saldo real y `coveredInstallments = "0.00"`.

Puede calcularse con la obligación inactiva.

Ejemplo:

```text
USD 11.000 / USD 1.100 = "10.00"
USD 2.000 / USD 1.100 = "1.82"
USD 4.700 / USD 500 = "9.40"
```

---

# 23. Investment

Representa una inversión registrada por el usuario.

```ts
Investment {
  id: UUID
  userId: UUID
  accountId: UUID
  type: InvestmentType
  currency: Currency
  principal: Decimal
  annualRate?: Decimal
  startDate: DateTime
  maturityDate?: DateTime
  expectedReturn?: Decimal
  actualReturn?: Decimal
  status: InvestmentStatus
  notes?: string
  renewedFromInvestmentId?: UUID
  createdAt: DateTime
  updatedAt: DateTime
}
```

`accountId` es la cuenta origen del capital. En M6.2+ será debitada por `INVESTMENT_OUTFLOW`. No exige `Account.type = INVESTMENT`.

`annualRate` se persiste como fracción anual (`30% = 0.300000`). No se guarda el porcentaje `30`.

---

# 24. InvestmentType

Inicialmente:

```ts
enum InvestmentType {
  CAUCION
  OTHER
}
```

No modelar instrumentos que todavía no se utilicen.

---

# 25. InvestmentStatus

```ts
enum InvestmentStatus {
  DRAFT
  ACTIVE
  MATURED
  RENEWED
  CANCELLED
}
```

---

# 26. Inicio de inversión

Cuando una inversión pasa a:

```text
ACTIVE
```

debe existir un movimiento:

```text
INVESTMENT_OUTFLOW
```

que represente el capital colocado.

Ejemplo:

```text
ARS 5.000.000
Cuenta disponible
→
Caución
```

---

# 27. Vencimiento de inversión

Sólo una Investment `ACTIVE` de tipo `CAUCION` puede vencer.

Transición:

```text
ACTIVE → MATURED
```

Rechazar: `DRAFT`, `MATURED`, `RENEWED`, `CANCELLED`. No hay segundo vencimiento.

El cliente elige `destinationAccountId`. No se asume `Investment.accountId`. La cuenta destino debe existir, ser del usuario, estar activa y tener la misma moneda. No hay FX.

Para `CAUCION`, `capitalReturned` es obligatorio y debe ser igual a `Investment.principal` (Decimal a 2 decimales). No se modela pérdida ni recuperación parcial de capital.

`actualReturn` es el interés real, requerido, `>= 0`. Cero está permitido. No puede ser negativo. No modifica `expectedReturn`.

`occurredAt` es la fecha en que se acreditó el vencimiento. Para `CAUCION`:

```text
calendarDate(occurredAt) >= calendarDate(maturityDate)
```

en `America/Argentina/Buenos_Aires`. Mismo día calendario válido. No usar milisegundos / 86400000. No exigir que sea "hoy".

Movimientos atómicos:

```text
INVESTMENT_PRINCIPAL_RETURN  (crédito, amount = principal)
INVESTMENT_RETURN            (crédito, amount = actualReturn, sólo si actualReturn > 0)
```

Si `actualReturn = "0.00"`: sólo se crea `INVESTMENT_PRINCIPAL_RETURN`. No hay Transaction de monto cero. `Investment.actualReturn` queda `"0.00"`.

Ejemplo:

```text
principal = 100000.00
actualReturn = 575.34

INVESTMENT_PRINCIPAL_RETURN = 100000.00
INVESTMENT_RETURN = 575.34
```

`INVESTMENT_RETURN` nunca es `100575.34`.

---

# 28. Renovación

Sólo una Investment `ACTIVE` de tipo `CAUCION` puede renovarse.

Transición de la original:

```text
ACTIVE → RENEWED
```

`RENEWED` es terminal: finalizó mediante renovación. No es `ACTIVE → MATURED → RENEWED`.

Rechazar: `DRAFT`, `MATURED`, `RENEWED`, `CANCELLED`. No hay segundo renew sobre la misma Investment.

La renovación es vencimiento económico + nueva colocación, atómicos. No hay rollover invisible.

Siempre se crea una **nueva** Investment `CAUCION` `ACTIVE` con:

```text
renewedFromInvestmentId = original.id
```

La original conserva intactos principal, annualRate, expectedReturn, startDate, maturityDate, accountId. Sólo se actualizan `status = RENEWED` y `actualReturn`.

`capitalReturned` no lo envía el cliente: es `original.principal`.

`actualReturn` lo envía el cliente, `>= 0`. Cero permitido. No modifica `expectedReturn` original. No se capitaliza ni se reinvierte automáticamente.

`renewalPrincipal > 0` y `<= original.principal`. Todo = igual al principal. Parcial = menor. No puede superar el principal (el interés no se agrega).

El cliente envía `accountId`: esa cuenta recibe el retorno y financia el nuevo outflow. La nueva Investment usa ese `accountId`.

`occurredAt` calendario ART `>= original.maturityDate`. `startDate` de la nueva = `occurredAt`. El cliente envía `maturityDate` de la nueva: calendario ART `>= occurredAt`. `annualRate` nueva (fracción). `expectedReturn` se recalcula con la regla M6.2 sobre `renewalPrincipal`.

Movimientos:

```text
INVESTMENT_PRINCIPAL_RETURN  crédito, original.principal, metadata original.id
INVESTMENT_RETURN            crédito, actualReturn, si > 0, metadata original.id
INVESTMENT_OUTFLOW           débito, renewalPrincipal, metadata nueva.id
```

El saldo se valida con los créditos del mismo flujo: no rechazar una renovación total sólo porque el saldo previo sea 0.

La cadena: A `RENEWED` ← B `ACTIVE` (`renewedFrom` = A). Luego se renueva B, no A.

---

# 29. InvestmentReturn

El rendimiento esperado debe ser calculado mediante código.

Ejemplo simple para caución:

```text
interest =
principal
*
annualRate
*
days
/
365
```

Este cálculo será aproximado.

`days` es la diferencia de fechas calendario en `America/Argentina/Buenos_Aires`:

```text
days = calendarDate(maturityDate) - calendarDate(startDate)
```

No es inclusiva: 01/09 → 08/09 = 7. Mismo día = 0. No usar `(timestamp / 86400000)`.

El resultado se redondea a 2 decimales con ROUND_HALF_UP.

La aplicación debe permitir registrar posteriormente el rendimiento real.

---

# 30. Budget

Un presupuesto representa un límite planificado.

```ts
Budget {
  id: UUID
  userId: UUID
  categoryId: UUID
  currency: Currency
  amount: Decimal
  year: number
  month: number
  createdAt: DateTime
  updatedAt: DateTime
}
```

Ejemplo:

```text
Nafta
2026-09
ARS 200.000
```

Create/update exige `amount > 0`.

`amount = 0` no está permitido.

“Sin presupuesto” se representa por la ausencia de un Budget para esa categoría, moneda y mes.

---

# 31. BudgetConsumption

No persistir necesariamente.

Calcular:

```text
sum(expenses)
-
sum(reimbursements)
```

para:

- categoría;
- mes;
- moneda.

---

# 32. BudgetProgress

Se calcula:

```text
spent / budget * 100
```

Ejemplo:

```text
147.500 / 200.000 = 73,75%
```

---

# 33. SpendingPace

El ritmo esperado del presupuesto puede calcularse mediante:

```text
currentDay / daysInMonth
```

Ejemplo:

Día:

10 / 30

Tiempo consumido:

33%

Presupuesto consumido:

70%

El sistema puede marcar:

```text
ABOVE_EXPECTED_PACE
```

---

# 34. MonthlySnapshot

Para análisis histórico podría guardarse un snapshot mensual.

No es obligatorio para el MVP inicial.

```ts
MonthlySnapshot {
  id: UUID
  userId: UUID
  year: number
  month: number
  arsBalance: Decimal
  usdBalance: Decimal
  totalExpenses: Decimal
  totalIncome: Decimal
  fundConsumption: Decimal
  createdAt: DateTime
}
```

Puede incorporarse posteriormente si mejora performance o auditoría.

---

# 35. FundConsumption

Métrica principal.

```text
FundConsumption =
gastos financiados por fondos propios
-
ingresos propios destinados a esos gastos
```

Conceptualmente:

```text
Gastos netos:
ARS 1.500.000

Ingresos propios:
ARS 600.000

Consumo fondo:
ARS 900.000
```

La implementación deberá evitar doble contabilización.

---

# 36. Runway

El runway estima cuántos meses puede sostenerse el gasto actual.

No persistirlo como valor definitivo.

Debe calcularse dinámicamente.

Versión inicial:

```text
runway =
availableFund
/
averageMonthlyFundConsumption
```

Pero debe excluir fondos reservados.

Ejemplo:

```text
Fondo ARS disponible:
ARS 20.000.000

Fondo vivienda:
USD 11.000

Consumo promedio:
ARS 1.000.000

Runway:
20 meses
```

Los USD reservados para vivienda no entran automáticamente en ese cálculo.

`AvailableRunwayARS` suma saldos ARS activos de cuentas `CASH`, `BANK` y `FUND`.

Un mes es válido para el promedio si tiene al menos un `EXPENSE` `ACTIVE` `ARS`. Si ese mes tiene consumo 0, igualmente participa.

El promedio usado para runway considera hasta los últimos 3 meses calendario cerrados válidos anteriores al mes calendario del resumen. El mes corriente no forma parte del promedio mientras esté abierto, aunque sus movimientos sí afectan `totalAvailableARS` y las métricas del mes.

---

# 37. Scenario

Las simulaciones no deben alterar datos reales.

M7.1 no persiste `Scenario`. Expone primitives read-only que reciben valores ya resueltos.

M7.2 implementa el escenario de producto «sin ingreso N meses» (`simulateMonthsWithoutIncome`). Es read-only: no persiste `Scenario` y no altera transacciones, cuentas, presupuestos, vivienda ni inversiones.

M7.3 implementa «nuevo empleo» (`simulateNewJobScenario`). También es read-only.

M7.4 implementa «reserva vivienda» (`simulateHousingReserve`). Read-only: no compra USD, no crea movimientos y no altera Housing, Accounts ni Scenario.

```ts
Scenario {
  id: UUID
  userId: UUID
  name: string
  parameters: JSON
  createdAt: DateTime
}
```

Persistencia de Scenario: opcional y fuera de M7.1–M7.4.

Primitives M7.1 (puras, sin DB, sin clock, sin userId):

```text
adjustMonthlyConsumption(baseMonthlyConsumption, percentageChange)
projectCapital({ initialCapitalARS, months, monthlyConsumptionARS, monthlyIncomeARS })
calculateSimulatedRunway(availableCapitalARS, monthlyFundConsumptionARS)
convertUsdToArs(amountUSD, exchangeRateARSPerUSD)
```

`percentageChange` es fracción (`-10%` = `-0.100000`). `projectCapital` no acumula surplus: si el ingreso hipotético supera el consumo, el draw efectivo es 0 y el capital no crece. El capital jamás queda negativo (clamp a 0). `monthlyIncomeARS` es un input hipotético constante, no el operating income real. M7.1 ignora cashflows futuros de Investments. FX sólo USD→ARS con cotización explícita.

M7.2 — «¿Qué pasa si no tengo ingresos durante N meses?»:

```text
capital inicial = totalAvailableARS real
consumo mensual simulado = averageMonthlyFundConsumption real
monthlyIncomeARS = 0
sin ajuste de gastos
sin housing
sin cashflow futuro de Investments
sin FX / USD
capital clamp 0
runway posterior = remainingCapital / el mismo promedio
null baseline se conserva
```

Inputs explícitos: `userId`, `year`, `month`, `months`, `timeZone`. No usa `Date.now()`. `months` es entero `> 0`. FinancialService es la autoridad del baseline (`totalAvailableARS`, `averageMonthlyFundConsumption`, `runwayMonths` como referencia). El escenario no recalcula saldos, meses válidos, promedio ni runway real.

Si `averageMonthlyFundConsumption = null`, no hay proyección fiable: no se asume 0 ni se inventa un promedio. Los campos simulados dependientes quedan `null`; el capital disponible del baseline se conserva.

Si el promedio es `"0.00"` (meses válidos con consumo 0), el draw es 0, el capital no se consume y el runway posterior es `null` (no infinito).

El resultado es `MonthsWithoutIncomeResult`, no un `ScenarioResult` genérico con vivienda o USD.

M7.3 — «¿Qué pasa si consigo un nuevo empleo después de N meses?»:

```text
horizonte total = totalMonths (explícito)
tramo 1: monthsUntilJob meses con monthlyIncomeARS = 0
tramo 2: el resto con monthlyIncomeARS = newMonthlyIncomeARS
consumo = adjustMonthlyConsumption(average, expenseChangeFraction)
el ajuste aplica a TODO el horizonte
operating income histórico no se proyecta
surplus del empleo no reconstruye el capital extraordinario
depleted global: phase1, o monthsUntilJob + phase2
runway final = remaining / draw post-empleo (o consumo ajustado si el empleo no entra en el horizonte)
si draw post-empleo = 0 → runway null (no infinito)
null baseline se conserva
sin housing
sin cashflow futuro de Investments
sin FX / USD
```

Inputs explícitos: `userId`, `year`, `month`, `monthsUntilJob`, `totalMonths`, `newMonthlyIncomeARS`, `expenseChangeFraction`, `timeZone`. No usa `Date.now()`. `monthsUntilJob` entero `>= 0`. `totalMonths` entero `> 0`. `monthsUntilJob <= totalMonths`. `newMonthlyIncomeARS >= 0`. `expenseChangeFraction >= -1`.

Se proyecta llamando `projectCapital` dos veces. No se llama `simulateMonthsWithoutIncome`.

El resultado es `NewJobScenarioResult`.

M7.4 — «¿Cuánto necesito reservar para cubrir X cuotas de vivienda?»:

```text
sólo HousingObligation.currency = USD
targetInstallments entero > 0 y <= remainingInstallments
targetReserveUSD = installmentAmount * targetInstallments
reserva actual = únicamente reserveAccountId (no otras cuentas USD, no Investments)
si reserveAccountId es null: HousingCoverage sigue null; el escenario usa effectiveCurrentReserveUSD = 0
si el saldo reserva es negativo: currentReserveUSD conserva el saldo; effective = 0
missing = max(target - effective, 0)
excess = max(effective - target, 0)
FX explícito ARS por 1 USD > 0; no mercado; no persistir
arsRequired = convertUsdToArs(missing, rate) (0 si no hay faltante)
available ARS = totalAvailableARS (no suma USD)
remaining ARS hipotético = max(available - required, 0)
arsShortfall = max(required - available, 0)
canFullyFund = available >= required
no recalcular runway; currentRunwayMonths es sólo referencia
no HousingPayment, no CurrencyExchange, no Scenario
```

Inputs explícitos: `userId`, `housingObligationId`, `targetInstallments`, `exchangeRateARSPerUSD`, `year`, `month`, `timeZone`. No usa `Date.now()`.

El resultado es `HousingReserveSimulationResult`.

---

# 38. ScenarioResult

Inicialmente no es necesario persistir resultados.

Se pueden calcular bajo demanda.

M7.2 no usa un `ScenarioResult` genérico. Su contrato es:

```ts
MonthsWithoutIncomeResult {
  year
  month
  months
  baseline {
    availableCapitalARS
    averageMonthlyFundConsumptionARS  // string | null
    currentRunwayMonths               // string | null
  }
  projection {
    monthlyIncomeARS                  // siempre "0.00"
    monthlyFundConsumptionARS         // string | null
    totalFundConsumedARS              // string | null
    remainingCapitalARS               // string | null
    depletedAfterMonth                // number | null
    runwayAfterScenarioMonths         // string | null
  }
}
```

`remainingUSD` y `housingCoverageMonths` no pertenecen a M7.2.

M7.3 usa `NewJobScenarioResult`:

```ts
NewJobScenarioResult {
  year
  month
  monthsUntilJob
  totalMonths
  assumptions {
    newMonthlyIncomeARS
    expenseChangeFraction
  }
  baseline {
    availableCapitalARS
    averageMonthlyFundConsumptionARS  // string | null
    currentRunwayMonths               // string | null
  }
  projection {
    adjustedMonthlyConsumptionARS     // string | null
    phaseWithoutIncome { months, totalFundConsumedARS, remainingCapitalARS, depletedAfterMonth }
    phaseWithNewJob { months, monthlyIncomeARS, effectiveMonthlyDrawARS, totalFundConsumedARS, remainingCapitalARS, depletedAfterMonth }
    totalFundConsumedARS
    remainingCapitalARS
    depletedAfterMonth                // mes global | null
    finalMonthlyFundConsumptionARS
    runwayAfterScenarioMonths
  }
}
```

`remainingUSD` y `housingCoverageMonths` no pertenecen a M7.3.

M7.4 usa `HousingReserveSimulationResult`. No usa un `ScenarioResult` genérico.

`remainingUSD` como suma de reserva + runway no pertenece a M7.4: ARS y USD se informan por separado.

Ejemplo genérico futuro:

```ts
ScenarioResult {
  remainingARS
  remainingUSD
  runwayMonths
  housingCoverageMonths
  totalFundConsumed
}
```

---

# 39. AIConversation

La conversación AI puede almacenarse de manera opcional.

Para MVP puede ser simple.

```ts
AIConversation {
  id: UUID
  userId: UUID
  title?: string
  createdAt: DateTime
  updatedAt: DateTime
}
```

---

# 40. AIMessage

```ts
AIMessage {
  id: UUID
  conversationId: UUID
  role: AIMessageRole
  content: string
  createdAt: DateTime
}
```

```ts
enum AIMessageRole {
  USER
  ASSISTANT
  SYSTEM
}
```

---

# 41. AIParsedTransaction

Una entrada natural procesada por AI NO debe guardarse directamente como transacción.

Primero debe generar una propuesta.

```ts
AIParsedTransaction {
  type: "EXPENSE" | "INCOME" | null
  amount: string | null
  currency: "ARS" | "USD" | null
  categoryHint: string | null
  accountHint: string | null
  description: string | null
  occurredAt: string | null
  paymentMethod: PaymentMethod | null
  incomeKind: "OPERATING" | "CAPITAL" | null
}
```

El resultado de parseo es `{ transactions: AIParsedTransaction[], ambiguities: string[] }`. Es propuesta, no persistencia. El schema canónico está en `AI-SPEC.md`.

Flujo:

```text
User input
↓
AI parse
↓
Structured result
↓
Preview
↓
User confirmation
↓
Transaction persisted
```

---

# 42. Regla AI crítica

El modelo de AI nunca es autoridad financiera.

Nunca debe decidir:

- saldos;
- rendimientos;
- runway;
- presupuestos;
- cantidad de cuotas cubiertas;
- capital restante.

Debe solicitar esos valores a funciones determinísticas.

---

# 43. FinancialService

Conceptualmente deben existir funciones de dominio como:

```ts
getAccountBalance(accountId)

getMonthlyExpenses(year, month)

getMonthlyNetExpenses(year, month)

getMonthlyIncome(year, month)

getMonthlyFundConsumption(year, month)

getBudgetProgress(categoryId, year, month)

getHousingCoverage()

calculateInvestmentExpectedReturn()

calculateRunway()

simulateScenario()
```

Estas funciones serán utilizadas tanto por la UI como por AI.

---

# 44. Decimal y dinero

Nunca utilizar `number` de JavaScript como fuente persistida de dinero.

PostgreSQL deberá usar:

```text
NUMERIC / DECIMAL
```

Ejemplo sugerido:

```text
NUMERIC(18,2)
```

Para tasas puede utilizarse mayor precisión:

```text
NUMERIC(12,6)
```

---

# 45. Fechas

Persistir fechas utilizando timestamps.

Preferentemente:

```text
TIMESTAMPTZ
```

La UI podrá presentarlas utilizando la zona horaria local.

---

# 46. IDs

Utilizar UUID como identificador principal.

Preferentemente UUID generado por aplicación o PostgreSQL.

No depender de IDs incrementales para reglas de negocio.

---

# 47. Auditoría mínima

Las entidades principales deben incluir:

```text
createdAt
updatedAt
```

No implementar auditoría financiera compleja en MVP.

No borrar físicamente movimientos financieros por defecto.

---

# 48. Eliminación de movimientos

Una transacción registrada debería preferentemente:

- editarse;
- anularse;
- archivarse;

en lugar de eliminarse definitivamente.

Puede utilizarse:

```ts
status: TransactionStatus
```

```ts
enum TransactionStatus {
  ACTIVE
  VOIDED
}
```

Las transacciones `VOIDED` no participan en cálculos.

---

# 49. Integridad monetaria

Una transacción debe cumplir:

```text
amount > 0
```

y:

```text
currency == account.currency
```

excepto operaciones explícitas de cambio de moneda.

---

# 50. Integridad de reintegros

La suma de reintegros asociados a un gasto no debería superar el gasto original salvo confirmación explícita.

Ejemplo:

```text
Expense:
ARS 100.000

Maximum reimbursement expected:
ARS 100.000
```

---

# 51. Integridad de inversión

Una inversión no puede utilizar más dinero que el saldo disponible de su cuenta de origen.

Ejemplo:

```text
Saldo:
ARS 1.000.000

Caución solicitada:
ARS 1.500.000

Resultado:
Rejected
```

---

# 52. Integridad de vivienda

Un pago de vivienda debe utilizar la misma moneda de la obligación, salvo que exista una operación de cambio explícita.

Si la obligación está en:

```text
USD
```

el pago debe registrarse en:

```text
USD
```

---

# 53. Soft delete

Las entidades configurables pueden utilizar:

```text
isActive
```

Ejemplo:

- categoría;
- cuenta;
- obligación.

Los movimientos financieros deben preservar historial.

Una cuenta o categoría inactiva no recibe movimientos nuevos.

Sigue disponible para consultar el historial existente.

Para volver a registrar movimientos sobre ella, primero debe reactivarse.

---

# 54. PostgreSQL

El diseño debe ser compatible con PostgreSQL.

Tipos sugeridos:

```text
UUID
VARCHAR
TEXT
NUMERIC
BOOLEAN
TIMESTAMPTZ
JSONB
```

`JSONB` solamente debe utilizarse para:

- metadata;
- parámetros de escenarios;
- información flexible no crítica.

No guardar entidades financieras completas dentro de JSONB.

---

# 55. Relaciones conceptuales

```text
User
 |
 +-- Account
 |     |
 |     +-- Transaction
 |     |
 |     +-- Investment
 |
 +-- Category
 |
 +-- Budget
 |
 +-- HousingObligation
 |       |
 |       +-- HousingPayment
 |
 +-- CurrencyExchange
 |
 +-- Scenario
 |
 +-- AIConversation
         |
         +-- AIMessage
```

---

# 56. Regla de independencia de infraestructura

El dominio no debe conocer:

- Neon;
- Render;
- Vercel;
- OpenAI;
- brokers;
- bancos.

Debe trabajar con interfaces.

La infraestructura podrá implementar esas interfaces posteriormente.

---

# 57. Regla de independencia de AI

La aplicación debe funcionar completamente sin OpenAI.

Si OpenAI falla:

- se pueden registrar gastos manualmente;
- se pueden consultar dashboards;
- se pueden calcular inversiones;
- se pueden calcular presupuestos;
- se pueden realizar simulaciones.

AI mejora la experiencia.

AI no sostiene el dominio.

---

# 58. Regla de privacidad

No persistir:

- claves bancarias;
- números completos de tarjetas;
- CVV;
- contraseñas externas;
- tokens bancarios;
- API keys.

Las API keys deben mantenerse únicamente en variables de entorno server-side.

---

# 59. Variables de entorno

Conceptualmente:

```env
DATABASE_URL=

OPENAI_API_KEY=
```

No almacenar estas variables en el repositorio.

---

# 60. Decisiones aplazadas

Todavía NO decidir:

- Prisma vs Drizzle vs otro ORM;
- proveedor definitivo de PostgreSQL;
- proveedor de hosting;
- autenticación;
- librería de gráficos;
- framework CSS;
- sistema exacto de componentes;
- modelo de OpenAI.

Estas decisiones pertenecen a documentación técnica posterior.

---

# 61. Invariantes principales

El dominio deberá respetar siempre:

1. El saldo es consecuencia de movimientos.
2. ARS y USD son monedas separadas.
3. Un gasto nunca utiliza importe negativo.
4. Los fondos reservados no se consideran automáticamente disponibles.
5. Los reintegros no eliminan el gasto original.
6. Las inversiones mantienen historial.
7. Las simulaciones nunca modifican datos reales.
8. AI nunca modifica datos sin confirmación.
9. AI nunca calcula saldos financieros como fuente de verdad.
10. PostgreSQL es la persistencia principal.
11. Los movimientos financieros deben conservar trazabilidad.
12. El dominio debe funcionar sin OpenAI.

---

# 62. Regla SDD

Este documento es la fuente de verdad del modelo de dominio.

Antes de crear una nueva entidad:

1. justificar por qué no puede representarse con el modelo existente;
2. actualizar este documento;
3. actualizar el modelo de datos;
4. actualizar el backlog;
5. recién después implementar.

Cursor/AI no debe crear entidades adicionales por conveniencia técnica sin actualizar previamente la especificación.
