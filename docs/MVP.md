# MVP.md

# Personal Finance Runway — MVP Specification

## 1. Objetivo del MVP

El MVP debe permitir que una única persona pueda:

- registrar gastos e ingresos rápidamente;
- visualizar cuánto dinero tiene disponible;
- controlar el consumo mensual del fondo;
- mantener separado el fondo ARS del fondo vivienda USD;
- registrar y seguir cauciones;
- controlar presupuestos mensuales;
- estimar runway financiero;
- visualizar cobertura de vivienda;
- usar AI para interpretar lenguaje natural y consultar información financiera;
- utilizar la aplicación tanto desde mobile como desktop;
- instalarla como PWA.

El MVP debe ser útil desde el primer día.

No debe intentar resolver todavía automatizaciones bancarias, inversiones automáticas o planificación financiera avanzada.

---

# 2. Definición de éxito

El MVP será considerado exitoso si el usuario puede:

1. Abrir la app desde el teléfono.
2. Registrar un gasto en menos de 10 segundos.
3. Ver cuánto gastó durante el mes.
4. Ver cuánto dinero consumió del fondo ese mes.
5. Ver cuánto capital ARS queda.
6. Ver cuántos USD están reservados para vivienda.
7. Ver cuántas cuotas de vivienda están cubiertas.
8. Registrar una caución y ver su rendimiento estimado.
9. Consultar desde desktop una vista más completa.
10. Escribir una frase como:

   `super 75 mil`

   y obtener una propuesta de gasto lista para confirmar.

---

# 3. Plataforma

La aplicación será:

- Web.
- Responsive.
- Mobile First.
- PWA instalable (frontend Next.js).
- Optimizada para desktop.
- Un único producto para el usuario, implementado como monorepo (`apps/web`, `apps/api`, `packages/shared`).
- Frontend: Next.js, React, TypeScript, App Router.
- Backend: Node.js, Express, TypeScript.
- Persistencia PostgreSQL + Prisma, únicamente desde el backend.

No se construirá una aplicación mobile nativa.

`apps/web` + `apps/api` no son microservicios.

---

# 4. Usuario

El MVP tendrá un único usuario funcional.

No se requiere:

- registro público;
- gestión de múltiples usuarios;
- roles;
- permisos complejos.

Puede existir una entidad `User` por diseño de dominio, pero el producto funcionará como aplicación personal.

La estrategia concreta de autenticación se definirá en un documento técnico posterior.

---

# 5. Navegación principal

La navegación MVP tendrá las siguientes secciones:

1. Dashboard
2. Registrar
3. Movimientos
4. Presupuestos
5. Vivienda
6. Inversiones
7. Simulaciones
8. AI Assistant
9. Configuración

En mobile la navegación puede resolverse mediante bottom navigation o menú compacto.

En desktop puede utilizarse sidebar.

La decisión visual final pertenece al documento UI/UX.

---

# 6. Dashboard

El Dashboard será la pantalla principal.

Debe responder inmediatamente:

> ¿Cómo estoy financieramente hoy?

Debe contener como mínimo:

## Capital

- Fondo ARS disponible.
- Fondo vivienda USD.
- Capital invertido ARS.
- Capital invertido USD.

## Mes actual

- Gastos brutos.
- Reintegros.
- Gastos netos.
- Ingresos propios.
- Consumo del fondo.

## Vivienda

- USD reservados.
- Cuota mensual.
- Cuotas pendientes.
- Meses/cuotas cubiertas.

## Inversiones

- Capital activo.
- Próximo vencimiento.
- Rendimiento estimado.
- Rendimiento realizado del mes.

## Runway

- Meses estimados de autonomía financiera.

---

# 7. Dashboard mobile

Mobile debe priorizar solamente información crítica.

Orden sugerido:

1. Fondo ARS.
2. Fondo vivienda USD.
3. Consumo del fondo del mes.
4. Gastado este mes.
5. Cobertura de vivienda.
6. Próximo vencimiento de inversión.
7. CTA `+ Registrar`.

No mostrar gráficos complejos inicialmente en mobile.

---

# 8. Dashboard desktop

Desktop debe aprovechar mayor espacio para incluir:

- tarjetas resumen;
- evolución mensual;
- distribución de gastos;
- presupuesto vs real;
- evolución del capital;
- estado de vivienda;
- inversiones activas;
- próximos vencimientos;
- accesos rápidos a simulaciones;
- acceso visible al AI Assistant.

---

# 9. Registrar movimiento

Debe existir una acción principal:

## + Registrar

Tipos permitidos en MVP:

- Gasto
- Ingreso
- Reintegro
- Transferencia
- Cambio de moneda
- Inversión
- Pago de vivienda

El flujo manual debe ser rápido.

---

# 10. Registrar gasto manual

Campos:

- importe;
- moneda;
- categoría;
- descripción opcional;
- fecha;
- medio de pago;
- cuenta;
- gasto fijo sí/no;
- reintegrable sí/no.

Valores por defecto:

- fecha actual;
- moneda ARS;
- gasto fijo = false;
- reintegrable = false.

Después de guardar:

- actualizar saldo;
- actualizar gasto mensual;
- actualizar presupuesto;
- actualizar consumo del fondo;
- actualizar runway.

---

# 11. Quick Add

El MVP debe tener un modo extremadamente rápido para gastos cotidianos.

Ejemplo:

```text
Importe: 75000
Categoría: Supermercado
Guardar
```

Objetivo:

Registrar un gasto en menos de 10 segundos.

Debe recordar opcionalmente:

- última cuenta utilizada;
- último medio de pago;
- moneda más utilizada.

---

# 12. Registro mediante lenguaje natural

Debe existir un input AI.

Ejemplo:

```text
super 75 mil
```

Resultado esperado:

```json
{
  "type": "EXPENSE",
  "amount": 75000,
  "currency": "ARS",
  "category": "Supermercado",
  "description": "Supermercado"
}
```

La propuesta NO se guarda automáticamente.

Flujo:

```text
Texto
↓
OpenAI
↓
Structured Output
↓
Preview
↓
Confirmación
↓
Persistencia
```

---

# 13. Múltiples movimientos con AI

Debe soportar frases simples con múltiples movimientos.

Ejemplo:

```text
pagué 54k del gym y 48 lucas de nafta
```

Resultado:

```text
Gym
ARS 54.000

Nafta
ARS 48.000
```

Ambos movimientos deben mostrarse antes de guardar.

El usuario puede:

- confirmar todos;
- editar uno;
- eliminar uno;
- cancelar.

---

# 14. Fallback sin AI

Si OpenAI no responde:

- el usuario debe poder seguir registrando manualmente;
- ninguna pantalla financiera debe depender de AI;
- ninguna métrica debe fallar.

AI es una mejora de UX.

No es infraestructura crítica.

---

# 15. Movimientos

Debe existir una pantalla con historial.

Cada movimiento debe mostrar:

- fecha;
- descripción;
- categoría;
- importe;
- moneda;
- tipo;
- cuenta;
- estado.

Filtros MVP:

- mes;
- tipo;
- categoría;
- moneda.

Opcional si es simple:

- búsqueda por texto.

---

# 16. Detalle de movimiento

Al seleccionar un movimiento se podrá ver:

- información completa;
- relaciones con reintegros;
- cuenta afectada;
- fecha;
- medio de pago;
- metadata relevante.

Acciones:

- editar;
- anular.

No realizar hard delete desde la UI normal.

---

# 17. Edición de movimientos

Se podrá editar:

- importe;
- categoría;
- descripción;
- fecha;
- medio de pago;
- indicador fijo;
- indicador reintegrable.

La edición debe disparar recálculo de métricas.

---

# 18. Anulación de movimiento

Debe existir:

```text
VOID TRANSACTION
```

La anulación:

- conserva historial;
- excluye el movimiento de cálculos;
- registra fecha de modificación.

No eliminar físicamente el registro.

---

# 19. Categorías

Debe existir una configuración simple de categorías.

Acciones:

- listar;
- crear;
- editar nombre;
- activar;
- desactivar.

No eliminar categorías utilizadas históricamente.

Categorías iniciales:

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

---

# 20. Presupuestos

Debe existir una pantalla de presupuestos mensuales.

El usuario podrá definir:

```text
Categoría
Mes
Monto
Moneda
```

Ejemplo:

```text
Nafta
Septiembre 2026
ARS 200.000
```

---

# 21. Progreso del presupuesto

Mostrar:

- presupuesto;
- gastado neto;
- disponible;
- porcentaje utilizado;
- ritmo esperado.

Ejemplo:

```text
Nafta

Presupuesto:
ARS 200.000

Gastado:
ARS 145.000

Disponible:
ARS 55.000

Uso:
72,5%
```

---

# 22. Spending Pace

Debe existir una regla determinística.

Ejemplo:

```text
Mes transcurrido:
40%

Presupuesto utilizado:
75%
```

Resultado:

```text
ABOVE_EXPECTED_PACE
```

La UI puede mostrar:

> Estás gastando más rápido de lo previsto.

No utilizar AI para decidir esto.

---

# 23. Reintegros

Un gasto puede marcarse como reintegrable.

Desde el detalle del gasto debe existir:

## Registrar reintegro

Campos:

- importe;
- fecha;
- cuenta receptora;
- descripción opcional.

El reintegro debe crear una nueva `Transaction`.

No modificar el importe original.

---

# 24. Reintegro parcial

Debe permitirse:

```text
Gasto:
ARS 100.000

Reintegro:
ARS 40.000

Pendiente:
ARS 60.000
```

Estado:

```text
PARTIAL
```

Cuando llegue al total:

```text
COMPLETED
```

---

# 25. Cuentas

Debe existir una pantalla básica de cuentas.

Cuentas iniciales sugeridas:

- Fondo indemnización ARS.
- Fondo vivienda USD.
- Cuenta operativa ARS.
- Broker ARS.
- Broker USD.

El usuario podrá:

- crear;
- editar nombre;
- activar/desactivar.

No se conectan a bancos reales.

---

# 26. Saldo de cuenta

El saldo debe calcularse mediante movimientos.

No debe editarse directamente.

Si el usuario necesita corregir un saldo se utilizará:

```text
ADJUSTMENT
```

---

# 27. Alta inicial del fondo

Debe existir un flujo inicial de configuración.

Ejemplo:

```text
Capital inicial:
ARS 39.000.000
```

Esto genera:

```text
INCOME
Account: Fondo indemnización ARS
```

No guardar un balance manual independiente.

---

# 28. Cambio de moneda

Debe existir una pantalla para registrar compra o venta de moneda.

Campos:

- cuenta origen;
- importe origen;
- moneda origen;
- cuenta destino;
- importe recibido;
- moneda destino;
- tipo de cambio;
- fecha.

Ejemplo:

```text
ARS 16.500.000
→
USD 11.000

Cotización:
1500 ARS/USD
```

Debe actualizar ambas cuentas.

---

# 29. Vivienda

Debe existir una pantalla específica para vivienda.

Debe mostrar:

- cuota mensual;
- moneda;
- cuotas pendientes;
- monto total nominal pendiente;
- fondo reservado;
- cobertura actual;
- historial de pagos.

---

# 30. Configuración inicial de vivienda

Campos:

- nombre;
- cuota mensual;
- moneda;
- cantidad de cuotas pendientes;
- día de vencimiento opcional;
- cuenta de reserva.

Ejemplo:

```text
Vivienda
USD 1.100
37 cuotas pendientes
```

---

# 31. Cobertura vivienda

Debe calcular:

```text
reserveBalance / installmentAmount
```

Mostrar:

```text
USD reservados:
11.000

Cobertura:
10 cuotas
```

Si tiene decimales:

```text
9,4 cuotas
```

---

# 32. Pago de vivienda

Debe existir:

## Registrar cuota

Campos:

- importe;
- fecha;
- cuenta;
- número de cuota opcional.

Al guardar:

- crear transacción;
- crear HousingPayment;
- reducir cuotas pendientes;
- recalcular cobertura.

---

# 33. Inversiones

Debe existir una pantalla para inversiones.

MVP soportará:

- Caución ARS.
- Caución USD.

No se conectará con brokers.

---

# 34. Crear caución

Campos:

- moneda;
- capital;
- cuenta origen;
- TNA;
- fecha inicio;
- fecha vencimiento;
- notas opcionales.

El sistema calculará:

- cantidad de días;
- interés estimado;
- monto estimado al vencimiento.

---

# 35. Cálculo de caución

Inicialmente:

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

Este cálculo es estimativo.

La tasa debe ingresarse como dato.

AI no puede inventar la tasa.

---

# 36. Inversiones activas

Mostrar:

- capital;
- moneda;
- tasa;
- inicio;
- vencimiento;
- días restantes;
- rendimiento esperado.

Ordenar por próximo vencimiento.

---

# 37. Vencimiento de caución

Cuando vence:

Acciones:

- Registrar retorno.
- Renovar.
- Renovar parcialmente.

El usuario deberá ingresar el rendimiento real.

---

# 38. Registrar retorno

Campos:

- capital retornado;
- interés real;
- cuenta destino;
- fecha.

La inversión cambia a:

```text
MATURED
```

---

# 39. Renovación

Una renovación debe crear una nueva inversión.

La anterior mantiene historial.

Debe relacionarse mediante:

```text
renewedFromInvestmentId
```

---

# 40. Consumo del fondo

Debe ser una métrica destacada.

Ejemplo:

```text
Gastos netos del mes:
ARS 1.400.000

Ingresos propios:
ARS 500.000

Consumo del fondo:
ARS 900.000
```

El cálculo debe realizarse mediante código.

---

# 41. Runway

Debe existir una estimación inicial.

Versión MVP:

```text
availableARSFund
/
averageMonthlyFundConsumption
```

Promedio inicial sugerido:

últimos 3 meses disponibles.

Si existe menos historial:

usar los meses disponibles.

Si todavía no existe consumo:

mostrar:

```text
Sin datos suficientes
```

---

# 42. Exclusión del fondo vivienda

Los USD reservados para vivienda no deben formar parte automáticamente del runway de gastos personales.

El sistema debe mostrar esta distinción claramente.

---

# 43. Simulaciones

Debe existir una pantalla de simulaciones.

El usuario podrá probar escenarios sin modificar datos reales.

---

# 44. Escenario nuevo empleo

Inputs:

- meses hasta conseguir trabajo;
- nuevo ingreso neto mensual;
- cambio porcentual de gastos opcional.

Ejemplo:

```text
Trabajo en:
3 meses

Nuevo ingreso:
ARS 3.500.000
```

Resultado:

- capital ARS proyectado;
- capital USD proyectado;
- consumo total del fondo;
- runway proyectado;
- cobertura de vivienda.

---

# 45. Escenario reducción de gastos

Ejemplo:

```text
Reducir gastos:
15%
```

Debe mostrar impacto estimado sobre:

- consumo mensual;
- runway;
- capital restante.

---

# 46. Simulación vivienda

Debe poder comparar:

```text
Reservar 8 cuotas
vs
Reservar 10 cuotas
```

Mostrar:

- USD requeridos;
- ARS requeridos según cotización ingresada;
- ARS restantes;
- cobertura.

---

# 47. Datos de simulación

Una simulación nunca debe:

- crear movimientos;
- modificar saldos;
- modificar inversiones;
- modificar presupuestos;
- modificar vivienda.

Es un entorno read-only sobre datos reales + parámetros hipotéticos.

---

# 48. AI Assistant

Debe existir una pantalla:

## Preguntarle a mis finanzas

Ejemplos válidos:

```text
¿Cuánto gasté este mes?
```

```text
¿Cuánto gasté en supermercado?
```

```text
¿Qué categoría aumentó más?
```

```text
¿Cuánto consumí del fondo?
```

```text
¿Cuántas cuotas de la casa tengo cubiertas?
```

```text
¿Cuánto rindieron mis cauciones?
```

---

# 49. AI con tools internas

OpenAI no debe recibir todos los datos crudos innecesariamente.

El asistente debe utilizar funciones internas.

Ejemplo conceptual:

```ts
getMonthlyExpenses()
getCategoryExpenses()
getFundConsumption()
getHousingCoverage()
getInvestmentSummary()
calculateRunway()
simulateScenario()
```

El código calcula.

AI explica.

---

# 50. Respuestas AI

Las respuestas deben:

- ser simples;
- mostrar valores concretos;
- distinguir hechos de simulaciones;
- no inventar datos;
- indicar cuando faltan datos.

Ejemplo:

```text
Este mes gastaste ARS 485.000 en supermercado.
Eso representa el 68% de tu presupuesto mensual de esa categoría.
```

---

# 51. AI no permitida

La AI no podrá:

- ejecutar inversiones;
- sugerir tasas inventadas;
- modificar movimientos sin confirmación;
- eliminar movimientos;
- cambiar saldos manualmente;
- predecir mercados;
- ejecutar compras de USD;
- realizar transferencias.

---

# 52. Confirmación AI

Toda interpretación de movimiento debe pasar por preview.

Ejemplo:

```text
Detecté:

Supermercado
ARS 75.000
Hoy

[Guardar]
[Editar]
[Cancelar]
```

Nunca auto-save.

---

# 53. OpenAI unavailable

Si la API está caída:

Mostrar algo como:

```text
El asistente no está disponible temporalmente.
Podés seguir registrando movimientos manualmente.
```

No bloquear la aplicación.

---

# 54. Configuración

Debe existir una pantalla de configuración.

MVP:

- categorías;
- cuentas;
- vivienda;
- moneda preferida;
- perfil básico;
- configuración inicial del fondo.

No incluir configuración avanzada innecesaria.

---

# 55. Onboarding inicial

Primera apertura:

## Paso 1

Crear usuario local/lógico.

## Paso 2

Configurar fondo inicial.

## Paso 3

Configurar vivienda.

## Paso 4

Crear cuentas iniciales.

## Paso 5

Crear categorías iniciales.

## Paso 6

Ir al dashboard.

Debe ser posible omitir datos no esenciales y completarlos posteriormente.

---

# 56. PWA

El MVP debe ser instalable como PWA.

Debe incluir:

- manifest;
- iconos;
- nombre de aplicación;
- theme;
- comportamiento standalone;
- responsive design.

Offline completo NO es requisito MVP.

---

# 57. Offline

MVP:

No implementar sincronización offline compleja.

Puede permitirse cache básico de assets.

Los movimientos requieren conexión para persistir.

Una futura versión podrá agregar offline-first.

---

# 58. Desktop responsive

La misma aplicación debe funcionar correctamente en:

- mobile;
- tablet;
- laptop;
- desktop.

No construir interfaces separadas.

---

# 59. Exportación

MVP debe incluir al menos:

## Exportar movimientos CSV

Campos:

- fecha;
- tipo;
- categoría;
- descripción;
- importe;
- moneda;
- cuenta;
- estado;
- clasificación (OPERATING/CAPITAL cuando el movimiento es INCOME);
- reembolso;
- medio de pago.

Exportación Excel avanzada queda para una versión posterior.

---

# 60. Importación

No forma parte del MVP:

- importar resumen de tarjeta;
- importar extracto bancario;
- importar Excel.

Puede evaluarse después.

---

# 61. Gráficos MVP

Desktop podrá incluir inicialmente:

1. Evolución del capital ARS.
2. Gastos por categoría.
3. Presupuesto vs gasto real.
4. Consumo mensual del fondo.

No agregar más gráficos si no aportan decisiones concretas.

---

# 62. Rendimiento

Las pantallas principales deberían responder rápidamente.

Objetivo:

- acciones comunes < 1 segundo cuando no dependen de AI;
- operaciones AI muestran estado de loading;
- evitar consultas innecesarias.

No realizar optimización prematura.

---

# 63. Estados vacíos

Todas las pantallas deben manejar correctamente ausencia de datos.

Ejemplo:

```text
Todavía no registraste gastos este mes.
```

```text
No hay inversiones activas.
```

```text
Necesitamos más historial para calcular el runway.
```

---

# 64. Manejo de errores

Mostrar errores claros.

No mostrar errores técnicos internos al usuario.

Ejemplo:

```text
No pudimos guardar el movimiento.
Intentá nuevamente.
```

Registrar errores técnicos server-side.

---

# 65. Validaciones

Ejemplos:

```text
amount > 0
```

```text
currency == account.currency
```

```text
budget amount > 0
```

```text
principal <= available balance
```

```text
reimbursement <= pending reimbursement
```

Las validaciones financieras críticas deben existir server-side.

---

# 66. Seguridad

MVP debe:

- mantener `DATABASE_URL` server-side;
- mantener `OPENAI_API_KEY` server-side;
- no exponer secrets al navegador;
- validar inputs;
- usar queries parametrizadas/ORM;
- no almacenar información bancaria sensible.

---

# 67. PostgreSQL

Persistencia principal:

```text
PostgreSQL
```

Debe funcionar con:

- local PostgreSQL;
- Neon;
- Render PostgreSQL;
- proveedores compatibles.

No utilizar funcionalidad propietaria como requisito del dominio.

---

# 68. Datos monetarios

Persistir dinero utilizando:

```text
NUMERIC(18,2)
```

Nunca floats.

Tasas:

```text
NUMERIC(12,6)
```

---

# 69. MVP — Entidades requeridas

Entidades mínimas:

- User
- Account
- Transaction
- Category
- Budget
- CurrencyExchange
- HousingObligation
- HousingPayment
- Investment

Opcionales durante MVP si realmente se utilizan:

- Scenario
- AIConversation
- AIMessage

No crear tablas adicionales sin necesidad demostrable.

---

# 70. MVP — Servicios de dominio

Implementar:

```text
AccountService
TransactionService
BudgetService
HousingService
InvestmentService
FinancialService
SimulationService
AIService
```

Estos nombres son conceptuales.

La estructura concreta sigue `ARCHITECTURE.md`:

```text
Route → Controller → Service → Repository → Prisma → PostgreSQL
```

---

# 71. FinancialService mínimo

Debe ofrecer:

```ts
getAccountBalance()

getTotalAvailableARS()

getMonthlyGrossExpenses()

getMonthlyNetExpenses()

getMonthlyIncome()

getMonthlyFundConsumption()

getBudgetProgress()

getHousingCoverage()

getInvestmentSummary()

calculateRunway()
```

---

# 72. SimulationService mínimo

Debe ofrecer:

```ts
simulateNewJobScenario()

simulateExpenseReduction()

simulateHousingReserve()

simulateMonthsWithoutIncome()
```

No persistir resultados necesariamente.

---

# 73. AIService mínimo

Debe ofrecer dos capacidades:

## Parse Transaction

```text
natural language
→
structured transaction proposals
```

## Financial Q&A

```text
user question
→
internal tools
→
AI explanation
```

Nada más en MVP.

---

# 74. Fuera del MVP

No implementar:

- Open Banking;
- sincronización bancaria;
- sincronización de tarjetas;
- conexión con brokers;
- ejecución automática de inversiones;
- cotización automática obligatoria;
- predicción de mercados;
- crypto;
- acciones;
- bonos;
- múltiples portfolios;
- impuestos;
- OCR de tickets;
- multiusuario;
- roles;
- aplicación nativa;
- push notifications complejas;
- WhatsApp bot;
- Telegram bot;
- importadores bancarios;
- reconciliación contable;
- machine learning propio;
- embeddings/vector database sin necesidad real.

---

# 75. Fases de implementación

El MVP se implementará por etapas.

## M0 — Foundation

- crear proyecto;
- configurar PostgreSQL;
- definir ORM;
- migrations;
- seed;
- layout;
- PWA base;
- variables de entorno.

---

## M1 — Core Finance

- User;
- Accounts;
- Categories;
- Transactions;
- balances;
- manual expense;
- manual income;
- movements history.

Resultado:

La aplicación ya permite registrar y consultar dinero real.

---

## M2 — Dashboard

- capital ARS;
- capital USD;
- gastos mes;
- ingresos mes;
- consumo fondo;
- basic charts.

---

## M3 — Budgets

- budgets;
- progress;
- spending pace.

---

## M4 — Housing

- housing obligation;
- housing reserve;
- housing payments;
- coverage.

---

## M5 — Investments

- cauciones;
- expected return;
- maturity;
- actual return;
- renewals.

---

## M6 — Simulations

- job scenario;
- expense reduction;
- housing reserve;
- runway scenarios.

---

## M7 — AI Input

- OpenAI integration;
- structured outputs;
- quick natural language transactions;
- confirmation UI.

---

## M8 — AI Assistant

- Q&A;
- internal financial tools;
- explanations.

---

## M9 — PWA Polish

- installable;
- mobile UX;
- desktop UX;
- loading states;
- empty states;
- error handling;
- CSV export.

---

# 76. Regla de implementación

No comenzar una milestone futura si la actual no tiene:

- funcionalidad implementada;
- validaciones;
- pruebas mínimas;
- documentación actualizada.

---

# 77. Testing MVP

Se requieren pruebas para lógica financiera crítica.

Prioridad:

- account balance;
- transaction sign behavior;
- reimbursements;
- budget progress;
- currency exchange;
- housing coverage;
- investment return;
- runway;
- simulations.

La UI no necesita cobertura exhaustiva inicialmente.

---

# 78. Casos críticos de prueba

## Caso 1

```text
Fondo:
ARS 1.000.000

Expense:
ARS 100.000

Saldo esperado:
ARS 900.000
```

## Caso 2

```text
Expense:
ARS 100.000

Reimbursement:
ARS 40.000

Net expense:
ARS 60.000
```

## Caso 3

```text
Housing reserve:
USD 11.000

Installment:
USD 1.100

Coverage:
10
```

## Caso 4

```text
Caución:
ARS 1.000.000
TNA 30%
7 días

Expected return:
deterministic formula
```

## Caso 5

Una simulación nunca modifica saldo real.

---

# 79. Definition of Done

Una feature se considera terminada cuando:

1. cumple la especificación;
2. respeta DOMAIN.md;
3. incluye validación;
4. maneja errores;
5. funciona mobile;
6. funciona desktop;
7. no rompe cálculos existentes;
8. tiene pruebas si contiene lógica financiera;
9. actualiza documentación si cambió alguna regla.

---

# 80. Prioridad UX

Ante conflicto entre:

- más funcionalidades;
- mayor velocidad de registro;

priorizar velocidad de registro.

Ante conflicto entre:

- visualización compleja;
- claridad;

priorizar claridad.

Ante conflicto entre:

- AI;
- lógica determinística;

priorizar lógica determinística.

---

# 81. Métricas visibles del MVP

El MVP debe permitir observar como mínimo:

```text
Capital ARS actual
Capital USD actual
Gasto neto del mes
Ingreso propio del mes
Consumo del fondo
Runway
Cobertura vivienda
Capital invertido
Rendimiento de inversiones
Presupuesto consumido
```

---

# 82. Primera experiencia objetivo

Ejemplo:

El usuario sale del supermercado.

Abre la PWA.

Escribe:

```text
super 75 mil
```

La aplicación responde:

```text
Supermercado
ARS 75.000
Hoy

¿Guardar?
```

Confirma.

El Dashboard ahora muestra:

```text
Gasto del mes:
+ ARS 75.000

Presupuesto supermercado:
actualizado

Consumo del fondo:
actualizado

Runway:
actualizado
```

La interacción completa debería durar pocos segundos.

---

# 83. Experiencia desktop objetivo

El usuario abre la aplicación desde la computadora.

Puede visualizar:

```text
Capital
Gastos
Presupuestos
Vivienda
Inversiones
Runway
```

Luego registra una caución:

```text
USD 11.000
7 días
TNA X%
```

La aplicación calcula el rendimiento esperado y lo incorpora a la proyección.

---

# 84. Principio de evolución

El MVP debe construir una base sólida pero pequeña.

No diseñar anticipadamente para funcionalidades que quizás nunca se implementen.

Agregar complejidad solamente cuando exista una necesidad concreta.

---

# 85. Regla SDD

`MVP.md` define qué debe construirse en la primera versión.

Antes de agregar una funcionalidad al MVP:

1. revisar `VISION.md`;
2. revisar `DOMAIN.md`;
3. justificar la necesidad;
4. actualizar `MVP.md`;
5. agregar la tarea correspondiente al backlog;
6. recién después implementar.

Cursor/AI no debe convertir ideas futuras en requerimientos MVP automáticamente.

---

# 86. Documentos siguientes

Después de aprobar este documento deberían crearse:

```text
ARCHITECTURE.md
DATA-MODEL.md
USER-FLOWS.md
AI-SPEC.md
BACKLOG.md
```

Orden recomendado:

```text
VISION.md
↓
DOMAIN.md
↓
MVP.md
↓
ARCHITECTURE.md
↓
DATA-MODEL.md
↓
USER-FLOWS.md
↓
AI-SPEC.md
↓
BACKLOG.md
↓
IMPLEMENTATION
```
