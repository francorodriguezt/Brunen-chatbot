# Cómo conversará el bot

Ejemplos de conversaciones tal como las resolvería el bot hoy, para que el dueño y la operadora revisen **el tono, las frases y las decisiones** antes de conectarlo a los clientes. Salen del motor de pedidos (`src/motor.ts`) con datos ficticios, un miércoles 28 de octubre de 2026 a las 10:00; los textos son **borradores** (`src/textos.ts`) y se ajustan en un solo lugar.

Qué mirar:
- ¿Las frases suenan como Brunen? ¿Algo que el bot dice no debería decirlo, o falta algo?
- Las decisiones marcadas como **supuesto** (más abajo) están pendientes de que el dueño las confirme.
- Cada respuesta del bot es **un solo mensaje** y un "gracias" no se responde, para quedar bajo los 1.000 mensajes gratis al mes.

Lo que el bot **nunca** hace: confirmar un pedido (la operadora confirma), prometer un precio o una fecha dudosos, ni responder reclamos, facturas o cobranzas por su cuenta.

**Supuestos pendientes** (ver `docs/PENDIENTES.md`): cómo tratar a un cliente nuevo (hoy: se anota y una persona coordina), pedidos con más de 20 bidones de un tipo (hoy: a revisión), precios especiales y mayoristas para 12 L y 10 L (hoy: a revisión), clientes bloqueados (hoy: los atiende una persona), y datos de pago (hoy: los entrega una persona).

---

### 1. Un pedido de un cliente conocido

Todo en un solo mensaje. El bot calcula el precio y propone la entrega.

**Cliente:** Hola, necesito 2 bidones de 20 para el viernes

**Bot:**
> Anotamos tu pedido:
> - 2 bidones de 20 L: $6.600
> Entrega estimada: viernes 30 de octubre.
> Si algo cambia, te avisamos por aquí.

_La operadora recibe un aviso con los botones Confirmar y Cambiar._

### 2. Un pedido en dos mensajes

El cliente no dice el tamaño. El bot pregunta una vez y entiende la respuesta corta.

**Cliente:** quiero 4 bidones

**Bot:**
> ¿De cuántos litros son los bidones: 20, 12 o 10?

**Cliente:** de 20

**Bot:**
> Anotamos tu pedido:
> - 4 bidones de 20 L: $11.000
> Entrega estimada: jueves 29 de octubre.
> Si algo cambia, te avisamos por aquí.

_La operadora recibe un aviso con los botones Confirmar y Cambiar._

### 3. "Lo de siempre"

El bot recuerda el último pedido del cliente.

**Cliente:** necesito 3 de 20 y 1 de 12

**Bot:**
> Anotamos tu pedido:
> - 3 bidones de 20 L: $9.900
> - 1 bidón de 12 L: $2.500
> Total: $12.400
> Entrega estimada: jueves 29 de octubre.
> Si algo cambia, te avisamos por aquí.

_La operadora recibe un aviso con los botones Confirmar y Cambiar._

**Cliente:** lo de siempre para el sábado

**Bot:**
> Anotamos tu pedido:
> - 3 bidones de 20 L: $9.900
> - 1 bidón de 12 L: $2.500
> Total: $12.400
> Ese día es feriado y no despachamos; la entrega más cercana es el lunes 2 de noviembre.
> Si algo cambia, te avisamos por aquí.

_La operadora recibe un aviso con los botones Confirmar y Cambiar._

### 4. Un día en que no se despacha

El domingo no hay reparto: el bot propone el siguiente día y lo explica.

**Cliente:** quiero 2 de 20 para el domingo

**Bot:**
> Anotamos tu pedido:
> - 2 bidones de 20 L: $6.600
> Los domingos no despachamos; la entrega más cercana es el lunes 2 de noviembre.
> Si algo cambia, te avisamos por aquí.

_La operadora recibe un aviso con los botones Confirmar y Cambiar._

### 5. Preguntas frecuentes

Las responde solo, sin molestar a la operadora.

**Cliente:** cuanto sale el bidon?

**Bot:**
> Estos son nuestros valores:
> - Bidón 20 L: 1: $4.500 · 2 a 3: $3.300 c/u · 4 o más: $2.750 c/u
> - Bidón 12 L: 1: $2.500 · 2 o más: $2.400 c/u
> - Bidón 10 L: $2.200 c/u
> El despacho es gratis.

**Cliente:** reparten los sabados?

**Bot:**
> Despachamos de lunes a viernes de 10:00 a 18:00 y los sábados de 10:00 a 15:00. No despachamos domingos ni festivos. Los pedidos hechos hasta las 9:00 salen el mismo día; los posteriores, el siguiente día de despacho.

**Cliente:** llegan a Maipú?

**Bot:**
> Por ahora no despachamos a Maipú. Atendemos: Ñuñoa, Macul, San Joaquín, Peñalolén, Santiago Centro, Providencia, Las Condes, Vitacura, Lo Barnechea, Recoleta, Huechuraba, La Reina.

### 6. Un cliente nuevo

Se anota el pedido, pero no se le promete precio ni fecha: una persona coordina la dirección.

**Cliente:** quiero 2 de 20

**Bot:**
> ¡Hola! Anotamos tu pedido de 2 bidones de 20 L. Como es tu primer pedido, una persona del equipo te escribirá para confirmar tu dirección y los detalles.

**Aviso a la operadora (Telegram):**
> 🆕 Cliente nuevo · P261028-3YMK9
> +56 9 1111 1111
> 2 bidones de 20 L
> “quiero 2 de 20”

### 7. Una comuna que no se atiende

Se informa y se anota como "Fuera_de_zona".

**Cliente:** quiero 2 de 20

**Bot:**
> Por ahora no despachamos a Maipú. Atendemos: Ñuñoa, Macul, San Joaquín, Peñalolén, Santiago Centro, Providencia, Las Condes, Vitacura, Lo Barnechea, Recoleta, Huechuraba, La Reina. Dejamos anotado tu pedido por si más adelante llegamos a tu comuna.

**Aviso a la operadora (Telegram):**
> 📍 Fuera de zona · P261028-3YMK9
> Ana Prueba · +56 9 1111 1111
> 2 bidones de 20 L · Maipú
> “quiero 2 de 20”

### 8. Un precio que depende de una decisión pendiente

Cliente con precio especial pidiendo 12 L: el bot no promete un valor dudoso.

**Cliente:** quiero 2 de 12

**Bot:**
> Anotamos tu pedido:
> - 2 bidones de 12 L
> El valor te lo confirmamos a la brevedad.
> Entrega estimada: jueves 29 de octubre.
> Si algo cambia, te avisamos por aquí.

**Aviso a la operadora (Telegram):**
> 🟡 Pedido para revisar · P261028-3YMK9
> Ana Prueba · +56 9 1111 1111
> 2 bidones de 12 L · Ñuñoa
> ⚠ Precio especial definido solo para 20 L; 12L se calculó con tramos (PENDIENTE).
> “quiero 2 de 12”

### 9. Un reclamo

Siempre lo atiende una persona; el bot solo avisa y responde de inmediato.

**Cliente:** el bidón de ayer venía con el sello roto

**Bot:**
> Lamentamos el inconveniente. Ya avisamos al equipo: te contactarán a la brevedad y lo resolvemos a más tardar mañana.

**Aviso a la operadora (Telegram):**
> 🔴 Reclamo
> Ana Prueba · +56 9 1111 1111
> El cliente presenta un reclamo
> “el bidón de ayer venía con el sello roto”

### 10. Un reclamo de noche

Fuera del horario de la operadora, el bot lo dice.

**Cliente:** el bidón llegó roto

**Bot:**
> Lamentamos el inconveniente. Ya avisamos al equipo: te contactarán a la brevedad y lo resolvemos a más tardar mañana.
> 
> Nuestro horario de atención es de 8:00 a 21:00: te respondemos apenas abramos.

**Aviso a la operadora (Telegram):**
> 🔴 Reclamo
> Ana Prueba · +56 9 1111 1111
> El cliente presenta un reclamo
> “el bidón llegó roto”

### 11. Pagos, envases y agradecimientos

Un "gracias" no se responde, para cuidar los 1.000 mensajes gratis al mes.

**Cliente:** ya transferí

**Bot:**
> Recibimos tu aviso de pago, gracias. Lo revisamos y, si falta algo, te escribimos.

**Aviso a la operadora (Telegram):**
> 💳 Pago
> Ana Prueba · +56 9 1111 1111
> Avisa que pagó o transfirió
> “ya transferí”

**Cliente:** tengo 3 bidones vacios para devolver

**Bot:**
> Anotado: retiramos 3 envases vacíos en tu próxima entrega.

**Aviso a la operadora (Telegram):**
> ♻️ Envases
> Ana Prueba · +56 9 1111 1111
> Tiene 3 envase(s) vacío(s) para retirar
> “tengo 3 bidones vacios para devolver”

**Cliente:** ok perfecto gracias

**Bot:** _(no responde)_

### 12. El cliente desiste

No queda nada anotado.

**Cliente:** quiero 4 bidones

**Bot:**
> ¿De cuántos litros son los bidones: 20, 12 o 10?

**Cliente:** no gracias

**Bot:**
> Listo, no anoté nada. Cuando quieras, escríbeme.
