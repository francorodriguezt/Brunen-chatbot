# Preguntas abiertas (para responder una por una)

Actualizada el 2026-11-26. Responde con el número, por ejemplo: "1 sí", "4 20 min y 10:30", "12 se lo pregunto a Felipe". Cada pregunta trae mi recomendación. Lo que respondas se anota en `DECISIONES.md` y la pregunta se marca aquí.

Las preguntas vienen de [PENDIENTES.md](PENDIENTES.md), [PROPUESTA_SIGUIENTES_PASOS.md](PROPUESTA_SIGUIENTES_PASOS.md), [PASOS_FRANCO.md](PASOS_FRANCO.md) y [EXPERIENCIAS_MOVILES.md](EXPERIENCIAS_MOVILES.md). Saqué las que ya están resueltas. La lista completa de lo que falta hacer, con estas preguntas incluidas, está en [LO_QUE_FALTA.md](LO_QUE_FALTA.md).

## Decides tú (Franco)

1. ~~**¿Publico lo que está listo?**~~ Sí, publicado el 2026-11-26 (D97). Son el arreglo de D87 y D90 a D93: en la app del repartidor, la siguiente parada y la observación al entregar; en el panel, al repartidor en Hoy; y la marca vieja que ya no cae en el pedido de hoy. No necesita migraciones. **Recomiendo: sí.**
2. ~~**Versiones de la ruta (D94):**~~ Sí, migración 0017 aplicada y publicada el 2026-11-26 (D97). cuando esté terminada, ¿aplico la migración 0017 en la base real (con su punto de restauración) y la publico? **Recomiendo: sí.**
3. ~~**Clientes en un solo lugar** (propuesta 1):~~ Construido (D104), sin publicar: falta aplicar la migración 0018 en la base real y publicar. Después, cargar en el panel el precio de $1.311 en la ficha de ese cliente. ¿la construyo? Cambia cómo cotiza el bot.
4. ~~**Alertas del reparto:**~~ 20 minutos y 10:30 (Franco, 2026-11-27; D98, construido). Se cambian en CONFIGURACION. ¿cuándo avisa el panel?
   - "Sin señal": la jornada está abierta y no llega su ubicación hace más de ___ minutos. **Recomiendo: 20.**
   - "Ruta no iniciada": a las ___ hay entregas y no tocó Iniciar ruta. **Recomiendo: 10:30.**
5. ~~**Cuando la operadora cambia o cancela un pedido en el panel,**~~ Hecho (Franco aceptó la recomendación, 2026-11-27; D99). ¿qué se le dice al cliente? Hoy no se le escribe nada. **Recomiendo:** un botón "Avisar al cliente" que abre su chat de WhatsApp con el texto listo, y lo envía la operadora.
6. ~~**Comprobante de un cliente con varios pedidos sin pagar:**~~ Hecho (Franco aceptó la recomendación, 2026-11-27; D100). ¿a cuál se asocia? **Recomiendo:** al más antiguo, y que la operadora lo pueda cambiar.
7. **Distancia real de calle para la ruta** (Mapbox, plan gratis, solo coordenadas; D62): ¿la usamos? **Recomiendo: esperar al día de prueba real** y ver si la ruta en línea recta se equivoca.
8. **Historial de git:** ¿lo reescribimos para quitar tu correo personal y el apellido de la operadora de los commits antiguos? Hay que forzar la subida. **Recomiendo: solo si la operadora no acepta figurar (pregunta 33).**
9. **Mejoras del bot que necesitan datos de Felipe:** ¿le pregunto lo de las preguntas 18 y 19, o lo dejamos para después? **Recomiendo: preguntarle junto con la 12.**

## Le preguntas a Felipe (dueño)

10. **Número de WhatsApp:** ¿proveedor autorizado de Meta (y cuánto se puede pagar al mes) o Brunen como su propio Tech Provider (gratis, pero más trámites)? Es el bloqueo más grande para abrir el bot a todos.
11. **Costo:** si un mes se pasan de 1.000 mensajes, el peor caso es de unos USD 6 al mes. ¿Está bien?
12. ~~**¿Todo minimarket paga precio mayorista?**~~ Sí (Franco, 2026-11-27): todo minimarket paga mayorista, salvo un cliente con un precio propio de $1.311 por bidón, que irá como precio especial en su ficha (D104). Hogar se toma como precio normal. ¿Y "hogar" es el precio normal?
13. **Carga inicial de 10 L:** ¿$4.000 o $4.500? El bot hoy tiene $4.500.
14. **Carga inicial de 12 L y 10 L desde 3 envases:** ¿cuánto cuesta cada uno?
15. **Precios especiales** ($3.500 y $3.000 por el de 20 L): ¿valen también para 12 L y 10 L? ¿A qué precio?
16. **Carga inicial mayorista** ($3.250 en 20 L y $2.000 en 12 L y 10 L): ¿es por envase?
17. **Entrega el mismo día:** ¿sigue valiendo para los pedidos hechos hasta las 9:00? El bot hoy la ofrece.
18. **¿El bot puede dar los datos de transferencia** a quien pregunta cómo pagar? Hoy siempre responde una persona.
19. **¿Hay un mínimo de pedido?** El bot podría responderlo solo. **Respondida: no hay (D109).**
20. **Aviso de privacidad** ([AVISO_PRIVACIDAD.md](AVISO_PRIVACIDAD.md)): ¿lo aprueba? ¿Cuánto tiempo se guardan los pedidos y las fichas de clientes?
21. **Hora de llegada al cliente:** hoy se le da una ventana de al menos 20 minutos ("entre las 12:05 y las 12:25"). ¿Le parece bien?
22. **Cobros: ¿quién verifica los pagos?** ¿Él, la operadora o los dos?
23. **¿El repartidor rinde el efectivo todos los días?**
24. **¿Hay pagos parciales o abonos de verdad?** En el Excel aparecen "abono" y "debe".
25. **¿Hay clientes que pagan a fin de mes (crédito)?** ¿Cuáles y con qué plazo? ¿Es eso lo que significa `Credito` en su hoja de clientes?
26. **Cliente bloqueado:** ¿se le contesta algo? Hoy el bot le dice que una persona lo revisará.
27. **Furgón:** ¿cuántos bidones de 12 L y de 10 L caben, y cuál es el peso máximo? Hoy se cuentan 65 sin importar el tamaño.
28. **Hora de salida del repartidor** y **minutos promedio por parada.** Hoy se usan valores de referencia.
29. **Clientes atrasados** ("Les toca pedir"): ¿les escribe la operadora desde la app (gratis) o el bot con una plantilla de Meta (se paga cada mensaje)? **Recomiendo: la operadora.**
30. **Dominio propio** (por ejemplo `app.brunen.cl`) para el panel: Cloudflare no recomienda dejar en `workers.dev` lo que es crítico para el negocio.
31. **El celular del repartidor:** ¿es de la empresa o personal?

## Le preguntas a la operadora

32. **¿Acepta recibir los avisos urgentes por Telegram?** Son reclamos y fallas del sistema.
33. **¿Acepta que su nombre y su horario figuren en el repositorio público?** Si no, los saco.
34. **Empresas con plan mensual:** ¿cuáles son, qué reciben y cada cuánto? Con eso cargo sus pedidos fijos.
35. **¿Qué significan "plan", "abono" y "debe"** en la forma de pago del Excel? ¿Y qué controlan las hojas CONTROL EFECTIVO, CONTROL BIDONES, CUOTAS y DETALLE HOTEL?
36. **Un vacío que falta** después de justificarlo: ¿se retira al día siguiente, queda como deuda del cliente o se cobra? **Respondida (deuda, D108).** Queda una duda: en la *primera* entrega de un cliente (carga inicial) no se anota deuda, porque no tiene vacíos que devolver; ¿está bien así, aunque un cliente antiguo con historial sin cargar quede sin deuda en esa primera entrega?
37. **¿Cuánto tiempo al día les toma hoy** anotar los pedidos, armar la ruta y escribirle al repartidor? Sirve para medir cuánto se ahorra.

## Agregadas después

45. **(Felipe) Textos nuevos del bot (D95):** la cotización ("3 bidones de 20 L: $9.900 ($3.300 c/u). El despacho es gratis. ¿Te los anoto? Responde «sí»."), el horario corto dentro de un pedido y las formas de pago. ¿Los aprueba? Están en `src/textos.ts`.

## Lo que tienes que hacer tú (no son preguntas)

38. **Bot de Telegram:** sigue sin crearse; revisé que no está cargado `TELEGRAM_BOT_TOKEN`. Pasos en [PASOS_FRANCO.md](PASOS_FRANCO.md), punto 2.
39. **Secreto del panel:** pasar el archivo con el secreto que quedó en tu computador a tu gestor de claves y borrarlo.
40. **Clave JSON de Google** que quedó en tu computador: guardarla en un lugar seguro o borrarla. Ya está en Cloudflare.
41. **Mensajes reales de clientes:** (2026-11-27: llegaron 6 chats; con ellos el bot pasó de 44 % a 77 % de mensajes entendidos, D103. Más chats siguen sirviendo.) en el teléfono del negocio, abre un chat → Más → **Exportar chat → Sin archivos**. Junta 5 a 10 en `datos/chats/` y corre `npm run medir-bot -- "datos/chats"`. Revisa `datos-anonimos/medicion-bot/informe.md` y pégame los no entendidos (D96). Es lo que más mejora al bot.
42. **Cuentas y prueba real:** la cuenta de la operadora, la del repartidor, instalar la app en su teléfono, probar la ubicación y hacer un día de prueba ([PASOS_FRANCO.md](PASOS_FRANCO.md), puntos 3 a 9).
43. **Historial del Excel:** correr la simulación y mandarme los totales (punto 6).
44. **Monitoreo:** una cuenta gratis de UptimeRobot que revise `/salud` y te avise al correo.
