# VISION.md

# Personal Finance Runway

## 1. Visión

Construir una aplicación personal de gestión financiera que permita administrar un capital extraordinario —inicialmente proveniente de una indemnización laboral— mientras el usuario atraviesa un período de transición de ingresos.

La aplicación debe ayudar a responder, de forma simple y cotidiana:

- ¿Cuánto dinero tengo disponible?
- ¿Cuánto estoy gastando?
- ¿En qué estoy gastando?
- ¿Cuánto estoy consumiendo del fondo cada mes?
- ¿Cuántos meses puedo mantener mi situación actual?
- ¿Cuántas cuotas de la vivienda tengo cubiertas?
- ¿Cuánto dinero tengo invertido?
- ¿Cuánto están generando mis inversiones?
- ¿Qué pasa si consigo trabajo dentro de 1, 3, 6 o 12 meses?
- ¿Dónde estoy gastando más de lo previsto?

El objetivo NO es crear una aplicación bancaria ni un sistema contable complejo.

El objetivo es:

> Tener claridad sobre el dinero, proteger el capital disponible y tomar mejores decisiones durante una etapa de transición laboral.

---

# 2. Contexto inicial

El usuario recibirá una indemnización laboral en ARS.

Ese capital tendrá principalmente tres destinos:

1. Crear una reserva en USD destinada al pago de cuotas futuras de una vivienda.
2. Mantener un fondo en ARS para cubrir gastos personales mientras no exista un nuevo ingreso laboral.
3. Mantener parte del capital invertido en instrumentos líquidos o de corto plazo.

El usuario tiene una obligación de vivienda denominada en dólares:

- Cuota mensual: USD 1.100
- Cuotas pendientes iniciales: 37
- Objetivo inicial: reservar aproximadamente entre 8 y 10 cuotas.

El dinero reservado para la vivienda debe permanecer conceptualmente separado del dinero utilizado para gastos cotidianos.

---

# 3. Objetivo principal

Maximizar el tiempo durante el cual el capital disponible puede sostener los gastos del usuario mientras busca un nuevo empleo.

Si el usuario consigue empleo rápidamente, el objetivo cambia:

> Preservar la mayor cantidad posible del capital restante y utilizarlo principalmente para fortalecer o adelantar el pago de la vivienda.

Por lo tanto, el sistema debe poder adaptarse a ambos escenarios:

### Escenario A — Sin nuevo empleo

El capital funciona como fondo de transición y se consume gradualmente.

### Escenario B — Nuevo empleo

El consumo del fondo disminuye o desaparece y el capital restante pasa a tener un objetivo de ahorro/inversión y vivienda.

---

# 4. Principios del producto

## 4.1 Registrar un gasto debe ser extremadamente rápido

Registrar un gasto desde el teléfono debería requerir menos de 10 segundos.

Ejemplo:

> Super 75 mil

Debe poder convertirse en:

- Supermercado
- ARS 75.000
- Fecha actual

El usuario confirma y el movimiento queda registrado.

---

## 4.2 Mobile first, desktop powerful

La aplicación debe ser una PWA.

Debe poder instalarse y utilizarse desde un teléfono como si fuera una aplicación móvil.

El uso mobile estará principalmente orientado a:

- registrar gastos;
- registrar ingresos;
- consultar saldo;
- consultar presupuesto;
- realizar consultas rápidas.

La versión desktop utilizará mejor el espacio disponible para:

- dashboard financiero;
- gráficos;
- inversiones;
- cauciones;
- proyecciones;
- escenarios;
- análisis con AI.

La aplicación debe utilizar la misma información independientemente del dispositivo.

---

# 5. El fondo de indemnización

La indemnización debe representarse como un fondo independiente.

Ejemplo:

Fondo inicial:

ARS 40.000.000

Luego pueden ocurrir movimientos como:

- compra de USD;
- gastos;
- inversiones;
- rendimientos;
- retiros;
- reintegros.

El sistema debe mantener trazabilidad sobre cómo evoluciona ese capital.

Ejemplo:

Capital inicial:

ARS 40.000.000

Compra USD vivienda:

- ARS 16.000.000

Capital ARS:

ARS 24.000.000

Resultado de inversiones:

+ ARS 180.000

Gastos financiados con el fondo:

- ARS 450.000

Capital final:

ARS 23.730.000

---

# 6. Separación por monedas

ARS y USD deben tratarse como fondos separados.

No debe asumirse automáticamente una conversión entre monedas.

Ejemplo:

## Fondo ARS

ARS 22.500.000

## Fondo vivienda USD

USD 11.000

La cotización del dólar podrá utilizarse para mostrar un patrimonio total estimado, pero nunca debe alterar los saldos reales.

---

# 7. Fondo vivienda

Debe existir un fondo específicamente destinado a la vivienda.

Datos iniciales:

- cuota: USD 1.100;
- cuotas pendientes: 37;
- cuotas inicialmente cubiertas: configurable;
- objetivo inicial sugerido: 8 a 10 cuotas.

Ejemplo:

Capital reservado:

USD 11.000

Cuota:

USD 1.100

Cobertura:

10 meses

Después de pagar una cuota:

Capital:

USD 9.900

Cobertura:

9 meses

Si el capital genera rendimiento, ese rendimiento debe incorporarse al fondo.

---

# 8. Gastos

El sistema debe permitir registrar gastos manualmente.

Ejemplo:

Supermercado
ARS 75.000

Gym
ARS 54.000

Nafta
ARS 48.500

Cada gasto debería poder contener:

- fecha;
- importe;
- moneda;
- categoría;
- descripción;
- medio de pago;
- indicador de gasto fijo;
- indicador de gasto reintegrable;
- estado del reintegro.

---

# 9. Categorías iniciales

Las categorías iniciales serán:

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

Las categorías deben poder modificarse en el futuro.

No construir un sistema rígido dependiente de estas categorías.

---

# 10. Gastos reintegrables

Algunos gastos pueden aparecer inicialmente como gastos del usuario pero posteriormente ser reintegrados por otra persona.

Ejemplo:

Gasto:

ARS 170.000

Reintegrable:

Sí

Posteriormente:

Reintegro:

ARS 170.000

El dashboard debe diferenciar:

Gasto bruto

vs.

Gasto real del usuario.

Un gasto completamente reintegrado no debe considerarse consumo definitivo del fondo.

---

# 11. Ingresos

La aplicación podrá registrar ingresos propios del usuario.

Ejemplos:

- prestación por desempleo;
- SUAF;
- trabajo freelance;
- nuevo salario;
- venta de activos;
- reintegros;
- otros ingresos.

Los ingresos de terceros no forman parte del patrimonio ni del flujo principal del usuario.

En particular, el salario de la pareja debe permanecer fuera del modelo financiero principal.

Si otra persona paga directamente un gasto familiar, simplemente no existe un egreso del fondo personal por ese importe.

---

# 12. Presupuestos

El usuario podrá definir presupuestos mensuales por categoría.

Ejemplo:

Nafta

Presupuesto:

ARS 200.000

Gastado:

ARS 147.500

Disponible:

ARS 52.500

El sistema debe mostrar:

- presupuesto;
- gasto actual;
- disponible;
- porcentaje consumido;
- ritmo de gasto.

---

# 13. Ritmo de gasto

El sistema debe poder detectar si una categoría está consumiendo presupuesto demasiado rápido.

Ejemplo:

Día del mes:

10

Presupuesto supermercado:

ARS 500.000

Gastado:

ARS 350.000

Consumido:

70%

El sistema puede mostrar:

> Estás consumiendo el presupuesto de supermercado más rápido de lo previsto.

Este cálculo debe realizarse mediante reglas determinísticas.

No requiere AI.

---

# 14. Flujo mensual

Una de las métricas principales del sistema será:

## Consumo del fondo durante el mes

Ejemplo:

Gastos personales:

ARS 1.500.000

Ingresos propios:

ARS 600.000

Déficit:

ARS 900.000

Por lo tanto:

Consumo del fondo:

ARS 900.000

Esta métrica debe tener alta visibilidad en el dashboard.

---

# 15. Runway financiero

La aplicación debe estimar durante cuánto tiempo puede mantenerse el usuario utilizando el capital disponible.

Ejemplo:

Capital disponible:

ARS 20.000.000

Consumo promedio mensual:

ARS 1.000.000

Runway aproximado:

20 meses

El cálculo real deberá considerar:

- capital disponible;
- gastos;
- ingresos;
- inversiones;
- rendimientos;
- obligaciones futuras;
- fondos reservados.

El fondo destinado a vivienda no debe considerarse automáticamente disponible para gastos generales.

---

# 16. Inversiones

La aplicación permitirá registrar inversiones.

Inicialmente se priorizarán:

- caución bursátil ARS;
- caución bursátil USD.

La aplicación NO ejecutará inversiones.

Solamente permitirá:

- registrarlas;
- calcular rendimientos;
- registrar vencimientos;
- proyectar resultados;
- mantener historial.

Ejemplo:

Tipo:

Caución

Moneda:

USD

Capital:

USD 11.000

TNA:

3,2%

Plazo:

7 días

Vencimiento:

08/09/2026

Interés estimado:

USD X

---

# 17. Cauciones

Cada caución debe guardar como mínimo:

- moneda;
- capital;
- tasa;
- fecha de inicio;
- fecha de vencimiento;
- rendimiento estimado;
- rendimiento real;
- estado.

Estados posibles:

- ACTIVE
- MATURED
- RENEWED
- CANCELLED

Cuando una caución vence, el usuario podrá registrar:

- retiro;
- renovación;
- renovación parcial.

---

# 18. Simulaciones

La aplicación debe permitir realizar simulaciones sin modificar los datos reales.

Ejemplos:

- ¿Qué pasa si consigo trabajo el próximo mes?
- ¿Qué pasa si consigo trabajo dentro de 3 meses?
- ¿Qué pasa si pasan 6 meses?
- ¿Qué pasa si compro 10 cuotas de vivienda en USD?
- ¿Qué pasa si compro solamente 8?
- ¿Qué pasa si reduzco mis gastos un 15%?
- ¿Qué pasa si la caución rinde X%?

Las simulaciones deben estar claramente diferenciadas de los datos reales.

---

# 19. Inteligencia Artificial

La AI será una capa de asistencia sobre el sistema.

No será la fuente de verdad financiera.

Los datos reales pertenecen a la aplicación.

Los cálculos financieros importantes deben realizarse mediante código determinístico.

La AI podrá:

- interpretar lenguaje natural;
- clasificar gastos;
- responder preguntas sobre los datos;
- explicar tendencias;
- detectar comportamientos;
- ayudar a interpretar simulaciones;
- sugerir posibles áreas de ahorro.

---

# 20. Registro de gastos mediante AI

Ejemplo:

Usuario:

> super 75 mil

AI:

{
  "type": "expense",
  "amount": 75000,
  "currency": "ARS",
  "category": "Supermercado",
  "description": "Supermercado"
}

La aplicación debe mostrar una confirmación antes de guardar.

---

Otro ejemplo:

Usuario:

> hoy pagué 54k del gym y 48 lucas de nafta

Resultado esperado:

Movimiento 1:

Gym
ARS 54.000

Movimiento 2:

Nafta
ARS 48.000

El usuario confirma los movimientos.

---

# 21. Asistente financiero

La aplicación podrá incluir una sección:

## Preguntarle a mis finanzas

Ejemplos:

> ¿Cuánto gasté este mes?

> ¿Cuánto gasté en supermercado?

> ¿En qué categoría estoy gastando más?

> ¿Cuánto gasté de más respecto al presupuesto?

> ¿Cuánto dinero retiré de la indemnización este mes?

> ¿Cuántas cuotas de la casa tengo cubiertas?

> ¿Cuánto generaron las cauciones?

> ¿Cómo estaría dentro de seis meses si no consigo trabajo?

La AI no debe calcular valores financieros críticos por sí misma.

Debe utilizar funciones internas de la aplicación.

Ejemplo conceptual:

calculateMonthlyExpenses()

calculateRunway()

calculateHousingCoverage()

calculateInvestmentReturn()

simulateScenario()

La función devuelve los números.

La AI explica el resultado.

---

# 22. Seguridad de AI

La AI nunca podrá:

- ejecutar inversiones;
- transferir dinero;
- modificar inversiones automáticamente;
- eliminar movimientos;
- modificar saldos sin confirmación;
- inventar tasas;
- inventar cotizaciones;
- asumir ingresos inexistentes.

Toda acción que modifique datos financieros deberá requerir confirmación explícita del usuario.

---

# 23. Privacidad

Los datos financieros deben permanecer privados.

Cuando se utilice una API externa de AI:

- enviar solamente el contexto mínimo necesario;
- nunca enviar información innecesaria;
- no incluir credenciales bancarias;
- no incluir números completos de tarjetas;
- no incluir contraseñas;
- no incluir tokens;
- no incluir API keys.

---

# 24. Arquitectura conceptual

La aplicación es un único producto para el usuario.

Técnicamente se implementa como un monorepo simple:

- `apps/web`: frontend Next.js (React, TypeScript, App Router, PWA);
- `apps/api`: backend Node.js + Express + TypeScript;
- `packages/shared`: tipos y contratos compartidos;
- `docs`: especificación SDD.

Objetivo:

- PWA (pertenece al frontend Next.js);
- mobile first;
- responsive;
- usable desde desktop;
- TypeScript;
- frontend Next.js como cliente de la API Express.

La arquitectura del backend es:

```text
Route
→ Controller
→ Service
→ Repository
→ Prisma
→ PostgreSQL
```

El frontend no accede a PostgreSQL.

Prisma queda encapsulado en repositories del backend.

OpenAI se invoca únicamente desde el backend.

`apps/web` + `apps/api` no son microservicios: hay un frontend único y un backend único.

No crear una arquitectura distribuida.

No crear microservicios.

No agregar infraestructura que no sea necesaria para el MVP.

---

# 25. OpenAI

La integración con OpenAI deberá realizarse exclusivamente desde código server-side.

Nunca exponer la API key en el navegador.

La AI será utilizada inicialmente para:

1. Natural Language Expense Input.
2. Financial Q&A.
3. Explicación de simulaciones.

La integración debe estar desacoplada del dominio financiero.

El dominio debe funcionar incluso si OpenAI no está disponible.

---

# 26. Dashboard

El dashboard principal debería priorizar:

## Capital

Fondo ARS

Fondo vivienda USD

Capital invertido

---

## Mes actual

Gastado

Presupuesto

Ingresos propios

Consumo del fondo

---

## Vivienda

Cuota mensual

Cuotas pendientes

Cuotas cubiertas

USD reservados

---

## Inversiones

Capital colocado

Próximo vencimiento

Rendimiento del mes

---

## Runway

Meses estimados de autonomía financiera.

---

# 27. Mobile UX

En mobile, la acción principal debe ser:

## + Registrar

Desde ahí:

- gasto;
- ingreso;
- reintegro;
- inversión.

Debe existir también una entrada rápida mediante lenguaje natural.

Ejemplo:

> Nafta 50k

El objetivo es registrar un movimiento en menos de 10 segundos.

---

# 28. Desktop UX

Desktop estará orientado principalmente al análisis.

Debe aprovechar el espacio disponible para mostrar:

- evolución del capital;
- distribución de gastos;
- presupuesto vs real;
- evolución mensual;
- cauciones;
- vencimientos;
- vivienda;
- simulaciones;
- AI assistant.

---

# 29. Fuente de verdad

La aplicación será la fuente de verdad de los movimientos financieros.

El Excel existente se considera una herramienta inicial de planificación.

En el futuro la aplicación podrá:

- exportar movimientos a CSV;
- exportar reportes a Excel;
- importar datos;
- generar snapshots mensuales.

Pero el Excel NO será utilizado como base de datos de la aplicación.

---

# 30. Qué NO construir en el MVP

No construir inicialmente:

- conexión bancaria automática;
- conexión con tarjetas;
- conexión con brokers;
- ejecución automática de cauciones;
- transferencias;
- pagos;
- sincronización bancaria;
- múltiples usuarios;
- presupuesto familiar complejo;
- sistema contable;
- cálculo impositivo;
- predicciones de mercado mediante AI;
- recomendaciones automáticas de inversión;
- trading;
- criptomonedas;
- microservicios;
- aplicación mobile nativa.

---

# 31. Métrica principal del producto

La métrica más importante será:

## Consumo mensual del fondo

Debe responder:

> ¿Cuánto de mi capital tuve que utilizar este mes para vivir?

La segunda métrica será:

## Capital preservado

Debe responder:

> ¿Cuánto del capital inicial todavía conservo?

La tercera será:

## Cobertura de vivienda

Debe responder:

> ¿Cuántas cuotas de USD 1.100 tengo actualmente cubiertas?

---

# 32. Filosofía

La aplicación no busca obsesionar al usuario con cada peso gastado.

Busca generar tranquilidad mediante información.

Debe permitir entender rápidamente:

- dónde está el dinero;
- cuánto se está gastando;
- cuánto queda;
- cuánto está invertido;
- cuánto tiempo puede durar;
- qué obligaciones están cubiertas.

La interfaz debe favorecer claridad sobre complejidad.

---

# 33. Evolución futura

Después del MVP se podrá evaluar:

- importación automática de resúmenes de tarjeta;
- lectura de tickets mediante cámara;
- categorización automática;
- notificaciones PWA;
- alertas de presupuesto;
- recordatorios de vencimientos;
- comparación entre meses;
- detección de gastos recurrentes;
- integración con cotizaciones;
- integración con brokers mediante APIs oficiales;
- reportes avanzados;
- objetivos financieros;
- planificación de cancelación de vivienda;
- agente financiero más avanzado.

Estas funcionalidades NO forman parte del MVP salvo que sean promovidas explícitamente al backlog.

---

# 34. Regla SDD

Este documento representa la visión del producto.

Las decisiones de implementación deben respetar esta visión.

Si existe conflicto entre una implementación propuesta y los principios definidos aquí, debe priorizarse este documento.

Cursor/AI no debe agregar funcionalidades no especificadas sin solicitar aprobación.

Antes de implementar una funcionalidad nueva:

1. definirla;
2. documentarla;
3. agregarla al backlog;
4. implementarla;
5. validarla.

La AI utilizada para desarrollo no debe expandir el alcance del producto automáticamente.