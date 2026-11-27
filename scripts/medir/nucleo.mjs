/**
 * Medidor del bot con chats reales (D96): lee chats exportados de WhatsApp, junta los mensajes seguidos de cada
 * cliente (como hace el bot) y cuenta qué entiende el intérprete por reglas. Lo que no entiende sale con los datos
 * personales ocultos, para revisarlo y sumarlo a tests/mensajes.json.
 *
 * Sin red y sin IA: el texto no sale del computador. Ocultar es una ayuda, no una garantía: un nombre o una
 * dirección escritos de otra forma pueden quedar a la vista, así que el informe se revisa antes de compartirlo.
 */

const INVISIBLES = /[‎‏‪-‮﻿]/g;
const ESPACIOS_RAROS = /[  ]/g;
const FECHA = String.raw`(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4}),? (\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([ap])\.?\s*m\.?)?`;
// Android: "26/11/26, 14:05 - Ana: hola". iPhone: "[26/11/26, 14:05:33] Ana: hola" o, en español, "[26-11-26, 2:05:33 p. m.] Ana: hola".
const LINEA_ANDROID = new RegExp(String.raw`^${FECHA} - ([^:\n]{1,60}?): (.*)$`, 'i');
const LINEA_IPHONE = new RegExp(String.raw`^\[${FECHA}\] ([^:\n]{1,60}?): (.*)$`, 'i');
// Una línea con fecha pero sin autor es del sistema ("Los mensajes están cifrados..."): no es de nadie.
const LINEA_SISTEMA = new RegExp(String.raw`^\[?${FECHA}\]?(?: -)? `, 'i');
const OMITIDO =
  /^(?:<?(?:multimedia|media) omit(?:ido|ted)>?|(?:imagen|audio|video|sticker|gif|documento|archivo|ubicaci[oó]n) omitid[oa]|se elimin[oó] este mensaje\.?|este mensaje fue eliminado\.?|eliminaste este mensaje\.?|this message was deleted\.?|.*\(archivo adjunto\))$/i;
const EDITADO = /\s*<se edit[oó] este mensaje\.?>\s*$/i;
// El iPhone pone el aviso de cifrado como un mensaje del contacto, y "Esperando el mensaje" cuando no se descargó (D103).
const AVISO_DE_WHATSAPP = /^(?:los mensajes y las llamadas est[aá]n cifrados|messages and calls are end-to-end encrypted|esperando el mensaje|waiting for this message)/i;
// "Hola, aquí va el pago imagen omitida": el texto que acompaña un archivo sí cuenta, sin la marca del archivo.
const ARCHIVO_AL_FINAL = /\s*(?:imagen|audio|video|sticker|gif|documento|archivo) omitid[oa]$/i;

function limpiar(linea) {
  return linea.replace(INVISIBLES, '').replace(ESPACIOS_RAROS, ' ');
}

function minutoDe([dia, mes, anio, hora, minuto, ampm]) {
  const a = Number(anio) < 100 ? 2000 + Number(anio) : Number(anio);
  let h = Number(hora) % (ampm ? 12 : 24);
  if (ampm && ampm.toLowerCase() === 'p') h += 12;
  return Date.UTC(a, Number(mes) - 1, Number(dia), h, Number(minuto)) / 60000;
}

/** Los mensajes de un chat exportado: autor, minuto (para saber cuáles van seguidos) y texto. Sin archivos ni avisos del sistema. */
export function leerChat(texto) {
  const mensajes = [];
  let actual = null;
  for (const cruda of texto.split(/\r?\n/)) {
    const linea = limpiar(cruda);
    const m = LINEA_ANDROID.exec(linea) ?? LINEA_IPHONE.exec(linea);
    if (m) {
      actual = { autor: m[7].trim(), minuto: minutoDe(m.slice(1, 7)), texto: m[8] };
      mensajes.push(actual);
    } else if (LINEA_SISTEMA.test(linea)) {
      actual = null;
    } else if (actual) {
      actual.texto += `\n${linea}`;
    }
  }
  return mensajes
    .map((m) => ({ ...m, texto: m.texto.replace(EDITADO, '').trim() }))
    .filter((m) => m.texto && !OMITIDO.test(m.texto) && !AVISO_DE_WHATSAPP.test(m.texto))
    .map((m) => ({ ...m, texto: m.texto.replace(ARCHIVO_AL_FINAL, '').trim() }))
    .filter((m) => m.texto);
}

/** Con dos o más chats, el negocio es quien escribe en todos (quien exportó los chats). Con uno solo no se sabe. */
export function detectarNegocio(chats) {
  if (chats.length < 2) return [];
  const [primero, ...resto] = chats.map((c) => new Set(c.map((m) => m.autor)));
  return [...primero].filter((autor) => resto.every((s) => s.has(autor))).sort();
}

/** Un mensaje del negocio que pide los datos del cliente: lo que conteste son su nombre y su dirección. */
const PIDE_DATOS = /direcci[oó]n|nombre|tus datos|sus datos|depto|departamento|comuna|n[uú]mero de casa|ubicaci[oó]n/i;

/**
 * Los mensajes seguidos de cada cliente, juntos: hasta 1 minuto entre uno y otro y sin respuesta en medio (el bot espera
 * 7 segundos, y los chats exportados solo dicen el minuto). `respondeADatos`: el negocio le acababa de pedir sus datos;
 * el bot lo entiende por el contexto (D37), así que no se mide ni se muestra (D97).
 */
export function agrupar(mensajes, negocio) {
  const grupos = [];
  let ultimo = null;
  let pidioDatos = false;
  for (const m of mensajes) {
    if (negocio.has(m.autor)) {
      ultimo = null;
      pidioDatos = PIDE_DATOS.test(m.texto);
      continue;
    }
    if (ultimo && ultimo.autor === m.autor && m.minuto - ultimo.minuto <= 1) {
      ultimo.texto += `\n${m.texto}`;
      ultimo.minuto = m.minuto;
    } else {
      ultimo = { autor: m.autor, minuto: m.minuto, texto: m.texto, respondeADatos: pidioDatos };
      pidioDatos = false;
      grupos.push(ultimo);
    }
  }
  return grupos.map(({ texto, respondeADatos }) => ({ texto, respondeADatos }));
}

const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Palabras con mayúscula que no son parte de una dirección: días, meses y cómo suele empezar un mensaje.
const NO_SON_CALLE = new Set(
  (
    'lunes martes miercoles miércoles jueves viernes sabado sábado domingo enero febrero marzo abril mayo junio julio agosto ' +
    'septiembre setiembre octubre noviembre diciembre hola buenas buenos gracias brunen hoy mañana manana para quiero necesito ' +
    'dame mandame mándame son serian serían seria sería somos solo sólo ok si sí ya y me mi te un una unos unas dos tres cuatro ' +
    'cinco seis siete ocho nueve diez porfa porfavor favor el la los las de del a al tipo como'
  ).split(' '),
);
// Lo que suele ir antes de la calle y no es parte de ella: queda a la vista.
const ANTES_DE_LA_CALLE = new Set(['mi', 'mí', 'direccion', 'dirección', 'es', 'en', 'vivo', 'queda', 'esta', 'está', 'al', 'para']);
// Palabras (con mayúscula o no) y un número de 2 a 5 cifras que no es de bidones, de horas ni de minutos.
const DIRECCION =
  /(?<![\p{L}\d.#])((?:\p{L}[\p{L}.]*\s+){1,4})#?\s?(\d{2,5})(?![\p{L}\d:])(?!\s*(?:de\b|x\b|bid|vid|botell|garraf|lts?\b|litros?\b|l\b|hrs?\b|horas?\b|am\b|pm\b|min))/giu;

function direccion(todo, palabras, numero) {
  const lista = palabras.trim().split(/\s+/);
  const n = Number(numero);
  const ultima = (lista.at(-1) ?? '').toLowerCase();
  if (ultima === 'de' || ultima === 'x') return todo; // "3 de 20"
  if ((ultima === 'las' || ultima === 'la' || ultima === 'a') && n <= 24) return todo; // "a las 12"
  const propias = lista.filter((p) => !NO_SON_CALLE.has(p.toLowerCase().replace(/\.$/, '')));
  if (n < 100 && propias.length === 0) return todo; // "el viernes 28"
  let i = 0;
  while (i < lista.length - 1 && ANTES_DE_LA_CALLE.has(lista[i].toLowerCase())) i++;
  const antes = lista.slice(0, i).join(' ');
  return antes ? `${antes} [DIRECCIÓN]` : '[DIRECCIÓN]';
}

/**
 * Oculta lo que identifica a alguien: enlaces, correos, RUT, teléfonos, el nombre que dice el mensaje ("soy", "me
 * llamo"), números de depto o casa, direcciones (con mayúscula o no) y los nombres de los autores del chat (D96, D97).
 */
export function ocultar(texto, nombres = []) {
  let t = texto
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[ENLACE]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[CORREO]')
    .replace(/\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g, '[RUT]')
    .replace(/\+?\d(?:[\s.-]?\d){7,}/g, '[TELÉFONO]')
    .replace(/(?<!\p{L})(soy|me llamo|mi nombre es|a nombre de|habla)\s+(\p{L}+(?:\s+\p{L}+){0,2})/giu, '$1 [NOMBRE]')
    // Antes que la dirección, para que su número no se lea como calle; "casa 3 de 12" es un pedido y queda.
    .replace(/(?<!\p{L})(depto|dpto|dto|departamento|depa|casa|block|torre|oficina)\.?\s*#?\s*\d+[a-z]?(?![\p{L}\d])(?!\s*(?:de|x)\b)/giu, '$1 [N]')
    .replace(DIRECCION, direccion);
  const palabras = [...new Set(nombres.flatMap((n) => n.split(/\s+/)).filter((p) => p.length >= 3))];
  for (const p of palabras) t = t.replace(new RegExp(String.raw`(?<![\p{L}\d])${escapar(p)}(?![\p{L}\d])`, 'giu'), '[NOMBRE]');
  return t;
}

/** Cuántos mensajes de cada intención y los no entendidos, ya ocultos. `interpretar` es el del bot. */
export function medir(grupos, interpretar, nombres = []) {
  const porIntencion = new Map();
  const revisar = [];
  let respuestasADatos = 0;
  for (const { texto, respondeADatos } of grupos) {
    if (respondeADatos) {
      respuestasADatos += 1;
      continue;
    }
    const { intencion } = interpretar(texto);
    porIntencion.set(intencion, (porIntencion.get(intencion) ?? 0) + 1);
    if (intencion === 'desconocido') revisar.push(ocultar(texto, nombres));
  }
  return { total: grupos.length - respuestasADatos, porIntencion, revisar, respuestasADatos };
}

const porcentaje = (n, total) => (total > 0 ? `${Math.round((n / total) * 100)} %` : '0 %');

/** El informe en Markdown: totales, por intención y los no entendidos (sin datos personales, a revisar igual). */
export function informe({ total, porIntencion, revisar, respuestasADatos = 0 }) {
  const desconocidos = porIntencion.get('desconocido') ?? 0;
  const filas = [...porIntencion].sort((a, b) => b[1] - a[1]).map(([intencion, n]) => `| ${intencion} | ${n} | ${porcentaje(n, total)} |`);
  return [
    '# Medición del bot con chats reales (D96)',
    '',
    `Mensajes del cliente: ${total} (los seguidos cuentan como uno, como en el bot).`,
    `Entendidos por las reglas: ${total - desconocidos} (${porcentaje(total - desconocidos, total)}). En producción, los no entendidos pasan además por la IA de respaldo antes de ir a una persona.`,
    `Respuestas a una pregunta por sus datos (no se miden ni se muestran): ${respuestasADatos}. El bot las entiende por el contexto.`,
    '',
    '| Intención | Mensajes | % |',
    '|---|---|---|',
    ...filas,
    '',
    '## No entendidos',
    '',
    'Se intentó ocultar teléfonos, correos, RUT, enlaces, nombres, direcciones y números de depto o casa. **Revísalos antes de compartirlos:** un nombre o una dirección escritos de otra forma pueden quedar a la vista.',
    '',
    ...revisar.map((texto, i) => `${i + 1}. ${texto.replace(/\n/g, ' / ')}`),
    '',
  ].join('\n');
}
