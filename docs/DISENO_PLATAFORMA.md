# Diseño: plataforma de Brunen (administración y reparto)

Estado: **propuesta, pendiente de la aprobación de Franco** (2026-11-11). No se construye nada de esto hasta que la apruebe. Decisión de origen: D49.

## Para qué

Tres dolores, en palabras de Franco:

1. Anotar todo a mano en los Excel (el histórico, el que se sube a la plataforma de rutas, el Word).
2. Los mensajes de pedidos que la operadora atiende uno por uno y va pasando al Excel.
3. Que el dueño pueda ver al repartidor en tiempo real, en la medida que se pueda.

El resultado buscado: dejar los Excel y dejar la plataforma de rutas que se paga hoy.

## Qué es

Una sola aplicación web, instalable en el celular como una app (sin tiendas de aplicaciones), con dos entradas:

- **Administrador**: la operadora, el dueño y Franco. Pedidos, clientes, ruta del día, avance del reparto y avisos.
- **Repartidor**: la ruta de hoy, parada por parada.

La referencia de uso es un sistema que Franco usa en otro trabajo: portada con dos entradas, pestañas arriba, una franja con "lo próximo", tarjetas con una etiqueta de estado y botones grandes.

No es un sistema nuevo: es el panel que ya existe (`src/panel/`, `panel/`), que hoy tiene Pedidos, Reparto y Avisos, más lo que falta.

## Esto es un ERP pequeño, hecho a medida (D50)

Un ERP ("planificación de recursos de la empresa") es un sistema donde cada área del negocio es un módulo y todos los módulos leen y escriben en una misma base de datos, de modo que un dato se anota una sola vez y queda disponible para los demás. Lo que se está planeando ya tiene esa forma.

| Idea de un ERP | Cómo queda aquí |
|---|---|
| Una sola base de datos | D1: el bot, el panel del administrador y el del repartidor leen lo mismo |
| Módulos por área | Pedidos (ventas), Clientes, Ruta (reparto), Pagos (cobranza), Envases (inventario) |
| Datos maestros | Clientes, productos y precios en un solo lugar, no repetidos en cada pedido |
| Roles y permisos | Administrador y repartidor; cada uno ve solo lo suyo |
| Rastro de cambios | Quién cambió qué y cuándo (ya existe para los pedidos) |

Lo que este enfoque agrega al plan: tratar los **envases y bidones como un inventario** (lo que sale de la planta, lo que sobra, los vacíos que debe cada cliente) y la **cobranza del día** (lo que el repartidor debía cobrar contra lo que cobró). El dueño ya había pedido ambas cosas; quedan como fase G.

Lo que no se toma: contabilidad, remuneraciones, compras y facturación electrónica. Para un negocio de tres personas sería más sistema que negocio.

Por qué no instalar un ERP existente: los gratuitos no lo son para este caso (uno ofrece gratis una sola aplicación y sin código propio; otro es de código abierto pero necesita un servidor propio o un hospedaje de pago), ninguno trae el bot de WhatsApp ni el reparto de bidones retornables, y habría que adaptar el negocio al programa. Fuentes en D50.

## Metas, no metas y lo que sería un fracaso

- **Metas**: que un pedido se escriba una sola vez (lo anota el bot o una persona en el panel) y de ahí salga todo lo demás; que el repartidor no dependa de mensajes escritos a mano; que el dueño vea el avance del reparto sin preguntar.
- **No metas por ahora**: reportes y estadísticas, cierre de caja, hora de llegada exacta para el cliente, notificaciones al celular, facturación.
- **Sería un fracaso**: que el dueño pierda de vista al repartidor al dejar la plataforma actual; que el sistema nuevo obligue a digitar dos veces; que cueste dinero al mes; que un dato de un cliente quede expuesto.

## Restricciones

- Costo: USD 0 al mes. Cloudflare Workers y D1 en su plan gratis; sin tiendas de aplicaciones; sin servicios de mapas de pago.
- El repositorio es público: ningún dato real de clientes ni de personas.
- El panel no se publica sin Cloudflare Access (D34): falla cerrado.
- Una página web instalada no garantiza enviar la ubicación con la pantalla bloqueada. No se promete seguimiento continuo.
- 10 ms de CPU por invocación en el plan gratis: los cálculos pesados (ordenar la ruta, leer un Excel) se hacen en el navegador, no en el Worker.

## Cómo entra cada persona

Cloudflare Access pide el correo y manda un código de un solo uso; el Worker ya valida ese acceso (`src/panel/acceso.ts`). Lo nuevo:

- Cada correo tiene un rol: `administrador` o `repartidor`. Los correos van en secretos de Cloudflare, no en el repositorio.
- El Worker decide qué puede pedir cada rol. El repartidor solo puede leer la ruta publicada de hoy y marcar sus paradas; no ve otros días, ni la lista de clientes, ni los avisos.
- Un administrador puede abrir la entrada del repartidor para ver lo mismo que ve él.

## Panel del administrador

| Pestaña | Qué hace | Estado |
|---|---|---|
| Pedidos | Por confirmar, confirmar, cambiar, cancelar, anotar a mano, buscar | Existe. Falta: forma de pago, estado del pago, si pide factura y tipo de cliente |
| Clientes | Ficha de cada cliente, sus pedidos y sus direcciones anteriores | Nueva |
| Ruta | Las paradas del día en orden, la carga del furgón contra su capacidad, mover una parada, publicar la ruta, y ver el avance en vivo | Existe la lista por comuna (pestaña Reparto). Falta lo demás |
| Avisos | Lo que una persona tiene que revisar | Existe |

## Panel del repartidor

- Arriba: "Ruta de hoy: N paradas, M bidones", con la carga por tamaño que hay que sacar de la planta.
- Botones "Iniciar ruta" y "Terminar jornada".
- Una tarjeta por parada, en orden, con lo mismo que hoy se le escribe a mano:
  nombre y tipo de cliente; dirección y comuna; teléfono; pedido ("15 de 20 L"); forma de pago y, si es efectivo, el monto a cobrar; envases por retirar; notas (edificio, "llamar al llegar").
- Cuatro botones por tarjeta: **Navegar** (abre Google Maps o Waze con la dirección; es un enlace, no usa un servicio de pago), **Llamar**, **Entregado** (pregunta cuántos vacíos retiró y si cobró) y **No se pudo** (pide el motivo).
- Si no hay señal, lo marcado se guarda en el teléfono y se envía solo cuando vuelve.

## Seguimiento del repartidor

Tres niveles, del seguro al incierto:

1. **Avance por paradas (seguro)**: cada "Entregado" llega al panel del administrador al instante, con la hora. "8 de 18 entregadas; la última a las 12:41".
2. **Posición mientras la página está abierta (probable)**: entre "Iniciar ruta" y "Terminar jornada" el teléfono envía su posición cada cierto tiempo. El administrador ve la última posición, su hora y un enlace que la abre en el mapa. Si pasan varios minutos sin posición, lo dice.
3. **Posición con la pantalla bloqueada (por probar)**: se prueba un día con el teléfono real. Si la página no alcanza, hay una aplicación gratuita y de código abierto que envía la posición en segundo plano a un servidor propio. Si tampoco sirve, queda compartir la ubicación desde Google Maps, sin desarrollo.

Cuidado con la persona: la posición se registra solo durante la jornada, la ven solo los administradores, se borra a los pocos días y el repartidor debe estar informado por escrito. Hay que revisarlo con alguien que sepa de derecho laboral.

## Orden de la ruta (lo que hoy hace la plataforma de pago)

- **Primera versión**: orden por comuna y dirección (ya existe), más mover paradas a mano.
- **Segunda versión**: cada vez que el repartidor marca una entrega, se guarda el punto exacto donde estaba. Con el tiempo cada dirección tiene su punto, sin enviar direcciones a ningún servicio externo. Con esos puntos el navegador calcula un orden que acorta el recorrido, partiendo y terminando en la planta.
- Para las direcciones nuevas haría falta un servicio que convierta dirección en punto. Los gratuitos tienen límites y no se ha verificado qué tan bien reconocen direcciones de Santiago. Es una excepción a D32 (las direcciones no salen de Brunen) que decide Franco.
- Será peor que la plataforma actual al principio: no conoce el tráfico. Por eso no se cancela la plataforma hasta comparar las dos.

## Datos nuevos (migraciones de D1)

- `pedidos`: forma de pago, estado del pago, si pide factura, tipo de cliente.
- `clientes`, `telefonos_cliente`, `direcciones` (con el punto del mapa cuando se conoce y la última vez que se usó). El historial no se pisa: un pedido guarda la dirección con la que se hizo.
- `rutas` (una por día: borrador, publicada, en curso, terminada) y `paradas` (pedido, orden, estado, hora de entrega, vacíos retirados, cobrado, motivo si no se pudo).
- `posiciones` (hora, punto, precisión), que la tarea programada borra pasados unos días.

Los clientes viven hoy en una hoja de Google. Pasarlos a D1 es el cambio más delicado, porque el bot los lee de ahí para calcular precios: se hace con la hoja como respaldo y con una comparación antes de cambiar.

## Fases

Cada una se puede probar sola y deja algo usable.

| Fase | Qué queda funcionando | Depende de |
|---|---|---|
| A. App con dos entradas | Portada, roles por correo, instalable en el celular | Nada para construir; Zero Trust para publicar |
| B. Sin Excel | Pedidos con pago, factura y tipo de cliente; clientes con historial de direcciones; carga del Excel histórico | El Excel histórico (anonimizado) para la carga |
| C. Ruta del día | Ordenar, mover paradas, aviso sobre la capacidad del furgón, publicar | B |
| D. Panel del repartidor | Tarjetas, navegar, llamar, entregado, no se pudo; avance en vivo para el administrador | C |
| E. Posición en vivo | Última posición y aviso si se pierde; prueba con el teléfono real | D |
| F. Ruta eficiente y fin de la plataforma de pago | Puntos aprendidos de las entregas, orden calculado, dos semanas en paralelo y cancelación | E y la decisión sobre direcciones nuevas |
| G. Envases y caja del día | Bidones que salen y sobran, vacíos que debe cada cliente, y lo cobrado contra lo que había que cobrar | D |

Durante el paralelo de la fase F, el panel puede generar el archivo que hoy se sube a la plataforma, para no digitar dos veces. Para eso sirve su plantilla de importación.

## Riesgos

- **El número de WhatsApp sigue sin conectar** (D45). Mientras no se resuelva, el bot no atiende clientes reales y el dolor 2 sigue igual, aunque el panel esté listo.
- **Posición con pantalla bloqueada**: puede no funcionar en el teléfono del repartidor. Mitigación: los tres niveles de arriba.
- **Acceso desde una app instalada**: hay que comprobar que el ingreso con código por correo funcione bien dentro de la app instalada y cada cuánto vuelve a pedirlo.
- **Calidad de la ruta** frente a la plataforma actual.
- **Carga del historial**: clientes duplicados o escritos de varias formas. Se hace primero una simulación que no escribe nada.

## Lo que decide Franco

1. Si aprueba este diseño y el orden de las fases.
2. Si las direcciones nuevas pueden enviarse a un servicio externo para ubicarlas en el mapa (solo calle, número y comuna).
3. Cuántos días se guardan las posiciones del repartidor.

## Lo que falta preguntar al dueño y a la operadora

1. Celular del repartidor: Android o iPhone; propio o de la empresa; si tiene datos móviles en la ruta; y un correo para su acceso.
2. Si el repartidor está de acuerdo con registrar su ubicación durante la jornada.
3. Si sigue existiendo la entrega el mismo día para pedidos antes de las 9:00.
4. Carga inicial de 10 L: $4.000 o $4.500.
5. Si todo minimarket paga precio mayorista.
6. Con más de 65 bidones: si se recarga a mitad de ruta o se parte desde la segunda planta.
7. Cuántos bidones de 10 y de 12 L caben en el furgón.
8. Dónde se anotan hoy los envases vacíos por retirar.
9. Cuánto tiempo al día toma hoy todo el proceso (para medir el ahorro).

Archivos: el Excel histórico de pedidos (necesario), una ruta exportada de la plataforma actual (para comparar) y su plantilla de importación (para el paralelo).
