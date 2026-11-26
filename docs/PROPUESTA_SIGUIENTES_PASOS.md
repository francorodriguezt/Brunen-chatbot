# Propuesta: los dos siguientes pasos (para que Franco decida)

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
1. **Tres estados de pago:** *pendiente* → *informado* (el repartidor dice que cobró, o el cliente mandó el comprobante) → *verificado* (Felipe o Constanza revisó el efectivo rendido o la transferencia en el banco). Queda quién verificó y cuándo.
2. **Pago parcial:** el repartidor anota cuánto cobró, no solo "cobré el total". El resto queda como saldo pendiente.
3. **"Por verificar" en el panel:** una lista con los cobros en efectivo del día (para la rendición) y los comprobantes recibidos, con un toque para verificar.
4. **Saldo por cliente:** lo que debe cada cliente, sumando sus pedidos pendientes.

Esto es la base para lo que sigue en finanzas (gastos, margen): sin saber qué está pagado y verificado no hay caja confiable. Necesita una migración nueva.

**Necesito de ti (o de Felipe y Constanza):**
- [ ] ¿Quién verifica los pagos: Felipe, Constanza o los dos?
- [ ] ¿El repartidor rinde el efectivo todos los días?
- [ ] ¿Hay pagos parciales o abonos de verdad? (En el Excel aparecen "abono" y "debe".)
- [ ] ¿Hay clientes que pagan a fin de mes (crédito)? Si es así, ¿cuáles y con qué plazo?

---

## Lo que ya está hecho y espera tu permiso para publicar
- **Borrar los datos de un cliente que lo pide** (D87), en su ficha.
- **"Actualizado HH:MM"** en la barra del panel (D88).

No necesitan migraciones: basta publicar el panel y la administración, y después correr `npm run comprobar`.
