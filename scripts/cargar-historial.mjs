/**
 * Carga el historial del Excel de control de pedidos a la base (fase B, D54).
 *
 * Uso:
 *   npm run cargar-historial -- "datos/CONTROL PEDIDOS.xlsx"            simulación: solo cuenta, no escribe nada
 *   npm run cargar-historial -- "datos/CONTROL PEDIDOS.xlsx" --generar  además escribe datos/historial.sql
 *
 * Después, con el visto bueno de Franco, se aplica:
 *   en tu computador:   npx.cmd wrangler d1 execute brunen-chatbot --local --file datos/historial.sql
 *   en la base real:    npx.cmd wrangler d1 execute brunen-chatbot --remote --file datos/historial.sql
 *                       (antes, anotar el punto de restauración: npx.cmd wrangler d1 time-travel info brunen-chatbot)
 *
 * El archivo SQL tiene datos reales de clientes: queda en `datos/`, que git ignora. Lo que se imprime son solo totales.
 * Correrlo dos veces no duplica nada.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { leerArchivo } from './anonimizar/lector.mjs';
import { convertir, sentencias } from './historial/convertir.mjs';

function hoyEnSantiago() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

function main() {
  const argumentos = process.argv.slice(2);
  const archivo = argumentos.find((a, i) => !a.startsWith('--') && argumentos[i - 1] !== '--hoja');
  if (!archivo) {
    console.log('Uso: npm run cargar-historial -- "datos/CONTROL PEDIDOS.xlsx" [--generar] [--hoja PEDIDOS]');
    return 1;
  }
  const generar = argumentos.includes('--generar');
  const posicionHoja = argumentos.indexOf('--hoja');
  const nombreHoja = posicionHoja >= 0 ? (argumentos[posicionHoja + 1] ?? 'PEDIDOS') : 'PEDIDOS';
  const hoja = leerArchivo(readFileSync(archivo), archivo).find((h) => h.nombre.trim().toUpperCase() === nombreHoja.toUpperCase());
  if (!hoja) throw new Error(`No encontré la hoja "${nombreHoja}".`);
  const filaEncabezado = hoja.filas.findIndex((f) => f.some((v) => String(v).trim().toLowerCase() === 'monto'));
  if (filaEncabezado < 0) throw new Error('No encontré la fila de encabezados (la que dice "Monto").');

  const hoy = hoyEnSantiago();
  const resultado = convertir(hoja.filas, filaEncabezado, hoy);
  const { pedidos, clientes, descartes } = resultado;
  const cuenta = (lista, f) => lista.reduce((m, x) => m.set(f(x), (m.get(f(x)) ?? 0) + 1), new Map());
  const mostrar = (titulo, mapa) => console.log(`${titulo}: ${[...mapa].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k || 'sin dato'} ${n}`).join(' · ')}`);

  console.log(`\nHoja "${hoja.nombre}" (hoy: ${hoy})`);
  console.log(`Pedidos que se cargarían: ${pedidos.length}. Descartados: ${[...descartes.values()].reduce((a, b) => a + b, 0)}.`);
  for (const [motivo, n] of descartes) console.log(`  - ${motivo}: ${n}`);
  console.log(`Clientes (uno por teléfono): ${clientes.length}. Direcciones distintas: ${clientes.reduce((a, c) => a + c.direcciones.size, 0)}.`);
  console.log(`Pedidos sin teléfono válido (quedan sin cliente; se pueden unir a mano): ${pedidos.filter((p) => !p.telefono).length}.`);
  console.log(`Pedidos sin monto: ${pedidos.filter((p) => p.total === null).length}. Con monto que no se divide exacto por la cantidad: ${pedidos.filter((p) => p.total !== null && p.lineas[0].precioUnitario === null).length}.`);
  mostrar('Estado', cuenta(pedidos, (p) => p.estado));
  mostrar('Tamaño', cuenta(pedidos, (p) => p.lineas[0].tipo));
  mostrar('Forma de pago', cuenta(pedidos, (p) => p.formaPago));
  mostrar('Pago', cuenta(pedidos, (p) => p.estadoPago));
  mostrar('Documento', cuenta(pedidos, (p) => p.documento));
  mostrar('Tipo de cliente', cuenta(pedidos, (p) => p.tipoCliente));
  console.log(`Fechas: de ${pedidos[0]?.fecha} a ${pedidos.at(-1)?.fecha}.`);

  if (!generar) {
    console.log('\nFue una simulación: no se escribió nada. Para generar el archivo, agrega --generar.');
    return 0;
  }
  mkdirSync('datos', { recursive: true });
  writeFileSync('datos/historial.sql', sentencias(resultado, Math.floor(Date.now() / 1000)), 'utf8');
  console.log('\nListo: datos/historial.sql (tiene datos reales: no lo compartas ni lo subas).');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exitCode = 1;
  }
}
