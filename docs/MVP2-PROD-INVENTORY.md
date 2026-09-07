# MVP2 — Inventario producción (P0.2)

**Fecha del inventario:** 2026-09-06  
**Modo:** READ-ONLY (solo `SELECT` / `information_schema`)  
**Escrituras realizadas:** **ninguna**  
**Script:** `apps/api/scripts/inventory-credit-card-legacy-readonly.ts`

## Target DB (anonimizado)

```text
neondb @ ep-bitter-night-arfo4mnj-pooler.c-4.us-west-2.aws.neon.tech
```

Sin `DATABASE_URL`, credenciales, passwords ni tokens en este documento.

Zona horaria usada para buckets mensuales: `America/Argentina/Buenos_Aires`.

---

## Criterios / queries

1. `COUNT(*)` de `transactions` con `status = 'ACTIVE'`.
2. Mismo universo filtrado por `payment_method = 'CREDIT_CARD'` (legacy MVP1).
3. Agregación por mes calendario AR de esos CREDIT_CARD: `count`, `SUM(amount)`.
4. Join a `accounts` para cuentas debitadas por esos movimientos.
5. Join a `categories` para categorías usadas.
6. `MIN/MAX(occurred_at)` sobre CREDIT_CARD ACTIVE.
7. Candidatos a “pago de resumen” como `EXPENSE` ACTIVE cuyo `description` ILIKE patrones (`resumen`, `pago tarjeta`, `visa`, `mastercard`, `amex`, `liquidaci%`, etc.). **Heurística → candidatos, no certeza.**
8. `REIMBURSEMENT` ACTIVE cuyo `related_transaction_id` apunta a un EXPENSE/ACTIVE con `payment_method = CREDIT_CARD`.
9. `information_schema.tables` buscando tablas `%credit_card%` / nombres MVP2.
10. `information_schema.columns` en `transactions` buscando `credit_card_id` (y FKs relacionadas).

No se exportaron filas individuales salvo muestra mínima anonimizada (vacía en este corrido).

---

## Resultados

| # | Pregunta | Resultado |
|---|---|---|
| 1 | Transactions ACTIVE | **12** |
| 2 | ACTIVE con `paymentMethod = CREDIT_CARD` | **0** |
| 3 | Por mes (CREDIT_CARD) | *(vacío)* |
| 4 | Suma importes por mes | *(vacío)* |
| 5 | Accounts debitadas por CREDIT_CARD | *(ninguna)* |
| 6 | Categorías en CREDIT_CARD | *(ninguna)* |
| 7 | Fecha min/max CREDIT_CARD | **null / null** |
| 8 | Candidatos pago-de-resumen como EXPENSE | **0** |
| 9 | REIMBURSEMENT ligados a CREDIT_CARD legacy | **0** (suma 0) |
| 10 | Tablas / columnas MVP2 tarjeta | **ninguna** |

### Desglose ACTIVE por tipo / paymentMethod (contexto)

| type | paymentMethod | count |
|---|---|---|
| EXPENSE | CASH | 5 |
| INCOME | null | 6 |
| INVESTMENT_OUTFLOW | null | 1 |

No hay `DEBIT_CARD`, `CREDIT_CARD`, `BANK_TRANSFER` ni `DIGITAL_WALLET` en ACTIVE.

### Schema MVP2

- Tablas `credit_cards`, purchases, installments, statements, expected_refunds, promotions: **no existen**.
- Columnas `credit_card_id` / purchase / installment en `transactions`: **no existen**.

---

## Posibles casos legacy problemáticos

Ninguno detectado en este inventario:

- Cero movimientos legacy `CREDIT_CARD`.
- Cero candidatos heurísticos de pago de resumen duplicado como `EXPENSE`.
- Cero reintegros asociados a compras CREDIT_CARD.

**Nota:** la heurística de descripciones no prueba ausencia absoluta de dobles gastos con otras redacciones; solo indica que no hubo matches a los patrones listados.

---

## Conclusión — riesgo de compatibilidad (tarjeta)

**Riesgo de conflicto con datos legacy CREDIT_CARD: bajo / nulo en el estado actual de esta DB.**

Implicaciones para P0.3+:

- F4 (LEAVE) sigue vigente como política, pero **hoy no hay filas** que deban preservarse bajo semántica CREDIT_CARD.
- Introducir tablas/columnas MVP2 sería **aditivo** sobre un universo sin deuda de tarjeta modelada ni gastos marcados como crédito.
- El riesgo principal al implementar F1 no es reinterpretar historia CREDIT_CARD (no hay), sino asegurar que los **nuevos** gastos de tarjeta no rompan saldos/métricas de los 12 movimientos ACTIVE existentes (CASH / INCOME / INVESTMENT_OUTFLOW).

Re-ejecutar este inventario antes del primer deploy de schema MVP2 si la DB pudo recibir más datos.

---

## Decisión documentada en paralelo (F9)

`CreditCardStatement` **no** es fuente independiente de deuda.  
`currentCardDebt` se deriva de eventos reconocidos; cambiar `actualAmount` del statement **no** modifica la deuda en silencio.  
Ver `docs/MVP2-DECISIONES-P0.md` (F9), `BUSINESS-RULES` §23.1, `DATA-MODEL` §37.

---

## Confirmación de no escritura

Este inventario:

- no ejecutó `INSERT` / `UPDATE` / `DELETE`;
- no ejecutó migraciones, seed ni backfill;
- no modificó filas;
- el script rechaza flags `--write` / `--apply` / `--migrate` / `--seed`.
