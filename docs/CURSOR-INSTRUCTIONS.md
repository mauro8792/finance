# CURSOR-INSTRUCTIONS.md

# Personal Finance Runway — Cursor Instructions

## 1. Propósito

Este documento define cómo debe trabajar Cursor/AI dentro de este repositorio.

La aplicación se desarrolla utilizando SDD (Specification-Driven Development).

La especificación escrita tiene prioridad sobre decisiones improvisadas durante implementación.

---

# 2. Documentos fuente de verdad

Antes de implementar una tarea, leer los documentos relevantes dentro de `/docs`.

Orden general:

```text
VISION.md
DOMAIN.md
MVP.md
BUSINESS-RULES.md
ARCHITECTURE.md
DATA-MODEL.md
USER-FLOWS.md
AI-SPEC.md
BACKLOG.md
```

No todos deben releerse completos para cada cambio, pero Cursor debe consultar los que gobiernen la tarea actual.

---

# 3. Jerarquía de decisiones

Ante una duda:

```text
VISION
↓
BUSINESS RULES
↓
DOMAIN
↓
MVP
↓
ARCHITECTURE
↓
DATA MODEL
↓
USER FLOWS
↓
AI SPEC
↓
BACKLOG
↓
IMPLEMENTATION
```

Si existe contradicción entre documentos:

```text
STOP
```

No elegir arbitrariamente una interpretación.

Informar:

1. documentos en conflicto;
2. reglas contradictorias;
3. impacto;
4. propuesta mínima de corrección.

No implementar hasta resolver la contradicción.

---

# 4. Arquitectura obligatoria

Backend:

```text
Express
TypeScript
PostgreSQL
Prisma
```

Flujo:

```text
Route
↓
Controller
↓
Service
↓
Repository
↓
Prisma
↓
PostgreSQL
```

Frontend:

```text
Next.js
TypeScript
React
PWA
```

---

# 5. Reglas de capas

## Controller

Puede:

- recibir HTTP;
- validar request;
- invocar Service;
- devolver response.

No puede:

- acceder directamente a Prisma;
- calcular saldos;
- calcular runway;
- implementar reglas financieras.

## Service

Contiene:

- reglas de negocio;
- coordinación;
- validaciones contextuales;
- límites de transacciones DB.

## Repository

Contiene:

- acceso a datos;
- queries;
- persistencia.

No colocar reglas financieras importantes en Repository.

---

# 6. No sobrearquitectura

No introducir sin especificación:

```text
NestJS
microservices
CQRS
event sourcing
Kafka
RabbitMQ
Redis
GraphQL
DDD ceremonial
generic repositories
BaseService
command handlers
use-case layer adicional
```

La arquitectura buscada es deliberadamente simple.

---

# 7. Regla de alcance

Implementar únicamente la tarea actual del `BACKLOG.md`.

No avanzar automáticamente a la siguiente.

No agregar features relacionadas "aprovechando".

No crear infraestructura para necesidades futuras no incluidas en la tarea.

---

# 8. Flujo obligatorio por tarea

Antes de modificar código:

1. identificar ID de backlog;
2. leer especificaciones relevantes;
3. inspeccionar código existente;
4. describir brevemente plan;
5. implementar sólo el alcance;
6. ejecutar validaciones/tests;
7. revisar diff;
8. actualizar backlog;
9. reportar resultado.

---

# 9. Si falta una decisión

No inventar una regla financiera.

Si una tarea requiere una decisión no especificada:

```text
STOP
```

Explicar exactamente qué falta decidir.

Puede proponer opciones, pero no asumir una sin aprobación.

---

# 10. Cambios de documentación

Si durante implementación se descubre que la especificación debe cambiar:

No modificar silenciosamente el comportamiento.

Primero:

```text
proponer cambio SDD
```

Luego, tras aprobación:

```text
actualizar docs
↓
actualizar backlog
↓
implementar
```

---

# 11. Base de datos

PostgreSQL es la persistencia principal.

Prisma se utiliza detrás de repositories.

Reglas:

- UUID;
- dinero con Decimal/NUMERIC;
- timestamps;
- migrations versionadas;
- no usar float para dinero;
- no hard delete de movimientos financieros;
- no guardar saldos derivados sin especificación.

---

# 12. Migrations

En desarrollo:

```text
prisma migrate dev
```

En deployment:

```text
prisma migrate deploy
```

No utilizar `db push` como estrategia de producción.

Toda modificación de schema debe corresponder con `DATA-MODEL.md`.

---

# 13. Dinero

Nunca asumir que JavaScript `number` es adecuado para persistencia monetaria.

Utilizar Prisma Decimal o estrategia equivalente.

No redondear prematuramente cálculos intermedios.

---

# 14. Reglas financieras

No duplicar reglas en:

- frontend;
- controllers;
- AI prompts;
- repositories.

Centralizar en Services.

Ejemplos:

```text
FinancialService
HousingService
BudgetService
InvestmentService
SimulationService
```

---

# 15. AI

OpenAI:

- sólo server-side;
- nunca accede directamente a DB;
- nunca persiste movimientos automáticamente;
- nunca calcula saldos como autoridad;
- utiliza Services/tools determinísticos.

Toda propuesta AI de movimiento requiere confirmación del usuario.

---

# 16. Secrets

Nunca commitear:

```text
DATABASE_URL
OPENAI_API_KEY
tokens
passwords
credentials
```

Mantener `.env.example` sin valores secretos.

---

# 17. Testing

Los tests automatizados nunca pueden usar la DB de desarrollo.

Usar `DATABASE_URL_TEST` (por ejemplo `personal_finance_test`). Si falta, los tests de integración deben fallar antes de escribir. No caer en `DATABASE_URL` de development.

Toda tarea con lógica financiera debe incluir tests.

Priorizar tests de Service.

Casos mínimos:

- happy path;
- validación principal;
- caso límite relevante;
- prevención de doble contabilización cuando corresponda.

---

# 18. Frontend

No duplicar lógica financiera.

Frontend:

- captura;
- presenta;
- formatea;
- llama API;
- maneja server state.

Los cálculos financieros críticos vienen del backend.

---

# 19. TanStack Query

Utilizar para server state cuando corresponda.

Después de mutations:

invalidar únicamente queries afectadas.

No crear store global de datos financieros duplicando backend.

---

# 20. Manejo de errores

Backend debe devolver errores controlados.

No exponer:

- stack traces;
- detalles internos;
- secrets.

Frontend debe conservar formularios ante errores recuperables.

---

# 21. Calidad

Antes de cerrar tarea:

```text
typecheck
lint
tests relevantes
build cuando corresponda
```

Si alguno falla:

no marcar tarea DONE.

---

# 22. Backlog

Cuando una tarea termina correctamente:

cambiar únicamente su estado:

```text
TODO → DONE
```

Si está parcialmente implementada:

```text
IN_PROGRESS
```

No marcar milestones completos si quedan tareas pendientes.

---

# 23. Commits

Si se solicita generar commits:

usar mensajes pequeños y descriptivos.

Ejemplo:

```text
feat(api): add health endpoint
```

No mezclar múltiples milestones en un commit.

---

# 24. Refactors

No realizar refactors amplios durante una tarea pequeña salvo que sean necesarios para completarla.

Si se detecta deuda no relacionada:

agregar propuesta de backlog, no implementarla automáticamente.

---

# 25. Dependencias

Antes de agregar una dependencia:

1. comprobar si realmente es necesaria;
2. preferir dependencias maduras;
3. evitar librerías que dupliquen capacidades existentes;
4. explicar brevemente su propósito.

---

# 26. Persona / finanzas compartidas

La entidad futura `Person` está fuera del MVP.

No crearla todavía.

No mezclar automáticamente patrimonio o ingresos de terceros.

---

# 27. Tarjetas

MVP:

```text
compra con tarjeta = gasto
pago del resumen != gasto nuevo
```

No implementar pasivo completo de tarjeta sin actualización SDD.

---

# 28. Transferencias e inversiones

No contar:

- transferencias;
- cambios de moneda;
- colocación de inversión;

como gasto operativo.

No contar devolución de principal como ingreso operativo.

---

# 29. Simulaciones

Deben ser read-only.

Una simulación jamás persiste movimientos reales.

---

# 30. Formato de respuesta al finalizar tarea

Responder con:

```text
Tarea:
Estado:

Implementado:
- ...

Archivos principales:
- ...

Validaciones ejecutadas:
- ...

Tests:
- ...

Decisiones / observaciones:
- ...

Siguiente tarea sugerida:
<BACKLOG ID>
```

No comenzar la siguiente tarea.

---

# 31. Regla final

Cuando exista conflicto entre:

```text
hacer más
```

y:

```text
cumplir exactamente la especificación
```

elegir:

```text
cumplir exactamente la especificación
```

El objetivo no es generar la mayor cantidad de código.

El objetivo es construir el sistema especificado, milestone por milestone.
