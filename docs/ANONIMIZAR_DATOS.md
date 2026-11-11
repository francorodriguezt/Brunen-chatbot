# Analizar datos reales sin exponerlos

El Excel histórico de pedidos y las planillas de la plataforma de rutas traen nombres, teléfonos y direcciones de clientes. Este repositorio es público y esos datos no pueden salir del computador. `scripts/anonimizar-excel.mjs` hace una copia donde cada persona es un código, más un informe de la estructura y de los patrones. Con esa copia se puede analizar todo lo que importa (duplicados, mudanzas, precios, volumen por día) sin ver a nadie.

## Cómo usarlo

1. Deja el archivo en `datos/` (carpeta ignorada por git).
2. Corre:

   ```bash
   npm run anonimizar -- "datos/historial.xlsx"
   ```

   También sirve para un .csv y para la plantilla o una exportación de la plataforma de rutas.
3. Mira la tabla que imprime: dice qué se hizo con cada columna. Si alguna quedó mal clasificada, corre de nuevo con `--col "Encabezado=rol"` (`=omitir` la quita). Roles posibles: `npm run anonimizar -- --ayuda`.
4. Abre un .csv de `datos-anonimos/` y comprueba a ojo que no se ve ningún nombre, teléfono ni dirección.
5. Se comparte `datos-anonimos/` (los .csv y `informe.md`). Nunca el archivo original.

Otras opciones: `--hoja "Nombre"` para una sola hoja, `--fila-encabezado 3` si los títulos no están en la primera fila, `--salida otra-carpeta`.

## Qué hace con cada columna

| Columna | Qué queda |
|---|---|
| Nombre | Un código (`Cliente-0007`). El mismo nombre, aunque cambien mayúsculas o tildes, da el mismo código |
| Teléfono | Un código (`Tel-0003`), el formato con los dígitos tapados (`+## # #### ####`), cuántos dígitos tenía y si parece móvil, fijo o inválido. `912345678` y `+56 9 1234 5678` son el mismo código |
| Dirección | Un código (`Dir-0120`), su largo, si trae número y si menciona depto, torre u oficina |
| Correo, RUT, latitud y longitud | Se ocultan |
| Notas y cualquier texto libre | No se copia. Quedan si está vacío, su largo y cuáles de una lista cerrada de palabras aparecen (llamar, efectivo, depto, envase...) |
| Comuna, tamaño, tipo de cliente, tipo y estado de pago, factura | Tal cual |
| Columna combinada de cantidad y tamaño ("15 de 20lts") | Los números y las unidades quedan; cualquier otra palabra se tapa |
| Cantidad, precio, fecha | Tal cual. Si una cantidad trae texto ("2 de Juan"), las palabras desconocidas se tapan: `2 de ?` |
| Columna que no reconoce | Se mira el contenido: números y fechas pasan; pocas opciones cortas pasan (y avisa); texto variado no se copia |

Antes de escribir, revisa que ninguna celda sea igual a un nombre, teléfono o dirección original ni parezca un correo, un RUT o un número largo. Si encuentra algo, no escribe nada.

## Qué no hace

- Es seudonimización, no anonimato total: quien tenga el archivo original podría reconstruir qué código es quién. Por eso la clave no se guarda en ningún lado y la copia se queda en el computador de Franco, en una carpeta que git ignora.
- Una columna que no reconoce y tiene pocas opciones (por ejemplo "Repartidor") queda visible. El script avisa cuál es; si trae nombres de personas, se quita con `=omitir`.
- No lee `.xls` antiguos: se guardan como .xlsx o .csv.
- Las fechas escritas como texto se entienden como día/mes/año.

## Cómo se probó

41 pruebas en `tests/anonimizar.test.mjs` (lector de xlsx y csv, roles, anonimizado, revisión de fugas e informe). Se comprobó que las pruebas fallan si el script deja pasar un nombre. Además se corrió sobre un .xlsx creado por Excel de verdad, con título sobre los encabezados, fechas con formato, teléfonos como número y una fórmula. No se ha probado todavía con el archivo real de Brunen.
