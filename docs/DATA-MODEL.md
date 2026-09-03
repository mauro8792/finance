# DATA-MODEL.md

# Personal Finance Runway — Data Model

## 1. Propósito

Este documento define el modelo de datos persistente del MVP.

Debe utilizarse como base para:

- PostgreSQL;
- Prisma schema;
- migrations;
- repositories;
- constraints;
- índices;
- seeds.

Debe respetar:

- `VISION.md`
- `DOMAIN.md`
- `MVP.md`
- `ARCHITECTURE.md`

La base de datos es PostgreSQL.

---

# 2. Principios

1. Los movimientos son la fuente de verdad de los saldos.
2. No persistir saldos derivados salvo necesidad futura demostrable.
3. ARS y USD se mantienen separados.
4. Los importes monetarios utilizan `NUMERIC`, nunca floating point.
5. Los movimientos financieros conservan historial.
6. Las operaciones compuestas deben ser atómicas.
7. Las simulaciones no modifican datos reales.
8. OpenAI no accede directamente a la base.
9. El modelo debe ser simple para el MVP.
10. Debe permitir evolución futura sin anticipar complejidad innecesaria.

---

# 3. Convenciones

## IDs

Utilizar UUID.

```text
UUID
```

## Dinero

```text
NUMERIC(18,2)
```

## Tasas

```text
NUMERIC(12,6)
```

## Fechas

```text
TIMESTAMPTZ
```

## Metadata flexible

```text
JSONB
```

Usar JSONB solamente cuando los datos no justifiquen una entidad relacional.

---

# 4. User

Representa al propietario de los datos financieros.

Tabla:

```text
users
```

Campos:

```text
id              UUID PK
name            VARCHAR(120) NOT NULL
email           VARCHAR(255) NOT NULL UNIQUE
password_hash   TEXT NOT NULL
timezone        VARCHAR(100) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires'
timezone        VARCHAR(100) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires'
created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL
```

Restricciones:

```text
email UNIQUE NOT NULL
```

`password_hash` nunca se expone. El valor crudo de la cookie de sesión no se persiste.

En MVP existirá un único usuario funcional.

El modelo mantiene `user_id` para evitar bloquear una evolución futura.

---

# 4b. Session

Sesión server-side (M10.5). Tabla `sessions`.

```text
id                   UUID PK
user_id              UUID NOT NULL FK users.id ON DELETE CASCADE
token_hash           VARCHAR(64) NOT NULL UNIQUE
created_at           TIMESTAMPTZ NOT NULL
absolute_expires_at  TIMESTAMPTZ NOT NULL
expires_at           TIMESTAMPTZ NOT NULL
revoked_at           TIMESTAMPTZ NULL
```

Índices: `user_id`, `expires_at`.

`token_hash` es HMAC-SHA256 del token de cookie (`SESSION_SECRET`). Nunca el token crudo.

Semántica: `absolute_expires_at` = created_at + 7 días (inmutable). `expires_at` = idle 24 h sliding, nunca posterior a `absolute_expires_at`. Logout setea `revoked_at`.

---

# 5. Person — extensión futura

Se deja prevista conceptualmente una entidad `Person`.

NO es obligatoria para el MVP inicial.

Su objetivo futuro sería asociar movimientos con personas relacionadas sin convertirlas en usuarios de la aplicación.

Ejemplos:

```text
Pareja
Hermano
Padre
Amigo
Otra persona
```

Modelo futuro posible:

```text
persons

id              UUID PK
user_id         UUID FK users.id
name            VARCHAR(120) NOT NULL
relationship    VARCHAR(80) NULL
is_active       BOOLEAN NOT NULL DEFAULT true
created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL
```

IMPORTANTE:

Una `Person` NO implica que su patrimonio o ingresos formen parte automáticamente del patrimonio del usuario.

La asociación futura permitiría representar:

```text
Pagado por
Recibido de
Relacionado con
```

sin alterar automáticamente cálculos de runway o capital personal.

No crear esta tabla durante MVP salvo promoción explícita desde backlog.

---

# 6. Account

Tabla:

```text
accounts
```

Campos:

```text
id                UUID PK
user_id           UUID FK users.id NOT NULL
name              VARCHAR(120) NOT NULL
currency          currency_enum NOT NULL
type              account_type_enum NOT NULL
initial_balance   NUMERIC(18,2) NOT NULL DEFAULT 0
is_active         BOOLEAN NOT NULL DEFAULT true
created_at        TIMESTAMPTZ NOT NULL
updated_at        TIMESTAMPTZ NOT NULL
```

Enums:

```text
currency_enum:
ARS
USD
```

```text
account_type_enum:
CASH
BANK
FUND
INVESTMENT
HOUSING_RESERVE
OTHER
```

Reglas:

```text
initial_balance >= 0
```

El saldo actual NO se persiste como columna.

Se deriva de movimientos.

---

# 7. Category

Tabla:

```text
categories
```

Campos:

```text
id              UUID PK
user_id         UUID FK users.id NOT NULL
name            VARCHAR(120) NOT NULL
type            category_type_enum NOT NULL
is_system       BOOLEAN NOT NULL DEFAULT false
is_active       BOOLEAN NOT NULL DEFAULT true
created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL
```

Enum:

```text
category_type_enum:
EXPENSE
INCOME
BOTH
```

Constraint lógico:

```text
UNIQUE(user_id, name)
```

La comparación case-insensitive puede resolverse posteriormente si fuera necesario.

---

# 8. Transaction

Tabla central:

```text
transactions
```

Campos:

```text
id                       UUID PK
user_id                  UUID FK users.id NOT NULL
account_id               UUID FK accounts.id NOT NULL
category_id              UUID FK categories.id NULL

type                     transaction_type_enum NOT NULL
status                   transaction_status_enum NOT NULL DEFAULT 'ACTIVE'

amount                   NUMERIC(18,2) NOT NULL
currency                 currency_enum NOT NULL

description              VARCHAR(255) NULL
occurred_at              TIMESTAMPTZ NOT NULL

payment_method           payment_method_enum NULL

is_fixed                 BOOLEAN NOT NULL DEFAULT false
reimbursement_status     reimbursement_status_enum NOT NULL DEFAULT 'NONE'

related_transaction_id   UUID FK transactions.id NULL

metadata                 JSONB NULL

created_at               TIMESTAMPTZ NOT NULL
updated_at               TIMESTAMPTZ NOT NULL
```

---

# 9. TransactionType

```text
transaction_type_enum:

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
```

El tipo determina el efecto económico.

`HOUSING_PAYMENT` es débito. `category_id` es null. Metadata:

```json
{
  "housingPaymentId": "<uuid>",
  "housingObligationId": "<uuid>"
}
```

`INVESTMENT_OUTFLOW` es débito. `INVESTMENT_PRINCIPAL_RETURN` e `INVESTMENT_RETURN` son crédito. `category_id` null. Metadata: `{ "investmentId": "<uuid>" }`.

Los importes se guardan siempre positivos.

---

# 10. TransactionStatus

```text
transaction_status_enum:

ACTIVE
VOIDED
```

Las transacciones `VOIDED`:

- permanecen en DB;
- no participan en cálculos financieros.

---

# 11. PaymentMethod

```text
payment_method_enum:

CASH
DEBIT_CARD
CREDIT_CARD
BANK_TRANSFER
DIGITAL_WALLET
OTHER
```

Es informativo.

No representa una integración externa.

---

# 12. ReimbursementStatus

```text
reimbursement_status_enum:

NONE
PENDING
PARTIAL
COMPLETED
```

Sólo tiene relevancia principal para gastos reintegrables.

---

# 13. Transaction constraints

Constraint:

```text
amount > 0
```

Regla de Service:

```text
transaction.currency == account.currency
```

excepto operaciones explícitas de cambio de moneda.

Regla:

```text
category.user_id == transaction.user_id
```

Regla:

```text
account.user_id == transaction.user_id
```

Regla de Service para nuevos movimientos:

```text
account.is_active == true
category.is_active == true
```

Entidades inactivas se conservan para historial; no reciben movimientos nuevos.

Regla de Service para `createExpense`:

```text
category_id NOT NULL
category.type IN (EXPENSE, BOTH)
```

El `category_id` nullable del schema queda para otros `TransactionType`.

---

# 14. Índices de Transaction

Crear como mínimo:

```text
INDEX transactions(user_id, occurred_at)
INDEX transactions(account_id, occurred_at)
INDEX transactions(category_id, occurred_at)
INDEX transactions(user_id, type, occurred_at)
INDEX transactions(related_transaction_id)
```

Estos índices soportan:

- dashboard;
- historial;
- filtros mensuales;
- presupuestos;
- reintegros.

---

# 15. Reintegros

No crear tabla `reimbursements`.

Un reintegro es:

```text
transactions.type = REIMBURSEMENT
```

y:

```text
related_transaction_id = expense.id
```

Ejemplo:

```text
Expense
id = A
amount = 100000
reimbursement_status = PARTIAL

Reimbursement
id = B
amount = 40000
related_transaction_id = A
```

Pendiente:

```text
60000
```

El estado del gasto se actualiza mediante Service.

---

# 16. Transferencias

Una transferencia entre cuentas de la misma moneda se representa con dos `Transaction`:

```text
type = TRANSFER
```

- una pierna OUT;
- una pierna IN;
- ambas ACTIVE al crearse;
- mismo `amount`;
- misma `currency`;
- `category_id` = null;
- `related_transaction_id` = null.

`related_transaction_id` queda reservado para reintegros. No se usa para transferencias.

Las dos piernas se vinculan con un identificador de operación en metadata, generado por el backend:

```json
{
  "transferId": "<uuid>",
  "direction": "OUT"
}
```

y:

```json
{
  "transferId": "<mismo uuid>",
  "direction": "IN"
}
```

`direction` sólo acepta `OUT` o `IN`.

La creación es atómica: OUT e IN se persisten juntos o no se persiste ninguna.

No existe tabla `transfers` en M2.3.

No se edita ni se anula una pierna de forma individual.

---

# 17. CurrencyExchange

Tabla:

```text
currency_exchanges
```

Campos:

```text
id                 UUID PK
user_id            UUID FK users.id NOT NULL

from_account_id    UUID FK accounts.id NOT NULL
to_account_id      UUID FK accounts.id NOT NULL

from_currency      currency_enum NOT NULL
to_currency        currency_enum NOT NULL

from_amount        NUMERIC(18,2) NOT NULL
to_amount          NUMERIC(18,2) NOT NULL

exchange_rate      NUMERIC(18,6) NOT NULL

occurred_at        TIMESTAMPTZ NOT NULL

description        VARCHAR(255) NULL

created_at         TIMESTAMPTZ NOT NULL
```

Constraints:

```text
from_amount > 0
to_amount > 0
exchange_rate > 0
from_currency <> to_currency
from_account_id <> to_account_id
```

Índices:

```text
INDEX currency_exchanges(user_id, occurred_at)
INDEX currency_exchanges(from_account_id, occurred_at)
INDEX currency_exchanges(to_account_id, occurred_at)
```

`exchange_rate` siempre significa ARS por 1 USD. No cambia según la dirección.

Montos: NUMERIC(18,2). Tipo de cambio: NUMERIC(18,6).

`to_amount` lo calcula el backend y se redondea a 2 decimales con ROUND_HALF_UP.

No hay `updated_at`, `status` ni `metadata` en esta tabla.

---

# 18. CurrencyExchange movements

Registrar un cambio de moneda genera:

```text
CurrencyExchange
+
Transaction OUT  (cuenta origen)
+
Transaction IN   (cuenta destino)
```

Las dos piernas:

```text
type = CURRENCY_EXCHANGE
status = ACTIVE
category_id = null
related_transaction_id = null
```

Metadata OUT:

```json
{
  "currencyExchangeId": "<id del CurrencyExchange>",
  "direction": "OUT"
}
```

Metadata IN:

```json
{
  "currencyExchangeId": "<mismo id>",
  "direction": "IN"
}
```

`related_transaction_id` no se usa. Queda reservado para reintegros.

No reutilizar `TRANSFER`.

La operación completa se ejecuta en una transacción PostgreSQL. Si falla un paso, rollback total.

No se edita ni se anula una pierna de forma individual.

---

# 19. HousingObligation

Tabla:

```text
housing_obligations
```

Campos:

```text
id                            UUID PK
user_id                       UUID FK users.id NOT NULL
reserve_account_id            UUID FK accounts.id NULL

name                          VARCHAR(120) NOT NULL
currency                      currency_enum NOT NULL

installment_amount            NUMERIC(18,2) NOT NULL
remaining_installments        INTEGER NOT NULL

due_day                       INTEGER NULL

is_active                     BOOLEAN NOT NULL DEFAULT true

created_at                    TIMESTAMPTZ NOT NULL
updated_at                    TIMESTAMPTZ NOT NULL
```

Constraints:

```text
installment_amount > 0
remaining_installments >= 0
due_day BETWEEN 1 AND 31 cuando no sea NULL
```

---

# 20. HousingPayment

Tabla:

```text
housing_payments
```

Campos:

```text
id                       UUID PK
housing_obligation_id    UUID FK housing_obligations.id NOT NULL
transaction_id           UUID FK transactions.id NOT NULL
account_id               UUID FK accounts.id NOT NULL

amount                   NUMERIC(18,2) NOT NULL
currency                 currency_enum NOT NULL

installment_number       INTEGER NULL
paid_at                  TIMESTAMPTZ NOT NULL

created_at               TIMESTAMPTZ NOT NULL
```

Constraints:

```text
amount > 0
```

Recomendado:

```text
transaction_id UNIQUE
```

`housing_payments` no tiene `user_id`. La pertenencia se valida vía `HousingObligation`.

Un pago y su `Transaction` se persisten en la misma transacción PostgreSQL, junto con `remaining_installments - 1`.

---

# 21. Housing coverage

No persistir:

```text
covered_installments
```

Calcular:

```text
reserve account balance
/
installment amount
```

2 decimales, ROUND_HALF_UP, string. No persistir. No cap por `remaining_installments`.

Si no hay `reserve_account_id`: cobertura null, no 0.

La UI puede mostrar `"10.00"` o `"9.40"` según el ratio.

---

# 22. Investment

Tabla:

```text
investments
```

Campos:

```text
id                            UUID PK
user_id                       UUID FK users.id NOT NULL
account_id                    UUID FK accounts.id NOT NULL
                              (cuenta origen del futuro INVESTMENT_OUTFLOW;
                              no restringida a Account.type = INVESTMENT)

renewed_from_investment_id    UUID FK investments.id NULL

type                          investment_type_enum NOT NULL
status                        investment_status_enum NOT NULL

currency                      currency_enum NOT NULL

principal                     NUMERIC(18,2) NOT NULL
annual_rate                   NUMERIC(12,6) NULL
                              (fracción anual; 30% = 0.300000; no persistir 30)

start_date                    TIMESTAMPTZ NOT NULL
maturity_date                 TIMESTAMPTZ NULL

expected_return               NUMERIC(18,2) NULL
actual_return                 NUMERIC(18,2) NULL

notes                         TEXT NULL

created_at                    TIMESTAMPTZ NOT NULL
updated_at                    TIMESTAMPTZ NOT NULL
```

---

# 23. InvestmentType

```text
investment_type_enum:

CAUCION
OTHER
```

No agregar instrumentos no utilizados.

---

# 24. InvestmentStatus

```text
investment_status_enum:

DRAFT
ACTIVE
MATURED
RENEWED
CANCELLED
```

---

# 25. Investment constraints

```text
principal > 0
```

Cuando existe:

```text
annual_rate >= 0
```

Unidad persistida: fracción anual. `30% = 0.300000`. No hay techo `<= 1` en el schema.

Cuando existe vencimiento:

```text
maturity_date >= start_date
```

Regla:

```text
investment.currency == account.currency
```

---

# 26. Investment indexes

```text
INDEX investments(user_id, status)
INDEX investments(user_id, maturity_date)
INDEX investments(account_id)
INDEX investments(renewed_from_investment_id)
```

---

# 27. Investment movements

Al activar una inversión:

```text
INVESTMENT_OUTFLOW
```

Al vencer una caución `ACTIVE`:

```text
INVESTMENT_PRINCIPAL_RETURN  crédito, amount = principal
INVESTMENT_RETURN            crédito, amount = actualReturn, si actualReturn > 0
```

`INVESTMENT_PRINCIPAL_RETURN` es sólo devolución de capital. No es INCOME, TRANSFER, ADJUSTMENT ni rendimiento.

`INVESTMENT_RETURN` es sólo el interés real. No incluye principal.

Si `actualReturn = 0`, no se persiste una Transaction de monto cero.

`category_id` es null. Metadata de ambos:

```json
{
  "investmentId": "<uuid>"
}
```

El signo lo determina `Transaction.type`: ambos son crédito.

Si posteriormente se necesita integridad referencial fuerte, agregar FK explícita mediante actualización SDD.

Al renovar una caución `ACTIVE`:

```text
ACTIVE → RENEWED  (original; actualReturn persistido)
+
INVESTMENT_PRINCIPAL_RETURN  crédito, original.principal, investmentId = original
INVESTMENT_RETURN            crédito, actualReturn, si > 0, investmentId = original
nueva Investment CAUCION ACTIVE  renewedFromInvestmentId = original.id
INVESTMENT_OUTFLOW           débito, renewalPrincipal, investmentId = nueva
```

Todo atómico. `renewalPrincipal > 0` y `<= original.principal`. El interés no se capitaliza. La misma `accountId` recibe el retorno y financia el nuevo outflow. `startDate` de la nueva = `occurredAt`.

---

# 28. Budget

Tabla:

```text
budgets
```

Campos:

```text
id              UUID PK
user_id         UUID FK users.id NOT NULL
category_id     UUID FK categories.id NOT NULL

currency        currency_enum NOT NULL

amount          NUMERIC(18,2) NOT NULL

year            INTEGER NOT NULL
month           INTEGER NOT NULL

created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL
```

Constraints:

```text
amount >= 0
month BETWEEN 1 AND 12
year >= 2000
```

Create/update en Service/HTTP exige `amount > 0`. La constraint de persistencia no se relaja ni se endurece en esta migration.

Unique:

```text
UNIQUE(user_id, category_id, currency, year, month)
```

---

# 29. Budget calculations

No persistir:

```text
spent
available
progress
spending pace
```

Se calculan desde movimientos.

Gasto neto:

```text
EXPENSE
-
REIMBURSEMENT
```

según categoría y período.

---

# 30. Scenario

Persistencia opcional.

No es necesaria para ejecutar simulaciones.

Si se decide guardar escenarios:

Tabla:

```text
scenarios
```

Campos:

```text
id              UUID PK
user_id         UUID FK users.id NOT NULL
name            VARCHAR(120) NOT NULL
parameters      JSONB NOT NULL
created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL
```

No guardar resultados como fuente de verdad.

---

# 31. AIConversation

Opcional para MVP.

Tabla futura posible:

```text
ai_conversations
```

Campos:

```text
id              UUID PK
user_id         UUID FK users.id NOT NULL
title           VARCHAR(160) NULL
created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL
```

---

# 32. AIMessage

Opcional para MVP.

Tabla futura posible:

```text
ai_messages
```

Campos:

```text
id                  UUID PK
conversation_id     UUID FK ai_conversations.id NOT NULL
role                ai_message_role_enum NOT NULL
content             TEXT NOT NULL
created_at          TIMESTAMPTZ NOT NULL
```

Enum:

```text
USER
ASSISTANT
SYSTEM
```

No guardar tool payloads financieros completos sin necesidad.

---

# 33. AI parsed transactions

NO persistir propuestas AI antes de confirmación.

Flujo:

```text
AI Parsed Result
↓
Frontend preview
↓
User confirmation
↓
Transaction
```

Una propuesta cancelada no necesita quedar en DB.

---

# 34. MonthlySnapshot

NO incluir en MVP inicial.

Los valores se calcularán directamente desde movimientos.

Agregar snapshots sólo si:

- performance lo requiere;
- se necesita auditoría histórica;
- se necesita preservar métricas calculadas a una fecha.

---

# 35. Saldos

No crear:

```text
accounts.current_balance
```

en MVP.

Calcular mediante:

```text
initial_balance
+
incoming movements
-
outgoing movements
```

Sólo movimientos `ACTIVE`.

---

# 36. Initial balance

Aunque `Account` contiene `initial_balance`, para fondos financieros principales se recomienda crear el capital mediante una transacción inicial.

Ejemplo:

```text
INCOME
Capital inicial
ARS 39.000.000
```

El `initial_balance` debe utilizarse principalmente para migraciones o cuentas existentes cuando sea necesario.

Idealmente las cuentas nuevas comienzan en:

```text
0
```

---

# 37. Credit card rule

Una compra con tarjeta de crédito se registra como gasto en la fecha de compra.

Ejemplo:

```text
03/09
Supermercado
ARS 75.000
PaymentMethod = CREDIT_CARD
```

El pago posterior del resumen NO debe volver a registrarse como gasto.

Esto evita doble contabilización.

En MVP no se modelará una cuenta de pasivo de tarjeta completa.

---

# 38. Reimbursable expense rule

Ejemplo:

```text
Expense:
ARS 170.000

Reimbursement:
ARS 170.000
```

Gasto bruto:

```text
170000
```

Gasto neto:

```text
0
```

Ambos movimientos permanecen en historial.

---

# 39. Third-party payments — futuro

El MVP registra principalmente flujo personal.

Si otra persona paga directamente un gasto:

```text
no existe egreso del fondo personal
```

La futura entidad `Person` podrá permitir registrar información de gastos compartidos sin incorporarlos automáticamente al patrimonio personal.

Esta funcionalidad queda fuera del MVP actual.

---

# 40. Ingresos de terceros

Los ingresos de otra persona no se registran como ingresos propios del usuario.

La futura asociación con `Person` no cambia esta regla automáticamente.

Para incluir ingresos compartidos en el futuro deberá definirse explícitamente un modo de presupuesto compartido.

---

# 41. Obligaciones privadas

El modelo no necesita conocer nombres comerciales o detalles sensibles de una obligación.

Un gasto u obligación puede utilizar una descripción neutral configurable.

No crear campos específicos para entidades financieras particulares.

---

# 42. Relaciones

Modelo conceptual:

```text
User
│
├── Account
│   ├── Transaction
│   └── Investment
│
├── Category
│   ├── Transaction
│   └── Budget
│
├── HousingObligation
│   └── HousingPayment
│
├── CurrencyExchange
│
├── Scenario (optional)
│
└── AIConversation (optional)
    └── AIMessage (optional)
```

Extensión futura:

```text
User
└── Person
    └── Transaction association
```

---

# 43. Prisma conceptual

El `schema.prisma` deberá reflejar este documento.

Ejemplo parcial conceptual:

```prisma
model User {
  id           String    @id @default(uuid()) @db.Uuid
  name         String
  email        String    @unique
  passwordHash String    @map("password_hash")
  timezone     String    @default("America/Argentina/Buenos_Aires")
  sessions     Session[]
  ...
}

model Session {
  id                String    @id @default(uuid()) @db.Uuid
  userId            String
  tokenHash         String    @unique
  createdAt         DateTime
  absoluteExpiresAt DateTime
  expiresAt         DateTime
  revokedAt         DateTime?
  user              User      @relation(...)
}
```

No considerar este fragmento como schema completo.

---

# 44. Prisma Decimal

Ejemplo:

```prisma
amount Decimal @db.Decimal(18, 2)
```

Tasa:

```prisma
annualRate Decimal? @db.Decimal(12, 6)
```

No convertir a JS `number` para cálculos monetarios críticos sin estrategia explícita.

---

# 45. Delete behavior

Por defecto evitar cascade delete sobre información financiera.

Ejemplo:

Eliminar/desactivar categoría:

```text
Category.is_active = false
```

No eliminar sus transacciones.

Eliminar/desactivar cuenta:

```text
Account.is_active = false
```

No eliminar historial.

Una cuenta o categoría inactiva no puede usarse para registrar movimientos nuevos.

---

# 46. Foreign keys

Todas las relaciones importantes deben utilizar FK PostgreSQL.

No depender únicamente de validación de aplicación.

Especialmente:

```text
transactions.account_id
transactions.category_id
housing_payments.housing_obligation_id
housing_payments.transaction_id
investments.account_id
budgets.category_id
```

---

# 47. Referential integrity

Un usuario no puede utilizar:

- cuenta de otro usuario;
- categoría de otro usuario;
- inversión de otro usuario;
- obligación de otro usuario.

Esto se valida en Service.

La futura autenticación determinará `user_id`.

---

# 48. DB transaction boundaries

Usar transacción DB para:

```text
CurrencyExchange
Reimbursement
HousingPayment
Investment activation
Investment maturity
Investment renewal
```

---

# 49. Query — monthly expenses

Conceptualmente:

```text
transactions
WHERE
  user_id = ?
  type = EXPENSE
  status = ACTIVE
  occurred_at within month
```

Luego considerar reintegros para gasto neto.

---

# 50. Query — account balance

Conceptualmente:

```text
initial balance
+
credits
-
debits
```

La clasificación exacta de cada `TransactionType` debe centralizarse en código de dominio.

No duplicar la lógica de signo en múltiples repositories.

---

# 51. Query — housing coverage

```text
reserve account balance
/
housing installment amount
```

No requiere tabla adicional.

---

# 52. Query — runway

Usar:

```text
available personal ARS funds
/
average monthly fund consumption
```

Incluir únicamente cuentas ARS activas `CASH`, `BANK` o `FUND`.

No incluir:

```text
HOUSING_RESERVE
INVESTMENT
OTHER
USD
inactivas
```

No convertir USD automáticamente.

Un mes entra al promedio de runway si tiene al menos un `EXPENSE` `ACTIVE` `ARS` y es un mes calendario cerrado anterior al mes del resumen. Un mes válido con consumo 0 aporta 0. El mes abierto no entra al promedio.

---

# 53. Index strategy

No crear índices indiscriminadamente.

Iniciales:

```text
transactions(user_id, occurred_at)
transactions(account_id, occurred_at)
transactions(category_id, occurred_at)
transactions(user_id, type, occurred_at)

budgets(user_id, year, month)

investments(user_id, status)
investments(user_id, maturity_date)

housing_payments(housing_obligation_id, paid_at)
```

Medir antes de agregar más.

---

# 54. Seed data

Seed mínimo:

```text
User demo/development (mismo userId QA). Email/password vía auth:bootstrap, no en seed versionado.

Categories:
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

No incluir montos personales reales en seed versionado.

---

# 55. Demo data

Si se necesita demo:

utilizar números ficticios.

Nunca copiar información financiera real al repositorio.

---

# 56. Sensitive data

No almacenar:

```text
card number
CVV
bank password
bank token
broker password
OpenAI API key
DATABASE_URL
```

Secrets viven en environment variables.

---

# 57. Migration naming

Utilizar nombres descriptivos.

Ejemplos:

```text
init_financial_model
add_housing_obligations
add_investments
add_budgets
```

Evitar nombres sin significado.

---

# 58. Data migrations

Si una futura modificación cambia semántica financiera:

1. actualizar SDD;
2. crear migration;
3. migrar datos existentes;
4. verificar balances;
5. recién después desplegar.

---

# 59. Constraints vs Service

Usar DB constraints para invariantes simples:

```text
amount > 0
month 1..12
FK
UNIQUE
```

Usar Service para reglas que requieren contexto:

```text
saldo suficiente
reintegro máximo
misma moneda
cuotas pendientes
ownership
```

---

# 60. No database business logic

No utilizar stored procedures o triggers para lógica financiera principal en MVP.

La lógica pertenece a Services.

PostgreSQL garantiza:

- persistencia;
- constraints;
- relaciones;
- atomicidad.

---

# 61. Person extension strategy

Cuando se decida activar `Person`:

1. actualizar `DOMAIN.md`;
2. actualizar `MVP.md` si entra en alcance;
3. crear tabla `persons`;
4. decidir semántica exacta de asociación;
5. agregar FK opcional donde corresponda;
6. actualizar FinancialService;
7. agregar tests para evitar mezclar patrimonio incorrectamente.

No agregar simplemente `person_id` sin definir primero qué significa.

Posibles significados futuros:

```text
PAID_BY
RECEIVED_FROM
BENEFICIARY
SHARED_WITH
```

Estos significados NO están definidos todavía.

---

# 62. Regla de separación patrimonial

Asociar una persona a un movimiento no implica:

```text
sumar su salario
sumar su patrimonio
sumar sus cuentas
```

al patrimonio principal.

El cálculo financiero personal debe seguir utilizando únicamente los fondos y movimientos configurados como propios.

---

# 63. Source of truth

Para dinero real:

```text
Transaction
```

Para obligaciones:

```text
HousingObligation
HousingPayment
```

Para inversiones:

```text
Investment
+
Transaction
```

Para presupuestos:

```text
Budget
+
Transaction
```

No utilizar AI conversations, snapshots o simulaciones como fuente de verdad.

---

# 64. MVP required tables

Primera implementación:

```text
users
accounts
categories
transactions
budgets
currency_exchanges
housing_obligations
housing_payments
investments
```

Opcionales posteriores:

```text
scenarios
ai_conversations
ai_messages
persons
```

---

# 65. Orden recomendado de migrations

```text
1. users
2. accounts
3. categories
4. transactions
5. budgets
6. currency_exchanges
7. housing_obligations
8. housing_payments
9. investments
```

Las tablas opcionales se agregan cuando su milestone las necesite.

---

# 66. Regla SDD

`DATA-MODEL.md` es la fuente de verdad del modelo persistente.

Cursor/AI no debe:

- crear columnas no documentadas;
- crear tablas por conveniencia;
- almacenar saldos derivados sin justificar;
- usar floats para dinero;
- agregar relaciones con personas sin definir semántica;
- guardar información sensible;
- reemplazar relaciones importantes por JSONB.

Ante un cambio:

```text
Requirement
↓
DOMAIN / MVP
↓
DATA-MODEL
↓
Migration
↓
Repository
↓
Service
↓
Tests
```

La implementación debe seguir ese orden conceptual.
