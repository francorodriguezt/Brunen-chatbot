/**
 * Restaura los pedidos desde el respaldo (D66), por si la base D1 se pierde o se daña.
 *
 * 1. Descarga el respaldo: en la planilla, hoja RESPALDO_PEDIDOS, "Archivo > Descargar > Valores separados por comas
 *    (.csv)"; o en el panel, Equipo > "Descargar todos los pedidos (Excel)".
 * 2. Corre:  npm run restaurar-respaldo -- "ruta/del/archivo.csv"
 *    Imprime solo totales (ningún dato de clientes) y escribe restaurar-pedidos.sql junto al archivo.
 * 3. Revisa los totales y aplica el SQL (en la base real, con un punto de restauración antes; ver docs/RESPALDO.md):
 *    npx wrangler d1 execute brunen-chatbot --remote --file "ruta/restaurar-pedidos.sql"
 *
 * Un pedido que en la base está más nuevo que en el respaldo no se toca.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { leerCsv, pedidosVigentes, sqlDeRestauracion } from './restaurar/nucleo.mjs';

const archivo = process.argv[2];
if (!archivo) {
  console.log('Uso: npm run restaurar-respaldo -- "ruta/del/respaldo.csv"');
  process.exit(1);
}

const filas = leerCsv(readFileSync(archivo, 'utf8'));
const { pedidos, descartadas } = pedidosVigentes(filas);
const salida = join(dirname(archivo), 'restaurar-pedidos.sql');
writeFileSync(salida, `${sqlDeRestauracion(pedidos)}\n`);

const porEstado = {};
for (const p of pedidos) porEstado[p.estado] = (porEstado[p.estado] ?? 0) + 1;
console.log(`Filas leídas: ${filas.length - 1}`);
console.log(`Pedidos distintos (versión más nueva de cada uno): ${pedidos.length}`);
for (const [estado, n] of Object.entries(porEstado).sort()) console.log(`  ${estado}: ${n}`);
if (descartadas.length > 0) {
  console.log(`Filas que no sirven (revisar a mano en el archivo): ${descartadas.length}`);
  for (const d of descartadas.slice(0, 20)) console.log(`  fila ${d.fila}: ${d.motivo}`);
}
console.log(`SQL escrito en: ${salida}`);
