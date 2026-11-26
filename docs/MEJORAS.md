# Mejoras por aplicar

Lista de trabajo acordada con Franco el 2026-11-17, a partir del análisis del proyecto
([ANALISIS_Y_MEJORAS.md](ANALISIS_Y_MEJORAS.md)) y de SpotGo (https://spotgo.cl/). Orden de trabajo: **ruta, bot,
panel**. **(Dueño)** = necesita su decisión o tiene costo. Al terminar una, se marca y se anota su decisión en
[DECISIONES.md](DECISIONES.md).

## 1. Ruta y mapa (prioridad de Franco)
- [x] Botón "Ruta en Google Maps" por carga: todas las paradas en orden, en tramos si son muchas.
- [x] La app del repartidor dice dónde recargar (planta o Actum) según la ruta, no siempre "Actum".
- [x] Cuántos bidones de cada tamaño cargar en cada viaje.
- [x] Que las cargas del mapa y de la lista coincidan: arman los viajes igual; el mapa dice "lo que queda" y la lista dice si va en el orden publicado o por comuna. (D73)
- [ ] Elegir en conjunto dónde cortar cada viaje y dónde recargar (no viaje por viaje). Antes hay que guardar los cortes al publicar la ruta: si no, la lista y la app del repartidor (que no tienen coordenadas) cortarían distinto que el mapa.
- [x] Aprender el tiempo en cada parada con la hora de cada entrega (D80). Falta: el tiempo entre paradas por zona y hora.
- [x] Recalcular desde donde está el repartidor (su última posición o su última entrega, D80).
- [ ] Horarios de clientes ("solo en la tarde") como condición de la ruta.
- [ ] Distancia real de calle (Mapbox, solo coordenadas). Decide Franco (zona gris, D62).
- [ ] Datos del dueño: hora de salida, minutos por parada, bidones de cada tamaño por viaje. **(Dueño)**

## 2. Bot de WhatsApp
- [x] Comprobantes: la foto que manda el cliente llega a Telegram para revisarla (y queda el aviso en el panel).
- [x] Audios: transcribirlos y mostrar el texto en el aviso. El bot sigue sin responder audios (regla del dueño).
- [x] Ubicación que manda el cliente por WhatsApp: se guarda como el punto exacto de su dirección. (D77)
- [x] "Hola, quiero pedir" de un cliente conocido: ofrecerle "lo de siempre" con su detalle.
- [x] Responder "¿cuándo llega?" con el estado del pedido y, con la ruta publicada, cuántas entregas quedan antes. (D78)
- [x] Detectar pedidos repetidos (mismo cliente, mismo día). (D76)
- [x] Días sin reparto con su motivo (no solo feriados), dicho al cliente. (D74)
- [ ] Promociones con fechas que el bot cotiza solo. **(Dueño: precios y condiciones)**
- [ ] Recordatorio a los clientes frecuentes que les toca pedir: pagado (plantilla de Meta) o gratis desde la lista del panel. **(Dueño)**
- [ ] Sumar a las pruebas cada mensaje real mal entendido y medir el acierto.

## 3. Panel (más intuitivo; con el plugin impeccable)
- [x] Pantalla "Hoy": qué hay que hacer ahora (por confirmar, avisos, reparto, a quién le toca pedir). (D70)
- [x] Confirmar varios pedidos de una vez, y "Deshacer" unos segundos después. (D70)
- [x] "Nuevo pedido" más corto: pegar el mensaje primero; pago y factura plegados. (D70)
- [x] Tarjetas cortas en "Por confirmar", letra de 16 px en los campos (el iPhone no hace zoom), contraste y toques de 44 px. (D70, encontrado en la revisión)
- [x] **Precio sugerido**: al pegar "3 de 20" o completar el precio, un botón "Lista: $3.300" lo llena; minimarket y empresa siguen a mano. (D71)
- [x] El tipo de cliente se llena solo al reconocer el teléfono (de su ficha o su último pedido). (D71)
- [ ] Llenar los envases por retirar al reconocer al cliente. Falta la regla: ¿se retiran tantos vacíos como bidones entrega, o lo que dice su ficha? **(Dueño)**
- [x] Borrador del pedido nuevo mientras la pestaña esté abierta. (D73)
- [x] Reparto: "viaje" en la lista y en el mapa, y el mapa dice "lo que queda" cuando ya hay entregas. (D73) Que los dos usen exactamente los mismos viajes queda en la sección 1 (ruta).
- [x] Reparto: "Copiar mensaje" es el botón principal de cada parada. (D73)
- [x] "Sin nombre" en Pedidos y en Clientes. (D73)
- [x] Vacíos esperados = uno por bidón más los que debía; el cierre compara lo retirado con lo ya entregado. (D72)
- [x] Filtros de pedidos en una fila en el celular; dos columnas de pedidos en el computador. (D73)
- [ ] Avisos en el iPhone con la app cerrada (instalada en la pantalla de inicio).
- [x] Días sin reparto: el panel los marca con un motivo y el bot los salta y lo explica. (D74)
- [ ] Promociones desde el panel (qué ofrecer y a quién lo decide el dueño). **(Dueño)**
- [x] Clientes por comuna y en el mapa. (D75)
- [ ] Probarlo con la operadora en una tarea real.

## 4. App del repartidor (Android)
- [x] Posición en vivo para el mapa (fase E) y hora de llegada por eventos, sin otra app (D80). El repartidor da su consentimiento (Franco, 2026-11-18; ya comparte su ubicación cuando trabaja): se registra en su app con fecha, solo durante el turno. Con ella, la hora de llegada al cliente: solo cuando el repartidor va en camino a esa dirección, y solo si el cliente la pregunta.
  - Sin otra app (Franco, 2026-11-18): el navegador no da la posición en segundo plano (D79). Diseño: posición con la app abierta, una posición en cada entrega, y la hora de llegada por eventos (última entrega + tiempo de viaje aprendido). Falta probar en el teléfono del repartidor.
- [ ] Promociones y recordatorios a clientes frecuentes: Franco los define más adelante. **(Dueño)**
- [x] "Iniciar ruta" y "Terminar jornada". (D80)
- [ ] Foto como prueba de entrega (cuando haya medio de pago en Cloudflare).

## 5. Reparto, caja, clientes
- [ ] Control de sobrantes del furgón ("saco 60, sobran 5").
- [ ] Saldo de envases por cliente.
- [ ] Resumen diario por Telegram.
- [ ] Link para seguir el pedido dentro del mensaje de confirmación.
- [ ] Portal o carga por Excel para las empresas con plan mensual.

## 6. Cuentas, calidad, legal
- [x] Zero Trust activado (2026-11-18) y la administración detrás de Access (D81).
- [x] `PANEL_SECRETO` y panel publicado (D81). Falta: bot de Telegram y cargar el historial.
- [x] Actualizar `CLAUDE.md` (decía que los pedidos van a Google Sheets y los comprobantes a Drive). (D84)
- [ ] Pruebas del panel en el navegador; medir la CPU después de publicar. (La app del repartidor se probó el 2026-11-25 con datos ficticios: sin señal, servidor caído y rechazos, D84.)
- [x] La cola del repartidor ya no pierde marcas; `/salud` revisa la base; pendientes de D80 cerrados salvo los cortes de viaje. (D84)
- [ ] Ley 21.719 (rige desde el 15-oct-2027, D82): aviso de privacidad y plazo de guardado. **(Dueño)**

## 7. Hacia la visión de Franco (D83, 2026-11-25)
Meta de largo plazo: asistentes de IA, roles dentro del panel, un panel de análisis avanzado y finanzas. Cada paso sirve solo, cuesta USD 0 al mes y se mide antes de seguir. La flota no hace falta (un repartidor): basta con no impedirla.

1. [ ] **Cobros, base de las finanzas:** separar "cobrado en terreno" de "pago verificado" (comprobante revisado), pago parcial y saldo pendiente por cliente. Hoy el pedido solo dice pendiente o pagado.
2. [ ] **Libro de envases:** cada envase entregado o retirado queda como un movimiento que no se borra; el saldo por cliente sale de ahí. Los envases son de Brunen y la carga inicial es venta (D83). Falta el saldo inicial de cada cliente.
3. [ ] **Gastos simples desde el celular** para Felipe y la operadora: fecha, monto, categoría y foto opcional del documento. Sin esto no hay margen ni rentabilidad que mostrar.
4. [ ] **Roles dentro del panel:** operadora (pedidos, avisos, clientes; sin Equipo ni finanzas) y despacho (reparto y ruta). Los permisos se revisan en el servidor, no solo escondiendo botones.
5. [ ] **Panel de análisis:** ventas, bidones, clientes y cobros por período, comuna y producto; margen cuando existan los gastos. Cada cifra con su definición y su fecha de corte; nunca cifras inventadas ni "rentabilidad" con costos incompletos.
6. [ ] **Asistentes de IA:** primero solo consultas en palabras sobre cifras que ya calcula el código ("¿cuántos bidones entregamos en Ñuñoa este mes?"); después borradores (un mensaje, un pedido) que una persona confirma. Nunca cambian precios, pagos ni rutas solos. Con el plan gratis de Groq (verificar cuotas antes) y enviando solo lo mínimo.
