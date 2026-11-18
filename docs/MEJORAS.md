# Mejoras por aplicar

Lista de trabajo acordada con Franco el 2026-11-17, a partir del análisis del proyecto
([ANALISIS_Y_MEJORAS.md](ANALISIS_Y_MEJORAS.md)) y de SpotGo (https://spotgo.cl/). Orden de trabajo: **ruta, bot,
panel**. **(Dueño)** = necesita su decisión o tiene costo. Al terminar una, se marca y se anota su decisión en
[DECISIONES.md](DECISIONES.md).

## 1. Ruta y mapa (prioridad de Franco)
- [x] Botón "Ruta en Google Maps" por carga: todas las paradas en orden, en tramos si son muchas.
- [x] La app del repartidor dice dónde recargar (planta o Actum) según la ruta, no siempre "Actum".
- [x] Cuántos bidones de cada tamaño cargar en cada viaje.
- [ ] Que las cargas del mapa y de la lista coincidan a mitad del día.
- [ ] Elegir en conjunto dónde cortar cada viaje y dónde recargar (no viaje por viaje).
- [ ] Aprender los tiempos reales (entre paradas y en cada parada) con la hora de cada entrega.
- [ ] Recalcular desde donde está el repartidor.
- [ ] Horarios de clientes ("solo en la tarde") como condición de la ruta.
- [ ] Distancia real de calle (Mapbox, solo coordenadas). Decide Franco (zona gris, D62).
- [ ] Datos del dueño: hora de salida, minutos por parada, bidones de cada tamaño por viaje. **(Dueño)**

## 2. Bot de WhatsApp
- [x] Comprobantes: la foto que manda el cliente llega a Telegram para revisarla (y queda el aviso en el panel).
- [x] Audios: transcribirlos y mostrar el texto en el aviso. El bot sigue sin responder audios (regla del dueño).
- [ ] Ubicación que manda el cliente por WhatsApp: se guarda como el punto exacto de su dirección.
- [x] "Hola, quiero pedir" de un cliente conocido: ofrecerle "lo de siempre" con su detalle.
- [ ] Responder "¿cuándo llega?" con la ruta del día y el avance.
- [ ] Detectar pedidos repetidos (mismo cliente, mismo día).
- [ ] Días sin reparto con su motivo (no solo feriados), dicho al cliente.
- [ ] Promociones con fechas que el bot cotiza solo. **(Dueño: precios y condiciones)**
- [ ] Recordatorio a los clientes frecuentes que les toca pedir: pagado (plantilla de Meta) o gratis desde la lista del panel. **(Dueño)**
- [ ] Sumar a las pruebas cada mensaje real mal entendido y medir el acierto.

## 3. Panel (más intuitivo; con el plugin impeccable)
- [ ] Pantalla "Hoy": qué hay que hacer ahora (por confirmar, avisos, reparto, a quién le toca pedir).
- [ ] Confirmar varios pedidos de una vez, y "Deshacer" unos segundos después de cada acción.
- [ ] "Nuevo pedido" más corto: pegar el mensaje primero; pago y factura plegados en "Más datos".
- [ ] Avisos en el iPhone con la app cerrada (instalada en la pantalla de inicio).
- [ ] Pantalla de días sin reparto y promociones (sin tocar la planilla).
- [ ] Mapa de clientes por comuna.
- [ ] Probarlo con Constanza en una tarea real.

## 4. App del repartidor (Android)
- [ ] Posición en vivo para el mapa (fase E), con su consentimiento escrito. **(Dueño y repartidor)**
- [ ] "Iniciar ruta" y "Terminar jornada".
- [ ] Foto como prueba de entrega (cuando haya medio de pago en Cloudflare).

## 5. Reparto, caja, clientes
- [ ] Control de sobrantes del furgón ("saco 60, sobran 5").
- [ ] Saldo de envases por cliente.
- [ ] Resumen diario por Telegram.
- [ ] Link para seguir el pedido dentro del mensaje de confirmación.
- [ ] Portal o carga por Excel para las empresas con plan mensual.

## 6. Cuentas, calidad, legal
- [ ] Zero Trust con la tarjeta de Franco (virtual o prepago con tope) o, sin tarjeta, un segundo factor propio.
- [ ] Bot de Telegram, `PANEL_SECRETO`, publicar el panel, cargar el historial.
- [ ] Actualizar `CLAUDE.md` (todavía dice que los pedidos van a Google Sheets y los comprobantes a Drive).
- [ ] Pruebas del panel en el navegador; medir la CPU después de publicar.
- [ ] Ley 21.719: aviso de privacidad y plazo de guardado. **(Dueño)**
