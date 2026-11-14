# Respaldo de la base (D66)

Los pedidos y los clientes viven en la base D1 de Cloudflare. Para no depender solo de ella hay tres copias, de la más
automática a la más manual.

| Copia | Qué guarda | Cada cuánto | Dónde |
|---|---|---|---|
| Google Sheets, hoja `RESPALDO_PEDIDOS` | Cada pedido nuevo o que cambió, con todos sus datos | Cada 30 minutos | La planilla de Brunen |
| Google Sheets, hoja `RESPALDO_CLIENTES` | Las fichas: nombre, teléfonos, dirección vigente, notas | Cada noche (3:00) | La planilla de Brunen |
| Excel desde el panel | Todos los pedidos, en su estado actual | Cuando alguien lo descarga | El computador de quien lo baja |
| Time Travel de Cloudflare | La base completa, minuto a minuto | Siempre | Cloudflare, 7 días hacia atrás |

## Cómo leer `RESPALDO_PEDIDOS`
- Es un registro: nunca se borra ni se reescribe una fila. Cada vez que un pedido cambia (se confirma, se entrega, se
  edita) se agrega una fila nueva al final con su estado de ese momento.
- **El estado vigente de un pedido es su última fila.** Para ver un pedido, filtra la columna `ID_Pedido`.
- Las columnas del final (`Lineas_JSON`, `…_Unix`, `Cliente_Id`) son para reconstruir la base: no hace falta mirarlas.
- No borres filas ni cambies el nombre de la hoja o de las columnas: el respaldo sigue escribiendo ahí.
- Se escribe "tal cual": un nombre que empieza con "=" queda como texto, no como fórmula.

## Si algo falla
- Si el respaldo no se actualiza en un día y hay pedidos esperando, la revisión de las 7:30 deja un aviso urgente
  (panel y Telegram). Los pedidos siguen a salvo en la base; el respaldo retoma solo desde donde quedó.
- En el panel, pestaña **Equipo > Respaldo**, se ve la última copia de cada hoja y el último error.

## Cómo restaurar
Solo si la base se perdió o se dañó. Antes, si la base sigue viva, prueba con Time Travel (vuelve la base a un minuto
anterior): `npx wrangler d1 time-travel restore brunen-chatbot --timestamp=…`.

1. Descarga el respaldo:
   - de la planilla: hoja `RESPALDO_PEDIDOS`, *Archivo > Descargar > Valores separados por comas (.csv)*; o
   - del panel: *Equipo > Descargar todos los pedidos (Excel)*.
   Usa el archivo **tal como se descargó**: si lo abres en Excel y lo vuelves a guardar, Excel cambia las fechas y los
   números largos, y esas filas se descartan. Para mirarlo, abre una copia.
2. Arma el SQL. Imprime solo totales, sin datos de clientes:

   ```bash
   npm run restaurar-respaldo -- "ruta/del/archivo.csv"
   ```

3. Revisa los totales. Antes de tocar la base real, anota un punto de restauración:

   ```bash
   npx.cmd wrangler d1 time-travel info brunen-chatbot
   ```

4. Aplica el SQL:

   ```bash
   npx.cmd wrangler d1 execute brunen-chatbot --remote --file "ruta/restaurar-pedidos.sql"
   ```

Un pedido que en la base está más nuevo que en el respaldo no se toca: se puede restaurar sobre una base viva sin
perder lo último. El archivo `restaurar-pedidos.sql` tiene datos de clientes: bórralo después y nunca lo subas al repositorio.

## Qué no se respalda
- Las cuentas del panel y sus claves: por seguridad. Si se pierden, el administrador entra de nuevo con Cloudflare
  Access y crea las cuentas.
- Los avisos y el historial de cambios de cada pedido: sirven para el día a día, no para reconstruir.
- Los puntos del mapa: se vuelven a aprender con el GPS del repartidor o con un pin.
