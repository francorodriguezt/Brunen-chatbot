# Análisis del proyecto y mejoras posibles (2026-11-13)

Revisión de todo el proyecto con métodos de gestión de proyectos, comparado con productos y proyectos parecidos. Cada afirmación sobre terceros lleva su fuente al final. Lo que no se pudo verificar en una fuente oficial se dice.

## 1. Resumen

- **Lo que ya está a la altura de productos de pago:** pedidos por WhatsApp con respuesta en un solo mensaje, fichas de clientes con historial de direcciones, pedidos fijos, aviso de clientes atrasados, reparto por cargas de 65 bidones, panel del repartidor que funciona sin señal, historial de cada cambio, y todo a costo cero. Pasan 1.341 pruebas y el bot atendió 447 invocaciones sin errores.
- **Lo que no existe como producto abierto:** no hay un proyecto de código abierto de reparto de agua por WhatsApp. Lo más cercano son piezas sueltas (optimizadores de ruta, seguimiento GPS, ERP genéricos). Brunen compite contra software de pago de USD 35 a USD 150 o más al mes, y contra el Excel.
- **Las 5 apuestas de mayor retorno:**
  1. Publicar lo que ya está construido (Zero Trust, Telegram, panel). Hoy los avisos urgentes no los ve nadie.
  2. Respaldos automáticos de la base y cumplimiento de la Ley 21.719.
  3. Mapa y ruta eficiente (en curso).
  4. Un corpus de mensajes reales para medir cuántos pedidos entiende el bot. Hoy tiene 2 casos.
  5. Cuadre de caja y estado de cuenta de las empresas, con datos que el panel del repartidor ya guarda.
- **Lo que no conviene hacer:** reemplazar esto por Odoo o ERPNext, geocodificar direcciones de clientes con servicios de terceros sin decidirlo, pagar por Time Travel de 30 días, ni prometer horas de llegada sin posición en vivo.

## 2. Métodos usados

| Método | Para qué se usó |
|---|---|
| Trabajos por hacer (JTBD) | Partir de los 3 dolores del dueño: anotar a mano, atender mensajes y ver al repartidor. |
| ISO/IEC 25010 | Calificar cada rama en funcionalidad, rendimiento, seguridad, fiabilidad, uso, mantenimiento y portabilidad. |
| Heurísticas de Nielsen y WCAG 2.2 | Revisar el uso del panel y la accesibilidad. |
| Guía de buenas prácticas de Workers | Auditar la configuración y el código contra la guía de Cloudflare. |
| Registro de riesgos | Probabilidad por impacto, con una respuesta para cada riesgo. |
| MoSCoW y puntaje valor/esfuerzo | Decidir qué se hace primero (sección 6). |
| Hoja de ruta Ahora, Después, Luego | Ordenar el trabajo en el tiempo (sección 7). |
| Definición de terminado | Ya existe en `CLAUDE.md`: funciona de punta a punta, tiene pruebas, registra errores y deja los documentos al día. |

## 3. Comparación con productos y proyectos parecidos

### Software de reparto de agua y de rutas (según las páginas de cada proveedor)

| Capacidad | Software comercial | Brunen hoy | Brecha |
|---|---|---|---|
| Pedidos recurrentes | Sí | Sí (pedidos fijos, D59) | Ninguna |
| Control de envases y depósitos | Sí | Parcial: guarda los vacíos retirados | Saldo por cliente (fase G) |
| App del conductor | Sí | Sí, y funciona sin señal | Ninguna |
| Orden de ruta | Sí | En construcción (D62) | Mapa y optimizador |
| Prueba de entrega con foto o firma | Sí | No: guarda hora, vacíos y cobro | Decisión de costo: las fotos no caben gratis |
| Aviso de hora de llegada al cliente | Sí | No | Posición en vivo y mensajes que cuestan |
| Portal o app para el cliente | Sí | WhatsApp, sin portal | No hace falta: el cliente ya usa WhatsApp |
| Cobro en línea | Sí | No | Comisión de 1 % o más: contradice el costo cero |
| Facturación | Sí | Manual, queda el número en el pedido | Ver rama de finanzas |
| Costo mensual | USD 35 a 150 o más | USD 0 | A favor de Brunen |

### Proyectos de código abierto

| Proyecto | Qué es | Licencia y estado | Sirve para Brunen |
|---|---|---|---|
| Fleetbase | Plataforma de logística completa | AGPL-3.0, activo | No: es grande, exige servidor propio y Brunen no necesita tanto |
| Traccar | Seguimiento GPS | Apache-2.0, activo | Idea para la fase E, pero necesita servidor |
| VROOM | Optimizador de rutas | BSD-2-Clause, activo | Como referencia del problema; ver D62 |
| OR-Tools, PyVRP, Timefold | Resolvedores de rutas | Apache-2.0 o MIT | Referencia: Brunen tiene 30 paradas como máximo y no justifica un resolvedor completo |
| OSRM, Valhalla, GraphHopper | Rutas por calle | BSD y Apache | Solo con servidor propio; no es gratis en Workers |
| ERPNext, Odoo, Dolibarr | ERP generales | GPL o similar, activos | No: D50 ya lo descartó |

## 4. Evaluación por rama

Calificación: 🟢 bien, 🟡 mejorable, 🔴 falta algo importante.

### A. Bot de WhatsApp 🟢
- Fuerte: una respuesta por pedido, escalamiento ante la duda, reconoce clientes por ficha, no se cae si Google falla, reintenta un envío fallido, responde 200 a Meta siempre.
- **A1 (Must).** El corpus de regresión tiene **2 casos** (`tests/mensajes.json`). Para llegar a "infalible", cada mensaje que el bot escala como "no entendido" se anota anonimizado, y se mide el porcentaje que entiende. Es la mejora que más sube la calidad.
- **A2 (Should).** Botones de respuesta en el mismo mensaje ("Sí, es esa dirección" o "Cambiar"). Es el mismo mensaje, así que no sube el costo, pero Meta cuenta los mensajes de servicio desde el 1 de octubre. Falta comprobar que el número compartido con la app acepta botones.
- **A3 (Could).** Los números de pedido salen de un hash de 32 bits (60 millones de combinaciones por día). Si dos pedidos chocaran, el segundo se descartaría sin aviso. La probabilidad es de una vez cada 100 años a 50 pedidos diarios, pero el arreglo es de 3 líneas.
- **A4 (Could).** `igualesTiempoConstante` sale antes si el largo difiere. La guía de Workers pide comparar la huella de ambos con `crypto.subtle.timingSafeEqual`.

### B. Datos y base 🟡
- Fuerte: migraciones numeradas, historial de cada pedido, punto de restauración antes de cada cambio, 6.795 pedidos del Excel listos para cargar.
- **B1 (Must).** Los respaldos semanales son manuales (D35). Time Travel guarda 7 días en el plan gratis (30 en el de pago). Se automatiza con una tarea programada del computador que exporte la base cada semana (gratis), o con R2 si se verifica que el plan gratis no exige tarjeta.
- **B2 (Should).** Las pruebas usan SQLite, no D1. Un conjunto corto de pruebas en el runtime real (`@cloudflare/vitest-pool-workers`) para las consultas críticas evita sorpresas de diferencias entre ambos.
- **B3 (Should).** Desde el 2026-09-01 D1 corta las consultas al pasar 100.000 escrituras al día. Cada índice cuenta como otra escritura. Conviene un aviso cuando el uso pase del 70 %.
- **B4 (Must antes del 1-dic).** Definir cuánto tiempo se guardan pedidos y fichas (Ley 21.719).

### C. Panel del administrador 🟡
- Fuerte: bandeja clara, estados con color, historial, búsqueda, dos pestañas nuevas (Clientes, Reparto) y avance en vivo de las entregas.
- **Corregido hoy:** en un celular de 375 px las 5 pestañas medían 506 px: "Avisos" y "Equipo" quedaban fuera de pantalla y la página se desbordaba. Ahora caben. Los botones y enlaces se agrandan a 44 px en pantallas táctiles (los enlaces de teléfono medían 23 px de alto).
- **C1 (Should).** "Nuevo pedido" tiene 20 campos y ocupa dos pantallas de celular. Una versión rápida (teléfono, cantidad y tamaño, dirección) con "más datos" plegado, y un cuadro para **pegar el mensaje del cliente** que rellena el formulario con el intérprete que ya existe. Ataca directo el dolor de anotar a mano.
- **C2 (Should).** Cuadre de caja diario: lo que el repartidor cobró contra lo que debía cobrar. Los datos ya se guardan.
- **C3 (Should).** Tablero simple con lo que el dueño pidió: bidones por día, semana y mes, y envases pendientes.
- **C4 (Should).** Aviso por Telegram de pedidos sin confirmar pasados 30 minutos en horario de atención.
- **C5 (Could).** Deshacer después de cancelar o confirmar por error.
- **C6 (Could).** El ingreso tiene dos títulos `h1`; el enlace "Volver" medía 21 px de alto.

### D. Panel del repartidor 🟢
- Fuerte: 27 controles, todos de 44 px o más; cola sin señal; no ve datos internos.
- **D1 (Should).** Mantener la pantalla encendida mientras la ruta está abierta (función "wake lock"). En iPhone hay que probarlo con la aplicación instalada.
- **D2 (Info).** iPhone no tiene sincronización en segundo plano. El diseño actual, que envía al abrir y al volver la señal, es el correcto.
- **D3 (Later).** Prueba de entrega con foto: no cabe en el plan gratis de forma razonable; la hora, los vacíos y el punto del teléfono cubren lo esencial.

### E. Ruta y mapa 🟡 (construida el 2026-11-14, D63; sin publicar)
- Hecho: orden más corto desde la planta y de vuelta, con recarga en la planta o en Actum; mapa en la pestaña Reparto; cambiar el orden a mano; pines a mano; publicar para el repartidor; Navegar a coordenadas; el GPS del repartidor ubica cada dirección al entregar.
- **E1 (Should).** Tiempos reales: hora de salida y minutos por parada del dueño (hoy son referenciales).
- **E2 (Could).** Distancias por calle (OpenRouteService, solo coordenadas) si la línea recta se queda corta (D62).

### F. Clientes y retención 🟢
- Fuerte: fichas con varios teléfonos, "Les toca pedir", pedidos fijos.
- **F1 (Should).** Saldo de envases por cliente (fase G).
- **F2 (Could).** Enlace de `wa.me` con el texto "lo de siempre" ya escrito, para compartirlo con los clientes frecuentes. Es gratis.

### G. Finanzas 🟡
- Fuerte: forma y estado de pago, boleta o factura, y ahora lo cobrado en la entrega.
- **G1 (Should).** Estado de cuenta mensual por empresa (hay unas 20 con plan mensual): sus pedidos, lo pagado y lo pendiente, en CSV. Sirve para facturar.
- **G2 (Info).** El SII ofrece un sistema de facturación gratuito, pero no se encontró una API pública para integrarlo. La emisión sigue siendo manual; el panel ya guarda el número.
- **G3 (Later).** Cobro en línea (Flow con Khipu cobra 0,99 % más IVA más $100 por transacción): contradice el costo cero y se evita por ahora. La conciliación de transferencias se mantiene manual con el comprobante.

### H. Seguridad y privacidad 🟡
- Fuerte: RUT y clave con bloqueo creciente, Access para el administrador, cookies HttpOnly y SameSite, política de contenido, teléfonos enmascarados en los registros.
- **H1 (Must).** Activar la detección de secretos y la protección al subir en el repositorio (gratis en repositorios públicos). Toma 5 minutos.
- **H2 (Must antes del 1-dic).** Ley 21.719: aviso de privacidad, registro de qué datos se tratan, plazos de conservación y una función para olvidar a un cliente que lo pida. Hay un proyecto de ley que posterga la vigencia a diciembre de 2027; mientras no se apruebe, rige el 1 de diciembre de 2026.
- **H3 (Should).** Dependabot y CodeQL en GitHub (gratis en público) y `npm audit` en cada subida.
- **H4 (Could).** Con 5 intentos fallidos se bloquea la cuenta del repartidor: alguien puede bloquearlo a propósito. Una alternativa es bloquear por dispositivo.
- **H5 (Could).** Documentar cómo cambiar `PANEL_SECRETO` (cambia todas las claves).

### I. Operación 🔴
- **I1 (Must).** Telegram sin configurar: las fallas y reclamos urgentes quedan solo en la base.
- **I2 (Should).** Resumen diario por Telegram: pedidos del día, sin confirmar, entregados, cobrado.
- **I3 (Should).** Guía de incidentes: qué hacer si vence el token de WhatsApp, si cae la base, si Meta cae.
- **I4 (Should).** Documentar el regreso a la versión anterior (`wrangler rollback`).
- **I5 (Could).** `/salud` solo responde "ok": no revisa la base.

### J. Calidad de ingeniería 🟢
- Fuerte: 1.341 pruebas, integración continua, decisiones numeradas con su porqué, cambios en commits pequeños.
- **J1 (Should).** Pruebas de punta a punta del panel (Playwright) en la integración continua.
- **J2 (Could).** Generar los tipos de las variables con `wrangler types` en vez de escribirlos a mano (la guía de Workers lo marca como mala práctica).
- **J3 (Could).** Subir la fecha de compatibilidad (2026-09-01) y correr las pruebas.
- **J4 (Could).** `panel/admin/app.js` tiene 1.500 líneas en un solo archivo; separarlo en módulos facilita el mantenimiento.

### K. Documentación y portafolio 🟡
- **K1 (Should).** El README gana con capturas del panel con datos ficticios, un diagrama de la arquitectura y las cifras (pruebas, CPU, costo cero). Es lo primero que ve quien lo revisa.
- **K2 (Could).** `SECURITY.md` y `CONTRIBUTING.md`; insignia de la integración continua.
- **K3 (Later).** Una demostración pública con datos de mentira.

### L. Costos 🟢
- Cero hoy. Vigilar: 1.000 mensajes de servicio al mes por número desde el 1 de octubre (peor caso, USD 6 al mes), 100.000 escrituras al día en la base y 10 ms de CPU por solicitud. En los datos de uso del 29 de octubre, el 99 % de las invocaciones gastó menos de 27 ms y no hubo errores.

### M. Producto a futuro 🟢
- **M1 (Later).** Ningún software barato reparte agua con pedidos por WhatsApp para una pyme latinoamericana. Brunen podría servir de base para otras distribuidoras. Requiere separar los datos por cliente y es una decisión de negocio del dueño, no de código.

## 5. Registro de riesgos

| # | Riesgo | Prob. | Impacto | Respuesta |
|---|---|---|---|---|
| R1 | La coexistencia del número de WhatsApp no se resuelve | Alta | Alto | Decidir entre un proveedor autorizado o ser Tech Provider; mientras, el bot queda en prueba (D45) |
| R2 | Sin Telegram ni panel, los avisos urgentes no los ve nadie | Alta | Alto | Publicar y configurar antes de abrir el bot a clientes |
| R3 | Pérdida de datos por una falla de la base | Baja | Alto | Respaldos automáticos (B1) y restauración probada |
| R4 | Una sola persona conoce el sistema | Media | Alto | Documentación ya extensa; falta una guía de incidentes (I3) y entrenar a Constanza |
| R5 | Cambios en precios o política de Meta | Media | Medio | Un mensaje por pedido; vigilar el uso |
| R6 | Ley 21.719 | Media | Medio | H2, antes de diciembre o de la nueva fecha |
| R7 | Se pasa del límite diario de escrituras de la base | Baja | Alto | Cargar el historial una sola vez; aviso de uso (B3) |
| R8 | Los mapas gratuitos cortan el servicio | Media | Bajo | La lista de paradas y la ruta funcionan sin mapa |
| R9 | Datos de clientes en servicios de terceros | Media | Alto | D32 y D62: las direcciones no salen; coordenadas aprendidas con el teléfono |
| R10 | El repartidor pierde o presta el teléfono | Media | Medio | "Cerrar sesiones" en Equipo; la clave se puede cambiar |

## 6. Mejoras priorizadas

Valor y esfuerzo de 1 a 5. Orden: Must, luego valor alto con esfuerzo bajo.

| ID | Mejora | Valor | Esfuerzo | MoSCoW |
|---|---|---|---|---|
| I1 | Telegram configurado | 5 | 1 | Must |
| H1 | Detección de secretos en GitHub | 4 | 1 | Must |
| B1 | Respaldos automáticos de la base | 5 | 2 | Must |
| A1 | Corpus de mensajes reales y medición | 5 | 2 | Must |
| H2/B4 | Ley 21.719 y plazos de conservación | 4 | 3 | Must |
| E | Mapa y ruta eficiente | 5 | 4 | Must |
| C1 | Nuevo pedido rápido y pegar mensaje | 5 | 3 | Should |
| C2 | Cuadre de caja | 4 | 2 | Should |
| D1 | Pantalla encendida en la ruta | 3 | 1 | Should |
| I2 | Resumen diario por Telegram | 4 | 2 | Should |
| G1 | Estado de cuenta por empresa | 4 | 3 | Should |
| C3 | Tablero de bidones | 4 | 3 | Should |
| C4 | Aviso de pedidos sin confirmar | 3 | 2 | Should |
| I3/I4 | Guía de incidentes y reversa | 3 | 2 | Should |
| B2 | Pruebas en el runtime real de D1 | 3 | 3 | Should |
| J1 | Pruebas de punta a punta | 3 | 3 | Should |
| H3 | Dependabot, CodeQL, npm audit | 3 | 1 | Should |
| K1 | README con capturas y diagrama | 3 | 2 | Should |
| A2 | Botones de respuesta | 3 | 3 | Should |
| F1 | Saldo de envases (fase G) | 4 | 4 | Should |
| A3, A4, B3, C5, C6, F2, H4, H5, I5, J2 a J4, K2 | Mejoras menores | 1 a 2 | 1 a 3 | Could |
| D3, G3, K3, M1 | Fotos de entrega, cobro en línea, demostración, producto | 2 a 3 | 4 a 5 | Later |

## 7. Hoja de ruta

- **Ahora (esta semana):** Zero Trust, Telegram, panel publicado, historial cargado, H1, B1.
- **Siguiente (2 a 4 semanas):** mapa y ruta, A1, C1, C2, D1, I2, H3.
- **Después (1 a 3 meses):** G1, C3, F1 (fase G), A2, J1, B2, K1, ley de datos si se aprueba.
- **Luego:** posición en vivo (fase E) con consentimiento del repartidor, hora de llegada para el cliente, producto para otras distribuidoras.

## 8. Fuentes

- Meta, precios: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Cloudflare, Time Travel de D1 (7 días gratis, 30 de pago): https://developers.cloudflare.com/d1/reference/time-travel/
- Cloudflare, precios de D1: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare, guía de buenas prácticas de Workers: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- Software de reparto de agua, según sus páginas: https://www.shipday.com/post/8-best-delivery-software-for-water-delivery-in-2026-ranked-for-independent-water-delivery-operators, https://rekart.io/?p=25944
- Precios de optimizadores de ruta (blogs de comparación): https://smartroutes.io/blogs/route-optimization-software-cost/
- Flow y Khipu, tarifas: https://web.flow.cl/en-cl/preguntas-frecuentes/khipu/
- SII, sistema de facturación gratuito: https://www.sii.cl/preguntas_frecuentes/factura_electronica/001_003_8873.htm
- LibreDTE (AGPL-3.0, exige publicar el código): https://www.libredte.cl/academy/integration/guide/general-integration-flow
- Ley 21.719, vigencia y proyecto de postergación: https://www.diarioconstitucional.cl/2026/06/12/la-ley-21-719-entra-en-vigor-el-1-de-diciembre-y-expone-vacios-en-regulacion-de-pequenas-empresas/
- Sincronización en segundo plano en iPhone: https://developer.apple.com/forums/thread/694805 y https://bugs.webkit.org/show_bug.cgi?id=201866
- Wake lock: https://web.dev/blog/screen-wake-lock-supported-in-all-browsers
- OpenRouteService, planes y términos: https://account.heigit.org/info/plans y https://account.heigit.org/info/tos
- Repositorios revisados: Fleetbase, Traccar, VROOM, OR-Tools, PyVRP, Timefold, OSRM, Valhalla, GraphHopper, ERPNext, Odoo, Dolibarr (licencias y actividad consultadas en GitHub el 2026-11-13).
