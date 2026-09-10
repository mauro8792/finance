# MVP2-BACKLOG.md

Backlog técnico de **Personal Finance Runway — MVP2**.

Fuente funcional: `docs/MVP2.md`.  
Decisiones P0: `docs/MVP2-DECISIONES-P0.md` (**F1–F8 cerradas**).

**Estado:** P0.0 DONE. P0.1 DONE (docs). P0.2 inventario read-only (ver `MVP2-PROD-INVENTORY.md`).  
**No modificar Prisma / migraciones / código de P0.3+ sin aprobación explícita.**

**Restricciones globales**

- MVP1 en producción con datos reales.
- Migraciones solo aditivas; no reinterpretar ni borrar movimientos existentes (F4 LEAVE).
- `Transaction` ACTIVE = fuente de verdad del gasto reconocido y de los flujos de caja tipados.
- Distinguir siempre: `currentCardDebt` vs `futureInstallmentCommitment` vs `totalOutstandingCommitment`.
- IA solo propone; nunca ejecuta en silencio.
- No desplegar sin validar migraciones sobre datos existentes (o copia).

---

# P0 — Correctitud financiera

Orden por dependencias.

---

## P0.0 — Cerrar decisiones funcionales bloqueantes

**Estado: DONE (aprobado)**

**Objetivo:** Resolver F1–F8 antes de schema.

**Entregable:** `docs/MVP2-DECISIONES-P0.md`.

**Criterio de aceptación:** F1–F8 documentadas y aprobadas — **cumplido**.

---

## P0.1 — Actualizar SDD (docs) sin código

**Estado: en este cambio documental**

**Objetivo:** Alinear `BUSINESS-RULES`, `DATA-MODEL`, `DOMAIN`, `USER-FLOWS`, `ARCHITECTURE` con F1–F8 y `MVP2.md`, marcando legacy MVP1.

**Migraciones / Prisma / código:** ninguna.

**Criterio de aceptación:** SDD contrastable con decisiones; `paymentMethod=CREDIT_CARD` documentado como legacy.

**Dependencias:** P0.0.

---

## P0.2 — Inventario de datos prod (solo lectura)

**Estado: DONE** — reporte en `docs/MVP2-PROD-INVENTORY.md`.

**Objetivo:** Contar `payment_method = CREDIT_CARD` y patrones de posible doble gasto en “pagos de resumen”.

**Reglas:** F4 — solo observación; no mutar ni reinterpretar.

**Migraciones:** ninguna.

**Riesgos:** solo lectura.

**Tests / entregable:** query documentada; counts por mes/cuenta (sin secretos).

**Criterio de aceptación:** volumen legacy conocido antes de cualquier deploy de schema nuevo.

**Dependencias:** P0.0.

---

## P0.3 — Schema aditivo: entidad CreditCard

**Estado: DONE** (código + migración en repo; aplicada en `personal_finance_test` y en Neon prod `neondb` el 2026-09-06. Código/API MVP2 **no** desplegado aún.)

**Objetivo:** Tabla `credit_cards` + CRUD API mínimo.

**Reglas:** `MVP2.md` §§3–4; F7 config incompleta no bloquea; sin PAN/CVV; una primary por user.

**Migraciones:** `20260906213000_create_credit_card` — CREATE ENUM fee_status + CREATE TABLE + índices/FK/CHECKs. No toca `transactions`/`accounts`.

**Endpoints:** `GET/POST /api/credit-cards`, `PATCH /:id`, `POST /:id/activate|deactivate|set-primary`.

**Criterio de aceptación:** API autenticada CRUD; sin efecto en saldos/métricas — **cumplido**.

**Dependencias:** P0.1. **Siguiente gate:** aprobación P0.4.

---

## P0.4 — Extender Transaction (`credit_card_id` nullable)

**Estado: DONE** en código + migración en repo; aplicada en `personal_finance_test` y en Neon prod `neondb` (2026-09-07). Semántica F1 / API tarjeta: **P0.5** (no iniciado).

**Objetivo:** Columna `credit_card_id` NULL + FK a `credit_cards` + índice. Sin cambiar signo, balances, `account_id`, ni API de create.

**Reglas:** F4 LEAVE; sin backfill; sin semántica financiera activa (eso es P0.5).

**Migración:** `20260907120000_add_transaction_credit_card_id` — solo ADD COLUMN / INDEX / FK.

**Tests:** schema null OK, FK válida, FK inválida rechazada; suite completa MVP1 verde.

**Criterio de aceptación:** comportamiento financiero idéntico a MVP1 — **cumplido** (pendiente approve Neon).

**Dependencias:** P0.3. **Siguiente gate:** migrate Neon + P0.5.
---

## P0.5 — Regla de saldo F1 (EXPENSE tarjeta)

**Estado: DONE definitivo** (código + Neon `neondb` + API prod `finance-2gxt` smoke 2026-09-07). Commit `6e953f1`.

**Objetivo:** Nuevos gastos de tarjeta: `creditCardId` obligatorio, `accountId = null`; impactan gasto/categoría/presupuesto; **no** debitan cuenta.

Gastos no tarjeta: `accountId` obligatorio, `creditCardId = null`.

**Prohibido:** cuentas sentinela/ficticias.

**Entidades/módulos:** `transaction.schema`, `transaction.service`, `transaction-balance`, `credit-card-debt`, financial metrics, budgets.

**Reglas:** F1; matriz anti-doble-conteo.

**Migraciones:** `20260907140000_transaction_account_id_nullable` (`ALTER COLUMN account_id DROP NOT NULL` únicamente; sin backfill).

**Riesgos:** **alto** si se aplica a legacy — **no hacerlo** (F4).

**Tests:** `card-expense-p05.test.ts` (casos A–J) + schema tests.

**Criterio de aceptación:** matriz F1 en CI; cero cambio en filas legacy.

**Dependencias:** P0.4, F1. **Siguiente gate:** migrate Neon + P0.6.

---

## P0.6 — Compra contado (1 cuota) vía Purchase

**Estado: DONE definitivo** (código + Neon `neondb` + API deploy/smoke 2026-09-07).

**Objetivo:** Flujo §5: crear `CreditCardPurchase` (N=1) + `CreditCardInstallment` 1/1 + `EXPENSE` reconocido en el acto → `currentCardDebt += amount`; banco intacto.

**Diseño:** opción B — `Purchase → Installment → Transaction` (prepara P0.7 sin FK 1:1 destructiva en Purchase).

**Entidades/módulos:** `credit-card-purchases/` (service/repo/routes); tablas `credit_card_purchases`, `credit_card_installments`.

**Reglas:** F1, F2; impacto financiero solo vía Transaction; Purchase/Installment = metadata contractual.

**Migraciones:** `20260907160000_create_credit_card_purchase` (CREATE enums/tables/FKs/checks; sin DROP/UPDATE/backfill).

**API:**
- `GET/POST /api/credit-card-purchases`
- `GET /api/credit-card-purchases/:id`
- Void diferido a P0.15 (no endpoint void en P0.6)

**Tests:** `credit-card-purchase.service.test.ts` (A–L) + schema test.

**Dependencias:** P0.5. **Siguiente:** P0.7 DONE.

---

## P0.7 — Compra en N cuotas + compromiso futuro

**Estado: DONE definitivo** (código + Neon `neondb` + API deploy/smoke 2026-09-07).

**Objetivo:** `Purchase` N≥1 → N `Installment` con schedule; al crear, **solo #1 RECOGNIZED** + EXPENSE; `#2..N PENDING` = `futureInstallmentCommitment`.

**Regla temporal de reconocimiento (hasta P0.8/closingDay):**
- Al registrar compra nueva: installment #1 queda RECOGNIZED inmediatamente.
- Installments #2..N quedan PENDING.
- El schedule mensual (`scheduled_for`) **no** usa `closingDay` todavía.
- **No** hay cron/job/endpoint de reconocimiento futuro en P0.7.

**Algoritmos:**
- Redondeo: minor units (`toCents`); cuotas 1..N-1 = floor(total/N); última = floor + remainder. `SUM(installment.amount) === purchase.totalAmount`.
- Fechas: `scheduled_for = purchaseDate + (n-1)` meses UTC; si el día no existe, último día del mes.
- Cap producto: `installmentsCount` ∈ [1, 60].
- `installmentAmount` en Purchase = valor nominal/base (cuota #1); fuente contractual exacta = `Installment.amount`.

**Fórmulas (derivadas, no persistidas):**
- `currentCardDebt` = SUM ACTIVE EXPENSE con `creditCardId` (P0.5 + reconocidas P0.6/P0.7)
- `futureInstallmentCommitment` = SUM amount de installments PENDING en purchases ACTIVE
- `totalOutstandingCommitment` = current + future
- Nunca sumar `Purchase.totalAmount` a spending/debt/future

**Migraciones:** `20260907180000_credit_card_installment_schedule` (ADD `scheduled_for` NOT NULL + CHECK recognition consistency). Aditiva.

**API:**
- `POST /api/credit-card-purchases` acepta `installmentsCount` 1..60
- `GET /:id` expone `installments[]`
- `GET /api/credit-cards/:id/commitments` → `{ currentCardDebt, futureInstallmentCommitment, totalOutstandingCommitment }`
- `GET .../current-debt` se mantiene (subset)

**Tests:** A–O en `credit-card-purchase.service.test.ts` + `credit-card-purchase.math.test.ts` + schema.

**Limitaciones históricas P0.7 (superadas por P0.8 en código):** no reconoce cuotas por fecha vía job; runway no convierte future commitments en cash outflows; sin statements/payments/refunds/UI/AI.

**Dependencias:** P0.6, F2. **Siguiente:** P0.8.

---

## P0.8 — Reconocimiento de cuota (impacto mensual + budget)

**Estado: DONE definitivo** (código + API deploy/smoke + CLI dry-run prod 2026-09-07). **Sin migración Neon.** **Sin cron/scheduler.**

**Objetivo:** `recognizeDueInstallments(asOf)` transforma installments elegibles `PENDING` → `RECOGNIZED` + `Transaction EXPENSE` de forma **idempotente** y segura ante concurrencia.

**Elegibilidad:** `status=PENDING`, `recognizedTransactionId IS NULL`, `scheduledFor <= asOf`, Purchase `ACTIVE`, ownership vía purchase.userId. No reconoce CANCELLED / RECOGNIZED / VOIDED / futuras / otro user. **Sin closingDay / statements.**

**Fechas:**
- `Transaction.occurredAt` = `Installment.scheduledFor` (período financiero)
- `Installment.recognizedAt` = instante técnico del reconocimiento (`clock.now()` una vez por corrida)

**Concurrencia:** por installment, DB transaction con `SELECT … FOR UPDATE OF installment SKIP LOCKED` → create EXPENSE → update condicional PENDING→RECOGNIZED. Evita Transactions huérfanas y doble gasto. Unidad atómica = 1 installment (no batch gigante). Partial failure: unidades ya committed permanecen; retry no duplica.

**Invocación (sin cron / sin endpoint admin inseguro):**
```text
npm run installments:recognize-due -- --as-of=2027-01-15 [--dry-run] [--user-id=UUID]
```
Dry-run: agregados only, cero writes.  
`failed > 0` ⇒ CLI exit code ≠ 0 (el summary siempre se imprime). Partial-commit se mantiene; retry no duplica.  
Automatización futura debe reutilizar exactamente `recognizeDueInstallments` — no una segunda lógica.

**Métricas:** reconocimiento mueve `futureInstallmentCommitment` → `currentCardDebt`; `totalOutstandingCommitment` no aumenta. Bank impact = 0.

**Migraciones:** ninguna (schema P0.7 alcanza).

**Tests:** A–Q service + CLI parse/exit-code + DB concurrency.

**Dependencias:** P0.7, F5. **Siguiente gate:** autorización P0.9.

---

## P0.9 — Statements / proyección (F7 + F9)

**Estado: DONE definitivo** (código + Neon + API deploy/smoke 2026-09-07). **P0.10 no iniciado.**

**Objetivo:** `CreditCardStatement` agrupa/proyecta/cierra un ciclo. **F9: Statement ≠ deuda.**

**Modelo:** `credit_card_statements` — periodStart/End, closingDate, dueDate?, status (PROJECTED|CLOSED|PARTIALLY_PAID|PAID), closedProjectedAmount snapshot, actualAmount informativo.

**Reglas de ciclo (UTC):**
- Requiere `closingDay`; sin él → `CREDIT_CARD_CONFIG_INCOMPLETE`.
- `closingDate` = día closingDay del mes (clamp EOM).
- `periodEnd = closingDate`; `periodStart = previousClosing + 1 día`.
- `dueDate` = primera ocurrencia de `dueDay` **estrictamente posterior** a closingDate (clamp EOM); null si dueDay null.

**projectedAmount:** derivado live de EXPENSE ACTIVE tarjeta (`accountId` null) en `[periodStart, periodEnd]` mientras PROJECTED. Al close: snapshot → `closedProjectedAmount`. Retroactive tx no muta snapshot; `hasReconciliationDifference`.

**API (producción — controller fino → service; no placeholders/501):**
- `GET /api/credit-cards/:id/statements`
- `POST /api/credit-cards/:id/statements/project` `{ closingDate }`
- `GET .../statements/:statementId`
- `POST .../statements/:statementId/close` `{ actualAmount? }`

Nota: `statement-controller-stub.ts` es **solo** para tests de CRUD de tarjeta (`credit-card.controller.test.ts`). El router de producción monta `CreditCardStatementController` real.

**Migración:** `20260907190000_create_credit_card_statement` (aditiva; sin `Transaction.statementId`).

**Tests:** math A–E + service F–Y + HTTP controller.

**Dependencias:** P0.7–P0.8. **Siguiente gate:** autorización P0.10.

---

## P0.10 — `CREDIT_CARD_PAYMENT` (total/parcial)

**Estado: DONE definitivo** (código + Neon + API deploy/smoke). **P0.11 DONE definitivo.**

**Objetivo:** Tipo dedicado; `accountId` origen + `creditCardId`; débito banco; `currentCardDebt −= amount`; **no** gross/net/budget. **payment ≠ expense.**

**Diseño link:** tabla `credit_card_payment_links` (1:1 con Transaction) guarda `statementId?` + `idempotencyKey` sin duplicar amount. SoT financiero = Transaction.

**Idempotency:** `idempotencyKey` **requerida**; UNIQUE(userId, key) en DB; canonical payload = `creditCardId` + `accountId` + `amount` + `statementId` + `occurredAt` (si el cliente lo envía). Replay mismo payload → mismo payment; distinto → `409 IDEMPOTENCY_CONFLICT`. Tests concurrentes A/B cubren race + UNIQUE.

**Locking:** `SELECT … FOR UPDATE` sobre `credit_cards` (+ account/statement) dentro de la misma DB transaction.

**Deuda:**
```text
currentCardDebt = SUM ACTIVE EXPENSE(card) − SUM ACTIVE CREDIT_CARD_PAYMENT(card)  (≥ 0)
```

**Matrix:**
| Event | Spending | Bank | CurrentCardDebt | FutureCommitment |
|---|---|---|---|---|
| `CREDIT_CARD_PAYMENT` | 0 | −amount | −amount | 0 |

**Statement (F9 vigente):**
- `targetAmount = actualAmount ?? closedProjectedAmount`
- `paidAmount = SUM ACTIVE payments linked`
- status: CLOSED / PARTIALLY_PAID / PAID según paid vs target
- no pagar PROJECTED ni PAID; payment sin statement permitido
- close con target 0 → PAID inmediato
- overpayment statement o deuda → reject
- saldo cuenta negativo permitido (paridad MVP1)

**API:**
- `POST/GET /api/credit-cards/:id/payments`
- `GET /api/credit-cards/:id/payments/:paymentId`
- sin PATCH/DELETE (void = P0.15)

**Migración:** `20260909120000_add_credit_card_payment` (enum + link table).

**CSV:** tipo `PAGO_TARJETA`; sin columna Tarjeta nueva (contrato CSV intacto; cuenta origen visible).

**Dependencias:** P0.9, F3. **Siguiente gate:** autorización P0.11.

---

## P0.11 — ExpectedRefund + acreditación F6

**Estado: DONE definitivo** (código + Neon migrate + API deploy/smoke).

**Objetivo:** ExpectedRefund sin efecto confirmado; acreditación:

- **BANK_ACCOUNT:** `REIMBURSEMENT` + `accountId` → banco+, neto↓;
- **CREDIT_CARD:** `REIMBURSEMENT` + `creditCardId`, `accountId null` → `currentCardDebt`↓, neto↓, banco invariante.

No auto-acreditar. Estados expectativa: `EXPECTED` | `PARTIALLY_ACCREDITED` | `ACCREDITED` | `CANCELLED`.

**Reglas:** F6; §§10, 13. **EXPECTED ≠ ACCREDITED**; **reintegro ≠ ingreso**.

**Migraciones:** `20260909230000_add_credit_card_refund_expectation` (enums + expectations + accreditations; XOR purchase/expense; `expected_date` nullable; additive). Aplicada en Neon.

**API:** `/api/credit-card-refunds` — `POST/GET /expected`, `GET /expected/:id`, `POST /expected/:id/cancel`, `POST /accredit`.

**Deuda:** `currentCardDebt = Σ EXPENSE − Σ PAYMENT − Σ REIMBURSEMENT(card)` (EXPECTED no participa).

**Dependencias:** P0.6; P0.10. **Siguiente gate:** P0.12 DONE definitivo.

---

## P0.12 — Topes de promoción

**Estado: DONE definitivo** (código + Neon migrate + API deploy/smoke). **P0.13 NOT STARTED.**

**Objetivo:** Tope por promo/ventana; expected acotado (§11).

**Reglas:** solo expectativa; neto confirmado intacto. Cap consumed = `expectedAmount - cancelledRemainingAmount`. Cancel libera remanente no acreditado. Promotion ≠ acreditación (P0.11 sigue siendo autoridad ACCREDITED).

**Migraciones:** `20260910010000_add_credit_card_promotion` (promotions + applications + expectation snapshot/cancelledRemaining; partial uniques; additive). Aplicada en Neon.

**API:** `/api/credit-card-promotions` — CRUD, activate/deactivate, preview, apply.

**Tests:** tope 25k mensual, dos compras → segundo expected 9k; cancel libera; apply sin impacto financiero; concurrency shared cap.

**Limitaciones conocidas (no bloquean cierre):** sin fees/recurring (P0.13); sin auto-detect por descripción; sin scheduler/lagDays; `expectedDate` en apply aún null; GET promotion sin `capUsed/capReserved/capRemaining` (sí en preview/apply); sin UI grande; sin AI.

**Criterio de aceptación:** §11; sin efecto en confirmado.

**Dependencias:** P0.11. **Siguiente gate:** autorización P0.13 (**NOT STARTED**).

---

## P0.13 — Comisiones / recurrentes (registro real)

**Objetivo:** Config en tarjeta; cargo real = movimiento confirmado (EXPENSE tarjeta o línea de statement), no posteo silencioso.

**Reglas:** proyección puede mostrar estimado **separado** de confirmado.

**Migraciones:** flags/plantillas aditivas.

**Tests:** plantilla ≠ Transaction; registro manual impacta current/gasto según tipo.

**Criterio de aceptación:** comisión registrable; sin secretos PAN/CVV.

**Dependencias:** P0.3, P0.9.

---

## P0.14 — Parsing monetario es-AR

Sin cambio por F1–F8. Paralelizable.

**Criterio:** shared + tests es-AR; UI/API consumen shared.

---

## P0.15 — Void / correcciones (F8)

**Objetivo:** Política F8 sin hard delete ni cascada indiscriminada.

**Reglas:**

- purchase sin reconocidos: anular purchase + installments futuros;
- installments no reconocidos: cancelables;
- reconocidos: reversión controlada del EXPENSE + deuda;
- statement cerrado: sin edits silenciosos;
- payment: void explícito restaura banco + `currentCardDebt`;
- reintegro acreditado: reversión explícita/coordinada;
- trazabilidad.

**Tests:** cada fila de la política; invariantes current/future/banco.

**Criterio de aceptación:** F8 en CI; sin hard delete.

**Dependencias:** P0.10–P0.11.

---

## P0.16 — Suite anti-doble-conteo + checklist deploy

**Objetivo:** Automatizar la matriz de 4 columnas + casos F4 + checklist migrate.

**Tests:** matriz completa abajo; legacy leave.

**Criterio de aceptación:** CI verde; dry-run migrate + smoke saldos antes de prod.

**Dependencias:** P0.5–P0.15.

---

# P1 — Uso diario

| ID | Ítem | Notas |
|----|------|--------|
| P1.1 | Tarjeta principal + matching IA/voz | §3.3; siempre confirmación |
| P1.2 | Cuenta predeterminada | |
| P1.3 | Parser IA: tarjeta/cuotas/promo | |
| P1.4 | UI conciliación reintegros | §12 |
| P1.5 | Privacidad de saldos | |
| P1.6 | Sección Tarjetas | proyección F7 vs completa |
| P1.7 | Home: disponible vs currentCardDebt vs commitment | no una sola “deuda” |
| P1.8 | Movimientos mobile + nav | |
| P1.9 | Recordatorio config incompleta (snooze) | F7 |

---

# P2 — Evolución / polish

| ID | Ítem |
|----|------|
| P2.1 | Métricas históricas por tarjeta |
| P2.2 | Costo real anual de tarjeta |
| P2.3 | Mejoras visuales |
| P2.4 | Renderer Assistant |
| P2.5 | Insights con datos ya registrados |

---

# Matriz anti-doble-contabilización (canónica)

| Evento | Gasto del período | Saldo bancario | currentCardDebt | futureInstallmentCommitment |
|--------|-------------------|----------------|-----------------|----------------------------|
| Compra contado (1 cuota) reconocida | +importe | — | +importe | — |
| Alta compra N cuotas (sin reconocer) | — | — | — | +suma cuotas pendientes |
| Reconocer cuota k | +cuota | — | +cuota | −cuota |
| Cierre de resumen | — | — | — | — |
| `CREDIT_CARD_PAYMENT` | — | −amount | −amount | — |
| ExpectedRefund / acreditación (P0.11 DONE) | — / +banco | −neto | — / −amount | — |
| Reintegro acreditado → banco | baja neto | +amount | — | — |
| Reintegro acreditado → tarjeta | baja neto | — | −amount | — |
| Legacy `paymentMethod=CREDIT_CARD` | + (MVP1) | − (MVP1) | — | — |

`totalOutstandingCommitment = currentCardDebt + futureInstallmentCommitment`.

Detalle y schema conceptual: `docs/MVP2-DECISIONES-P0.md`.

---

# Decisiones F1–F8

**Cerradas.** Ver `docs/MVP2-DECISIONES-P0.md`. No reabrir en implementación sin cambio de producto explícito.

---

# Fuera de alcance (hasta nueva aprobación)

- Modificar Prisma / migraciones / código P0.3+ sin aprobación.
- Migrar o reinterpretar legacy `CREDIT_CARD` (F4).
- Integración bancaria; intereses proyectados sin datos.
- Hard delete de movimientos.
- Despliegue prod sin P0.16.
