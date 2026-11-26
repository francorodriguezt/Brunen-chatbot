# Análisis del Prompt Maestro BRUNEN ERP 2.7

Fecha: 2026-11-25. Paquete revisado: `BRUNEN_ERP_PROMPT_MAESTRO_2_7_COMPLETO.zip`.

**Qué se revisó:** el prompt maestro (secciones 0 a 33 y directivas finales), las dos auditorías, los archivos de portada, las 6 maquetas y los hashes del manifiesto (coinciden). El Anexo A es [PROMPT_PROYECTO.md](PROMPT_PROYECTO.md) con 2 líneas cambiadas. Lo que el prompt afirma se cotejó con el código y las migraciones, que su autor declara no haber visto.

**Qué no se revisó:** la base real, Cloudflare ni un teléfono. No se cambió código.

## 1. Veredicto

Es un buen documento de **principios** y un mal **plan de trabajo**. Sus reglas sobre dinero, inventario, honestidad de los datos y permisos valen la pena y conviene adoptarlas. Pero describe un sistema bastante más grande de lo que necesita una empresa con un furgón y tres usuarios, repite tres veces la misma información y se equivoca en algunos hechos porque su autor no vio el código.

Recomendación: **no pegarlo entero como instrucción**. Tomar sus reglas, resumirlas en el repositorio y construir según la necesidad del negocio.

## 2. Dos cosas que hay que corregir ya

> **Las dos quedaron corregidas el 2026-11-25** (D82 y D84), con pruebas, y publicadas el mismo día.

### 2.1 La app del repartidor puede perder una entrega y decir que la anotó

El prompt insiste en que los reintentos y el trabajo sin señal sean seguros. Al revisarlo apareció esto en `panel/repartidor/app.js` (función `enviar`):

- La app guarda cada "Entregado" o "No se pudo" en una cola del teléfono.
- Si el servidor responde **cualquier error** que no sea 401 (por ejemplo 500 o 503), la acción **se borra de la cola** y no se reintenta.
- Como ya no está en la cola, el último aviso que ve el repartidor es **"Entrega anotada."**

Reproducido con un servidor simulado: con 500, 503, 404 y 409 quedan 0 acciones en la cola. Solo se reintenta cuando no hay señal. Las pruebas del repositorio no ejercitan esta función. El código no cambió desde la publicación. Según los documentos todavía no hay cuenta de repartidor en la base real, así que no debería haber datos perdidos.

Relacionado, visto en el código pero no simulado:

- "Salir" borra la cola aunque tenga entregas sin enviar.
- Una entrega hecha sin señal y enviada al día siguiente se rechaza (`no_es_de_hoy`) y se descarta.
- La hora de entrega que se guarda es la de llegada al servidor, no la del teléfono.

Arreglo propuesto: reintentar ante errores 5xx y 429; ante un rechazo definitivo, dejarlo visible en la parada con su motivo; no decir "anotada" si el servidor no lo confirmó; avisar antes de "Salir" con pendientes.

### 2.2 La fecha de la Ley 21.719 cambió y el repositorio no lo sabe

El prompt tiene razón. La [Ley 21.855](https://www.bcn.cl/leychile/navegar?idNorma=1230520) (publicada el 2026-11-23) mueve la entrada en vigor al **15 de octubre de 2027**. Siguen diciendo 1-dic-2026: `conocimiento_brunen.md` §14, `PASOS_FRANCO.md`, `PENDIENTES.md` y `ANALISIS_Y_MEJORAS.md`. Falta una decisión nueva en `DECISIONES.md`.

El aviso de privacidad sigue pendiente; solo deja de ser urgente por calendario.

## 3. Lo bueno: adoptarlo

| Idea | Hoy en el proyecto | Qué haría |
|---|---|---|
| Venta, cobro, caja y utilidad son cosas distintas | El pedido tiene `estado_pago` = pendiente o pagado | Es la mejor idea del documento. Separar "cobrado en terreno" de "verificado" |
| Envases como libro de movimientos que no se borran | Vacíos por pedido y una cuenta de faltantes | Sí, cuando estén la regla de propiedad y el saldo inicial |
| Producto lleno distinto de envase retornable | No existe inventario | Sí, junto con lo anterior |
| Cada acción del repartidor con un ID estable; repetirla no duplica | Se identifica por pedido y tipo; repetir "entregado" casi no duplica, salvo el historial | Hacerlo junto con el arreglo de 2.1 |
| Congelar los viajes al publicar la ruta | Solo se guarda el orden; los viajes se recalculan | Sí, es un pendiente ya conocido (D80) |
| No mostrar módulos sin terminar ni cifras inventadas | Se cumple | Mantener como regla |
| Etiquetas de certeza (verificado, parcial, propuesto, pendiente) | No se usan | Usarlas en `ETAPAS.md` y `PENDIENTES.md` |
| Bandeja de trabajo con antigüedad, responsable y siguiente acción | Hay avisos y pantalla "Hoy" (D70) | Agregar antigüedad y siguiente acción; responsable no hace falta aún |
| "Actualizado a las HH:MM" visible en cada vista | Solo en el seguimiento | Barato y útil |
| Lista de 12 condiciones antes de abrir a clientes reales | Repartida en varios documentos | Convertirla en una sola lista marcable |
| Costo $0 con un procedimiento para pedir excepciones | Regla ya vigente | Mantener |
| No reescribir ni cambiar de tecnología sin evidencia | Regla ya vigente | Mantener |
| Definir cada indicador con numerador y denominador | No hay indicadores financieros | Solo cuando existan |

## 4. Lo mejorable

- **Tamaño.** Son unas 36.000 palabras: 12.000 de instrucciones, 5.800 de la sección 30, 8.500 de las secciones 31 a 33 y 9.300 del Anexo A. La sección 30 vuelve a contar el anexo. Un modelo gasta mucho contexto y es fácil que siga la versión vieja de algo. Con 2.000 a 3.000 palabras de reglas y el repositorio como fuente se logra más.
- **Tres hojas de ruta** (§26, §30.14 y §31.11). Debe haber una sola.
- **Siempre parte con una auditoría completa** (§29). Pegado en cada sesión, reharía la Fase 0 una y otra vez.
- **Faltan los dolores del dueño.** En `conocimiento_brunen.md` §13 son: dejar de cargar a mano, tener la lista del día copiable y responder rápido. Fuera del anexo, el prompt no los usa, y son el criterio para ordenar todo lo demás.
- **No hay cómo saber si sirvió.** Ni medición de partida (cuánto tarda hoy el proceso), ni metas, ni estimación de esfuerzo.
- **No ve parte de lo construido:** cierre del día con efectivo y vacíos (D64), bidones por día, semana y mes y vacíos por retirar (D65), "lo de siempre" (D69), pedido rápido y mensaje por parada (D64). Pone el "cierre de jornada" en la Fase 7.
- **Trata como pendiente algo hecho:** cada pedido ya guarda precio por línea, total, dirección y comuna de ese momento (§9.1 y §31.8).

## 5. Lo que no me gusta o no comparto

> **Decisión de Franco (2026-11-25, D83):** él decide el proyecto, y los asistentes de IA, los roles, el panel de análisis y las finanzas son su meta de largo plazo; la flota no hace falta. Queda aceptado. Lo que sigue ya no es una objeción: son advertencias para construirlo por etapas, cada una útil sola y con alguien que alimente los datos (los gastos los llevan Felipe y Constanza). El plan está en [MEJORAS.md](MEJORAS.md) §7.

1. **"Finanzas completas" como decisión cerrada.** El dueño dijo el 2026-10-29 qué quería ver en el panel y **no pidió ventas en pesos**. Cuentas por pagar, libro mayor, presupuestos y rentabilidad exigen que alguien ingrese costos a diario. Si nadie lo hace, el módulo queda vacío o muestra cifras engañosas. Antes de aceptarlo hay que saber quién lo pidió. Alternativa: primero cobros pendientes y conciliación del día; gastos simples después.
2. **Siete agentes de IA y una "memoria empresarial".** Para este tamaño, unas consultas y alertas hechas con código dan casi lo mismo, sin enviar datos a un modelo ni gastar cuota. La memoria ya existe: es la carpeta `docs/`.
3. **Seis roles de usuario.** Hay dos (administrador y repartidor) y alcanzan.
4. **Preparar flota.** Con un vehículo, basta con no impedirlo. No crearía tablas de vehículos todavía.
5. **Business Intelligence con 8 filtros transversales.** No hay volumen ni costos que lo justifiquen.
6. **Rutas versionadas con acuse y aceptación del repartidor.** Con un repartidor basta congelar los viajes y avisar "la ruta cambió, actualiza".
7. **El costo escondido del alcance.** El plan gratis da 10 ms de CPU y el bot ya tuvo mensajes sobre ese tiempo (26,7 ms en el 1 % más lento, sin cortes, según `DECISIONES.md`). Cada módulo nuevo hay que medirlo.
8. **Una sola persona mantiene todo.** Más módulos significan más cosas que pueden fallar un día de reparto.

## 6. Errores y contradicciones del paquete

| Qué dice | Qué pasa en realidad |
|---|---|
| No consta cola sin señal para entregas y cobros; solo para GPS (2.7, §32.4, §33.2, §33.5) | **Falso.** La cola existe y la app lo dice en pantalla. Es el "hallazgo de precisión" de la versión 2.7, y está al revés (su defecto real es el de 2.1) |
| El Anexo A conserva la fuente "sin modificaciones" (§3.1, §30.10, §32.2) | **Falso.** Se cambiaron 2 líneas (las de la fecha legal) |
| §6.3, §12, §31.5, §31.10 y el esquema de §31.3 incluyen "entrega parcial" | §31.3 (punto 6) y §33 dicen que no se diseñe. El servidor no la soporta |
| El repartidor registra cantidades por tamaño, vacíos extra aparte y monto y método de cobro (§6.3, §31.3) | El servidor recibe solo `vacios` y `cobrado` (sí o no, por el total) |
| §30.15: no publicar el nombre de la operadora | El propio prompt lo usa varias veces |
| Posible duplicidad de precios | Confirmada y ya conocida (D71): el bot usa la hoja PRECIOS y el panel sugiere con la tabla del código; una revisión diaria avisa si difieren |
| Dos conteos de archivos de prueba sin explicar (61 y 57) | Resuelto: 57 archivos de prueba más 4 de apoyo; pasaban 1.523 pruebas. Tras D84: 1.558 en 58 archivos |
| `/salud` no revisa la base; no hay `SECURITY.md`; `CLAUDE.md` está atrasado | Las tres son ciertas |

## 7. Las maquetas

**Sirven:** la paleta y la jerarquía; la "Bandeja de trabajo" con la siguiente acción; los "Controles de publicación" de la ruta; separar lo real de lo estimado.

**No sirven tal cual:**

- **Tienen errores de dibujo que su propia auditoría no vio** (las declara legibles y coherentes): filas que se salen de la tarjeta en 01, 02, 05 y 06, una línea suelta en 03 y, en 04, la tarjeta de reglas tapa la tabla de conciliación.
- Casi todo son guiones: no prueban cómo se ve con 30 paradas o 600 clientes.
- Ponen documentación dentro de la pantalla ("Reglas de trazabilidad", "Reglas de interpretación") y jerga ("Conteo del día · D1").
- Menú de 11 entradas, 3 de módulos que no existen. "Nuevo pedido" debería ser un botón.
- Columna "Teléfonos" en el listado general, y "Cobros recibidos" con el subtítulo "Pagos conciliados" (esto sí lo detecta su auditoría).
- Solo hay escritorio. Faltan las de teléfono, que son las que más importan: dueño y operadora usan iPhone y el repartidor Android.

Para el celular no generaría imágenes nuevas: capturaría la app real con datos ficticios y la mejoraría sobre eso.

## 8. Orden que propongo

1. ~~**Arreglar la cola del repartidor** (2.1), con pruebas~~. Hecho y publicado (D84).
2. ~~**Corregir la fecha legal** en los documentos (2.2)~~. Hecho (D82).
3. **Salir a la operación real:** cuenta del panel, repartidor probando en su teléfono, un día de prueba, número de WhatsApp. Sin uso real no se sabe qué falta.
4. **Congelar los viajes al publicar** y cerrar lo demás de D80.
5. **Cobros:** estados "cobrado" y "verificado", pago parcial, pendientes por cliente.
6. **Envases:** libro de movimientos, cuando esté la regla.
7. **Finanzas y reportes:** solo lo que el dueño confirme.
8. Agentes, portal y flota: no planificarlos todavía.

## 9. Información que falta

> **Respondido por Franco el 2026-11-25 (D83):** él decide el proyecto (finanzas incluidas, como meta); la contabilidad y los gastos los llevan Felipe con Constanza; los envases son de Brunen y la carga inicial es venta; el sistema lo mantienen en el día a día Felipe y Constanza, y Franco lo desarrolla. Lo demás sigue abierto.

**Del dueño (las que cambian el plan):**

1. ¿Pidió finanzas completas? ¿Qué decisión quiere tomar con ellas?
2. ¿Quién lleva hoy la contabilidad, cómo emite boletas y facturas, y quién anotaría los gastos?
3. ¿Qué costos conoce (agua, insumos, combustible, sueldos) y con qué respaldo?
4. El envase, ¿es de Brunen o del cliente? La carga inicial, ¿es venta o garantía?
5. ¿Qué condiciones tienen las empresas con plan mensual?
6. Número de WhatsApp: ¿proveedor autorizado o Tech Provider propio, y cuánto acepta pagar?
7. ¿Cuántos bidones de cada tamaño caben en el furgón?
8. Carga inicial de 10 L, precios especiales en 12 y 10 L, y si sigue la entrega el mismo día antes de las 9:00.
9. ¿Cuánto tiempo guardar pedidos, fichas y comprobantes?

**De la operadora:** qué controlan las hojas CONTROL EFECTIVO, CONTROL BIDONES, CUOTAS y DETALLE HOTEL; qué significan "plan", "abono", "debe" y `Credito`; cuánto tiempo le toma hoy el día.

**Del repartidor:** ¿probó la app en su teléfono? ¿El teléfono es suyo? ¿Hay zonas sin señal? ¿Entrega a veces menos de lo pedido? (decide si la entrega parcial hace falta).

**De Franco:** ¿cuántas horas por semana y hasta cuándo? ¿Quién mantiene el sistema si no está? ¿Quién armó el paquete y con qué información además de los expedientes?
