# Quién hace qué: el Proyecto o la sesión del computador

Al 2026-11-27. Los números son los de [LO_QUE_FALTA.md](LO_QUE_FALTA.md); las respuestas, en [RESPUESTAS_2026-11-27.md](RESPUESTAS_2026-11-27.md).

**Regla:** el **Proyecto** escribe código y documentos y entrega pull requests. La **sesión del computador** revisa, une, publica, aplica migraciones, toca la base real y los archivos locales. No trabajan lo mismo a la vez.

## Ya hecho

- **En el Proyecto (pull request 1, sin unir):** alertas del reparto (D98), avisar al cliente (D99), comprobante al pedido más antiguo (D100), aviso de fecha (D101), cambios de ruta sin publicar (D102), el bot aprende de 6 chats reales (D103), clientes en un solo lugar (D104, migración 0018).
- **En el computador:** borrados los datos de prueba de la base real (6), secretos juntos en una carpeta (14), comprobaciones de producción (118), respaldos revisados (123), investigación (9, 11, 35, 66, 75, 65, 3), plazos de privacidad recomendados (4).

## Le toca al computador

| Qué | Punto | Estado |
|---|---|---|
| Revisar, unir y publicar el pull request 1, con la migración 0018 | 26–29, 36 | Revisión en curso |
| Quitar el nombre de la operadora del repositorio y de su historial | 31, 55 | Después de unir |
| Publicar cada entrega del Proyecto y correr `npm run comprobar` | 118 | Cada vez |
| Cargar el historial del Excel | 21 | Cuando Franco lo pida |
| Cuentas del panel e instalar la app del repartidor | 15–20 | Franco |

## Le toca al Proyecto (después de unir y de limpiar el historial)

| Qué | Punto |
|---|---|
| Cobros: pendiente → informado → verificado, abonos, transferencias, crédito, rendición diaria y gasto de bencina | 45, 68, 98 |
| Un vacío que falta queda como deuda y se pide en la próxima entrega | 53, 72 |
| El bot da los datos de transferencia (de la hoja CONFIGURACION) y dice que no hay mínimo | 42, 43, 63 |
| Preguntas frecuentes y textos a partir de los chats | 8, 10, 64 |
| Capacidad del furgón: solo cuentan los de 20 L | 47 |
| Precio y forma de pago claros en la app del repartidor | 74 |
| Botón "Escribirle" para clientes atrasados | 49, 76 |
| Contador de mensajes del bot en el mes, con aviso a los 800 | 9 |
| Workers AI como respaldo de Groq, comparado con `tests/mensajes.json` | 66 |
| "Abrir a todos" explícito en `NUMEROS_PERMITIDOS` | 7 |
| Quitar los botones sin uso de Telegram; `npm audit` y CodeQL; subir wrangler | 91, 94, 92 |
| Ideas de la sección 8 que valgan la pena | 79–89, 93, 95–97 |

## Mensaje para pegar en el Proyecto

Pégalo **después** de que aquí se una el pull request 1 y se limpie el historial (para que parta de la versión nueva).

> Parte desde la última versión de `main`. Lee `docs/RESPUESTAS_2026-11-27.md`, `docs/DIVISION_TRABAJO.md` y `docs/INVESTIGACION_2026-11-27.md`. Construye, en pull requests separados y en este orden: (1) cobros según mi respuesta 45; (2) vacíos que faltan como deuda (53); (3) el bot da los datos de transferencia desde la hoja CONFIGURACION y dice que no hay mínimo (42, 43); (4) preguntas frecuentes y textos a partir de los chats que te di (8, 10, 64); (5) capacidad contando solo los de 20 L (47), precio claro para el repartidor (74) y botón "Escribirle" para atrasados (76); (6) contador de mensajes con aviso a los 800 y Workers AI de respaldo (9, 66). No uses el nombre de la operadora en ningún archivo. No publiques nada: yo publico desde mi computador.
