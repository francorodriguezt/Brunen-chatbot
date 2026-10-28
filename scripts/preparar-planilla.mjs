/**
 * Prepara la planilla de Google Sheets con las hojas y columnas del proyecto
 * (docs/conocimiento_brunen.md, sección 11). Se puede correr varias veces: no borra datos.
 *
 * Uso: npm run preparar-planilla -- RUTA_DE_LA_CLAVE.json ID_DE_LA_PLANILLA
 * La clave de la cuenta de servicio nunca se imprime ni se guarda en el repositorio.
 */

import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const [, , rutaClave, planillaId] = process.argv;
if (!rutaClave || !planillaId) {
  console.log('Uso: npm run preparar-planilla -- RUTA_DE_LA_CLAVE.json ID_DE_LA_PLANILLA');
  process.exit(1);
}

const HOJAS = {
  PEDIDOS: ['ID_Pedido', 'Fecha_Hora', 'Telefono', 'Nombre', 'Producto', 'Cantidad', 'Precio_Unitario', 'Total', 'Fecha_Entrega_Solicitada', 'Fecha_Entrega_Confirmada', 'Estado', 'Comuna', 'Direccion', 'Notas_Repartidor', 'Envases_A_Retirar', 'Confirmado_Por', 'Observaciones'],
  CLIENTES: ['Telefono', 'Nombre', 'Direccion', 'Comuna', 'Tipo', 'Precio_Especial_20L', 'Envases_Pendientes', 'Primera_Compra', 'Aviso_Hora', 'Credito', 'Fecha_Ultimo_Pedido', 'Total_Pedidos', 'Notas', 'Estado'],
  PRECIOS: ['Tipo', 'Desde', 'Hasta', 'Precio'],
  PAGOS: ['ID_Pago', 'Fecha_Hora', 'Telefono', 'ID_Pedido', 'Monto', 'Banco_Origen', 'URL_Comprobante', 'Estado', 'Verificado_Por'],
  CONFIGURACION: ['Variable', 'Valor', 'Descripcion'],
  FERIADOS: ['Fecha', 'Nombre'],
  // Columnas provisionales: el formato real depende del archivo de importación de la app de rutas (PENDIENTE).
  RUTA_DEL_DIA: ['Orden', 'Telefono', 'Nombre', 'Direccion', 'Comuna', 'Productos', 'Notas_Repartidor'],
  DASHBOARD: [],
  ERRORES: ['Fecha_Hora', 'Etapa', 'ID_Mensaje', 'Mensaje'],
  MENSAJES_PROCESADOS: ['Fecha_Hora', 'Wamid', 'Telefono_Enmascarado', 'Tipo', 'Resultado', 'Intencion'],
};

// Datos que ya están definidos en el documento de conocimiento (sección 2). Hasta vacío = "o más".
const PRECIOS = [['20L', 1, 1, 4500], ['20L', 2, 3, 3300], ['20L', 4, '', 2750], ['12L', 1, 1, 2500], ['12L', 2, '', 2400], ['10L', 1, '', 2200]];
const CONFIGURACION = [
  ['BOT_ACTIVO', 'SI', 'SI o NO. Con NO el bot deja de responder (regla 11). Se lee cada minuto.'],
  ['ESTADO_SERVICIO', 'normal', 'normal o reducido. Con reducido el bot agrega MENSAJE_EXCEPCION a sus respuestas.'],
  ['MENSAJE_EXCEPCION', '', 'Texto de aviso para clientes cuando hay una falla operativa (PENDIENTE: lo redacta el dueño).'],
];
const INICIALES = { PRECIOS, CONFIGURACION };

const clave = JSON.parse(readFileSync(rutaClave, 'utf8'));
const base64 = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');

async function tokenDeAcceso() {
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = `${base64({ alg: 'RS256', typ: 'JWT' })}.${base64({ iss: clave.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600 })}`;
  const firma = createSign('RSA-SHA256').update(cuerpo).sign(clave.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cuerpo}.${firma}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`No se obtuvo el token: ${r.status} ${j.error ?? ''}`);
  return j.access_token;
}

const token = await tokenDeAcceso();
const api = `https://sheets.googleapis.com/v4/spreadsheets/${planillaId}`;
async function llamar(ruta, metodo = 'GET', cuerpo) {
  const r = await fetch(`${api}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${metodo} ${ruta.slice(0, 40)}: ${r.status} ${j.error?.message ?? ''}`);
  return j;
}

// 1. Hojas: se renombra "Hoja 1" a PEDIDOS y se crean las que falten.
const actuales = (await llamar('?fields=sheets.properties(sheetId,title)')).sheets.map((h) => h.properties);
const titulos = new Set(actuales.map((h) => h.title));
const peticiones = [];
const hoja1 = actuales.find((h) => h.title === 'Hoja 1');
if (hoja1 && !titulos.has('PEDIDOS')) {
  peticiones.push({ updateSheetProperties: { properties: { sheetId: hoja1.sheetId, title: 'PEDIDOS' }, fields: 'title' } });
  titulos.add('PEDIDOS');
}
for (const nombre of Object.keys(HOJAS)) {
  if (!titulos.has(nombre)) peticiones.push({ addSheet: { properties: { title: nombre } } });
}
if (peticiones.length > 0) await llamar(':batchUpdate', 'POST', { requests: peticiones });
console.log(`Hojas: ${peticiones.length} cambio(s) de estructura.`);

// 2. Encabezados y datos iniciales, solo en hojas que estén vacías.
const ids = Object.fromEntries((await llamar('?fields=sheets.properties(sheetId,title)')).sheets.map((h) => [h.properties.title, h.properties.sheetId]));
const formato = [];
for (const [nombre, columnas] of Object.entries(HOJAS)) {
  const hoyVacia = !(await llamar(`/values/${encodeURIComponent(nombre)}!A1:A1`)).values;
  if (!hoyVacia) { console.log(`  ${nombre}: ya tiene datos, no se toca.`); continue; }
  const filas = columnas.length > 0 ? [columnas, ...(INICIALES[nombre] ?? [])] : [];
  if (filas.length > 0) {
    await llamar(`/values/${encodeURIComponent(nombre)}!A1?valueInputOption=RAW`, 'PUT', { values: filas });
    formato.push(
      { repeatCell: { range: { sheetId: ids[nombre], startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
      { updateSheetProperties: { properties: { sheetId: ids[nombre], gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
    );
  }
  console.log(`  ${nombre}: ${columnas.length} columnas${INICIALES[nombre] ? ` y ${INICIALES[nombre].length} fila(s) inicial(es)` : ''}.`);
}
if (formato.length > 0) await llamar(':batchUpdate', 'POST', { requests: formato });
console.log('Planilla lista.');
