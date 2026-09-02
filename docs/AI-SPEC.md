# AI-SPEC.md

# Personal Finance Runway — AI Specification

## 1. Propósito

Definir el uso de OpenAI dentro del MVP.

AI mejora la experiencia, pero no controla el dominio financiero.

---

# 2. Capacidades MVP

Sólo dos capacidades principales:

1. Parseo de movimientos en lenguaje natural.
2. Preguntas y respuestas sobre las finanzas del usuario mediante tools internas.

---

# 3. Parseo de movimientos

Ejemplo:

```text
super 75 mil
```

Salida estructurada:

```json
{
  "transactions": [
    {
      "type": "EXPENSE",
      "amount": "75000.00",
      "currency": "ARS",
      "categoryHint": "Supermercado",
      "description": "Supermercado",
      "occurredAt": null,
      "paymentMethod": null
    }
  ]
}
```

La salida es una propuesta.

Nunca se persiste automáticamente.

---

# 4. Múltiples movimientos

Ejemplo:

```text
gym 54k y nafta 48 lucas
```

Debe producir dos propuestas independientes.

El usuario puede:

- editar;
- eliminar;
- confirmar.

---

# 5. Ambigüedad

Si falta un dato crítico, AI debe:

- dejarlo `null`; o
- solicitar aclaración.

No inventar:

- moneda;
- cuenta;
- tasa;
- importe;
- fecha específica no inferible.

Defaults definidos por producto pueden aplicarse fuera del modelo.

---

# 6. Structured Outputs

El parser debe utilizar salida estructurada validada por schema.

No parsear texto libre con regex después de recibir una respuesta narrativa.

El backend valida nuevamente la salida antes de enviarla al frontend.

---

# 7. Confirmación

Flujo obligatorio:

```text
User text
↓
AI parse
↓
schema validation
↓
preview
↓
user confirmation
↓
normal domain endpoint
↓
persist
```

AI no llama directamente a repositories de escritura.

---

# 8. Financial Q&A

Ejemplos:

```text
¿Cuánto gasté este mes?
¿Cuánto gasté en supermercado?
¿Cuántas cuotas de vivienda tengo cubiertas?
¿Cuánto rindieron mis cauciones?
¿Qué pasa si estoy 6 meses sin ingresos?
```

---

# 9. Tools internas

AI puede utilizar funciones como:

```text
getFinancialSummary
getMonthlyExpenses
getMonthlyNetExpenses
getCategoryExpenses
getMonthlyFundConsumption
getBudgetProgress
getHousingCoverage
getInvestmentSummary
getRealizedInvestmentReturn
calculateRunway
simulateMonthsWithoutIncome
simulateNewJobScenario
simulateHousingReserve
```

Los nombres finales pueden variar, pero la responsabilidad no.

---

# 10. Regla de tools

Las tools:

- reciben parámetros validados;
- llaman Services;
- devuelven datos estructurados;
- no contienen lógica financiera duplicada.

---

# 11. OpenAI no accede a DB

Prohibido:

```text
OpenAI
↓
Prisma
```

Correcto:

```text
OpenAI tool
↓
Service
↓
Repository
↓
Prisma
```

---

# 12. Mutaciones desde chat

MVP:

AI Assistant no ejecuta mutaciones financieras desde una respuesta conversacional.

Puede preparar un draft y redirigir al flujo de confirmación.

---

# 13. System instructions

El prompt de sistema debe indicar al modelo:

- no inventar valores;
- utilizar tools para datos financieros;
- diferenciar datos reales de simulaciones;
- ser breve y claro;
- pedir datos faltantes cuando sean necesarios;
- no afirmar que una operación fue realizada si no existe confirmación/persistencia.

---

# 14. Context minimization

No enviar toda la base financiera al modelo.

Preferir:

```text
question
+
tool definitions
+
tool results necesarios
```

Esto reduce:

- costo;
- exposición de datos;
- ruido;
- riesgo de errores.

---

# 15. Privacidad

No enviar a OpenAI:

- claves;
- números completos de tarjeta;
- credenciales;
- tokens;
- información no necesaria para responder.

Las descripciones de movimientos pueden enviarse sólo cuando sean relevantes para la consulta.

---

# 16. Modelo configurable

Configurar server-side:

```env
OPENAI_API_KEY=
OPENAI_MODEL=
```

No acoplar Services al nombre de un modelo concreto.

---

# 17. OpenAIClient

Arquitectura:

```text
AIService
↓
OpenAIClient
↓
OpenAI SDK
```

Responsabilidades de `OpenAIClient`:

- llamada API;
- timeout;
- manejo de errores del proveedor;
- structured output;
- tool protocol.

---

# 18. AIService

Responsabilidades:

- construir contexto mínimo;
- seleccionar operación;
- validar respuesta;
- coordinar tools;
- mapear errores;
- devolver respuesta utilizable por Controller.

No realiza cálculos financieros propios.

---

# 19. Cost control

MVP debe:

- limitar historial conversacional;
- limitar tokens de salida;
- usar modelo económico adecuado;
- evitar llamadas para tareas determinísticas;
- evitar enviar datasets completos;
- reutilizar datos agregados cuando corresponda.

---

# 20. Historial conversacional

No es obligatorio persistir conversaciones en la primera versión.

Puede mantenerse únicamente durante la sesión.

Si se persiste posteriormente:

- definir retención;
- permitir borrado;
- no convertir chat en fuente financiera.

---

# 21. Error handling

Si OpenAI falla:

```text
AI_UNAVAILABLE
```

La API debe responder de forma controlada.

Frontend:

```text
El asistente no está disponible temporalmente.
```

El resto de la app sigue funcionando.

---

# 22. Timeout

Las llamadas AI deben tener timeout.

Un timeout no debe generar reintentos infinitos.

El usuario puede reintentar manualmente.

---

# 23. Parser fallback

Si el parser AI falla:

ofrecer:

```text
Registrar manualmente
```

No intentar interpretar silenciosamente con lógica riesgosa.

---

# 24. Respuestas factuales

Cuando una tool devuelve:

```json
{
  "amount": "485000.00",
  "currency": "ARS"
}
```

AI puede responder:

```text
Este mes gastaste ARS 485.000.
```

No debe modificar el valor.

---

# 25. Simulaciones

AI puede convertir una pregunta natural:

```text
¿Qué pasa si consigo trabajo dentro de 3 meses cobrando 3 millones?
```

en parámetros:

```json
{
  "monthsUntilJob": 3,
  "monthlyIncome": "3000000.00"
}
```

Luego:

```text
SimulationService
```

realiza el cálculo.

---

# 26. Advice boundary

El asistente puede ayudar a interpretar:

- gasto;
- presupuesto;
- runway;
- escenarios.

No debe presentar una predicción de mercado como certeza ni ejecutar decisiones financieras.

Las recomendaciones deben distinguirse de los datos calculados.

---

# 27. Tests

Testear:

- un movimiento;
- múltiples movimientos;
- montos con `k`, `mil`, `lucas`;
- categorías ambiguas;
- dato faltante;
- structured output inválido;
- tool correcta;
- tool failure;
- timeout;
- OpenAI unavailable;
- ninguna persistencia sin confirmación.

---

# 28. Observabilidad

Registrar:

- operación AI;
- duración;
- éxito/error;
- modelo utilizado;
- uso de tokens/costo si el SDK lo facilita.

No loggear contenido financiero completo por defecto.

---

# 29. Fuera del MVP

No implementar:

- agente autónomo;
- inversiones automáticas;
- análisis de documentos con OCR;
- voz;
- memoria AI compleja;
- vector DB;
- embeddings financieros;
- predicción de mercado;
- recomendaciones automáticas de trading.

---

# 30. Regla SDD

Toda nueva capacidad AI debe responder:

1. ¿qué problema resuelve?
2. ¿puede resolverse determinísticamente?
3. ¿qué datos necesita?
4. ¿requiere tool?
5. ¿puede modificar datos?
6. ¿requiere confirmación?

Actualizar `AI-SPEC.md` antes de implementar nuevas capacidades.
