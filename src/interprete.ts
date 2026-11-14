/**
 * Intérprete de mensajes por reglas (Etapa 3). Sin red, sin secretos y sin LLM: texto -> datos.
 *
 * Principio 1: el intérprete solo EXTRAE lo que dijo el cliente (tipo, cantidad, fecha como texto,
 * comuna). No calcula precios ni fechas de entrega: eso es de precios.ts y despacho.ts.
 * Lo que no entiende queda como "desconocido" para que el LLM de respaldo lo intente después.
 */

import type { TipoBidon } from './precios';
import { detectarComuna } from './comunas';
import { preparar } from './texto';

/** "no_especificado": el cliente pidió bidones sin decir de cuántos litros. */
export type TipoBidonPedido = TipoBidon | 'no_especificado';

export interface ItemInterpretado {
  tipo: TipoBidonPedido;
  /** null = el cliente nombró el tipo pero no dijo cuántos. */
  cantidad: number | null;
}

// "bidoness", "bidonez": se tolera la letra repetida del final, frecuente al escribir rápido.
const NOMBRE = /(?:[bv]idon(?:e?[sz]+)?|botellon(?:e?s+)?|garrafon(?:e?s+)?)/.source;
const TIPO = /(?:10|12|20)/.source;
const UNIDAD = /(?:\s+(?:l|lt|lts|ltr|ltrs|litros?))?/.source;

// "2 bidones de 20", "2 de 20", "2 bidones de 20 litros"
const CANTIDAD_Y_TIPO = new RegExp(String.raw`\b(\d{1,3})\s+(?:${NOMBRE}\s+(?:de\s+)?|de\s+)(${TIPO})${UNIDAD}\b`, 'g');
// "bidon de 20 x 3"
const TIPO_POR_CANTIDAD = new RegExp(String.raw`\b(?:${NOMBRE}\s+(?:de\s+)?|de\s+)(${TIPO})${UNIDAD}\s+x\s+(\d{1,3})\b`, 'g');
// "2 x 20", "2x20 lts" (el texto ya viene como "2 x 20"): primero la cantidad, después los litros.
const CANTIDAD_POR_TIPO = new RegExp(String.raw`\b(\d{1,3})\s+x\s+(${TIPO})${UNIDAD}\b`, 'g');
// "20 lts x 3": los litros llevan su unidad, así que la cantidad es la otra.
const TIPO_CON_UNIDAD_POR_CANTIDAD = new RegExp(String.raw`\b(${TIPO})\s+(?:l|lt|lts|ltr|ltrs|litros?)\s+x\s+(\d{1,3})\b`, 'g');
// "20 x 3": los litros primero y sin unidad. Se aplica después de "2 x 20", así "20 x 20" queda como 20 de 20.
const TIPO_SUELTO_POR_CANTIDAD = new RegExp(String.raw`\b(${TIPO})\s+x\s+(\d{1,3})\b`, 'g');
// "4 bidones" (sin tipo)
const SOLO_CANTIDAD = new RegExp(String.raw`\b(\d{1,3})\s+${NOMBRE}\b`, 'g');
// "bidon de 20", "bidones de 12 litros" (sin cantidad)
const NOMBRE_Y_TIPO = new RegExp(String.raw`\b(${NOMBRE})\s+(?:de\s+)?(${TIPO})${UNIDAD}\b`, 'g');
// "20 litros" (sin cantidad ni nombre)
const SOLO_TIPO_CON_UNIDAD = new RegExp(String.raw`\b(${TIPO})\s+(?:l|lt|lts|ltr|ltrs|litros?)\b`, 'g');

interface Hallazgo {
  posicion: number;
  largo: number;
  item: ItemInterpretado;
}

function aTipo(litros: string): TipoBidon {
  return `${litros}L` as TipoBidon;
}

function conCantidad(tipo: TipoBidonPedido, cantidad: string): ItemInterpretado | null {
  const n = Number(cantidad);
  return n > 0 ? { tipo, cantidad: n } : null;
}

function buscar(texto: string, patron: RegExp, aItem: (grupos: string[]) => ItemInterpretado | null): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  for (const m of texto.matchAll(patron)) {
    const item = aItem(m.slice(1).map((grupo) => grupo ?? ''));
    if (item) hallazgos.push({ posicion: m.index ?? 0, largo: m[0].length, item });
  }
  return hallazgos;
}

/** Tapa con espacios los tramos ya usados, para que otra regla no los lea dos veces. */
function tapar(texto: string, hallazgos: readonly Hallazgo[]): string {
  let resultado = texto;
  for (const { posicion, largo } of hallazgos) {
    resultado = resultado.slice(0, posicion) + ' '.repeat(largo) + resultado.slice(posicion + largo);
  }
  return resultado;
}

/**
 * Bidones que pidió el cliente, en el orden en que los nombró. Si repite un tipo, suma
 * ("2 de 20 y 1 de 20" -> 3 de 20): Constanza confirma igual (el bot registra y propone).
 */
export function extraerItems(texto: string): ItemInterpretado[] {
  let restante = preparar(texto);
  const hallazgos: Hallazgo[] = [];

  const aplicar = (patron: RegExp, aItem: (grupos: string[]) => ItemInterpretado | null) => {
    const nuevos = buscar(restante, patron, aItem);
    restante = tapar(restante, nuevos);
    hallazgos.push(...nuevos);
  };

  aplicar(CANTIDAD_Y_TIPO, ([cantidad = '', litros = '']) => conCantidad(aTipo(litros), cantidad));
  aplicar(TIPO_POR_CANTIDAD, ([litros = '', cantidad = '']) => conCantidad(aTipo(litros), cantidad));
  aplicar(TIPO_CON_UNIDAD_POR_CANTIDAD, ([litros = '', cantidad = '']) => conCantidad(aTipo(litros), cantidad));
  aplicar(CANTIDAD_POR_TIPO, ([cantidad = '', litros = '']) => conCantidad(aTipo(litros), cantidad));
  aplicar(TIPO_SUELTO_POR_CANTIDAD, ([litros = '', cantidad = '']) => conCantidad(aTipo(litros), cantidad));
  aplicar(SOLO_CANTIDAD, ([cantidad = '']) => conCantidad('no_especificado', cantidad));
  aplicar(NOMBRE_Y_TIPO, ([nombre = '', litros = '']) => ({
    tipo: aTipo(litros),
    // "bidon de 20" es uno; "bidones de 20" no dice cuántos.
    cantidad: /[sz]+$/.test(nombre) ? null : 1,
  }));
  aplicar(SOLO_TIPO_CON_UNIDAD, ([litros = '']) => ({ tipo: aTipo(litros), cantidad: null }));

  const porTipo = new Map<TipoBidonPedido, ItemInterpretado>();
  for (const { item } of hallazgos.sort((a, b) => a.posicion - b.posicion)) {
    const previo = porTipo.get(item.tipo);
    if (!previo) {
      porTipo.set(item.tipo, { ...item });
    } else if (previo.cantidad !== null || item.cantidad !== null) {
      previo.cantidad = (previo.cantidad ?? 0) + (item.cantidad ?? 0);
    }
  }
  return [...porTipo.values()];
}

const DIAS_SEMANA: Readonly<Record<string, string>> = {
  lunes: 'lunes',
  martes: 'martes',
  miercoles: 'miércoles',
  jueves: 'jueves',
  viernes: 'viernes',
  sabado: 'sábado',
  domingo: 'domingo',
};

const MESES = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const DIA_Y_MES = new RegExp(String.raw`\b\d{1,2} de (?:${MESES})\b`, 'g');
// "para el 20", "el dia 15", "2 de 20 el 15"; no cuando es parte de "15/11" o "15 de noviembre", ni cuando el número
// son litros o bidones ("el 20 lts", "el 12 x 2").
const DIA_SUELTO = new RegExp(
  String.raw`\b(?:para el dia|para el|el dia|el)\s+(\d{1,2})(?![/\d])(?!\s+(?:de|l|lt|lts|ltr|ltrs|litros?|x)\b)(?!\s+${NOMBRE}\b)\b`,
  'g',
);
// Días que el cliente descarta: "mañana no, el jueves" (mañana) y "el jueves, no el viernes" (viernes). Se buscan en el
// texto con sus comas, porque sin ellas "no el viernes" podría ser cualquiera de los dos.
const PALABRA_FECHA = String.raw`(?:pasado manana|manana|hoy|lunes|martes|miercoles|jueves|viernes|sabado|domingo)`;
const DESCARTADA_POR_NO_DESPUES = new RegExp(String.raw`\b(${PALABRA_FECHA})\s*(?:no|tampoco)\b`, 'g');
const DESCARTADA_POR_NO_ANTES = new RegExp(String.raw`[,;.]\s*(?:no|tampoco)\s+(?:el\s+|para\s+el\s+|para\s+)?(${PALABRA_FECHA})\b`, 'g');

function fechasDescartadas(texto: string): Set<string> {
  const conComas = texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ');
  const fuera = new Set<string>();
  for (const patron of [DESCARTADA_POR_NO_DESPUES, DESCARTADA_POR_NO_ANTES]) {
    for (const m of conComas.matchAll(patron)) if (m[1]) fuera.add(m[1]);
  }
  return fuera;
}

/**
 * Cuándo quiere el pedido, como texto ("mañana", "viernes", "15 de noviembre"). No calcula la
 * fecha de entrega. "en la mañana" es una hora del día, no el día siguiente.
 */
export function extraerFecha(texto: string): string | undefined {
  const t = preparar(texto);
  const candidatos: Array<{ posicion: number; fecha: string }> = [];
  const descartadas = fechasDescartadas(texto);

  // Toma la primera coincidencia válida de cada patrón; después gana la que aparece antes en el texto.
  const agregar = (patron: RegExp, aFecha: (m: RegExpMatchArray) => string | null) => {
    for (const m of t.matchAll(patron)) {
      if (descartadas.has(m[0])) continue;
      const fecha = aFecha(m);
      if (fecha) {
        candidatos.push({ posicion: m.index ?? 0, fecha });
        return;
      }
    }
  };

  agregar(/\bpasado manana\b/g, () => 'pasado mañana');
  agregar(/\bmanana\b/g, (m) => (/\b(?:la|esta)\s$/.test(t.slice(0, m.index ?? 0)) ? null : 'mañana'));
  agregar(/\bhoy\b/g, () => 'hoy');
  agregar(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/g, (m) => DIAS_SEMANA[m[1] ?? ''] ?? null);
  agregar(DIA_Y_MES, (m) => m[0]);
  agregar(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, (m) => m[0]);
  agregar(DIA_SUELTO, (m) => (Number(m[1]) >= 1 && Number(m[1]) <= 31 ? `el ${Number(m[1])}` : null));

  return candidatos.sort((a, b) => a.posicion - b.posicion)[0]?.fecha;
}

// ---------------------------------------------------------------------------------------------
// Intención. Las listas de frases son lo que se amplía cuando un mensaje real se entiende mal
// (y ese mensaje, anonimizado, se agrega a tests/mensajes.json). Se buscan sobre texto ya
// normalizado: sin tildes, en minúsculas y con los números en cifras.
// ---------------------------------------------------------------------------------------------

export type Intencion =
  | 'pedido'
  | 'repetir_pedido'
  | 'pregunta'
  | 'reclamo'
  | 'factura'
  | 'proveedor'
  | 'pago'
  | 'envases'
  | 'cambio'
  | 'saludo'
  | 'cierre'
  | 'desconocido';

export type TipoPregunta = 'precio' | 'zona' | 'horario' | 'pago';

/** Qué debería hacer el bot después. Las decisiones finales son de las etapas de pedido y alertas. */
export type AccionSugerida = 'escalar' | 'preguntar_tipo' | 'preguntar_cantidad' | 'preguntar_pedido';

/**
 * Resultado del intérprete. Es el mismo contrato JSON de tests/mensajes.json (por eso las claves
 * van en snake_case) y el que se le pedirá al LLM de respaldo: así los dos pasan por la misma validación.
 */
export interface Interpretacion {
  intencion: Intencion;
  items: ItemInterpretado[];
  fecha_texto?: string;
  comuna_mencionada?: string;
  /** Solo con intención "envases": cuántos envases vacíos quiere devolver el cliente. */
  envases_a_retirar?: number;
  tipo_pregunta?: TipoPregunta;
  accion?: AccionSugerida;
  /** Cómo dice que va a pagar, si lo dice con claridad ("pago en efectivo"). Se anota en el pedido. */
  forma_pago?: FormaDePagoMencionada;
  /** Pide envases nuevos ("no tengo envases", "con envase nuevo"): es carga inicial, que cuesta más que la recarga. */
  pide_envase?: true;
}

/** Las formas de pago que el cliente puede nombrar, con las mismas palabras que usa el panel (D52). */
export type FormaDePagoMencionada = 'efectivo' | 'transferencia' | 'redcompra';

// ---------------------------------------------------------------------------------------------
// Validación de ítems que vienen de fuera del intérprete: la respuesta de la IA y la memoria guardada
// en D1. Los dos usan el mismo contrato, así que se revisan con las mismas reglas.
// ---------------------------------------------------------------------------------------------

export const TIPOS_BIDON_PEDIDO: ReadonlySet<string> = new Set<TipoBidonPedido>(['10L', '12L', '20L', 'no_especificado']);
/** Tope de cantidad que acepta el contrato (el intérprete lee hasta 3 dígitos). */
export const CANTIDAD_MAXIMA = 999;
const MAX_ITEMS = 5;

/** Un entero de 1 a CANTIDAD_MAXIMA, o null. */
export function enteroValido(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 && valor <= CANTIDAD_MAXIMA ? valor : null;
}

/** null = no cumple el contrato (no es "sin ítems": eso es una lista vacía). Suma los ítems del mismo tipo. */
export function validarItems(crudo: unknown): ItemInterpretado[] | null {
  if (crudo === undefined) return [];
  if (!Array.isArray(crudo) || crudo.length > MAX_ITEMS) return null;
  const porTipo = new Map<TipoBidonPedido, ItemInterpretado>();
  for (const elemento of crudo) {
    if (typeof elemento !== 'object' || elemento === null) return null;
    const { tipo, cantidad } = elemento as Record<string, unknown>;
    if (typeof tipo !== 'string' || !TIPOS_BIDON_PEDIDO.has(tipo)) return null;
    if (cantidad !== null && enteroValido(cantidad) === null) return null;
    const previo = porTipo.get(tipo as TipoBidonPedido);
    if (!previo) {
      porTipo.set(tipo as TipoBidonPedido, { tipo: tipo as TipoBidonPedido, cantidad: cantidad as number | null });
    } else if (previo.cantidad !== null || cantidad !== null) {
      previo.cantidad = (previo.cantidad ?? 0) + ((cantidad as number | null) ?? 0);
    }
  }
  return [...porTipo.values()];
}

const palabras = (...frases: string[]): RegExp => new RegExp(String.raw`\b(?:${frases.join('|')})\b`);

// Principio 3: reclamos, facturas y pagos a proveedores se derivan siempre a una persona.
// Ante la duda se escala (principio 4), por eso estas listas son generosas.
const RECLAMO = palabras(
  'reclamo', 'reclamos', 'reclamar', 'queja', 'quejas', 'quejarme', 'defectuoso', 'defectuosa',
  'roto', 'rota', 'rotos', 'rotas', 'sucio', 'sucia', 'sucios', 'sucias', 'danado', 'danada',
  'danados', 'danadas', 'sello abierto', 'sin sello', 'derramado', 'derramada', 'gotea', 'goteando',
  'filtra', 'filtrando', 'pesimo', 'pesima', 'mal sabor', 'sabor raro', 'sabor feo', 'huele mal',
  'mal olor', 'no llego', 'no me llego', 'no han llegado', 'no ha llegado', 'no llegaron',
  'aun no llega', 'todavia no llega', 'aun no llegan', 'todavia no llegan', 'me faltaron', 'me falto',
  'se equivocaron', 'se equivoco', 'equivocado', 'equivocada', 'me cobraron de mas', 'cobro de mas',
  'cobraron mal', 'mala atencion', 'inaceptable', 'molesto', 'molesta', 'enojado', 'enojada',
);
// PENDIENTE (dueño): ¿el bot maneja boletas o también las deriva? Mientras tanto se derivan.
const FACTURA = palabras(
  'factura', 'facturas', 'facturar', 'facturacion', 'boleta', 'boletas', 'nota de credito',
  'nota de debito', 'guia de despacho', 'rut',
);
const PROVEEDOR = palabras('proveedor', 'proveedores', 'cobranza', 'me deben', 'cuando me pagan', 'pago pendiente');
// Frases específicas: "semana pasada" o "repetir" sueltas también aparecen en preguntas y reclamos.
const REPETIR = palabras(
  'lo de siempre', 'de siempre', 'como siempre', 'lo mismo', 'lo habitual', 'lo de costumbre',
  'mismo pedido', 'repetir el pedido', 'repite el pedido', 'repetir pedido',
  'lo de la semana pasada', 'lo de la vez pasada', 'lo de la ultima vez',
);
const VERBO_PEDIDO = palabras(
  'quiero', 'quisiera', 'queria', 'necesito', 'necesitamos', 'necesitaria', 'solicito', 'pido',
  'pedir', 'encargar', 'encargo', 'agendar', 'anota', 'anotame', 'ponme', 'dame', 'deme',
  'dejame', 'mandame', 'mandeme', 'traeme', 'traigame', 'enviame', 'envieme',
  'me puede traer', 'me pueden traer', 'puede traer', 'pueden traer', 'me puede mandar',
  'me pueden mandar', 'me puede enviar', 'me pueden enviar', 'me trae', 'me traen', 'me manda',
  'me mandan', 'me envia', 'me envian',
);
// Con un verbo de pedir pero sin bidones nombrados, solo es pedido si hablan del producto ("necesito ayuda" no lo es).
const MENCIONA_PRODUCTO = palabras(
  'bidon', 'bidones', 'vidon', 'vidones', 'botellon', 'botellones', 'garrafon', 'garrafones', 'agua',
  'recarga', 'recargas', 'carga', 'cargas',
);
const PEDIR_EXPLICITO = palabras('pedir', 'pido', 'encargar', 'encargo', 'agendar', 'pedido');
// Hablan de envases propios, no de pedir: "tengo 3 bidones vacios para devolver".
const DEVOLUCION = palabras('vacio', 'vacios', 'vacia', 'vacias', 'devolver', 'devolucion', 'retirar', 'retiran', 'envase', 'envases');
// Pide envases nuevos (carga inicial), no devuelve: "2 bidones de 20 con envase nuevo", "no tengo envases".
const SIN_ENVASE = palabras(
  'envase nuevo', 'envases nuevos', 'bidon nuevo', 'bidones nuevos', 'sin envase', 'sin envases', 'no tengo envase',
  'no tengo envases', 'no tengo bidon', 'no tengo bidones', 'con envase', 'con envases', 'carga inicial', 'primera vez',
);
// Cancelar, cambiar o mover un pedido que ya hizo: lo ve una persona (no se anota otro pedido encima).
// En Chile "cancelar" también es pagar ("cancelo en efectivo"): ese uso se quita antes de buscar.
const CAMBIO = palabras(
  'cancelar', 'cancela', 'cancelo', 'cancelen', 'cancelame', 'cancelado', 'anular', 'anula', 'anulo', 'anulen',
  'ya no quiero', 'ya no necesito', 'no quiero el pedido', 'no lo quiero', 'no los quiero',
  'cambiar el pedido', 'cambiar mi pedido', 'cambiar pedido', 'cambio el pedido', 'cambio de pedido',
  'modificar el pedido', 'modificar mi pedido', 'modificar pedido', 'corregir el pedido', 'corregir mi pedido',
  'mejor que sean', 'mejor que sea', 'en vez de', 'en lugar de', 'no voy a estar', 'no estare', 'no vamos a estar',
  'no estaremos', 'no hay nadie', 'reagendar', 'reagenda', 'reagendame', 'reprogramar', 'reprograma', 'otro dia',
  'cambiar la fecha', 'cambiar el dia', 'postergar', 'posponer',
);
const CANCELAR_ES_PAGAR =
  /\b(?:como|donde|cuando)\s+(?:puedo\s+|se\s+|les\s+)?cancel\w*|\bcancel\w*\s+(?:con|en|al|contra|por|cuando|apenas|despues|altiro|el total|todo)\b/g;
const PAGO_EFECTIVO = palabras('efectivo', 'cash', 'en la entrega', 'contra entrega', 'al recibir');
const PAGO_TRANSFERENCIA = palabras('transferencia', 'transfiero', 'transferire', 'por transferir');
const PAGO_TARJETA = palabras('tarjeta', 'redcompra', 'debito', 'maquinita');

const CON_FORMA_DE_PAGO: ReadonlySet<Intencion> = new Set<Intencion>(['pedido', 'repetir_pedido', 'desconocido']);

function formaDePago(t: string): FormaDePagoMencionada | undefined {
  const encontradas = [
    PAGO_EFECTIVO.test(t) ? 'efectivo' : null,
    PAGO_TRANSFERENCIA.test(t) ? 'transferencia' : null,
    PAGO_TARJETA.test(t) ? 'redcompra' : null,
  ].filter((forma): forma is FormaDePagoMencionada => forma !== null);
  return encontradas.length === 1 ? encontradas[0] : undefined; // con dos no está claro: lo ve una persona
}

const PREGUNTA_PRECIO = palabras(
  'cuanto sale', 'cuanto salen', 'cuanto cuesta', 'cuanto cuestan', 'cuanto vale', 'cuanto valen',
  'cuanto es', 'cuanto seria', 'cuanto me sale', 'cuanto cobran', 'precio', 'precios', 'valor',
  'valores', 'tarifa', 'tarifas', 'a cuanto',
);
const PREGUNTA_HORARIO = palabras(
  'horario', 'horarios', 'a que hora', 'hasta que hora', 'desde que hora', 'atienden', 'abren',
  'cierran', 'dias de reparto', 'dias de despacho', 'dias de entrega', 'que dias reparten',
  'que dias llegan', 'que dias despachan', 'que dias atienden', 'cuando llega', 'cuando llegan',
  'cuando entregan', 'cuando reparten', 'cuando me pueden traer',
  'trabajan el sabado', 'trabajan el domingo', 'trabajan sabado', 'trabajan domingo',
  'reparten el sabado', 'reparten el domingo', 'reparten sabado', 'reparten domingo',
  'reparten feriados', 'reparten festivos', 'trabajan feriados', 'trabajan festivos',
  'reparten los sabados', 'reparten los domingos', 'trabajan los sabados', 'trabajan los domingos',
  'llegan los sabados', 'llegan los domingos', 'llegan sabado', 'llegan domingo',
);
// "despachan los domingos", "hay reparto el sabado", "los feriados reparten?": verbo de reparto y un día, en cualquier orden.
const HORARIO_POR_DIA = new RegExp(
  String.raw`\b(?:reparten|reparte|despachan|despacha|entregan|entrega|trabajan|atienden|abren|hay reparto|hay despacho|hay entrega|hacen reparto|hacen despacho)\b.*\b(?:domingos?|sabados?|feriados?|festivos?|lunes|martes|miercoles|jueves|viernes)\b|\b(?:domingos?|sabados?|feriados?|festivos?|lunes|martes|miercoles|jueves|viernes)\b.*\b(?:reparten|reparte|despachan|despacha|entregan|entrega|trabajan|atienden|abren|hay reparto|hay despacho|hay entrega|hacen reparto|hacen despacho)\b`,
);
const PREGUNTA_PAGO = palabras(
  'como se paga', 'como pago', 'como pagar', 'como puedo pagar', 'medio de pago', 'medios de pago',
  'forma de pago', 'formas de pago', 'datos de la cuenta', 'datos para la transferencia',
  'datos de transferencia', 'datos para transferir', 'numero de cuenta', 'cuenta bancaria',
  'aceptan tarjeta', 'aceptan efectivo', 'aceptan transferencia', 'se puede pagar', 'puedo pagar',
  'como cancelo', 'como puedo cancelar', 'como se cancela', 'donde cancelo', 'forma de cancelar',
  'cuanto me cobraron', 'cuanto les debo', 'cuanto debo', 'cuanto les pague', 'cuanto pague',
);
// "llegan a", "despachan hasta", "reparten en": solo es pregunta de zona si además hay una comuna.
const VERBO_ZONA = new RegExp(
  String.raw`\b(?:llegan?|despachan?|reparten?|entregan?|cubren|van|hacen (?:despachos?|entregas?|repartos?))\s+(?:a|hasta|en|por|para)\b`,
);
const PALABRA_ZONA = palabras('cobertura', 'zona', 'zonas', 'comunas', 'sector', 'sectores');
const MENCION_PAGO = palabras(
  'transferi', 'transferimos', 'transferido', 'pague', 'pagamos', 'pagado', 'deposite', 'abone',
  'comprobante', 'voucher',
);

// Los saludos largos van antes que "buenas", para que no quede "tardes" suelto.
const SALUDOS = new RegExp(
  String.raw`\b(?:hola+|holi+|buenas tardes|buenas noches|buenos dias|buen dia|buenas|que tal|hey|saludos|estimad[oa]s?|como estan|como esta|como andan|todo bien)\b`,
  'g',
);
const RELLENO = new RegExp(String.raw`\b(?:por favor|porfa|porfis|amigos?|amigas?|equipo|brunen|a todos|todos)\b`, 'g');

// Mensajes que solo cierran la conversación: no se responden (cada respuesta gasta el cupo gratis).
const PALABRAS_CIERRE = new RegExp(
  String.raw`\b(?:muchas|mil|gracias|ok+|okey|oka|listo|dale|perfecto|vale|genial|excelente|bacan|buenisimo|super|ya|de acuerdo|entendido|recibido|nada mas|eso es todo|eso seria todo|eso nomas|por todo|saludos)\b`,
  'g',
);

function esSoloSaludo(t: string): boolean {
  const sinSaludo = t.replace(SALUDOS, ' ');
  return sinSaludo !== t && sinSaludo.replace(RELLENO, ' ').replace(/[\s?/]+/g, '') === '';
}

function esSoloCierre(t: string): boolean {
  return /[a-z0-9]/.test(t) && t.replace(PALABRAS_CIERRE, ' ').replace(/[\s?/]+/g, '') === '';
}

function tipoDePregunta(t: string, hayComuna: boolean): TipoPregunta | undefined {
  if ((hayComuna && VERBO_ZONA.test(t)) || PALABRA_ZONA.test(t)) return 'zona';
  if (PREGUNTA_PRECIO.test(t)) return 'precio';
  if (PREGUNTA_HORARIO.test(t) || HORARIO_POR_DIA.test(t)) return 'horario';
  if (PREGUNTA_PAGO.test(t)) return 'pago';
  return undefined;
}

export function accionDePedido(items: readonly ItemInterpretado[]): AccionSugerida | undefined {
  if (items.length === 0) return 'preguntar_pedido';
  if (items.some((item) => item.tipo === 'no_especificado')) return 'preguntar_tipo';
  if (items.some((item) => item.cantidad === null)) return 'preguntar_cantidad';
  return undefined;
}

/**
 * Qué quiere el cliente, según reglas. Orden de decisión (el primero que calza gana):
 *   1. reclamo / factura / proveedor -> escalar a una persona (aunque también pida bidones).
 *   1b. cancelar, cambiar o mover un pedido -> "cambio", también a una persona (no se anota otro pedido encima).
 *   2. "lo de siempre" sin bidones nombrados -> repetir_pedido.
 *   3. pregunta (precio, zona, horario, pago), salvo que además pida con verbo y cantidad.
 *   4. pedido: bidones nombrados (si no hablan de devolver envases), o un verbo de pedir junto al producto.
 *   5. aviso de pago, saludo, cierre; si nada calza, "desconocido" (lo toma el LLM de respaldo).
 */
export function interpretar(texto: string): Interpretacion {
  const t = preparar(texto);
  const items = extraerItems(texto);
  const comuna = detectarComuna(texto);
  const fecha = extraerFecha(texto);

  const pago = formaDePago(t);

  const resultado = (intencion: Intencion, extra: Partial<Interpretacion> = {}): Interpretacion => ({
    intencion,
    items,
    ...(fecha !== undefined && { fecha_texto: fecha }),
    ...(comuna !== null && { comuna_mencionada: comuna.nombre }),
    ...(pago !== undefined && CON_FORMA_DE_PAGO.has(intencion) && { forma_pago: pago }),
    ...extra,
  });

  const escalada = RECLAMO.test(t) ? 'reclamo' : FACTURA.test(t) ? 'factura' : PROVEEDOR.test(t) ? 'proveedor' : undefined;
  if (escalada) return resultado(escalada, { accion: 'escalar' });

  if (CAMBIO.test(t.replace(CANCELAR_ES_PAGAR, ' '))) return resultado('cambio', { accion: 'escalar' });

  // Una pregunta ("¿cuánto sale lo mismo de siempre?") nunca debe crear un pedido.
  if (REPETIR.test(t) && items.length === 0 && !tipoDePregunta(t, comuna !== null)) return resultado('repetir_pedido');

  const verbo = VERBO_PEDIDO.test(t);
  let tipoPregunta = tipoDePregunta(t, comuna !== null);
  // Solo una comuna y un "?": "¿Vitacura?" se entiende como pregunta de zona.
  if (!tipoPregunta && comuna !== null && t.includes('?') && items.length === 0 && !verbo) tipoPregunta = 'zona';
  if (tipoPregunta && !(verbo && items.some((item) => item.cantidad !== null))) {
    return resultado('pregunta', { tipo_pregunta: tipoPregunta });
  }

  const pideEnvases = SIN_ENVASE.test(t);
  const quierePedir =
    items.length > 0 ? verbo || pideEnvases || !DEVOLUCION.test(t) : verbo && (MENCIONA_PRODUCTO.test(t) || PEDIR_EXPLICITO.test(t));
  if (quierePedir) {
    const accion = accionDePedido(items);
    return resultado('pedido', { ...(accion && { accion }), ...(pideEnvases && { pide_envase: true }) });
  }

  // Envases vacíos para devolver (regla 5: se anotan para el repartidor). No es un pedido.
  if (DEVOLUCION.test(t) && !pideEnvases) {
    const envases = items.reduce((suma, item) => suma + (item.cantidad ?? 0), 0);
    return { ...resultado('envases'), items: [], ...(envases > 0 && { envases_a_retirar: envases }) };
  }

  if (MENCION_PAGO.test(t)) return resultado('pago');
  if (esSoloSaludo(t)) return resultado('saludo');
  if (esSoloCierre(t)) return resultado('cierre');
  return resultado('desconocido');
}
