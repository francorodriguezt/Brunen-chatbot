# Todo lo que falta

Foto al **2026-11-26** (noche). Todo lo construido hasta D97 está publicado. Esta es la lista completa de lo que queda. Sale de:
- [PREGUNTAS_ABIERTAS.md](PREGUNTAS_ABIERTAS.md), [PENDIENTES.md](PENDIENTES.md) y [PASOS_FRANCO.md](PASOS_FRANCO.md);
- [MEJORAS.md](MEJORAS.md), [EXPERIENCIAS_MOVILES.md](EXPERIENCIAS_MOVILES.md) y [PROPUESTA_SIGUIENTES_PASOS.md](PROPUESTA_SIGUIENTES_PASOS.md);
- los riesgos del [resumen del proyecto](PROMPT_PROYECTO.md) (§12.10).

**Cómo leerla.** Cada punto dice quién lo hace y dónde:
- **Franco** (una acción tuya), **Felipe** o **la operadora** (una pregunta o una acción de ellos).
- **Proyecto**: se puede hacer en la pestaña Proyectos (conversar, decidir, escribir código como pull request).
- **Aquí**: necesita el computador de Franco (publicar en Cloudflare, migraciones, datos reales, probar en el navegador).
- "P12" es la pregunta 12 de [PREGUNTAS_ABIERTAS.md](PREGUNTAS_ABIERTAS.md): ahí está la pregunta completa con mi recomendación.

---

## 1. Lo que impide abrir el bot a clientes reales

Hoy el bot solo contesta a los números de prueba. Para abrirlo a todos, en este orden:

1. **Conectar el número actual de WhatsApp a la API** (coexistencia). Es el bloqueo más grande: Meta exige hacerlo por un proveedor autorizado o con Brunen como su propio Tech Provider. — Felipe decide (P10), Franco tramita.
   - Averiguar cuánto cobra un proveedor al mes, o los requisitos de ser Tech Provider (D45, D48).
   - Saber si hoy usan listas de difusión: la coexistencia las desactiva y obliga a abrir la app al menos cada 14 días.
   - Confirmar con el proveedor que la coexistencia está disponible en Chile.
2. **Crear el bot de Telegram** y cargar `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`. Sin él, los reclamos y las fallas urgentes solo quedan en el panel, donde nadie los ve al instante. — Franco, Aquí ([PASOS_FRANCO.md](PASOS_FRANCO.md), punto 2).
3. **Que la operadora acepte recibir los avisos por Telegram** (P32).
4. **Aviso de privacidad** aprobado ([AVISO_PRIVACIDAD.md](AVISO_PRIVACIDAD.md)) y **cuánto tiempo se guardan** pedidos y fichas. La ley rige desde el 15-oct-2027, pero conviene tenerlo antes de abrir. — Felipe (P20).
5. **Monitoreo de `/salud`** con una cuenta gratis de UptimeRobot que avise al correo. — Franco.
6. **Borrar los pedidos de prueba** de la base real, para que no se mezclen con los de verdad. — Claude con permiso, Aquí.
7. **Una forma explícita de "abrir a todos"** en `NUMEROS_PERMITIDOS` (hoy la lista vacía significa "a nadie"). — Claude, Proyecto o Aquí; publicarlo, Aquí.
8. **Aprobar los textos nuevos del bot** (cotización, horario y pago dentro de un pedido, D95). — Felipe (P45).
9. **Confirmar que el costo es aceptable** si un mes se pasan de 1.000 mensajes (peor caso, unos USD 6). — Felipe (P11).
10. **Contarle a Felipe que cambió el texto aprobado**: la respuesta ahora dice "Entrega en: …" (D55, D57). — Franco.
11. **Confirmar en la documentación oficial de Meta** los datos que salieron de fuentes secundarias (unos 250 contactos nuevos al día sin verificar la empresa, costos). — Claude, Proyecto.
12. **Verificación de la empresa en Meta y método de pago registrado** (Meta lo exige aunque no cobre dentro del cupo). — Felipe.

## 2. Para empezar a usar el panel y la app en el día a día

13. **Guardar el secreto del panel** en tu gestor de claves y borrar el archivo que quedó en tu computador. — Franco (P39).
14. **Guardar o borrar la clave JSON de Google** que quedó en tu computador (ya está en Cloudflare). — Franco (P40).
15. **Primera cuenta de administrador** con el correo de Brunen: código por correo, luego RUT y clave. No la crea Claude. — Felipe o Franco ([PASOS_FRANCO.md](PASOS_FRANCO.md), punto 3).
16. **Sumar los correos de la operadora y el tuyo** a la política "Administradores del panel Brunen" en Zero Trust. — Franco, o Claude si le pasas los correos, Aquí.
17. **Cuenta de la operadora** en el panel (entra con su correo y elige RUT y clave). — la operadora.
18. **Crear al repartidor** en Equipo (nombre, RUT, una clave que se le dice en persona). — Un administrador.
19. **Instalar la app en el teléfono del repartidor** (Chrome → Agregar a pantalla de inicio, permiso de ubicación, batería sin restricciones, aceptar compartir la ubicación). — Repartidor con Franco.
20. **Probar la ubicación 10 minutos** (Google Maps, pantalla dividida, teléfono bloqueado) y mandar la captura del registro. Dice cuánto confiar en la posición en vivo (D79). — Repartidor con Franco.
21. **Cargar el historial del Excel** (unos 6.800 pedidos). Primero corres la simulación y me pasas los totales; después se carga una sola vez ese día, porque gasta la mitad del cupo diario de escrituras. — Franco + Claude, Aquí (P43).
22. **Un día de prueba real**: la operadora confirma y publica la ruta, el repartidor la recorre con la app, al final revisan el cierre del día y me cuentan qué falló. — la operadora, repartidor y Franco.
23. **Revisar la guía del panel con la operadora** ([GUIA_PANEL.md](GUIA_PANEL.md)) y probar el panel en una tarea real. — la operadora y Franco.
24. **Mantener la plataforma de rutas actual** (Optiroute) en paralelo hasta probar el reemplazo en días reales (D49); después, decidir cuándo cancelarla. — Felipe y Franco.
25. **Revisar los correos de facturación** de Cloudflare en el correo de Brunen. — Felipe y Franco.

## 3. Decisiones tuyas (Franco)

26. **Clientes en un solo lugar** (P3): ¿construyo las fichas como única fuente (precio especial, vacíos que debe, bloqueado)? Recomiendo sí, después de la P12 de Felipe.
27. **Umbrales de las alertas del reparto** (P4): "sin señal" después de cuántos minutos (recomiendo 20) y "ruta no iniciada" a qué hora (recomiendo 10:30).
28. **Qué se le dice al cliente cuando la operadora cambia o cancela su pedido** (P5). Recomiendo un botón que abra su chat con el texto listo.
29. **Comprobante de un cliente con varios pedidos sin pagar** (P6): ¿a cuál se asocia? Recomiendo al más antiguo, y que la operadora lo pueda cambiar.
30. **Distancia real de calle para la ruta** (Mapbox, P7). Recomiendo esperar al día de prueba real.
31. **Reescribir el historial de git** para quitar tu correo personal y el apellido de la operadora (P8). Recomiendo solo si la operadora no acepta figurar.
32. **Preguntarle a Felipe lo que piden las mejoras del bot** (P9: datos de transferencia y mínimo de pedido).
33. **Permisos dentro del panel**: hoy todo administrador ve y cambia todo. ¿Separar operadora y despacho ahora, o junto con la visión (sección 9)?
34. **Promociones y recordatorios a clientes frecuentes**: quedaste en definirlos más adelante.

## 4. Preguntas para Felipe

35. **Número de WhatsApp**: proveedor o Tech Provider, y cuánto se puede pagar (P10).
36. **¿Todo minimarket paga mayorista?** ¿"Hogar" es el precio normal? (P12). Destraba la mejora de las fichas.
37. **Carga inicial de 10 L**: ¿$4.000 o $4.500? (P13).
38. **Carga inicial de 12 L y 10 L desde 3 envases** (P14).
39. **Precios especiales** ($3.500 y $3.000): ¿valen para 12 L y 10 L? (P15).
40. **Carga inicial mayorista** ($3.250 y $2.000): ¿es por envase? (P16).
41. **Entrega el mismo día** para pedidos hasta las 9:00: ¿sigue valiendo? El bot la ofrece (P17).
42. **¿El bot puede dar los datos de transferencia?** (P18).
43. **¿Hay un mínimo de pedido?** (P19).
44. **Hora de llegada al cliente**: ¿le parece bien una ventana de al menos 20 minutos? (P21). ¿Se avisa la hora a todos o solo a los que la piden (columna `Aviso_Hora`)?
45. **Cobros**: quién verifica los pagos, si el repartidor rinde el efectivo cada día, si hay abonos y si hay clientes a crédito (P22 a P25). Respondida (45) y construida en D107.
46. **Cliente bloqueado**: ¿se le contesta algo? (P26).
47. **Furgón**: cuántos bidones de 12 L y 10 L caben y el peso máximo (P27). Si los sobrantes quedan en el furgón y si la carga lleva margen.
48. **Hora de salida y minutos por parada** (P28).
49. **Clientes atrasados**: ¿les escribe la operadora o el bot con plantilla pagada? (P29).
50. **Dominio propio** para el panel (P30).
51. **El celular del repartidor**: ¿de la empresa o personal? (P31). Cambia cómo se pide su consentimiento.
52. **La plataforma de rutas actual** (Optiroute): nombre exacto, plan, cuánto pagan y qué funciones usan. Es la lista de lo que el reemplazo tiene que cubrir antes de cancelarla.
53. **Un vacío que falta** después de justificarlo: ¿se retira mañana, queda como deuda o se cobra? (también en P36).

## 5. Preguntas para la operadora

54. **¿Acepta los avisos urgentes por Telegram?** (P32).
55. **¿Acepta que su nombre y su horario estén en el repositorio público?** (P33).
56. **Empresas con plan mensual**: cuáles, qué reciben y cada cuánto, para cargar sus pedidos fijos (P34).
57. **Qué significan "plan", "abono" y "debe"**, y qué controlan las hojas CONTROL EFECTIVO, CONTROL BIDONES, CUOTAS y DETALLE HOTEL del Excel (P35).
58. **Qué pasa con un vacío que falta** (P36).
59. **Cuánto tiempo al día les toma hoy** anotar, armar la ruta y escribirle al repartidor (P37). Sirve para medir el ahorro.
60. **Qué incidencias pasan en el reparto** además de las 5 de "No se pudo" (por ejemplo, una falla del furgón), para la lista de incidencias.

## 6. Para medir y mejorar el bot

61. **Exportar 5 a 10 chats** de clientes desde el teléfono del negocio (Exportar chat → Sin archivos), dejarlos en `datos/chats/` y correr `npm run medir-bot -- "datos/chats"`. Revisar el informe y pasarme los no entendidos. — Franco, Aquí (P41).
62. **Sumar a `tests/mensajes.json`** cada mensaje real mal entendido, con su corrección. — Claude, Proyecto o Aquí.
63. **Dar los datos de transferencia** a quien pregunta cómo pagar (mejora C). — Espera a Felipe (P18).
64. **Más preguntas frecuentes** (envases, carga inicial, mínimo de pedido; mejora E). — Espera a Felipe.
65. **IA con contexto** (mejora F): que la IA de respaldo sepa qué preguntó el bot. — Solo si la medición muestra que hace falta.
66. **Probar otro modelo de IA** (mejora G), solo si sigue siendo gratis. — Solo si la medición lo pide.

## 7. Construcción que espera una decisión

67. **Fichas como única fuente de clientes** (propuesta 1): migración nueva, el bot mira la ficha primero, copia única desde la hoja CLIENTES con los casos que no coinciden. — Espera P3 y P12. Proyecto para el código; Aquí para la migración y publicar.
68. **Cobros** (propuesta 2): pendiente → informado → verificado, pago parcial, lista "Por verificar" y saldo por cliente. — ✅ Hecho en D107.
69. **Alertas "sin señal" y "ruta no iniciada"** en Hoy y por Telegram. — Espera P4.
70. **Avisar al cliente un cambio o una cancelación** con un botón que abre su chat. — Espera P5.
71. **Asociar comprobantes a un pedido** cuando hay varios sin pagar. — Espera P6.
72. **Llenar solos los vacíos por retirar** al reconocer al cliente. — Espera la regla del saldo de envases (P36, punto 53).
73. **Incidencias sin parada** (furgón, diferencias) en la app del repartidor. — Espera la lista de Felipe y la operadora (punto 60).
74. **Precio de todo el pedido en la app del repartidor**. Hoy ve solo lo que cobra en efectivo; mostrar más es decisión del negocio.
75. **Promociones** que el bot cotiza solo y que se arman desde el panel. — Espera a Felipe.
76. **Recordatorios a clientes frecuentes**. — Espera P29.
77. **Distancia real de calle** (Mapbox). — Espera P7.

## 8. Construcción que no espera a nadie (cuando haya tiempo)

**Ruta y reparto**

78. Avisar al repartidor cuando la ruta cambia sin volver a publicarse (un pedido nuevo o cancelado a mitad del día), que D94 no cubre.
79. Elegir en conjunto dónde cortar cada viaje y dónde recargar, en vez de viaje por viaje.
80. Horarios de clientes ("solo en la tarde") como condición de la ruta.
81. Tiempo entre paradas por zona y hora (hoy se aprende solo el tiempo en cada parada).
82. Un mapa dentro de la app del repartidor.
83. Estado "En curso" en una parada (opcional en la especificación).

**Pantallas**

84. Navegación abajo en el teléfono (app y panel), cuando haya más secciones.
85. Revisar el borde de la pantalla del iPhone (notch) y las tablas que quedan anchas.
86. Avisos en el iPhone con la app cerrada (instalada en la pantalla de inicio).
87. Panel de administración instalable en el celular.
88. Acotar por fecha las listas "Cerrados" y "Todos" cuando haya miles de pedidos.

**Calidad y mantenimiento del código**

89. Separar `panel/admin/app.js` (2.566 líneas) en módulos con pruebas automáticas de pantalla.
90. Medir la CPU del bot en producción (límite de 10 ms) y, si hace falta, pasar CLIENTES, PRECIOS, CONFIGURACION y FERIADOS de Google Sheets a D1.
91. Quitar de `telegram.ts` los botones Confirmar y Cambiar, que quedaron sin uso.
92. Subir wrangler (hay una versión nueva) y la `compatibility_date` de los Workers, revisando los cambios.
93. Generar los tipos de `Env` con `wrangler types` en vez de escribirlos a mano.
94. CodeQL y `npm audit` en la revisión automática de GitHub.
95. Formateador y linter (Prettier y ESLint).
96. Espejo de los pedidos en la planilla cada noche, para quien prefiera ver Excel en la transición.
97. Confirmar en la base real que un `INSERT … ON CONFLICT … WHERE` que no cambia nada devuelve `changes = 0` (D27, prioridad baja).

## 9. La visión de largo plazo (D83), por etapas

Cada paso sirve solo, cuesta USD 0 al mes y se mide antes de seguir ([MEJORAS.md](MEJORAS.md) §7).

98. **Cobros** (punto 68): la base de las finanzas. ✅ Construido en D107 (sin publicar; migración 0019).
99. **Libro de envases**: cada envase entregado o retirado queda como un movimiento; el saldo por cliente sale de ahí, con vacíos por formato y cierre con diferencias. Falta el saldo inicial de cada cliente.
100. **Gastos simples desde el celular** para Felipe y la operadora (fecha, monto, categoría, foto opcional).
101. **Roles dentro del panel**: operadora y despacho, con permisos revisados en el servidor.
102. **Panel de análisis**: ventas, bidones, clientes y cobros por período, comuna y producto; margen cuando haya gastos.
103. **Asistentes de IA**: primero preguntas en palabras sobre cifras que ya calcula el código; después borradores que una persona confirma.

Y además, del diseño de la plataforma ([DISENO_PLATAFORMA.md](DISENO_PLATAFORMA.md)):

104. **Fase F**: dos semanas en paralelo con la plataforma de rutas actual y después cancelarla.
105. **Fase G**: control de sobrantes del furgón ("saco 60, sobran 5"), saldo de envases por cliente y caja del día.
106. Resumen diario por Telegram.
107. Link para seguir el pedido dentro del mensaje de confirmación.
108. Portal o carga por Excel para las empresas con plan mensual.
109. Foto como prueba de entrega.
110. Una ruta por repartidor, cuando trabajen dos a la vez.
111. Dominio propio (punto 50).

## 10. Seguridad, cuentas y legal

112. Bajarte a Administrator en la cuenta de Cloudflare cuando todo funcione (hoy eres Super Administrador). — Franco.
113. Pasar a nombre de Brunen lo que todavía esté a tu nombre: Google Cloud y la planilla, y la app de Meta. La cuenta de Cloudflare ya es de Brunen SpA. — Franco y Felipe.
114. Definir quiénes están en el grupo de Telegram que recibe comprobantes y cuánto se guardan. — Felipe y la operadora.
115. Registro de tratamientos y plazos de conservación (con el aviso de privacidad, punto 4). — Felipe, con un borrador de Claude.
116. Si la operadora no acepta figurar en el repositorio, sacar su nombre de los documentos (punto 31). — Claude.
117. Planilla real: confirmar si la que usa el bot es la definitiva o la de desarrollo. Si es la de desarrollo: copiarla, correr `npm run preparar-planilla` y cambiar `GOOGLE_SHEET_ID`. — Franco + Claude, Aquí.

## 11. Mantenimiento que vuelve cada cierto tiempo

118. **Después de cada publicación**: `npm run comprobar`. — Aquí.
119. **Cuando cambie la hoja PRECIOS**: igualar `TABLA_PRECIOS` en `src/precios.ts` (el precio sugerido del panel sale de ahí; el vigía avisa si son distintos). — Claude.
120. **Feriados**: cargar los de 2028 en la hoja FERIADOS antes del 31 de diciembre de 2027, y confirmar el 21 de junio de 2027 cuando salga el calendario oficial. — Franco o Claude.
121. **Con coexistencia**: abrir la app de WhatsApp Business al menos cada 14 días. — la operadora o Felipe.
122. **Token de WhatsApp**: el vigía lo revisa cada mañana y avisa si vence; renovarlo si pasa. — Franco.
123. **Respaldos**: se hacen solos (pedidos cada 30 minutos, fichas cada noche, Time Travel de 7 días). Basta confirmar de vez en cuando que la hoja RESPALDO_PEDIDOS se sigue llenando. — Franco.
124. **Al cerrar cada sesión de trabajo**: anotar decisiones, pendientes y qué cambia en el documento de conocimiento. — Claude.
