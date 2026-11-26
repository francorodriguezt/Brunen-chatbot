# Aviso de privacidad — BORRADOR

> **Borrador para revisión (2026-11-25, D85).** Lo redactó el equipo de desarrollo con lo que el sistema hace hoy. **No es asesoría legal**: lo aprueba el dueño y conviene que lo revise un abogado antes de publicarlo. Lo marcado **[PENDIENTE]** lo decide el dueño.
>
> Contexto legal (verificar antes de publicar): hoy rige la Ley 19.628 sobre protección de la vida privada; la Ley 21.719, que la reemplaza en gran parte, rige desde el **15 de octubre de 2027** (Ley 21.855, D82). Este texto apunta a cumplir la nueva desde ya.

---

## 1. Texto para los clientes

**Cómo cuidamos tus datos en Brunen**

**Quiénes somos.** Brunen SpA, RUT [PENDIENTE], Pudahuel, Santiago. Para cualquier consulta sobre tus datos, escríbenos por este mismo WhatsApp o al correo [PENDIENTE: correo de contacto de Brunen].

**Qué datos guardamos**
- Tu nombre, tu teléfono y tu dirección de entrega (comuna, y edificio y departamento si corresponde).
- Tus pedidos: qué pediste, cuándo, el precio, cómo pagaste y si pediste boleta o factura.
- Lo que nos escribes por WhatsApp para hacer o cambiar un pedido.
- Los comprobantes de pago que nos envías.
- Los audios que nos mandas: se pasan a texto para que una persona los atienda.
- La ubicación, solo si tú nos la compartes por WhatsApp.

**Para qué los usamos**
- Tomar, confirmar y entregar tus pedidos, y llevar el control de los bidones.
- Cobrar y emitir tu boleta o factura.
- Recordar tu dirección para que no tengas que escribirla cada vez.
- Responder tus reclamos y consultas, por ejemplo "¿cuándo llega mi pedido?".

No usamos tus datos para otra cosa. [PENDIENTE: si algún día se envían promociones, decir aquí que se pedirá permiso antes.]

**Por qué podemos usarlos.** Porque los necesitamos para atender el pedido que tú nos haces, y para cumplir con obligaciones tributarias (boletas y facturas). [PENDIENTE: confirmar con un abogado.]

**Con quién los compartimos.** No vendemos ni regalamos tus datos. Usamos estos servicios para funcionar, que los procesan por encargo nuestro:
- **Meta (WhatsApp):** los mensajes que nos envías y te respondemos.
- **Cloudflare:** los servidores y la base de datos donde se guardan tus pedidos. También pasa tus audios a texto; no guarda el audio.
- **Google:** una planilla con la configuración y una copia de respaldo de los pedidos y de las fichas de clientes.
- **Groq:** solo cuando el sistema no entiende un mensaje, recibe el texto de ese mensaje, sin tu nombre ni tu teléfono, y no lo guarda.
- **Telegram:** avisos internos para nuestro equipo y los comprobantes de pago que nos envías.

Estos servicios pueden guardar los datos fuera de Chile.

**Cuánto tiempo los guardamos**
- Lo que escribiste en un aviso o reclamo: 90 días.
- La conversación en curso con el sistema: 12 horas.
- Tu último pedido, para ofrecerte "lo de siempre": 6 meses desde ese pedido.
- Tus pedidos y tu ficha de cliente (nombre, teléfonos, direcciones): [PENDIENTE: plazo; considerar lo que exige la ley tributaria para boletas y facturas].
- Los comprobantes de pago: [PENDIENTE: plazo en Telegram].
- Las copias de seguridad: 7 días en la base de datos y [PENDIENTE] en la planilla de respaldo.

**Tus derechos.** Puedes pedirnos ver qué datos tuyos tenemos, corregirlos, que los borremos, que dejemos de usarlos o que te los entreguemos para llevarlos a otro lado. Escríbenos por WhatsApp o al correo de arriba. Te responderemos en un plazo de [PENDIENTE: plazo legal, confirmar]. Si borras tus datos, no podremos recordar tu dirección ni tus pedidos anteriores. Las boletas y facturas emitidas se guardan el tiempo que exige la ley.

**Cómo los protegemos.** Solo las personas de Brunen que atienden pedidos pueden ver tus datos, con su usuario y clave. Los registros técnicos no guardan tu nombre ni tu dirección, y tu teléfono aparece tapado.

**Cambios.** Si cambiamos este aviso, publicaremos la nueva versión con su fecha. Versión del [PENDIENTE: fecha de publicación].

---

## 2. Versión corta para WhatsApp

Para no gastar mensajes (un solo mensaje por pedido), irían dos líneas al final de la **primera** respuesta a un cliente nuevo, cuando se le piden nombre y dirección:

> Usamos tus datos solo para tus pedidos. Más información: [PENDIENTE: enlace al aviso].

Propuesta técnica, para cuando el dueño apruebe el texto: publicar este aviso en la dirección pública (`/privacidad` en `brunen-panel`) y agregar esa línea en `src/textos.ts`. No se construye antes de la aprobación.

---

## 3. Registro de tratamientos (uso interno)

Lo que pide la Ley 21.719 como "registro": qué datos, para qué, dónde y por cuánto tiempo. Plazos tomados del código el 2026-11-25.

| Datos | Para qué | Dónde | Quién los ve | Plazo |
|---|---|---|---|---|
| Ficha del cliente: nombre, teléfonos, direcciones, tipo | Atender y entregar pedidos | D1 (`clientes`, `telefonos_cliente`, `direcciones_cliente`); copia nocturna en Google Sheets | Dueño, la operadora (panel); repartidor solo los de su ruta | [PENDIENTE] |
| Pedidos e historial de cambios | Entregar, cobrar, boleta o factura | D1 (`pedidos`, `historial_pedidos`); copia cada 30 min en Google Sheets | Dueño, la operadora; repartidor solo los de hoy | [PENDIENTE] |
| Texto de avisos y reclamos | Que una persona atienda | D1 (`avisos`) | Dueño, la operadora | 90 días (el aviso queda, sin el texto) |
| Conversación en curso y mensajes por agrupar | Entender mensajes seguidos | D1 (`conversaciones`, `mensajes_pendientes`) | Nadie: los usa el sistema | 12 horas y 1 hora |
| Último pedido por teléfono | Ofrecer "lo de siempre" | D1 (`ultimos_pedidos`) | Nadie: los usa el sistema | 6 meses desde ese pedido |
| Mensajes ya procesados (identificador y teléfono) | No responder dos veces | D1 (`mensajes_procesados`) | Nadie | 7 días |
| Comprobantes de pago (foto o PDF) | Verificar pagos | Telegram (grupo privado) | Integrantes del grupo | [PENDIENTE] |
| Audios | Que la operadora sepa de qué se trata | Se transcriben en Cloudflare; no se guardan | Dueño, la operadora (el texto) | Como los avisos |
| Ubicación que comparte el cliente | Punto de la dirección en el mapa | D1 (`puntos`) | Dueño, la operadora, repartidor | Mientras exista la dirección |
| Cuentas del panel (RUT, nombre, huella de la clave) | Entrar al panel | D1 (`usuarios`, `sesiones`) | Administradores | Mientras la cuenta exista |
| Ubicación del repartidor (con su consentimiento) | Mapa del reparto y hora de llegada | D1 (`posiciones`, `jornadas`) | Dueño, la operadora | 3 días; se borra al retirar el consentimiento o desactivar la cuenta (D84) |
| Registros técnicos | Encontrar fallas | Cloudflare (Workers Logs) | Quien administra Cloudflare | 3 días; teléfono tapado, sin nombre ni dirección |
| Copia de la base | Recuperarse de un error | Cloudflare D1 (Time Travel) | Quien administra Cloudflare | 7 días |

---

## 4. Lo que el sistema todavía no hace y el aviso promete

Antes de publicar el aviso hay que construir o decidir:
1. **Borrar a un cliente a pedido:** un botón en su ficha que borre o anonimice sus datos en D1, avise qué queda por ley (boletas y facturas) y saque su fila de la copia en Google Sheets. Los comprobantes en Telegram se borran a mano.
2. **Plazo automático para pedidos y fichas**, cuando el dueño lo fije.
3. **Entregarle sus datos a un cliente** que los pida (exportar su ficha y sus pedidos).
4. **Quién responde** las solicitudes y en qué plazo.

## 5. Para el dueño: decisiones

- [ ] RUT y correo de contacto que van en el aviso.
- [ ] Cuánto tiempo se guardan los pedidos y las fichas (y la copia en la planilla).
- [ ] Cuánto tiempo quedan los comprobantes en Telegram, y quiénes están en ese grupo.
- [ ] Si habrá promociones (el aviso tendría que decir que se pide permiso antes).
- [ ] Quién responde las solicitudes de los clientes.
- [ ] Revisión por un abogado antes de publicarlo.

El aviso para el repartidor sobre su ubicación ya está en su app y se acepta ahí (D80).
