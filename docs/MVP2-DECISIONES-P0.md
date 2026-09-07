# Decisiones MVP2 P0

Documento de gate **P0.0**. Aprobado por producto.

Fuente funcional: `docs/MVP2.md`.  
Backlog técnico: `docs/MVP2-BACKLOG.md`.

**Estado:** F1–F9 documentadas (F9 = statement ≠ fuente de deuda).  
**Implementación:** no iniciar Prisma / migraciones / código de P0.3+ sin nueva aprobación explícita.  
**P0.2:** inventario prod en `docs/MVP2-PROD-INVENTORY.md` (2026-09-06, READ-ONLY).

---

## Alcance de estas decisiones

Aplican a movimientos y entidades **nuevos** del modelo de tarjeta MVP2.

No cambian la semántica de datos ya persistidos en producción bajo reglas MVP1.

---

## F1 — Compra con tarjeta

Usar `Transaction.type = EXPENSE` con:

| Campo | Gasto con tarjeta (MVP2) | Gasto no tarjeta |
|---|---|---|
| `creditCardId` | **obligatorio** | **null** |
| `accountId` | **null** | **obligatorio** |

- No usar cuentas sentinela ni cuentas ficticias.
- La compra **sí** impacta gasto reconocido, categoría y presupuesto.
- La compra **no** modifica saldo de cuenta bancaria / disponible.

Invariant XOR (nuevos gastos):

```text
(accountId != null && creditCardId == null)
  XOR
(accountId == null && creditCardId != null)
```

---

## F2 — Cuotas

Modelo obligatorio:

```text
CreditCardPurchase
  → CreditCardInstallment (1..N)
      → Transaction EXPENSE (opcional) cuando la cuota queda reconocida
```

- **No** modelar N `EXPENSE` independientes sin purchase padre.
- `Transaction` ACTIVE sigue siendo la fuente de verdad del **gasto reconocido**.

Métricas de compromiso / deuda (distintas; no mezclar):

| Concepto | Definición |
|---|---|
| `currentCardDebt` | Consumos/cuotas **ya reconocidos** (tienen `EXPENSE` ACTIVE) y **todavía no pagados**. |
| `futureInstallmentCommitment` | Cuotas **futuras aún no reconocidas** (sin `EXPENSE` ACTIVE). |
| `totalOutstandingCommitment` | `currentCardDebt + futureInstallmentCommitment`. |

Movimientos de valor:

- Reconocer una cuota: valor pasa de `futureInstallmentCommitment` → `currentCardDebt` (y se crea el `EXPENSE`).
- Pagar tarjeta (`CREDIT_CARD_PAYMENT`): reduce `currentCardDebt`.
- No confundir deuda exigible actual con compromiso futuro.

---

## F3 — Pago de tarjeta

Nuevo `TransactionType`:

```text
CREDIT_CARD_PAYMENT
```

Campos mínimos:

- `accountId` = cuenta origen (obligatorio)
- `creditCardId` = tarjeta destino (obligatorio)
- `amount` > 0

Impacto:

- saldo de la cuenta origen **disminuye**;
- `currentCardDebt` **disminuye**;
- **no** impacta gasto del período (gross/net operativo / budgets).

Soportar pago total y parcial. No proyectar intereses sin datos.

---

## F4 — Legacy `paymentMethod = CREDIT_CARD`

**LEAVE.**

- No migrar.
- No backfill automático.
- No reinterpretar.
- No recalcular historia.

Los movimientos legacy con `paymentMethod = CREDIT_CARD` (típicamente con `accountId` y **sin** `creditCardId` del modelo nuevo) conservan **exactamente** la semántica MVP1:

- son `EXPENSE` que debitan la cuenta;
- entran en gasto del período como hoy;
- no forman parte de `currentCardDebt` / purchases MVP2.

Cualquier asociación histórica futura: manual, explícita, **fuera de este P0**.

---

## F5 — Presupuestos

Sí.

Una cuota **reconocida** consume el presupuesto de su categoría en el **período en que se reconoce**.

Ejemplo: ARS 600.000 en 6 cuotas de 100.000 → cada mes consume 100.000 del presupuesto de la categoría.  
**Nunca** consumir 600.000 completos en el mes inicial.

---

## F6 — Reintegros

Dos destinos reales de acreditación:

### A) `BANK_ACCOUNT`

`REIMBURSEMENT` con `accountId` (y sin efecto de deuda de tarjeta):

- aumenta saldo de cuenta;
- reduce gasto neto confirmado.

### B) `CREDIT_CARD`

`REIMBURSEMENT` con `creditCardId` y `accountId = null`:

- reduce `currentCardDebt`;
- reduce gasto neto confirmado;
- no aumenta saldo bancario.

`ExpectedRefund` permanece separado: **sin efecto financiero confirmado** hasta acreditación explícita.  
**No** auto-acreditar.

---

## F7 — Sin `closingDay`

Proyección **LIMITADA**.

Puede mostrarse:

- consumos registrados;
- cuotas conocidas;
- compromisos futuros;
- reintegros pendientes.

**No** afirmar a qué resumen pertenece cada consumo.  
**No** presentar un importe de “próximo resumen” como cierto.

Mostrar configuración incompleta + recordatorio para cargar cierre/vencimiento.

Con `closingDay` / `dueDay` completos, la proyección de resumen completo es un paso posterior alineado a `MVP2.md` §§7–8.

---

## F8 — Void / correcciones (en P0)

- No hard delete.
- No cascada automática indiscriminada.
- Mantener trazabilidad (`VOIDED` / estados explícitos).

Política:

| Situación | Acción permitida |
|---|---|
| Compra sin dependencias financieras reconocidas | Puede anularse purchase + installments futuros |
| Installments futuros no reconocidos | Pueden cancelarse |
| Installments ya reconocidos | Requieren reversión controlada del `EXPENSE` (y de deuda) |
| Statement cerrado | Restringe modificaciones silenciosas |
| Pago existente | Reversión explícita que restaure banco y `currentCardDebt` |
| Reintegro acreditado | Reversión explícita / coordinada |

---

## Matriz anti-doble-contabilización (canónica)

Columnas separadas: no usar una sola “deuda tarjeta”.

| Evento | Gasto del período | Saldo bancario | currentCardDebt | futureInstallmentCommitment |
|---|---|---|---|---|
| Compra contado (1 cuota) reconocida | +importe | — | +importe | — |
| Alta compra en N cuotas (aún sin reconocer) | — | — | — | +total (o suma cuotas futuras) |
| Reconocer cuota k | +cuota | — | +cuota | −cuota |
| Cierre de resumen | — | — | — | — |
| `CREDIT_CARD_PAYMENT` total/parcial | — | −amount | −amount | — |
| ExpectedRefund (pendiente) | — | — | — | — |
| Reintegro acreditado → banco | −neto (baja neto) | +amount | — | — |
| Reintegro acreditado → tarjeta | −neto (baja neto) | — | −amount | — |
| Legacy `paymentMethod=CREDIT_CARD` (MVP1) | +importe (como hoy) | −importe (como hoy) | — (fuera del modelo MVP2) | — |

`totalOutstandingCommitment = currentCardDebt + futureInstallmentCommitment`.

---

## Schema conceptual propuesto (P0.3–P0.13)

**Solo diseño.** No crear en Prisma hasta aprobación.

### `credit_cards`

```text
id, user_id
name, bank_issuer, brand, currency
is_active, is_default
closing_day NULL, due_day NULL
fee / maintenance flags (según MVP2)
created_at, updated_at
```

`configComplete` = derivado (`closing_day` y `due_day` presentes) o columna materializada.

### `credit_card_purchases`

```text
id, user_id, credit_card_id
purchased_at, total_amount, currency
installment_count, installment_amount
category_id, description
status (OPEN / CANCELLED / …)
created_at, updated_at
```

### `credit_card_installments`

```text
id, purchase_id
installment_number   -- 1..N
amount
recognition_status   -- PENDING | RECOGNIZED | CANCELLED
recognized_transaction_id NULL  -- FK transactions cuando hay EXPENSE
statement_id NULL              -- solo si ciclo conocido; null si config incompleta
created_at, updated_at
```

### `credit_card_statements` (P0.9)

```text
id, user_id, credit_card_id, currency
period_start, period_end (= closing_date), closing_date
due_date NULL
status: PROJECTED | CLOSED | PARTIALLY_PAID | PAID
closed_projected_amount NULL   -- snapshot al cerrar; null en PROJECTED
actual_amount NULL             -- informativo; NO mueve deuda
closed_at NULL
UNIQUE(credit_card_id, closing_date)
```

`projectedAmount` API = derivado live (PROJECTED) o `closed_projected_amount` (CLOSED).  
Sin `Transaction.statement_id` — pertenencia por card + occurredAt en el ciclo.

Sin `closing_day` en la tarjeta: no inventar statement “cierto” (F7).

### F9 — CreditCardStatement no es fuente de deuda

Aprobado junto con el inventario P0.2. **Vigente en P0.9.**

`CreditCardStatement` **no** es fuente independiente de `currentCardDebt`.

La deuda actual se deriva de eventos financieros reconocidos:

- compras/cuotas reconocidas (`EXPENSE` con `creditCardId`);
- `CREDIT_CARD_PAYMENT` (P0.10+);
- reintegros acreditados a tarjeta;
- eventuales cargos reales explícitos.

El statement:

- agrupa/formaliza un ciclo;
- proyecta monto derivado de Transactions;
- puede guardar `actualAmount` informado por el banco;
- **actualizar `actualAmount` NO debe modificar silenciosamente `currentCardDebt`**.

Si el banco informa un total distinto por cargos reales, esos cargos se representan después con un movimiento/cargo explícito (no por editar el statement).

---

### `transactions` (extensión aditiva)

```text
account_id          NULLABLE  -- NULL solo en EXPENSE de tarjeta MVP2 o REIMBURSEMENT→tarjeta
credit_card_id      NULLABLE
-- vínculos opcionales:
credit_card_purchase_id NULL
credit_card_installment_id NULL
```

Nuevo enum value: `CREDIT_CARD_PAYMENT`.

Constraints de servicio (y DB check si es viable):

- `EXPENSE` no-tarjeta: `account_id NOT NULL`, `credit_card_id IS NULL`
- `EXPENSE` tarjeta MVP2: `account_id IS NULL`, `credit_card_id NOT NULL`
- `CREDIT_CARD_PAYMENT`: ambos `account_id` y `credit_card_id` NOT NULL; no entra en gross
- `REIMBURSEMENT` banco: `account_id NOT NULL`, `credit_card_id IS NULL`
- `REIMBURSEMENT` tarjeta: `account_id IS NULL`, `credit_card_id NOT NULL`
- Legacy filas: sin `credit_card_id`; `account_id` como hoy

### Expected refund / promo (P0.11–P0.12)

```text
promotions / expected_refunds
  expected_amount, actual_amount NULL
  status: PENDING | ACCREDITED | REVIEW | NOT_RECEIVED
  cap window / tope
  linked purchase(s)
  accredited_transaction_id NULL  -- REIMBURSEMENT cuando se acredita
```

### Derivación de métricas (concepto)

```text
currentCardDebt(card) =
  sum(EXPENSE ACTIVE con creditCardId)
  - sum(CREDIT_CARD_PAYMENT ACTIVE)
  - sum(REIMBURSEMENT ACTIVE destino tarjeta)
  (ajustes por void / política F8)

futureInstallmentCommitment(card) =
  sum(installments PENDING no cancelados)

totalOutstandingCommitment = currentCardDebt + futureInstallmentCommitment
```

(Fórmula exacta a fijar en tests P0.16; posibles redondeos y pagos parciales multi-statement.)

---

## Estado de implementación (schema)

| Ítem | Estado |
|---|---|
| P0.3 `credit_cards` | DONE (código + Neon) |
| P0.4 `transactions.credit_card_id` nullable | DONE (código + Neon); sin semántica financiera activa |
| P0.5 F1 accountId null / no débito bancario | DONE definitivo (código + Neon + API smoke) |
| P0.6 Purchase contado 1/1 | DONE definitivo (código + Neon + API) |
| P0.7 Purchase N cuotas + future commitment | DONE definitivo (código + Neon + API) |
| P0.8 Recognize due installments (idempotent) | DONE definitivo (código + API; sin migración; CLI dry-run; sin cron) |
| P0.9 CreditCardStatement (F9) | DONE definitivo (código + Neon + API) |
| `CREDIT_CARD_PAYMENT` | No iniciado |

### Modelado P0.6–P0.7 (opción B)

```text
CreditCardPurchase
  -> CreditCardInstallment 1..N
      -> Transaction EXPENSE opcional (solo RECOGNIZED)
```

P0.7 create:
- #1 RECOGNIZED + EXPENSE inmediato (regla temporal hasta ciclos/closingDay)
- #2..N PENDING (`scheduled_for` = purchaseDate + (n-1) meses, clamp EOM)
- Cap: installmentsCount ≤ 60
- Redondeo minor-units: remainder en última cuota; SUM(installments) === totalAmount

FK canónica: `CreditCardInstallment.recognizedTransactionId` → `transactions.id` (UNIQUE).  
Purchase **no** tiene `transactionId`.

```text
currentCardDebt = SUM ACTIVE EXPENSE creditCardId
futureInstallmentCommitment = SUM PENDING installment.amount (purchase ACTIVE)
totalOutstandingCommitment = current + future
```

Nunca sumar `purchase.totalAmount`.

Void de purchase: diferido a P0.15.

### Matriz de impacto P0.5–P0.8 (anti-doble-conteo)

Recognition of spending and movement of cash are separate concerns.

| Event | Period spending | Bank | currentCardDebt | futureCommitment |
|---|---|---|---|---|
| Bank EXPENSE | +amount | −amount | 0 | 0 |
| Card EXPENSE P0.5 | +amount | 0 | +amount | 0 |
| Purchase 1 pago P0.6 (vía EXPENSE) | +amount | 0 | +amount | 0 |
| Purchase 600k/6 P0.7 al crear | +100k | 0 | +100k | +500k |
| Recognize 2/6 P0.8 | +100k | 0 | +100k | −100k |

Tras reconocer k cuotas: `totalOutstandingCommitment` se mantiene; solo se mueve future→current.  
`occurredAt` del EXPENSE = `scheduledFor` (no el día técnico del job).

Purchase/Installment solos: impacto financiero = 0. Solo el Transaction reconoce gasto/deuda.

### Matriz de nulabilidad por TransactionType (P0.5)

| TransactionType | accountId | creditCardId | Notas |
|---|---|---|---|
| EXPENSE (banco) | NOT NULL | NULL | Debita cuenta |
| EXPENSE (tarjeta P0.5) | NULL | NOT NULL | Sin débito bancario; deuda + |
| INCOME | NOT NULL | NULL | MVP1 |
| TRANSFER | NOT NULL | NULL | MVP1 (por pierna) |
| REIMBURSEMENT | NOT NULL | NULL | MVP1 (F6-B tarjeta = P0.11+) |
| HOUSING_PAYMENT | NOT NULL | NULL | MVP1 |
| INVESTMENT_* | NOT NULL | NULL | MVP1 |
| CURRENCY_EXCHANGE | NOT NULL | NULL | MVP1 |
| ADJUSTMENT | (MVP1) | NULL | Sin cambio |

Constraint DB global XOR **no** se agregó (invasivo para otros tipos). XOR de EXPENSE se garantiza en schema Zod + `TransactionService`.

`currentCardDebt` (P0.5) = suma de `EXPENSE` ACTIVE con ese `creditCardId`. Extensible luego con pagos/reintegros. No se persiste como saldo mutable.

---

## Conflictos residuales (docs vs código actual)

Post-P0.5 (código local / test; Neon hasta aprobación):

1. **Runtime F1 activo** para creates nuevos vía API (`accountId` XOR `creditCardId`).
2. **`account_id`:** nullable en schema + migración test; Neon pendiente.
3. **`REIMBURSEMENT`:** solo acredita cuenta (falta F6-B).
4. Sin statements/`CREDIT_CARD_PAYMENT`/reconocimiento P0.8 (P0.7 crea schedule PENDING solamente).

Ninguno de estos se “arregla” en silencio: requieren aprobación de Prisma/implementación.

---

## Referencias

- `docs/MVP2.md`
- `docs/MVP2-BACKLOG.md`
- SDD actualizado en P0.1: `BUSINESS-RULES`, `DATA-MODEL`, `DOMAIN`, `USER-FLOWS`, `ARCHITECTURE`
