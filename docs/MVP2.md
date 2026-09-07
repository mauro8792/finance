# Personal Finance Runway — MVP2

## 1. Objetivo

MVP2 evoluciona Personal Finance Runway desde una aplicación de control de movimientos y runway hacia una herramienta de uso financiero diario más completa.

El foco principal de MVP2 es:

- incorporar tarjetas de crédito como entidades financieras de primera clase;
- registrar consumos en el momento en que ocurren;
- controlar cuotas y compromisos futuros;
- proyectar próximos resúmenes;
- administrar reintegros/promociones;
- contemplar comisiones y gastos recurrentes;
- mejorar la corrección de movimientos reales;
- reducir la fricción del registro diario;
- mejorar significativamente la experiencia mobile.

MVP2 NO debe romper las reglas existentes de MVP1.

Los movimientos continúan siendo la fuente de verdad financiera.

---

# 2. Principios

## 2.1 No duplicar gastos

Una compra con tarjeta se contabiliza cuando corresponde según las reglas definidas en este documento.

El posterior pago de la tarjeta NO vuelve a ser un gasto.

Debe modelarse como cancelación/pago de deuda desde una cuenta hacia la tarjeta.

---

## 2.2 Diferenciar dinero disponible y deuda

Una cuenta bancaria representa dinero disponible.

Una tarjeta de crédito representa consumos/deuda y compromisos futuros.

Comprar con tarjeta:

- aumenta gastos según corresponda;
- aumenta la deuda/proyección de la tarjeta;
- NO reduce inmediatamente el saldo de una cuenta bancaria.

Pagar la tarjeta:

- reduce la cuenta desde donde se paga;
- reduce la deuda de la tarjeta;
- NO genera un nuevo gasto.

---

## 2.3 IA asistiva

Se mantiene la regla de MVP1:

> La IA puede interpretar y proponer. Nunca debe ejecutar silenciosamente una operación financiera.

Toda interpretación mediante texto o voz debe poder revisarse antes de guardarse.

---

# 3. Tarjetas de crédito

## 3.1 Entidad propia

Las tarjetas deben ser entidades independientes de las cuentas bancarias.

Un usuario puede registrar todas las tarjetas que utilice.

Ejemplos:

- Visa Santander
- Visa BBVA
- Amex Santander

Dos tarjetas pertenecientes al mismo banco siguen siendo tarjetas diferentes.

---

## 3.2 Datos de una tarjeta

Como mínimo contemplar:

- nombre;
- banco/emisor;
- marca (Visa, Mastercard, Amex, etc.);
- moneda;
- activa/inactiva;
- tarjeta principal/predeterminada;
- día de cierre;
- día de vencimiento;
- configuración completa/incompleta;
- posibilidad de tener comisión/mantenimiento.

No guardar números completos de tarjeta, CVV ni información sensible innecesaria.

---

## 3.3 Tarjeta principal

El usuario puede definir una tarjeta como principal.

Esto permite simplificar el registro mediante texto o voz.

Ejemplo:

> "50 mil de nafta con la Visa"

Si existe una Visa configurada como principal y la interpretación es inequívoca, la aplicación puede proponer automáticamente esa tarjeta.

Si el usuario dice:

> "50 mil de nafta con la Visa del BBVA"

debe utilizar/proponer específicamente Visa BBVA.

Siempre debe existir confirmación antes de guardar cuando intervenga IA.

---

# 4. Cierre y vencimiento

Cada tarjeta puede tener:

- día de cierre;
- día de vencimiento.

Estos datos son importantes para proyectar resúmenes.

Sin embargo, NO son obligatorios para comenzar a utilizar una tarjeta.

Si faltan, la tarjeta debe quedar marcada como:

> Configuración incompleta

La aplicación debe recordar periódicamente al usuario que puede completar estos datos.

El recordatorio:

- no debe bloquear el uso;
- debe poder posponerse;
- debe continuar apareciendo mientras la configuración siga incompleta.

Las fechas deben poder modificarse posteriormente.

---

# 5. Compra común con tarjeta

Ejemplo:

> "Gasté 50 mil de nafta con Visa Santander."

Interpretación:

- tipo: gasto;
- importe: ARS 50.000;
- categoría: Nafta;
- tarjeta: Visa Santander;
- fecha: hoy;
- cuotas: 1.

Efectos:

- gasto del período + ARS 50.000;
- deuda/consumo de Visa Santander + ARS 50.000;
- ninguna cuenta bancaria disminuye en ese momento.

---

# 6. Compras en cuotas

## 6.1 Regla contable/producto elegida

MVP2 utilizará el criterio de impacto mensual.

Ejemplo:

Compra:

> TV ARS 600.000 en 6 cuotas sin interés.

La aplicación conserva:

- importe total original: ARS 600.000;
- cantidad de cuotas: 6;
- importe por cuota: ARS 100.000;
- tarjeta utilizada;
- fecha de compra;
- cuotas pagadas/transcurridas;
- compromiso pendiente.

El gasto mensual será ARS 100.000, NO ARS 600.000 en el mes de compra.

---

## 6.2 Indicador X/N

Las compras en cuotas deben mostrar claramente su progreso.

Ejemplos:

- 1/6
- 2/6
- 3/12
- 10/12

Esto debe avanzar a medida que las cuotas entren en los períodos correspondientes.

No debe depender únicamente del paso del tiempo si existen inconsistencias con los períodos/resúmenes registrados.

---

## 6.3 Compromiso futuro

Aunque solo una cuota impacte el gasto mensual, la aplicación debe conservar y mostrar todo el compromiso futuro.

Ejemplo:

TV:

- total: ARS 600.000;
- cuota actual: 1/6;
- cuota mensual: ARS 100.000;
- gasto del período: ARS 100.000;
- compromiso futuro luego de esa cuota: ARS 500.000.

El objetivo es poder saber cuánto gasto futuro ya está comprometido antes de realizar nuevas compras.

---

# 7. Proyección de tarjeta

Cada tarjeta debe poder mostrar una proyección.

Ejemplo conceptual:

## Visa Santander

Próximo resumen estimado: ARS 485.000

- Compras del período: ARS 310.000
- Cuotas del período: ARS 195.000
- Reintegros acreditados: -ARS 20.000
- Reintegros pendientes: ARS 15.000
- Cierre: 25/09
- Vencimiento: 07/10

Compromisos futuros en cuotas: ARS 780.000

Próximo período ya comprometido: ARS 195.000

Los reintegros pendientes NO deben descontarse del total confirmado.

---

# 8. Resúmenes

Debe existir el concepto de período/resumen de tarjeta.

Estados conceptuales posibles:

- proyectado;
- cerrado;
- pagado parcialmente;
- pagado.

Antes del cierre se muestra una estimación.

Una vez cerrado, debe poder registrarse/corregirse el importe real del resumen.

No asumir que una proyección es necesariamente idéntica al resumen emitido por el banco.

---

# 9. Pago del resumen

El usuario debe poder registrar desde qué cuenta paga una tarjeta.

Ejemplo:

Santander ARS -> pago Visa Santander.

El pago:

- disminuye el saldo de Santander ARS;
- disminuye/cancela deuda de Visa Santander;
- NO genera un segundo gasto.

---

## 9.1 Pago parcial

Debe soportarse pago parcial.

Ejemplo:

Resumen:

ARS 500.000

Pago:

ARS 300.000

Pendiente:

ARS 200.000

No calcular automáticamente intereses financieros futuros si no existe información suficiente.

Los intereses/cargos reales podrán registrarse cuando sean conocidos.

---

# 10. Promociones y reintegros

## 10.1 Reintegro esperado

Una compra puede estar asociada a una promoción.

Ejemplo:

Compra:

ARS 100.000

Promoción:

- reintegro: 20%;
- tope: ARS 25.000.

Reintegro esperado:

ARS 20.000.

El reintegro inicialmente queda:

> Pendiente

---

## 10.2 Regla fundamental

Un reintegro esperado NO es dinero acreditado.

Por lo tanto:

> Los reintegros pendientes nunca reducen el gasto neto confirmado.

Ejemplo:

Compra: ARS 100.000

Reintegro esperado: ARS 20.000

Mientras esté pendiente:

- gasto bruto: ARS 100.000;
- gasto neto confirmado: ARS 100.000;
- gasto neto estimado: ARS 80.000.

Cuando el usuario confirma que recibió ARS 20.000:

- gasto bruto: ARS 100.000;
- reintegro acreditado: ARS 20.000;
- gasto neto confirmado: ARS 80.000.

---

## 10.3 Estados de reintegro

Como mínimo:

- pendiente;
- acreditado;
- revisar;
- no recibido.

Un reintegro NO debe marcarse automáticamente como acreditado.

---

## 10.4 Demoras

Los reintegros pueden tardar más de 30 días.

La aplicación puede manejar una fecha estimada o plazo de revisión.

Si se supera el plazo:

NO marcar automáticamente como perdido.

Cambiar a:

> Revisar

El usuario decide posteriormente si fue acreditado o no recibido.

---

## 10.5 Importe acreditado diferente

El importe real puede diferir del esperado.

Ejemplo:

Esperado:

ARS 20.000

Acreditado:

ARS 18.000

La aplicación debe conservar ambos valores:

- esperado;
- real acreditado.

---

# 11. Topes de promociones

El tope puede corresponder a una promoción/período y no necesariamente a una única compra.

Ejemplo:

Promoción:

20% de reintegro.

Tope mensual:

ARS 25.000.

Primera compra:

ARS 80.000

Reintegro esperado:

ARS 16.000.

Tope restante:

ARS 9.000.

Segunda compra:

ARS 100.000.

Reintegro matemático:

ARS 20.000.

Reintegro posible por tope restante:

ARS 9.000.

La aplicación debe poder mostrar:

> Tope utilizado: ARS 25.000 / ARS 25.000

Esto permitirá posteriormente informar cuánto beneficio queda disponible.

---

# 12. Conciliación de reintegros

Confirmar reintegros individualmente puede ser tedioso.

MVP2 debe contemplar una experiencia de conciliación simple.

Por tarjeta, mostrar reintegros pendientes y permitir acciones rápidas:

- Acreditar;
- Editar importe acreditado;
- Marcar para revisar;
- Marcar como no recibido.

Idealmente esto puede utilizarse mientras el usuario revisa el resumen bancario.

No se requiere integración automática con bancos en MVP2.

---

# 13. Métricas de reintegros

Distinguir:

### Gasto neto confirmado

Gastos menos reintegros efectivamente acreditados.

### Gasto neto estimado

Gastos menos reintegros acreditados y reintegros esperados pendientes.

El Dashboard principal debe utilizar el valor CONFIRMADO.

El estimado puede mostrarse como información secundaria.

Ejemplo:

> Gasto confirmado: ARS 500.000

> Podría disminuir a ARS 465.000 si se acreditan ARS 35.000 pendientes.

---

# 14. Gastos recurrentes en tarjeta

Una tarjeta puede tener gastos recurrentes conocidos.

Ejemplos:

- seguro del celular;
- servicios;
- suscripciones;
- seguros;
- software.

Ejemplo:

Seguro celular

- tarjeta: Amex Santander;
- categoría: Seguros;
- frecuencia: mensual;
- importe esperado;
- activo/inactivo.

Los gastos recurrentes permiten proyectar compromisos futuros.

El importe esperado no debe sustituir silenciosamente al consumo real si el importe cambia.

---

# 15. Comisiones y mantenimiento

Las tarjetas pueden tener costos propios.

Ejemplos:

- mantenimiento;
- comisión;
- renovación;
- cargos administrativos.

Una tarjeta puede configurarse como:

- con comisión;
- bonificada;
- potencialmente bonificada;
- sin comisión conocida.

El importe puede ser variable.

No exigir necesariamente un importe fijo durante la configuración.

Cuando aparezca el cargo real, debe registrarse como gasto.

Ejemplo de categoría:

> Comisiones bancarias

---

## 15.1 Bonificaciones

Opcionalmente puede registrarse una descripción de condición de bonificación.

Ejemplo conceptual:

> Bonificada mientras se cumplan determinadas condiciones.

MVP2 NO necesita automatizar la validación de condiciones bancarias externas.

---

# 16. Costo real de una tarjeta

La información recopilada permitirá mostrar posteriormente:

- comisiones pagadas;
- reintegros recibidos;
- cantidad de consumos;
- costo neto de mantener/utilizar la tarjeta.

Esto puede ayudar al usuario a evaluar si una tarjeta le resulta conveniente.

No debe convertirse en recomendación financiera automática.

---

# 17. Tarjetas — UX propuesta

Crear una sección específica:

> Tarjetas

Cada tarjeta debería resumir:

- nombre;
- banco;
- marca;
- estado;
- próximo cierre;
- próximo vencimiento;
- consumo/resumen estimado;
- reintegros pendientes;
- cuotas del período;
- compromisos futuros.

Al ingresar a una tarjeta:

- consumos;
- cuotas;
- resumen actual;
- resúmenes anteriores;
- reintegros;
- gastos recurrentes;
- comisiones;
- configuración.

---

# 18. Registro rápido mediante IA

El parser existente debe evolucionar para entender tarjetas y cuotas.

Ejemplos:

> "50 mil de nafta con Visa Santander"

> "100 mil de supermercado con la Visa"

> "600 mil la tele en 6 cuotas con Visa Santander"

> "100 mil en Vea con Visa Santander, 20% de reintegro tope 25 mil"

La IA debe devolver una PROPUESTA.

El usuario revisa y confirma antes de guardar.

---

# 19. Cuenta predeterminada

El usuario puede elegir una cuenta predeterminada para registros que no utilizan tarjeta.

Ejemplo:

> Mercado Pago

Entonces:

> "5200 almacén"

puede proponer automáticamente:

- Gasto
- ARS 5.200
- Almacén/Otros según parser
- Mercado Pago

La cuenta sigue siendo editable antes de guardar.

Esto evita obligar al usuario a entrar en "Editar" solamente para seleccionar una cuenta en cada registro rápido.

---

# 20. Corrección de movimientos

Con datos financieros reales, corregir errores es una funcionalidad prioritaria.

MVP2 debe permitir corregir movimientos existentes de forma segura.

Evaluar:

- edición;
- anulación/void;
- eliminación lógica;
- trazabilidad mínima.

Evitar hard delete si rompe trazabilidad financiera.

La implementación exacta debe respetar las reglas existentes de movimientos como fuente de verdad.

---

# 21. Privacidad de saldos

Agregar control visual tipo:

> Mostrar / ocultar importes

Representable mediante icono de ojo.

Debe aplicarse al menos a:

- Home;
- Cuentas;
- Tarjetas;
- Vivienda;
- Inversiones.

La preferencia puede persistirse localmente en el dispositivo.

Ocultar importes es una función de privacidad visual, NO una medida de seguridad/autenticación.

---

# 22. Home — cuentas y tarjetas

Mejorar la visualización de dónde se encuentra el dinero.

Inspiración conceptual: aplicaciones bancarias con cards horizontales.

NO copiar visualmente una aplicación bancaria específica.

Home puede mostrar cards para:

- cuentas bancarias;
- Mercado Pago;
- inversiones;
- reserva vivienda;
- tarjetas.

Debe quedar visualmente clara la diferencia entre:

- dinero disponible;
- inversiones;
- reservas;
- deuda/consumo de tarjeta.

---

# 23. Mobile — Movimientos

Actualmente los filtros ocupan gran parte de la primera pantalla mobile.

MVP2 debe priorizar el historial.

En mobile:

- mostrar movimientos rápidamente;
- mover filtros a botón "Filtrar";
- usar drawer, modal o bottom sheet;
- mostrar indicador cuando existen filtros activos.

Desktop puede mantener una experiencia de filtros expandida si resulta conveniente.

---

# 24. Mobile — navegación

Revisar navegación mobile.

Problema conocido:

> El menú "Más" puede permanecer abierto después de seleccionar una opción.

Como mínimo:

- cerrar menú al navegar.

Evaluar preferentemente:

- hamburger;
- drawer lateral/mobile;
- navegación adaptada a PWA.

Debe mantenerse acceso rápido a las funciones principales.

---

# 25. Inputs monetarios es-AR

Corregir parsing de importes con formato argentino.

Deben contemplarse correctamente ejemplos como:

- 25495784.34
- 25.495.784,34
- 25 495 784,34

No interpretar separadores de miles como separadores decimales incorrectamente.

Esta regla debe aplicarse consistentemente a formularios monetarios.

Caso real detectado:

> 25.495.784,34

fue inicialmente rechazado por una validación de capital.

MVP2 debe resolverlo de forma centralizada/reutilizable.

---

# 26. Dashboard

MVP2 debe mantener claramente separados:

## Disponible para vivir

Dinero líquido utilizable.

Las compras con tarjeta NO reducen este valor hasta que se paga la tarjeta.

## Gasto del período

Incluye:

- compras directas;
- compras con tarjeta;
- cuotas correspondientes al período;
- comisiones reales;
- otros gastos.

## Reintegros

Separar:

- acreditados;
- pendientes.

## Compromisos futuros

Mostrar especialmente:

- próximas cuotas;
- gastos recurrentes conocidos;
- próximos resúmenes/proyecciones.

Evitar sumar compromisos futuros al gasto actual.

---

# 27. Modelo mental del usuario

MVP2 debe permitir responder rápidamente:

1. ¿Cuánta plata tengo disponible hoy?
2. ¿Cuánto gasté realmente este mes?
3. ¿Cuánto debo en tarjetas?
4. ¿Cuánto podría venir en el próximo resumen?
5. ¿Cuánto del próximo mes ya está comprometido?
6. ¿Qué compras siguen en cuotas?
7. ¿Qué reintegros estoy esperando?
8. ¿Cuánto me devolvieron realmente?
9. ¿Cuánto me cuesta mantener cada tarjeta?
10. ¿De dónde está saliendo mi dinero?

Si el diseño no permite responder estas preguntas con claridad, debe revisarse.

---

# 28. Fuera de alcance de MVP2

Explícitamente fuera de MVP2:

- WhatsApp bot;
- WhatsApp Business API;
- registro de movimientos mediante WhatsApp;
- integración automática con bancos;
- scraping de home banking;
- lectura automática de resúmenes bancarios;
- ejecución automática de operaciones financieras;
- recomendaciones automáticas de inversión.

---

# 29. V3 — candidato: WhatsApp

Para una futura V3 queda registrado:

> Utilizar WhatsApp como canal conversacional de la aplicación.

Ejemplos futuros:

"5200 almacén MP"

"50 mil nafta Visa Santander"

"¿Cuánto gasté este mes?"

"¿Cuánto viene de Visa?"

Arquitectura conceptual futura:

WhatsApp
→ webhook
→ API
→ parser/AI existente
→ propuesta
→ confirmación
→ servicios financieros existentes.

WhatsApp debe ser únicamente otro canal.

NO debe duplicar las reglas de negocio financieras.

---

# 30. Compatibilidad con MVP1

MVP2 debe preservar:

- movimientos existentes;
- cuentas existentes;
- categorías;
- vivienda;
- inversiones;
- presupuestos;
- simulaciones;
- AI assistant;
- exportación;
- autenticación;
- datos reales de producción.

Las migraciones deben ser conservadoras.

No borrar ni reinterpretar datos financieros existentes silenciosamente.

---

# 31. Estrategia de implementación

MVP1 queda congelado salvo bugs reales de producción.

Antes de implementar MVP2:

1. aprobar este documento;
2. crear MVP2-BACKLOG.md;
3. dividir trabajo en P0/P1/P2;
4. revisar impacto sobre BUSINESS-RULES.md;
5. revisar DATA-MODEL.md;
6. diseñar migraciones;
7. implementar incrementalmente;
8. ejecutar tests automáticos;
9. realizar QA manual por flujo;
10. desplegar solamente después de validar migraciones sobre datos existentes.

Cursor NO debe comenzar una implementación masiva únicamente a partir de este documento.

Primero debe producir el análisis técnico/backlog correspondiente.

---

# 32. Prioridades preliminares

## P0 — Correctitud financiera

- modelo de tarjetas;
- compras con tarjeta;
- cuotas;
- compromisos futuros;
- cierre/vencimiento;
- resúmenes;
- pago total/parcial;
- reintegros;
- topes de promociones;
- comisiones;
- gastos recurrentes;
- corrección segura de movimientos;
- parsing monetario es-AR;
- migraciones compatibles con producción.

## P1 — Uso diario

- tarjeta principal;
- cuenta predeterminada;
- parser IA para tarjetas/cuotas/promociones;
- conciliación de reintegros;
- privacidad de saldos;
- nueva sección Tarjetas;
- Home con cards;
- mejoras mobile de Movimientos;
- navegación mobile.

## P2 — Evolución y polish

- métricas históricas por tarjeta;
- costo real anual de tarjeta;
- mejoras visuales;
- renderer enriquecido del Assistant;
- insights basados en información ya registrada.

---

# 33. Criterio de éxito del MVP2

MVP2 estará terminado cuando un usuario pueda registrar sus gastos diarios independientemente de si paga mediante:

- cuenta;
- efectivo;
- billetera;
- tarjeta de crédito;
- tarjeta en cuotas;

y la aplicación pueda distinguir correctamente:

- dinero disponible;
- gasto actual;
- deuda de tarjeta;
- próximos resúmenes;
- cuotas futuras;
- reintegros pendientes;
- reintegros acreditados;
- comisiones;
- compromisos futuros;

sin duplicar gastos ni alterar incorrectamente los saldos existentes.

El usuario debe poder entender su situación financiera actual y futura desde la aplicación sin depender del resumen de la tarjeta para descubrir cuánto gastó.