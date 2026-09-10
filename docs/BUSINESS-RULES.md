# BUSINESS-RULES.md

# Personal Finance Runway — Business Rules

## 1. Propósito

Este documento define las reglas financieras que deben aplicarse de forma determinística.

Debe respetar `VISION.md`, `DOMAIN.md`, `MVP.md`, `MVP2.md`, `MVP2-DECISIONES-P0.md`, `ARCHITECTURE.md`, `DATA-MODEL.md` y `USER-FLOWS.md`.

La AI puede explicar resultados, pero estas reglas pertenecen al backend.

---

# 2. Fuente de verdad

Los saldos y métricas se derivan de movimientos `ACTIVE`.

Una transacción `VOIDED` conserva historial pero no participa en cálculos.

No modificar saldos directamente.

---

# 3. Clasificación económica

Para evitar errores de runway, cada movimiento debe distinguir entre:

- flujo operativo;
- movimiento de capital;
- movimiento interno;
- rendimiento;
- ajuste.

La clasificación puede implementarse mediante reglas por `TransactionType` y metadata. Si se vuelve insuficiente, deberá actualizarse el modelo antes de agregar columnas.

---

# 4. Ingreso operativo

Es dinero nuevo que puede financiar gastos cotidianos.

Ejemplos:

- salario;
- prestación;
- freelance;
- asignación propia;
- otro ingreso recurrente o disponible para consumo.

Participa en el cálculo de consumo mensual del fondo.

---

# 5. Ingreso de capital

Es dinero que aumenta el patrimonio inicial o extraordinario, pero no debe interpretarse como ingreso operativo del mes.

Ejemplos:

- capital inicial;
- indemnización cargada al comenzar;
- aporte extraordinario de capital.

Debe poder registrarse como movimiento sin distorsionar `monthlyOperatingIncome`.

En MVP la distinción puede guardarse en metadata:

```json
{
  "incomeKind": "CAPITAL"
}
```

Valores conceptuales:

```text
OPERATING
CAPITAL
```

Si esta distinción se utiliza ampliamente, deberá promoverse a columna/enum mediante actualización SDD.

---

# 6. Capital inicial

El capital inicial:

- aumenta el saldo;
- aumenta patrimonio;
- NO se resta de gastos para calcular consumo mensual;
- NO se considera salario o ingreso operativo.

---

# 7. Gastos

Un `EXPENSE` representa consumo económico.

Debe participar en:

- gasto bruto;
- gasto por categoría;
- presupuesto;
- gasto mensual.

Si tiene reintegro, el gasto neto se reduce por los reintegros relacionados.

`createExpense` exige `categoryId` y exactamente uno de `accountId` o `creditCardId` (F1 / P0.5).

| Modo | accountId | creditCardId | Banco | Period spending | currentCardDebt |
|---|---|---|---|---|---|
| BANK EXPENSE | set | null | −amount | +amount | 0 |
| CARD EXPENSE P0.5 | null | set | 0 | +amount | +amount |

**Recognition of spending and movement of cash are separate concerns.**

Un gasto (`Transaction.type = EXPENSE`) sólo puede usar categorías con:

```text
CategoryType = EXPENSE
CategoryType = BOTH
```

Debe rechazarse una categoría `INCOME`.

Un movimiento nuevo no puede registrarse sobre una cuenta, tarjeta o categoría inactiva (`isActive = false`).

Esas entidades se conservan sólo para historial. Para volver a usarlas hay que reactivarlas.

Tarjeta inactiva: conserva histórico; no acepta nuevos consumos.

---

# 8. Gasto bruto

```text
GrossExpense =
SUM(EXPENSE ACTIVE)
```

para período y moneda seleccionados.

---

# 9. Gasto neto

```text
NetExpense =
GrossExpense
-
valid reimbursements
```

No permitir que el gasto neto de una transacción sea negativo salvo futura regla explícita.

---

# 10. Reintegros

Un `REIMBURSEMENT`:

- aumenta saldo de la cuenta receptora;
- reduce gasto neto asociado;
- no se considera ingreso operativo independiente;
- debe estar vinculado al gasto original.

---

# 11. Consumo del fondo

Métrica central:

```text
MonthlyFundConsumption =
EligibleNetOperatingExpenses
-
EligibleOperatingIncome
```

Si el resultado es menor que cero:

```text
MonthlyFundConsumption = 0
```

para cálculo de runway.

Puede mostrarse por separado un superávit operativo.

---

# 12. Qué NO es consumo del fondo

Excluir:

- transferencias entre cuentas propias;
- compra/venta de moneda;
- capital colocado en inversiones;
- devolución de principal de inversión;
- capital inicial;
- ajustes técnicos que no representen consumo;
- reintegros como ingreso independiente.

---

# 13. Vivienda y consumo del fondo

El pago de vivienda representa una obligación real, pero cuando se paga desde un fondo USD reservado específicamente para vivienda no debe duplicarse dentro del runway ARS de gastos cotidianos.

Regla MVP:

```text
Runway ARS
```

mide autonomía del fondo personal ARS.

```text
HousingCoverage
```

mide autonomía de vivienda USD.

`coveredInstallments = reserveBalance / installmentAmount` con 2 decimales ROUND_HALF_UP. No limitar por `remainingInstallments`.

Si no hay cuenta reserva: `reserveBalance` y `coveredInstallments` son null.

Si `reserveBalance <= 0`: se conserva el saldo (puede ser negativo) y `coveredInstallments = "0.00"`.

Una obligación inactiva sí puede calcular cobertura. Ownership sigue siendo obligatorio.

Ambas métricas se muestran separadas.

Si un pago de vivienda sale de fondos operativos ARS mediante cambio de moneda, el cambio no es gasto operativo; la obligación se analiza en la métrica de vivienda.

Un pago de vivienda se representa como `Transaction.type = HOUSING_PAYMENT`, no como `EXPENSE`, `TRANSFER`, `ADJUSTMENT` ni `INVESTMENT_OUTFLOW`.

`categoryId` es null. No se crea una categoría “Vivienda”.

`HOUSING_PAYMENT` no participa de:

```text
monthlyGrossExpenses
monthlyNetExpenses
monthlyOperatingIncome
monthlyFundConsumption
Budget consumption
```

Es una salida de capital reservada/específica de vivienda.

Si la cuenta de pago es ARS elegible para runway, su balance sí disminuye y `totalAvailableARS` puede bajar de forma indirecta.

Si se paga desde una cuenta USD, no se convierte a ARS ni afecta métricas ARS operativas.

El signo en balance es débito. Si falta metadata válida, el signo sigue siendo débito.

Después de un pago válido: `remainingInstallments - 1`, nunca menor a 0. Si queda 0, no desactivar automáticamente la obligación.

`PATCH /api/transactions/:id` y `POST /api/transactions/:id/void` rechazan `HOUSING_PAYMENT` con `HOUSING_PAYMENT_IMMUTABLE`.

---

# 14. Runway

```text
RunwayMonths =
AvailableRunwayARS
/
AverageMonthlyFundConsumption
```

`AvailableRunwayARS` (`totalAvailableARS`) suma el balance derivado actual de cuentas que cumplen:

```text
currency = ARS
isActive = true
type IN (CASH, BANK, FUND)
```

Excluir:

```text
HOUSING_RESERVE
INVESTMENT
OTHER
cuentas USD
cuentas inactivas
```

No convertir USD a ARS.

---

# 15. Promedio de consumo

MVP:

- utilizar hasta los últimos 3 meses calendario **cerrados** válidos anteriores al mes calendario solicitado (el mes del Dashboard / `year`+`month` de `getFinancialSummary`);
- el mes corriente no forma parte del promedio mientras esté abierto, aunque sus movimientos sí afectan balances y métricas del mes;
- un mes es válido si tiene al menos un `EXPENSE` `ACTIVE` `ARS` en el mes calendario del usuario;
- INCOME, CAPITAL, REIMBURSEMENT, TRANSFER, CURRENCY_EXCHANGE o VOIDED no hacen válido un mes por sí solos;
- si el mes es válido y `fundConsumption = 0`, el mes aporta 0 al promedio;
- si sólo existe un mes cerrado válido, utilizar ese mes;
- si no existe ningún mes cerrado válido: `averageMonthlyFundConsumption = null` y `runwayMonths = null`;
- si el promedio resulta 0: `runwayMonths = null`.

No devolver infinito.

`runwayMonths` se expresa con 2 decimales (ROUND_HALF_UP) o `null`.

---

# 16. Transferencias

Una transferencia entre cuentas propias:

- no es ingreso;
- no es gasto;
- no altera patrimonio total;
- sí altera saldos individuales;
- puede dejar el saldo origen negativo (misma política de balances derivados que otros movimientos; no hay `INSUFFICIENT_BALANCE` exclusivo para transfers).

Se representa con dos movimientos `Transaction.type = TRANSFER` vinculados por `metadata.transferId` (source of truth desde MVP1). No existe entidad `InternalTransfer` ni un `TransactionType` adicional.

```text
metadata.direction = OUT
```

débito en la cuenta origen.

```text
metadata.direction = IN
```

crédito en la cuenta destino.

Lookup lógico / idempotencia (P0.12.1): tabla aditiva `transfer_links` con UNIQUE `(user_id, idempotency_key)`. Las dos piernas siguen siendo la autoridad financiera.

Canonical payload de idempotencia:

```text
sourceAccountId
destinationAccountId
amount
description (normalizada; null si vacía)
occurredAt solo si el cliente lo envió
```

Misma key + mismo payload → misma transferencia lógica. Misma key + payload distinto → `409 IDEMPOTENCY_CONFLICT`.

Antes de crear piernas: `SELECT … FOR UPDATE` de ambas cuentas en orden determinístico de UUID (menor → mayor) para evitar deadlocks; luego validar existencia, mismo user, activas, origen ≠ destino, misma currency. OUT + IN + link en la misma DB transaction.

Transferencia INVESTMENT → BANK reclasifica liquidez (`totalAvailableARS` puede subir); no es income; no muta `Investment` / cauciones.

Debe persistirse atómicamente: OUT e IN juntos, o rollback completo.

No se edita ni se anula una pierna individual (`PATCH` / `void` sobre `TRANSFER` se rechazan con `TRANSFER_IMMUTABLE`).

Corrección/reversión atómica de la operación completa: P0.15 (no hard delete).

CSV export: sigue emitiendo **2 filas físicas** con label `Transferencia` (compatibilidad); no agrupa. La UI de Movimientos sí agrupa por `transferId` cuando el par OUT+IN está completo; piernas legacy incompletas se muestran individuales.

---

# 17. Cambio de moneda

Una compra/venta de moneda:

- no es gasto operativo;
- no es ingreso operativo;
- no es CAPITAL ni OPERATING;
- no es reintegro;
- cambia composición patrimonial por moneda;
- conserva `fromAmount`, `toAmount` y `exchangeRate`.

Se representa con `CurrencyExchange` más dos `Transaction.type = CURRENCY_EXCHANGE`.

```text
CURRENCY_EXCHANGE + direction OUT → débito
CURRENCY_EXCHANGE + direction IN  → crédito
```

`exchangeRate` siempre es ARS por 1 USD.

```text
ARS → USD: toAmount = fromAmount / exchangeRate
USD → ARS: toAmount = fromAmount * exchangeRate
```

Redondeo de `toAmount` a 2 decimales: ROUND_HALF_UP. No truncar. No usar float.

El cliente envía `fromAmount` y `exchangeRate`. El backend calcula `toAmount`.

Debe persistirse atómicamente: CurrencyExchange + OUT + IN, o rollback completo.

No se edita ni se anula una pierna individual (`PATCH` / `void` sobre `CURRENCY_EXCHANGE` se rechazan).

---

# 18. Inversiones

`Investment.accountId` es la cuenta origen del capital. El débito (`INVESTMENT_OUTFLOW`) ocurre al activar/crear en M6.2. No se exige `Account.type = INVESTMENT`.

Colocar capital en una inversión:

- reduce saldo disponible de la cuenta origen;
- aumenta capital invertido;
- NO es gasto operativo.

Al vencimiento (sólo `ACTIVE` → `MATURED`):

- `INVESTMENT_PRINCIPAL_RETURN` acredita el capital en `destinationAccountId` (lo elige el cliente; no se asume `Investment.accountId`);
- para `CAUCION`, `capitalReturned` debe ser igual a `principal`;
- el principal retornado NO es ingreso operativo ni rendimiento;
- `INVESTMENT_RETURN` acredita sólo el interés real (`actualReturn`);
- el rendimiento real SÍ es rendimiento financiero, no operating income;
- `actualReturn >= 0`; `"0.00"` está permitido y no crea Transaction de monto cero;
- `actualReturn` no modifica `expectedReturn`;
- `occurredAt` se compara por fecha calendario ART: `occurredAt >= maturityDate`;
- ninguno de los dos movimientos entra en gross/net expenses, operating income, fund consumption ni budgets;
- ambos afectan el saldo de la cuenta destino;
- PATCH/VOID genéricos de `INVESTMENT_PRINCIPAL_RETURN` e `INVESTMENT_RETURN` se rechazan.

Al renovar (sólo `ACTIVE` → `RENEWED`, más nueva `ACTIVE`):

- es vencimiento económico + nueva colocación, atómicos; no hay rollover invisible;
- `capitalReturned` = `original.principal` (el cliente no lo envía);
- `actualReturn >= 0`; no se reinvierte automáticamente; se acredita en `accountId`;
- `renewalPrincipal > 0` y `<= original.principal` (todo o parcial; no mayor);
- la misma cuenta recibe retorno y financia el nuevo `INVESTMENT_OUTFLOW`;
- el saldo se valida incluyendo esos créditos del mismo flujo (una renovación total es válida con saldo previo 0);
- `startDate` nueva = `occurredAt`; `maturityDate` nueva calendario ART `>= occurredAt`;
- `annualRate` nueva (fracción); `expectedReturn` recalculado (regla M6.2);
- los tres tipos de movimiento no entran en expenses, operating income, fund consumption ni budgets;
- segundo renew sobre la original se rechaza (`INVESTMENT_NOT_ACTIVE`).

---

# 19. Rendimiento esperado

Para caución MVP:

```text
expectedReturn =
principal * annualRate * days / 365
```

`annualRate` se persiste y se usa en el cálculo como fracción anual.

Ejemplo:

```text
30%   = 0.300000
8.5%  = 0.085000
0%    = 0.000000
```

No persistir `"30.000000"` para representar 30%.

`days` es la diferencia de fechas calendario (no inclusiva) en `America/Argentina/Buenos_Aires`. 01/09 → 08/09 = 7. Mismo día = 0. No usar milisegundos / 86400000.

El resultado se persiste con 2 decimales y ROUND_HALF_UP.

El resultado es estimativo.

---

# 20. Rendimiento real

Al vencimiento prevalece:

```text
actualReturn
```

sobre `expectedReturn`.

Los reportes históricos deben usar rendimiento real cuando exista.

`actualReturn` lo envía el cliente al vencer. ROUND_HALF_UP a 2 decimales. No JS float. Cero permitido. Negativo rechazado.

---

# 21. Presupuestos

```text
BudgetConsumption =
NetExpense(category, month)
```

Transferencias, inversiones y cambios de moneda no consumen presupuesto de gastos.

Create/update de Budget exige:

```text
amount > 0
```

`amount = 0` no está permitido.

“Sin presupuesto” se representa por la ausencia de un Budget para esa categoría, moneda y mes.

La constraint de persistencia `amount >= 0` no autoriza crear ni editar un presupuesto en 0.

---

# 22. Spending pace

```text
monthProgress =
elapsedDays / totalDays
```

```text
budgetProgress =
budgetConsumption / budgetAmount
```

Si:

```text
budgetProgress > monthProgress
```

el gasto está por encima del ritmo esperado.

Puede agregarse tolerancia visual posteriormente sin cambiar la regla base.

---

# 23. Tarjeta de crédito

Fuente: `MVP2.md`, decisiones `MVP2-DECISIONES-P0.md` (F1–F8).  
Implementación: P0.3–P0.5 en código (ver `MVP2-BACKLOG.md`). Neon P0.5 pendiente de aprobación.

## 23.1 Modelo MVP2 (movimientos nuevos)

Las tarjetas son entidades de primera clase (`CreditCard`), independientes de `Account`.

Compra con tarjeta:

- **P0.5 path directo:** `Transaction.type = EXPENSE` con `creditCardId` + `accountId = null` (sigue válido por compatibilidad).
- **P0.6/P0.7 path canónico:** `CreditCardPurchase` → `CreditCardInstallment` 1..N → `Transaction EXPENSE` solo para cuotas `RECOGNIZED`.

Gasto no tarjeta → `accountId` obligatorio; `creditCardId = null`.

No usar cuentas sentinela.

Efectos de la compra / cuota reconocida:

- sí: gasto reconocido, categoría, presupuesto del período (vía **Transaction**);
- no: saldo bancario / disponible;
- Purchase/Installment **no** suman gasto ni deuda por sí solos;
- installments `PENDING` solo forman `futureInstallmentCommitment`.

`currentCardDebt` (P0.11) =
  SUM ACTIVE EXPENSE(creditCardId)
  − SUM ACTIVE CREDIT_CARD_PAYMENT(creditCardId)
  − SUM ACTIVE REIMBURSEMENT(creditCardId)
  (floor 0).

Pago de tarjeta → `Transaction.type = CREDIT_CARD_PAYMENT`:

- `accountId` origen + `creditCardId` destino;
- disminuye saldo de cuenta y `currentCardDebt`;
- no es gasto del período.

Distinguir:

- `currentCardDebt` — reconocidos aún no pagados (menos reintegros a tarjeta);
- `futureInstallmentCommitment` — cuotas `PENDING` de purchases `ACTIVE` (P0.7+; P0.5 sin purchase = 0);
- `totalOutstandingCommitment` = suma de ambos.

Reintegros acreditados: destino banco (`REIMBURSEMENT` + `accountId`) o tarjeta (`REIMBURSEMENT` + `creditCardId`, `accountId` null).  
`CreditCardRefundExpectation` (EXPECTED) **no** mueve confirmado hasta acreditación explícita. EXPECTED ≠ ACCREDITED; reintegro ≠ ingreso.

Sin `closingDay`: proyección limitada; no afirmar “próximo resumen” cierto.

`CreditCardStatement` no es fuente de deuda: `currentCardDebt` se deriva de eventos (`EXPENSE` reconocidos, `CREDIT_CARD_PAYMENT`, reintegros a tarjeta, cargos explícitos). Cambiar `actualAmount` del statement **no** altera la deuda en silencio (`MVP2-DECISIONES-P0.md` F9).

**P0.11:** expectations + accreditations implementados (Neon aplicado).  
**P0.12 DONE definitivo LIVE:** promotions + applications + `cancelledRemainingAmount`; Neon + Render live (smoke GET promotions `[]`, preview domain 404). Apply/preview sin impacto en confirmado. Cap consumed = expected − cancelledRemaining.

**P0.13 DONE definitivo LIVE:** plantillas `CreditCardRecurringCharge` no mueven dinero. Confirmación explícita → `EXPENSE` tarjeta (`accountId` null) → `currentCardDebt`+ / gross+ / budget+ / banco 0. `feeStatus` nunca genera movimientos. Estimado ≠ confirmado; estimado fuera de deuda.

## 23.2 Legacy MVP1

Movimientos con `paymentMethod = CREDIT_CARD` **sin** el modelo de entidad tarjeta (típicamente con `accountId` y sin `creditCardId` MVP2):

- conservan semántica MVP1 (gasto que debita la cuenta);
- no se migran, no se recalculan, no se reinterpretan en P0 (LEAVE);
- no forman `currentCardDebt` del modelo nuevo.

El pago del resumen **nunca** debe registrarse otra vez como `EXPENSE` (ni en legacy ni en MVP2).

---

# 24. Gastos en cuotas (tarjeta)

Modelo: `CreditCardPurchase` → `CreditCardInstallment` 1..N → `Transaction EXPENSE` opcional al reconocer.

**P0.6:** N=1; installment creado ya `RECOGNIZED` con EXPENSE atómico.  
**P0.7:** N∈[1,60]; al crear, **solo #1 RECOGNIZED** + EXPENSE; `#2..N PENDING`.  
**P0.8:** `recognizeDueInstallments(asOf)` reconoce PENDING con `scheduledFor <= asOf` → EXPENSE (`occurredAt = scheduledFor`) + `recognizedAt = now` técnico. Idempotente (`FOR UPDATE SKIP LOCKED`). Catch-up multi-cuota. Sin cron; CLI `installments:recognize-due` (+ `--dry-run`). Sin closingDay.

Regla temporal P0.7 (create): primera cuota se reconoce inmediatamente.  
Reconocimiento futuro de `#2..N` = P0.8 (manual/CLI hasta haber scheduler).

No crear N `EXPENSE` huérfanos sin purchase padre (flujo purchase).  
El create EXPENSE P0.5 con `creditCardId` permanece por compatibilidad (sin Purchase; sí forma `currentCardDebt`; future = 0; el job P0.8 no lo toca).

CreditCardPurchase = fuente contractual/metadata (`totalAmount`).  
CreditCardInstallment.amount = obligación exacta por período.  
`scheduledFor` = período financiero esperado del gasto.  
`recognizedAt` = momento técnico de reconocimiento.  
Transaction = fuente del gasto reconocido.  
CreditCardStatement ≠ fuente de deuda.

Reconocer mueve compromiso: future → current; **no** aumenta `totalOutstandingCommitment`.

Nunca sumar Purchase + Transaction como dos impactos financieros.  
Nunca asumir `installmentAmount * count == totalAmount` si hay remainder de redondeo.

Criterio de impacto mensual: solo la cuota reconocida en el período entra en gasto bruto/neto y presupuestos.  
Ejemplo: 600.000 en 6 cuotas → 100.000 por período de reconocimiento, nunca 600.000 en el mes de compra.

El reconocimiento mueve valor de `futureInstallmentCommitment` a `currentCardDebt`.

---

# 25. Ajustes

`ADJUSTMENT` se utiliza para corregir discrepancias.

Debe incluir descripción obligatoria en UI/Service.

Un ajuste no debería considerarse gasto o ingreso operativo por defecto.

---

# 26. Saldo suficiente

Validar saldo suficiente para:

- transferencia;
- cambio de moneda;
- inversión;
- pago vivienda.

Para gasto cotidiano, la política puede permitir registrar un gasto aunque una cuenta lógica quede negativa sólo si el tipo de cuenta lo permite explícitamente en el futuro.

MVP debe rechazar operaciones de fondos/cash que excedan saldo disponible.

---

# 27. Fondos reservados

Una cuenta `HOUSING_RESERVE` está earmarked para vivienda.

No debe incluirse automáticamente en:

```text
AvailableRunwayARS
```

ni sugerirse como disponible para consumo general.

---

# 28. Personas externas

MVP no mezcla automáticamente patrimonio de terceros.

Si en el futuro se agrega `Person`, asociarla a un movimiento no implica incorporar:

- salario;
- patrimonio;
- cuentas;
- runway.

Eso requerirá reglas explícitas.

---

# 29. Obligaciones privadas

Las obligaciones configurables pueden utilizar nombres neutrales.

El dominio no debe depender de una institución financiera concreta.

---

# 30. Simulaciones

Las simulaciones:

- leen estado real (a partir de M7.2, vía FinancialService);
- aplican parámetros hipotéticos;
- producen resultados;
- no crean movimientos;
- no cambian saldos.

M7.1 es primitives puras. Reciben valores. No leen DB. No usan clock. InvestmentService no participa en M7.1–M7.4. HousingService participa sólo en M7.4 vía `getCoverage`. No hay `POST /api/simulations` en M7.2–M7.4.

M7.2 — sin ingreso N meses:

- «sin ingreso N meses» = durante el horizonte, `monthlyIncomeARS = "0.00"`;
- el consumo simulado es exactamente `averageMonthlyFundConsumption` del baseline real;
- no usar `monthlyOperatingIncome` como ingreso futuro, aunque el mes real tenga operating income;
- no llamar `adjustMonthlyConsumption`;
- no housing, no FX, no USD, no vencimientos ni rendimientos futuros de Investments;
- capital jamás negativo (clamp 0 vía `projectCapital`);
- `totalFundConsumedARS` no excede el capital disponible;
- `runwayAfterScenarioMonths` = `calculateSimulatedRunway(remainingCapitalARS, averageMonthlyFundConsumption)`;
- `currentRunwayMonths` es sólo referencia del baseline; no se recalcula en el escenario;
- si `averageMonthlyFundConsumption = null`, no inventar promedio ni proyectar; campos dependientes `null`;
- si el promedio es `"0.00"`, remaining = capital inicial y runway posterior `null`;
- `months` entero `> 0` (rechazar 0, negativos y decimales). Sin máximo arbitrario.

M7.3 — nuevo empleo:

- horizonte total explícito `totalMonths`;
- tramo 1: `monthsUntilJob` meses con `monthlyIncomeARS = "0.00"`;
- tramo 2: `totalMonths - monthsUntilJob` meses con `monthlyIncomeARS = newMonthlyIncomeARS`;
- `newMonthlyIncomeARS` es hipótesis futura, no el operating income histórico;
- `expenseChangeFraction` se aplica con `adjustMonthlyConsumption` al promedio real y vale para ambos tramos;
- no llamar `simulateMonthsWithoutIncome`; proyectar con dos `projectCapital`;
- si el tramo 1 agota el capital, el tramo 2 arranca en `"0.00"`; surplus del empleo no reconstruye el fondo;
- `totalFundConsumedARS` = suma monetaria de ambos tramos (centavos); no supera el capital inicial;
- `depletedAfterMonth` global: el de phase1 si agotó; si no, `monthsUntilJob + phase2.depletedAfterMonth`; capital inicial 0 → `0`;
- runway final: si el empleo entra en el horizonte, `calculateSimulatedRunway(remaining, effectiveMonthlyDraw post-empleo)`; si `monthsUntilJob = totalMonths`, el empleo no ocurrió y se usa el consumo ajustado;
- draw post-empleo 0 → runway `null` (no infinito);
- `monthsUntilJob` entero `>= 0`; `totalMonths` entero `> 0`; `monthsUntilJob <= totalMonths`;
- null baseline se conserva; no inventar consumo.

M7.4 — reserva vivienda:

- escenario USD-only; otra moneda → no soportado;
- `targetInstallments` entero `> 0` y `<= remainingInstallments`;
- `targetReserveUSD = installmentAmount * targetInstallments` (centavos);
- reserva actual = `HousingService.getCoverage`; no recalcular saldo ni `coveredInstallments`;
- `reserveAccountId` null: coverage sigue null; el escenario normaliza `effectiveCurrentReserveUSD = "0.00"`;
- saldo reserva negativo: `currentReserveUSD` real; `effectiveCurrentReserveUSD = "0.00"`;
- `missingReserveUSD` y `excessReserveUSD` no son positivos a la vez;
- FX explícito `> 0`; `arsRequiredForMissingReserve` vía `convertUsdToArs`;
- capital ARS = `totalAvailableARS`; no sumar USD;
- `remainingAvailableARSAfterReserve` es hipotético; no modifica Accounts ni FinancialSummary;
- `arsShortfall` y `canFullyFundFromAvailableARS`;
- `currentRunwayMonths` sólo referencia; no `calculateSimulatedRunway` sobre el ARS hipotético;
- no Investments; no otras cuentas USD.

`adjustMonthlyConsumption`: `base >= 0`; `percentageChange >= -1` (fracción); `adjusted = base * (1 + percentageChange)` ROUND_HALF_UP a 2 decimales. `-1` → `0.00`. El resultado no puede ser negativo.

`projectCapital`: montos ARS `>= 0`; `months` entero `>= 0`. `effectiveMonthlyDraw = max(consumption - income, 0)`. Cada mes: `remaining = max(previous - draw, 0)`. Si el capital llega a 0, permanece 0. `totalFundConsumedARS` es el capital realmente consumido. `depletedAfterMonth` es `null` si no se agotó; `0` si `initialCapitalARS = 0`; `1..N` si se agotó en ese mes. No hay acumulación de surplus.

`calculateSimulatedRunway`: misma semántica que runway real si consumption = 0 → `null`. Si consumption > 0: `capital / consumption` ROUND_HALF_UP a 2 decimales. Capital 0 y consumption > 0 → `"0.00"`.

`convertUsdToArs`: `amountUSD >= 0`; `exchangeRate` ARS por 1 USD `> 0`. No consultar mercado. No suma ARS + USD.

M7.1 no modela vencimientos futuros de inversiones.

---

# 31. AI

AI nunca es fuente de verdad para:

- saldos;
- runway;
- presupuesto;
- rendimientos;
- cobertura vivienda;
- consumo del fondo.

AI utiliza Services determinísticos.

---

# 32. Redondeo

Dinero:

```text
2 decimales
```

Tasas:

```text
hasta 6 decimales
```

Los cálculos intermedios pueden conservar mayor precisión y redondear al presentar/persistir según corresponda.

---

# 33. Monedas

No sumar ARS + USD en una misma cifra sin conversión explícita.

Si una visualización futura necesita patrimonio consolidado:

- solicitar cotización;
- indicar fecha/tasa;
- marcar resultado como conversión estimada.

---

# 34. Anulación

Anular una transacción relacionada puede afectar otras.

Ejemplo: anular un gasto con reintegros existentes.

MVP debe impedir la anulación directa si deja relaciones inconsistentes o requerir resolver/anular movimientos relacionados.

No hacer cascadas financieras silenciosas.

---

# 35. Orden de autoridad

Ante discrepancia:

```text
BUSINESS-RULES.md
↓
DOMAIN.md
↓
DATA-MODEL.md
↓
USER-FLOWS.md
↓
implementación
```

Si los documentos entran en conflicto, corregir la especificación antes de implementar.

---

# 36. Regla SDD

Cursor/AI no debe modificar fórmulas o clasificación económica por conveniencia.

Todo cambio que altere una métrica financiera requiere:

1. actualizar este documento;
2. actualizar documentos afectados;
3. agregar tests;
4. recién después implementar.
