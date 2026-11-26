# Propuesta: los siguientes pasos (para que Franco decida)

2026-11-26. Los dos cambian cómo trabaja el negocio, así que no se construyen sin tu visto bueno. Cada uno trae mi recomendación y las preguntas que cambian lo que se construye.

---

## 1. Los clientes en un solo lugar: las fichas del panel

**Hoy.** El bot busca al cliente en la hoja CLIENTES de la planilla: de ahí saca el tipo (normal, mayorista, empresa, especial), el precio especial, los vacíos que debe y si está bloqueado. Las fichas del panel solo se usan cuando el teléfono no está en la hoja. Son dos lugares para lo mismo, y en el panel no se puede anotar un precio especial ni bloquear a alguien.

**Propuesta.**
1. La ficha guarda tres datos más: **precio especial del bidón de 20 L**, **vacíos que debe de antes** y **bloqueado (sí o no)**. Necesita una migración nueva en la base real.
2. Esos datos se cambian en la ficha del panel, igual que el tipo de cliente.
3. El bot mira primero la ficha. La hoja CLIENTES queda solo como respaldo, para un teléfono que no tenga ficha, hasta que la apaguemos.
4. Un botón (o un comando) copia una sola vez la hoja CLIENTES a las fichas y muestra los casos en que no coinciden, para que una persona decida.

**Equivalencias:** hogar = normal, minimarket = mayorista, empresa = empresa. "Especial" no es un tipo: es tener un precio especial.

**Riesgo:** cambia cómo cotiza el bot. Se cubre con pruebas de todos los casos de precios (sección 3 del conocimiento), y si la ficha y la hoja dicen cosas distintas, el pedido va a revisión en vez de cotizarse.

**Necesito de ti:**
- [ ] ¿Lo construyo?
- [ ] ¿Todo minimarket paga precio mayorista? Esa pregunta sigue abierta con Felipe.

---

## 2. Cobros: el primer paso de tu visión (finanzas)

**Hoy.** Cada pedido dice "pendiente" o "pagado". El repartidor marca "cobré" (siempre el total) y queda "pagado". Un comprobante de transferencia llega como aviso y una persona marca "pagado" a mano. No se distingue "me dijeron que pagó" de "revisé que el dinero llegó".

**Propuesta.**
1. **Tres estados de pago:** *pendiente* → *informado* (el repartidor dice que cobró, o el cliente mandó el comprobante) → *verificado* (Felipe o la operadora revisó el efectivo rendido o la transferencia en el banco). Queda quién verificó y cuándo.
2. **Pago parcial:** el repartidor anota cuánto cobró, no solo "cobré el total". El resto queda como saldo pendiente.
3. **"Por verificar" en el panel:** una lista con los cobros en efectivo del día (para la rendición) y los comprobantes recibidos, con un toque para verificar.
4. **Saldo por cliente:** lo que debe cada cliente, sumando sus pedidos pendientes.

Esto es la base para lo que sigue en finanzas (gastos, margen): sin saber qué está pagado y verificado no hay caja confiable. Necesita una migración nueva.

**Necesito de ti (o de Felipe y la operadora):**
- [ ] ¿Quién verifica los pagos: Felipe, la operadora o los dos?
- [ ] ¿El repartidor rinde el efectivo todos los días?
- [ ] ¿Hay pagos parciales o abonos de verdad? (En el Excel aparecen "abono" y "debe".)
- [ ] ¿Hay clientes que pagan a fin de mes (crédito)? Si es así, ¿cuáles y con qué plazo?

---

## 3. Un bot que entienda más y responda mejor

**Cómo responde hoy.** Primero interpreta con reglas. Solo si no entiende, le pregunta a una IA (Groq), que extrae la intención y las cantidades: no redacta. Las respuestas son textos fijos y los precios y fechas los calcula el código. Eso se mantiene: una IA que redacta sola puede inventar un precio, un horario o una promesa.

| # | Mejora | Hoy | Con el cambio | ¿Quién decide? |
|---|---|---|---|---|
| A | **Cotizar lo que preguntan** | "¿Cuánto salen 3 de 20?" recibe la tabla completa de precios | "3 bidones de 20 L: $9.900, despacho gratis. ¿Te los anoto?" (cliente especial o mayorista: su precio, o lo confirma una persona) | Franco |
| B | **Dos cosas en un mensaje** | Gana una sola intención: "mándame 2 de 20, ¿llegan hoy antes de las 12?" anota el pedido y la pregunta se pierde | Una sola respuesta que anota y contesta; lo que no pueda contestar queda como aviso | Franco |
| C | **Responder cómo pagar** | Siempre se deriva a una persona | El bot entrega los datos de transferencia de la hoja CONFIGURACION | Felipe (son datos bancarios) |
| D | **Aprender de lo que no entiende** | El corpus de pruebas tiene 83 mensajes, todos ficticios | Lista en el panel de los "no entendido" para revisarlos, quitarles nombres y direcciones y sumarlos a las pruebas; se mide el porcentaje de acierto | Franco |
| E | **Preguntas frecuentes nuevas** | Solo precio, zona, horario y pago | Envases, carga inicial, mínimo de pedido, cómo funciona el cambio de bidón | Franco redacta, Felipe confirma los datos |
| F | **IA con contexto** | La IA ve el mensaje suelto | Le llega además qué preguntó el bot (por ejemplo "¿de cuántos litros?"), sin nombre, dirección ni teléfono | Franco |
| G | **Probar otro modelo** | `openai/gpt-oss-20b` | Comparar con uno más grande sobre el mismo corpus y quedarse con el que acierte más, solo si sigue siendo gratis (revisar los límites vigentes antes) | Franco |

**Orden recomendado:** D primero (sin mensajes reales se mejora a ciegas), luego A y B (no dependen de nadie), después C y E, y al final F y G, solo si la medición muestra que hace falta. Todo mantiene un mensaje por respuesta y costo USD 0.

**Lo que más ayuda y puedes hacer ya:** juntar 50 a 100 mensajes reales de clientes (sin nombres, teléfonos ni direcciones).

---

## 4. Qué más falta

**Para abrir el bot a todos los clientes** (según [PASOS_FRANCO.md](PASOS_FRANCO.md); hoy solo contesta a números de prueba):
- Conectar el número actual por un proveedor autorizado de Meta, o que Brunen sea su propio Tech Provider. Es el bloqueo más grande.
- Aviso de privacidad aprobado por Felipe.
- Monitoreo de `/salud` y bot de Telegram.
- Borrar los pedidos de prueba de la base real.
- Que la operadora acepte los avisos y que su nombre figure en el repositorio público.

**Para usar el panel y la app del repartidor:** cuentas de la operadora y del repartidor, instalar la app en su teléfono, probar la ubicación, cargar el historial del Excel y hacer un día de prueba real.

**Código a medias o sin publicar:**
- D94, versiones de la ruta: está el servidor; falta el aviso en la app del repartidor y en el panel. Necesita la migración 0017.
- Sin publicar: el arreglo de D87 y D90 a D93.
- Alertas "sin señal" y "ruta no iniciada": faltan los umbrales que decidas.
- CPU del bot: medido sobre los 10 ms del plan gratis; falta volver a medir.

**Necesito de ti:**
- [ ] ¿Qué construyo primero: el bot (D, A, B), las fichas, los cobros o terminar D94?
- [ ] ¿Publico lo que está listo?
