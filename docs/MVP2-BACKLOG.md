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

**Estado: DONE** en código + migración en repo; aplicada en `personal_finance_test` y en Neon prod `neondb` (2026-09-07). **Siguiente gate:** deploy API P0.3–P0.5 + smoke; luego aprobación P0.6.

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

**Objetivo:** Flujo §5: crear `CreditCardPurchase` (N=1) + installment + `EXPENSE` reconocido en el acto → `currentCardDebt += amount`; banco intacto.

**Entidades:** `CreditCardPurchase`, `CreditCardInstallment`, `transactions`.

**Reglas:** F1, F2 (siempre purchase padre, incluso N=1).

**Migraciones:** tablas purchase/installment si no están (puede unificarse con P0.7).

**Riesgos:** no crear EXPENSE tarjeta sin purchase.

**Tests:** §5; `currentCardDebt`; `futureInstallmentCommitment = 0`; legacy intacto.

**Criterio de aceptación:** API end-to-end contado; métricas de deuda separadas.

**Dependencias:** P0.5.

---

## P0.7 — Compra en N cuotas + compromiso futuro

**Objetivo:** Persistir total, N, cuota, N installments `PENDING`; `futureInstallmentCommitment = suma pendientes`; `currentCardDebt` sin cambio hasta reconocer.

**Reglas:** F2; §6.2–6.3; X/N sobre reconocidas vs total.

**Migraciones:** tablas purchase/installment.

**Riesgos:** no auto-reconocer por solo paso del tiempo sin regla/statement.

**Tests:** 600k/6 → future=600k, current=0, gasto período=0 hasta reconocer.

**Criterio de aceptación:** compromiso consultable; sin N EXPENSE huérfanos.

**Dependencias:** P0.6, F2.

---

## P0.8 — Reconocimiento de cuota (impacto mensual + budget)

**Objetivo:** Al reconocer installment k: crear `EXPENSE` (accountId null, creditCardId set, category del purchase); `future −= cuota`, `current += cuota`; gross/net/budget del **período de reconocimiento** += cuota. Nunca 600k en mes 0.

**Entidades:** installments → transactions; `FinancialService`; `BudgetService`.

**Reglas:** F2, F5; §6.1.

**Migraciones:** ninguna extra si FKs installment↔transaction listos.

**Riesgos:** budgets del mes; no reconocer dos veces.

**Tests:** golden 600k/6; presupuesto categoría 100k/mes; idempotencia reconocimiento; void controlado diferido a P0.15.

**Criterio de aceptación:** Dashboard/Month/Budgets alineados a impacto mensual.

**Dependencias:** P0.7, F5.

---

## P0.9 — Statements / proyección (F7)

**Objetivo:** Entidad statement cuando hay ciclo; proyección **LIMITADA** sin `closingDay` (consumos, cuotas, compromisos, expected refunds) **sin** afirmar “próximo resumen = X” ni asignar consumos a un resumen inventado.

**Reglas:** F7; §§7–8 cuando config completa.

**Migraciones:** `credit_card_statements`.

**Riesgos:** UX que sugiera certeza falsa — copy obligatorio “configuración incompleta”.

**Tests:** incomplete → limited payload; complete → puede proyectar ciclo; `actualAmount` editable al cerrar.

**Criterio de aceptación:** API respeta F7; no “próximo resumen cierto” sin cierre.

**Dependencias:** P0.7–P0.8.

---

## P0.10 — `CREDIT_CARD_PAYMENT` (total/parcial)

**Objetivo:** Tipo dedicado; `accountId` origen + `creditCardId`; débito banco; `currentCardDebt −= amount`; **no** gross/net/budget.

**Reglas:** F3; §9–9.1.

**Migraciones:** enum `CREDIT_CARD_PAYMENT`; opcional tabla payment link / metadata statement.

**Riesgos:** **alto** — mal clasificar como EXPENSE = doble gasto.

**Tests:** 500k pago; parcial 300k; gross invariante; void restaura banco+deuda (P0.15); legacy EXPENSE CREDIT_CARD no se convierte en payment.

**Criterio de aceptación:** matriz fila pago en CI.

**Dependencias:** P0.9 (imputación a statement si existe), F3. Mínimo viable: pago a tarjeta sin statement si config incompleta, reduciendo solo `currentCardDebt`.

---

## P0.11 — ExpectedRefund + acreditación F6

**Objetivo:** ExpectedRefund sin efecto confirmado; acreditación:

- **BANK_ACCOUNT:** `REIMBURSEMENT` + `accountId` → banco+, neto↓;
- **CREDIT_CARD:** `REIMBURSEMENT` + `creditCardId`, `accountId null` → `currentCardDebt`↓, neto↓, banco invariante.

No auto-acreditar. Estados: pendiente / acreditado / revisar / no recibido.

**Reglas:** F6; §§10, 13.

**Migraciones:** expected_refunds (+ enums); extender `REIMBURSEMENT` para XOR account/card.

**Riesgos:** no cambiar neto de gastos solo-MVP1; no reutilizar `ReimbursementStatus.PENDING` del gasto con otra semántica sin mapear.

**Tests:** esperado no mueve confirmado; A y B; importe real ≠ esperado; plazo → Revisar.

**Criterio de aceptación:** §13 + F6 en CI.

**Dependencias:** P0.6; P0.10 útil si se concilia contra resumen.

---

## P0.12 — Topes de promoción

**Objetivo:** Tope por promo/ventana; expected acotado (§11).

**Reglas:** solo expectativa; neto confirmado intacto.

**Migraciones:** promotions / cap windows.

**Tests:** tope 25k, dos compras → segundo expected 9k.

**Criterio de aceptación:** §11; sin efecto en confirmado.

**Dependencias:** P0.11.

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
| ExpectedRefund pendiente | — | — | — | — |
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
