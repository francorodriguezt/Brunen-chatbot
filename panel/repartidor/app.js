/**
 * Panel del repartidor (fase D, D61): la ruta de hoy, una tarjeta por parada, con Navegar, Llamar, Entregado (cuántos
 * vacíos retiró y si cobró) y No se pudo (el motivo).
 *
 * Sin señal: lo que marca se guarda en el teléfono y se envía solo cuando vuelve la conexión (`cola.js`, D84), y la
 * última ruta que cargó se sigue viendo. Ambas cosas se borran al salir; si quedan marcas sin enviar, pregunta antes.
 */

import { mostrarIngreso, pedir, registrarAplicacion } from '/ingreso.js';
import { agregar, cuerpoParaEnviar, enviarPendientes, normalizar, nuevaMarca, pendientes, quitar, rechazadas } from './cola.js';

const $ = (id) => document.getElementById(id);
const ZONA = 'America/Santiago';
const formatoDeHoy = new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' });
const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA });
const pesos = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const CLAVE_RUTA = 'brunen-ruta';
const CLAVE_COLA = 'brunen-pendientes';
const CLAVE_PANTALLA = 'brunen-pantalla-encendida';
const REINTENTO_MS = 30_000;

let ruta = null;
/** La tarjeta con su formulario abierto: { id, tipo: 'entregado' | 'no-se-pudo' }. */
let abierta = null;
/** El envío de la cola que está en curso (uno a la vez). */
let envioEnCurso = null;
/** Cuándo confirmó el servidor la ruta por última vez (ms) y si el último intento falló por falta de señal (D90). */
let ultimaSincronizacion = null;
let sinConexion = false;

// ---- Utilidades ----

function h(etiqueta, atributos = {}, ...hijos) {
  const elemento = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave === 'clase') elemento.className = valor;
    else if (clave.startsWith('on') && typeof valor === 'function') elemento.addEventListener(clave.slice(2), valor);
    else elemento.setAttribute(clave, valor === true ? '' : String(valor));
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    elemento.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return elemento;
}

const boton = (texto, clase, alHacerClic) => h('button', { type: 'button', clase, onclick: alHacerClic }, texto);

function leer(clave) {
  try {
    return JSON.parse(localStorage.getItem(clave) ?? 'null');
  } catch {
    return null;
  }
}

function guardar(clave, valor) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento (modo privado): se trabaja solo con conexión */
  }
}

let esperaDelMensaje;
function avisar(texto, esError = false) {
  const caja = $('mensaje');
  caja.textContent = texto;
  caja.classList.toggle('error', esError);
  caja.hidden = false;
  clearTimeout(esperaDelMensaje);
  esperaDelMensaje = setTimeout(() => (caja.hidden = true), 4000);
}

const hoy = () => formatoDia.format(new Date());
const cola = () => normalizar(leer(CLAVE_COLA));
const guardarCola = (nueva) => guardar(CLAVE_COLA, nueva.length > 0 ? nueva : null);

function textoBidones(bidones) {
  return ['20L', '12L', '10L']
    .filter((tipo) => bidones[tipo] > 0)
    .map((tipo) => `${bidones[tipo]} de ${tipo.replace('L', ' L')}`)
    .join(' y ');
}

const textoMotivo = (valor) => ruta?.motivos.find((m) => m.valor === valor)?.texto ?? valor;

// ---- Pantallas ----

function mostrarSolo(id) {
  for (const zona of ['ingreso', 'otra-sesion', 'ruta']) $(zona).hidden = zona !== id;
  $('barra').hidden = id !== 'ruta';
}

function pedirClave() {
  mostrarSolo('ingreso');
  mostrarIngreso({ contenedor: $('ingreso'), titulo: 'Repartidor', descripcion: 'Entra con tu RUT y tu clave.', rutaEntrar: '/api/sesion/entrar', alEntrar: mostrarRuta });
}

function mostrarRuta(usuario) {
  $('usuario').textContent = usuario.nombre;
  $('fecha-de-hoy').textContent = formatoDeHoy.format(new Date()).replace(',', '');
  mostrarSolo('ruta');
  void cargarRuta();
}

// ---- La ruta ----

/**
 * Lo marcado sin señal se ve en la tarjeta como si ya hubiera llegado, con "(por enviar)". Lo que el servidor rechazó
 * no cambia la tarjeta: se muestra el motivo para que el repartidor avise a la oficina (D84).
 */
function aplicarCola() {
  if (!ruta) return;
  for (const marca of cola()) {
    const parada = ruta.paradas.find((p) => p.idPedido === marca.id);
    if (!parada) continue;
    if (marca.rechazo) parada.rechazo = { op: marca.op, tipo: marca.tipo, motivo: marca.rechazo };
    else if (marca.tipo === 'entregado') {
      const monto = parada.cobrar ?? parada.cobrado ?? parada.montoEfectivo ?? null;
      Object.assign(parada, { estado: 'entregado', vaciosRetirados: marca.cuerpo.vacios, cobrado: marca.cuerpo.cobrado ? monto : null, cobrar: null, porEnviar: true });
    }
    else Object.assign(parada, { estado: 'no_se_pudo', motivo: marca.cuerpo.motivo, porEnviar: true });
  }
}

/** Las marcas rechazadas de paradas que ya no están en la ruta (por ejemplo, de otro día): van arriba de la lista. */
function pintarNoAnotadas() {
  const caja = $('no-anotadas');
  const enLaRuta = new Set((ruta?.paradas ?? []).map((p) => p.idPedido));
  const sueltas = rechazadas(cola()).filter((m) => !enLaRuta.has(m.id));
  caja.hidden = sueltas.length === 0;
  caja.replaceChildren(
    ...(sueltas.length > 0 ? [h('b', {}, sueltas.length === 1 ? 'Una marca no se anotó' : `${sueltas.length} marcas no se anotaron`), h('span', {}, '. Avisa a la oficina.')] : []),
    ...sueltas.map((m) =>
      h(
        'p',
        { clase: 'no-anotada' },
        `${m.nombre || m.id} (${m.tipo === 'entregado' ? 'Entregado' : 'No se pudo'}): ${m.rechazo} `,
        boton('Entendido', 'boton boton-chico', () => olvidarMarca(m.op)),
      ),
    ),
  );
}

// ---- Cambios de la ruta publicada (D94) ----

let confirmandoVersion = false;

/**
 * Si la oficina volvió a publicar la ruta cuando la app ya tenía otra, se avisa hasta que el repartidor toque
 * "Entendido". La primera versión del día que recibe la app se confirma sola: no hay cambio que avisar.
 */
function pintarCambioDeRuta() {
  const caja = $('cambio-ruta');
  const publicacion = ruta?.publicacion ?? null;
  const cambio = Boolean(publicacion && publicacion.vista !== null && publicacion.vista < publicacion.version);
  caja.hidden = !cambio;
  if (!cambio) {
    caja.replaceChildren();
    if (publicacion && publicacion.vista === null && !sinConexion) void confirmarVersion(publicacion.version, true);
    return;
  }
  caja.replaceChildren(
    h('b', {}, `La oficina cambió la ruta a las ${hora(publicacion.publicadaEn)}.`),
    ' Revisa el orden y la siguiente parada. ',
    boton('Entendido', 'boton boton-chico boton-principal', () => void confirmarVersion(publicacion.version, false)),
  );
}

async function confirmarVersion(version, enSilencio) {
  if (confirmandoVersion) return;
  confirmandoVersion = true;
  try {
    const { estado } = await pedir('/api/repartidor/ruta/vista', { version });
    if (estado === 401) return pedirClave();
    if (estado === 200) {
      if (ruta?.publicacion?.version === version) ruta.publicacion.vista = version;
      // También en la copia sin señal, para que el aviso no vuelva al abrir la app sin conexión.
      const guardada = leer(CLAVE_RUTA);
      if (guardada?.publicacion?.version === version) guardar(CLAVE_RUTA, { ...guardada, publicacion: { ...guardada.publicacion, vista: version } });
    } else if (estado === 409 && !enSilencio) {
      void cargarRuta(); // la oficina la cambió otra vez: se lee de nuevo
      return;
    }
  } catch {
    if (!enSilencio) avisar('Sin señal: toca Entendido de nuevo cuando vuelva.', true);
    return;
  } finally {
    confirmandoVersion = false;
  }
  pintarCambioDeRuta();
}

/** "Entendido": el repartidor ya vio el rechazo; se quita del teléfono. */
function olvidarMarca(op) {
  guardarCola(quitar(cola(), op));
  void cargarRuta();
}

async function cargarRuta() {
  limpiarVencido(); // la app puede quedar abierta de un día para otro
  try {
    const { estado, datos } = await pedir('/api/repartidor/ruta');
    if (estado === 401) return pedirClave();
    if (estado !== 200 || !datos) throw new Error('sin ruta');
    ruta = datos;
    guardar(CLAVE_RUTA, datos);
    ultimaSincronizacion = Date.now();
    sinConexion = false;
    $('aviso-conexion').hidden = true;
  } catch {
    sinConexion = true;
    const guardada = leer(CLAVE_RUTA);
    ruta = guardada?.fecha === hoy() ? guardada : null;
    $('aviso-conexion').textContent = ruta ? 'Sin conexión: ves la última ruta que se cargó. Lo que marques se envía cuando vuelva la señal.' : 'Sin conexión. Cuando vuelva la señal, toca Actualizar.';
    $('aviso-conexion').hidden = false;
  }
  aplicarCola();
  pintar();
}

function pintar() {
  // Cada cambio de la ruta (cargarla, marcar una parada) revisa si la pantalla sigue encendida.
  if ('wakeLock' in navigator) void ajustarPantalla();
  pintarUbicacion();
  ajustarSeguimiento();
  pintarNoAnotadas();
  pintarCambioDeRuta();
  pintarSincronizacion();
  const lista = $('paradas');
  const cifras = $('cifras-ruta');
  if (!ruta || ruta.paradas.length === 0) {
    cifras.replaceChildren();
    pintarSiguiente(null);
    lista.replaceChildren(h('p', { clase: 'vacio' }, ruta ? 'No hay entregas confirmadas para hoy.' : 'Todavía no se pudo cargar la ruta de hoy.'));
    return;
  }
  const hechas = ruta.paradas.filter((p) => p.estado !== 'pendiente').length;
  const cifra = (numero, palabra) => h('li', {}, h('b', {}, String(numero)), ` ${palabra}`);
  // replaceChildren escribe "null" si recibe null: se filtran los que no van.
  cifras.replaceChildren(
    ...[
      // El avance primero, como "1 de 6" (D90).
      cifra(`${hechas} de ${ruta.paradas.length}`, ruta.paradas.length === 1 ? 'lista' : 'listas'),
      cifra(ruta.totalBidones, ruta.totalBidones === 1 ? 'bidón' : 'bidones'),
      ruta.cargas.length > 1 ? cifra(ruta.cargas.length, 'viajes') : null,
    ].filter(Boolean),
  );
  // La siguiente es la primera pendiente en el orden de la ruta publicada: no se reordena nada (D90).
  const siguiente = ruta.paradas.find((p) => p.estado === 'pendiente') ?? null;
  pintarSiguiente(siguiente);
  lista.replaceChildren(
    ...ruta.paradas.flatMap((parada) => {
      // Cada viaje lleva su encabezado (aunque sea uno solo): qué cargar, dónde recargar y su ruta en Maps.
      const carga = ruta.cargas.find((c) => c.desde === parada.orden);
      const titulo = carga ? encabezadoDeCarga(carga) : null;
      const esta = tarjeta(parada, parada === siguiente);
      return titulo ? [titulo, esta] : [esta];
    }),
  );
}

/** La siguiente parada, arriba y destacada (D90): a quién, dónde, y botones para navegar o ir a su tarjeta. */
function pintarSiguiente(p) {
  const caja = $('siguiente');
  if (!ruta || ruta.paradas.length === 0) {
    caja.hidden = true;
    return;
  }
  if (!p) {
    caja.replaceChildren(h('p', {}, h('b', {}, 'Todas las paradas están listas.')));
    caja.hidden = false;
    return;
  }
  const { lugar, google } = enlacesDe(p);
  caja.replaceChildren(
    h('p', { clase: 'suave' }, 'Siguiente parada'),
    h('p', { clase: 'siguiente-nombre' }, `${p.orden}. ${p.nombre || 'Sin nombre'}`),
    h('p', {}, lugar),
    h(
      'div',
      { clase: 'acciones' },
      h('a', { clase: 'boton boton-principal', href: google, target: '_blank', rel: 'noopener noreferrer' }, 'Navegar'),
      boton('Ir a la parada', 'boton', () => document.getElementById(`parada-${p.idPedido}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })),
    ),
  );
  caja.hidden = false;
}

/** Una línea fija con la conexión y lo marcado (D90). Nunca dice "al día" si queda algo sin confirmar por el servidor. */
function pintarSincronizacion() {
  const linea = $('estado-sincronizacion');
  const porEnviar = pendientes(cola()).length;
  const marcas = (n) => `${n} ${n === 1 ? 'marca' : 'marcas'} por enviar`;
  let texto;
  if (sinConexion || !navigator.onLine) texto = porEnviar > 0 ? `Sin conexión · ${marcas(porEnviar)}` : 'Sin conexión';
  else if (envioEnCurso) texto = 'Enviando…';
  else texto = porEnviar > 0 ? marcas(porEnviar) : 'Al día';
  if (ultimaSincronizacion) texto += ` · última sincronización ${formatoHora.format(new Date(ultimaSincronizacion))}`;
  linea.textContent = texto;
  linea.classList.toggle('pendiente', porEnviar > 0 || sinConexion);
}

/** Enlaces para navegar a una parada: a su punto exacto si se conoce (D63); si no, a la dirección escrita. */
function enlacesDe(p) {
  const lugar = [p.direccion, p.comuna].filter(Boolean).join(', ') || 'sin dirección';
  const destino = encodeURIComponent(`${lugar}, Chile`);
  const coordenadas = p.punto ? `${p.punto.lat},${p.punto.lng}` : null;
  return {
    lugar,
    google: coordenadas ? `https://www.google.com/maps/dir/?api=1&destination=${coordenadas}&travelmode=driving` : `https://www.google.com/maps/search/?api=1&query=${destino}`,
    waze: coordenadas ? `https://waze.com/ul?ll=${coordenadas}&navigate=yes` : `https://waze.com/ul?q=${destino}&navigate=yes`,
  };
}

const NOMBRE_DE_DEPOSITO = { planta: 'la planta', actum: 'Actum' };
const TAMANOS = [['20L', '20 L'], ['12L', '12 L'], ['10L', '10 L']];

/** El encabezado de un viaje (D67): cuántos bidones de cada tamaño subir, dónde recargar y la ruta del viaje en Maps. */
function encabezadoDeCarga(carga) {
  const total = ruta.cargas.length;
  const detalle = TAMANOS.filter(([tipo]) => (carga.bidones?.[tipo] ?? 0) > 0).map(([tipo, nombre]) => `${carga.bidones[tipo]} de ${nombre}`).join(' y ');
  const recarga = carga.numero > 1 ? (carga.recargaEn ? `Antes, recarga en ${NOMBRE_DE_DEPOSITO[carga.recargaEn]}.` : 'Antes, recarga en la planta o en Actum.') : null;
  const mapas = carga.mapas ?? [];
  return h(
    'div',
    { clase: 'encabezado-carga' },
    h('h3', { clase: 'titulo-carga' }, total > 1 ? `Viaje ${carga.numero} de ${total}` : 'Tu viaje'),
    h('p', {}, h('b', {}, 'Cargar: '), detalle || `${carga.totalBidones} bidones`, carga.excedeFurgon ? ' (no cabe en un viaje: avisa)' : ''),
    recarga ? h('p', { clase: 'suave' }, recarga) : null,
    mapas.length > 0
      ? h(
          'div',
          { clase: 'acciones' },
          ...mapas.map((enlace, i) =>
            h('a', { clase: 'boton boton-principal', href: enlace, target: '_blank', rel: 'noopener noreferrer' }, mapas.length > 1 ? `Ruta en Maps (parte ${i + 1})` : 'Ruta del viaje en Maps'),
          ),
        )
      : null,
  );
}

function insignia(parada, esSiguiente) {
  if (parada.estado === 'entregado') return h('span', { clase: 'insignia verde' }, parada.porEnviar ? 'Entregado (por enviar)' : 'Entregado');
  if (parada.estado === 'no_se_pudo') return h('span', { clase: 'insignia rojo' }, parada.porEnviar ? 'No se pudo (por enviar)' : 'No se pudo');
  if (esSiguiente) return h('span', { clase: 'insignia azul' }, 'Siguiente');
  return null;
}

function tarjeta(p, esSiguiente = false) {
  const { lugar, google: enGoogle, waze: enWaze } = enlacesDe(p);
  const formulario = abierta?.id === p.idPedido ? (abierta.tipo === 'entregado' ? formularioEntregado(p) : formularioNoSePudo(p)) : null;
  return h(
    'article',
    { clase: `tarjeta parada parada-${p.estado}${esSiguiente ? ' parada-siguiente' : ''}`, id: `parada-${p.idPedido}` },
    h('div', { clase: 'tarjeta-cabecera' }, h('span', { clase: 'persona-nombre' }, `${p.orden}. ${p.nombre || 'Sin nombre'}`), insignia(p, esSiguiente)),
    h(
      'div',
      { clase: 'datos' },
      h('span', {}, h('b', {}, 'Dirección: '), lugar),
      h('span', {}, h('b', {}, 'Deja: '), textoBidones(p.bidones)),
      // Uno por bidón es lo normal; esto avisa solo cuando además debe vacíos de antes (D72).
      p.envasesARetirar > 0 ? h('span', {}, h('b', {}, 'Retirar: '), `${p.vaciosEsperados ?? p.envasesARetirar} vacíos (${p.envasesARetirar} que debía)`) : null,
      p.cobrar !== null ? h('span', { clase: 'cobrar' }, h('b', {}, 'Cobrar en efectivo: '), pesos.format(p.cobrar)) : p.formaPago ? h('span', {}, h('b', {}, 'Pago: '), p.formaPago) : null,
      p.notas ? h('span', {}, h('b', {}, 'Notas: '), p.notas) : null,
      p.estado === 'entregado' && p.vaciosRetirados !== null ? h('span', { clase: 'suave' }, `Retiró ${p.vaciosRetirados} ${p.vaciosRetirados === 1 ? 'vacío' : 'vacíos'}.`) : null,
      p.estado === 'no_se_pudo' ? h('span', { clase: 'suave' }, `Motivo: ${textoMotivo(p.motivo)}.`) : null,
    ),
    p.rechazo
      ? h(
          'p',
          { clase: 'revision no-anotada' },
          h('b', {}, `No se anotó «${p.rechazo.tipo === 'entregado' ? 'Entregado' : 'No se pudo'}»: `),
          `${p.rechazo.motivo} Avisa a la oficina. `,
          boton('Entendido', 'boton boton-chico', () => olvidarMarca(p.rechazo.op)),
        )
      : null,
    h(
      'div',
      { clase: 'acciones' },
      h('a', { clase: 'boton', href: enGoogle, target: '_blank', rel: 'noopener noreferrer' }, 'Navegar'),
      h('a', { clase: 'boton', href: enWaze, target: '_blank', rel: 'noopener noreferrer' }, 'Waze'),
      p.telefono ? h('a', { clase: 'boton', href: `tel:+${p.telefono}` }, 'Llamar') : null,
      boton(p.estado === 'entregado' ? 'Corregir' : 'Entregado', 'boton boton-principal', () => abrir(p.idPedido, 'entregado')),
      p.estado === 'pendiente' ? boton('No se pudo', 'boton', () => abrir(p.idPedido, 'no-se-pudo')) : null,
    ),
    formulario,
  );
}

function abrir(id, tipo) {
  abierta = abierta?.id === id && abierta.tipo === tipo ? null : { id, tipo };
  pintar();
}

function formularioEntregado(p) {
  const vacios = h('input', { type: 'number', min: 0, max: 200, inputmode: 'numeric', value: p.vaciosRetirados ?? p.vaciosEsperados ?? p.envasesARetirar, clase: 'campo-corto', 'aria-label': 'Vacíos que retiraste' });
  // Al corregir una entrega, la casilla muestra lo que ya cobró: si no, se borraría el cobro.
  const corrigiendo = p.estado === 'entregado';
  const monto = corrigiendo ? (p.cobrado ?? p.montoEfectivo) : p.cobrar;
  const cobro = monto !== null && monto !== undefined ? h('input', { type: 'checkbox', checked: corrigiendo ? p.cobrado !== null : true }) : null;
  // Solo si esa dirección no tiene su punto en el mapa o el que tiene es impreciso, y solo al entregar (no al corregir).
  const ubicar = !corrigiendo && (!p.punto || p.punto.afinar) && 'geolocation' in navigator ? h('input', { type: 'checkbox', checked: true }) : null;
  // Una nota opcional para la oficina (D91): queda en el historial del pedido.
  const observacion = h('input', { type: 'text', maxlength: 200, placeholder: 'Observación (opcional)', 'aria-label': 'Observación' });
  const confirmar = async () => {
    const numero = Number(vacios.value);
    if (!Number.isInteger(numero) || numero < 0 || numero > 200) return avisar('Escribe cuántos vacíos retiraste (0 si ninguno).', true);
    const nota = observacion.value.trim();
    const cuerpo = { vacios: numero, cobrado: cobro ? cobro.checked : false, ...(nota ? { observacion: nota } : {}) };
    if (ubicar?.checked) {
      avisar('Buscando dónde estás (unos segundos)…');
      Object.assign(cuerpo, await ubicacionActual());
    }
    void marcar(p, 'entregado', cuerpo);
  };
  return h(
    'div',
    { clase: 'formulario-parada' },
    h('label', {}, 'Vacíos que retiraste ', vacios),
    cobro ? h('label', {}, cobro, ` Cobré ${pesos.format(monto)} en efectivo`) : null,
    ubicar ? h('label', {}, ubicar, ' Guardar dónde queda esta dirección, para el mapa de la ruta') : null,
    ubicar ? h('p', { clase: 'suave nota-ubicacion' }, 'El teléfono dice dónde estás solo en este momento, una vez. No se sigue tu recorrido.') : null,
    observacion,
    h('div', { clase: 'acciones' }, boton('Confirmar entrega', 'boton boton-principal', () => void confirmar()), boton('Cancelar', 'boton', () => abrir(p.idPedido, 'entregado'))),
  );
}

function formularioNoSePudo(p) {
  const motivo = h('select', { 'aria-label': 'Motivo' }, ...ruta.motivos.map((m) => h('option', { value: m.valor }, m.texto)));
  const detalle = h('input', { type: 'text', maxlength: 200, placeholder: 'Detalle (opcional)', 'aria-label': 'Detalle' });
  return h(
    'div',
    { clase: 'formulario-parada' },
    h('label', {}, 'Motivo ', motivo),
    detalle,
    h(
      'div',
      { clase: 'acciones' },
      boton('Confirmar', 'boton boton-principal', () => void marcar(p, 'no-se-pudo', { motivo: motivo.value, detalle: detalle.value })),
      boton('Cancelar', 'boton', () => abrir(p.idPedido, 'no-se-pudo')),
    ),
  );
}

// ---- Pantalla encendida (D64) ----

/**
 * Que el teléfono no se bloquee en plena ruta ("wake lock" del navegador). Solo mientras quedan paradas y la aplicación
 * está a la vista: el navegador lo suelta solo al cambiar de aplicación, y se pide de nuevo al volver. El repartidor
 * lo puede apagar; la elección queda en el teléfono.
 */
let bloqueoDePantalla = null;
let ajustandoPantalla = false; // dos repintados seguidos no deben pedir dos bloqueos
const quierePantallaEncendida = () => leer(CLAVE_PANTALLA) !== false;

async function ajustarPantalla() {
  if (ajustandoPantalla) return;
  ajustandoPantalla = true;
  const quedan = ruta?.paradas.some((p) => p.estado === 'pendiente') ?? false;
  const debe = quierePantallaEncendida() && quedan && document.visibilityState === 'visible';
  try {
    if (debe && !bloqueoDePantalla) {
      bloqueoDePantalla = await navigator.wakeLock.request('screen');
      bloqueoDePantalla.addEventListener('release', () => (bloqueoDePantalla = null));
    } else if (!debe && bloqueoDePantalla) {
      await bloqueoDePantalla.release();
      bloqueoDePantalla = null;
    }
  } catch {
    bloqueoDePantalla = null; // sin batería suficiente o sin permiso: el teléfono se comporta como siempre
  } finally {
    ajustandoPantalla = false;
  }
}

function prepararPantalla() {
  if (!('wakeLock' in navigator)) return; // navegadores antiguos: no se ofrece
  const casilla = $('pantalla-encendida');
  casilla.checked = quierePantallaEncendida();
  casilla.addEventListener('change', () => {
    guardar(CLAVE_PANTALLA, casilla.checked);
    void ajustarPantalla();
  });
  $('opcion-pantalla').hidden = false;
  document.addEventListener('visibilitychange', () => void ajustarPantalla());
}

// ---- Ubicación durante la jornada (fase E, D80) ----
//
// El navegador solo deja medir la posición con la app abierta y a la vista (D79): al cambiar a Google Maps o bloquear
// el teléfono se detiene, y vuelve sola al regresar. Por eso la hora de llegada sale sobre todo de las entregas marcadas;
// la posición la afina cuando está fresca. Solo con su consentimiento y entre "Iniciar ruta" y "Terminar jornada".

const CLAVE_POSICIONES = 'brunen-posiciones';
const CLAVE_AHORA_NO = 'brunen-ubicacion-ahora-no';
const CADA_SEGUNDOS = 30; // una posición cada 30 segundos, o antes si se movió más de 100 metros
const METROS_PARA_ENVIAR = 100;
const MAXIMO_EN_COLA = 120;
let vigilancia = null;
let ultimaGuardada = null;
let ultimaMedida = null;
let enviandoPosiciones = false;

const formatoHora = new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false });
const hora = (segundos) => formatoHora.format(new Date(segundos * 1000));
const jornadaAbierta = () => Boolean(ruta?.ubicacion?.jornada && ruta.ubicacion.jornada.terminadaEn === null);
const colaDePosiciones = () => leer(CLAVE_POSICIONES) ?? [];

function metrosEntre(a, b) {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371000;
}

function ahoraNo() {
  try {
    return sessionStorage.getItem(CLAVE_AHORA_NO) === '1';
  } catch {
    return false;
  }
}

/** La tarjeta de arriba: pedir el consentimiento (una vez), "Iniciar ruta" o "Terminar jornada". */
function pintarUbicacion() {
  const caja = $('ubicacion');
  const u = ruta?.ubicacion;
  if (!u || !('geolocation' in navigator)) {
    caja.hidden = true;
    return;
  }
  const partes = [];
  if (!u.consentimiento && !ahoraNo()) {
    partes.push(
      h('h3', {}, 'Compartir tu ubicación durante la ruta'),
      h('p', {}, 'Así la oficina ve por dónde va el reparto y puede decirle al cliente que pregunta más o menos cuándo llegas.'),
      h(
        'ul',
        {},
        h('li', {}, 'Solo entre «Iniciar ruta» y «Terminar jornada», y solo de 6:00 a 22:00.'),
        h('li', {}, 'Solo con esta app abierta: no sigue tu teléfono cuando usas otra app.'),
        h('li', {}, 'Lo ven el dueño y la oficina. A un cliente que pregunta se le dice solo una hora aproximada, nunca dónde estás. Se borra a los 3 días.'),
        h('li', {}, 'Puedes dejar de compartir cuando quieras, y se borra lo guardado.'),
      ),
      h('div', { clase: 'acciones' }, boton('Acepto', 'boton boton-principal', () => void decidirUbicacion(true)), boton('Ahora no', 'boton', () => dejarParaDespues())),
    );
  }
  if (jornadaAbierta()) {
    const desde = hora(u.jornada.iniciadaEn);
    const estado = !u.consentimiento
      ? 'sin compartir tu ubicación'
      : ultimaMedida
        ? `compartiendo tu ubicación (última ${Math.max(0, Math.round(Date.now() / 1000 - ultimaMedida.en))} s)`
        : 'compartiendo tu ubicación';
    partes.push(
      h('p', {}, h('b', {}, `Ruta iniciada a las ${desde}`), ` · ${estado}`),
      h(
        'div',
        { clase: 'acciones' },
        boton('Terminar jornada', 'boton', () => void cambiarJornada('terminar')),
        u.consentimiento ? boton('Dejar de compartir', 'boton boton-chico', () => void decidirUbicacion(false)) : null,
      ),
    );
  } else {
    partes.push(h('div', { clase: 'acciones' }, boton(u.jornada ? 'Iniciar de nuevo' : 'Iniciar ruta', 'boton boton-principal', () => void cambiarJornada('iniciar'))));
  }
  caja.replaceChildren(...partes);
  caja.hidden = false;
}

function dejarParaDespues() {
  try {
    sessionStorage.setItem(CLAVE_AHORA_NO, '1');
  } catch {
    /* sin almacenamiento: se vuelve a preguntar al recargar */
  }
  pintarUbicacion();
}

async function decidirUbicacion(acepta) {
  try {
    const { estado, datos } = await pedir('/api/repartidor/ubicacion', { acepta });
    if (estado === 401) return pedirClave();
    if (estado !== 200) return avisar(datos?.error ?? 'No se pudo guardar. Intenta de nuevo.', true);
    ruta.ubicacion = datos.ubicacion;
    if (!acepta) guardar(CLAVE_POSICIONES, null);
    avisar(acepta ? 'Gracias. Se comparte solo durante la jornada.' : 'Listo: ya no se comparte y se borró lo guardado.');
    pintar();
  } catch {
    avisar('Sin señal: inténtalo cuando vuelva.', true);
  }
}

async function cambiarJornada(accion) {
  try {
    const { estado, datos } = await pedir('/api/repartidor/jornada', { accion });
    if (estado === 401) return pedirClave();
    if (estado !== 200) return avisar(datos?.error ?? 'No se pudo. Intenta de nuevo.', true);
    ruta.ubicacion = datos.ubicacion;
    if (accion === 'terminar') await enviarPosiciones(); // lo que quedó medido antes de terminar
    avisar(accion === 'iniciar' ? 'Ruta iniciada. ¡Buen reparto!' : 'Jornada terminada. Ya no se comparte tu ubicación.');
    pintar();
  } catch {
    avisar('Sin señal: inténtalo cuando vuelva.', true);
  }
}

/** Mide solo con consentimiento, la jornada abierta y la app a la vista; si no, deja de medir. */
function ajustarSeguimiento() {
  const debe = Boolean(ruta?.ubicacion?.consentimiento) && jornadaAbierta() && document.visibilityState === 'visible' && 'geolocation' in navigator;
  if (debe && vigilancia === null) {
    vigilancia = navigator.geolocation.watchPosition(alMedir, () => {}, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 });
  } else if (!debe && vigilancia !== null) {
    navigator.geolocation.clearWatch(vigilancia);
    vigilancia = null;
  }
}

function alMedir(posicion) {
  const medida = { lat: posicion.coords.latitude, lng: posicion.coords.longitude, precision: Math.round(posicion.coords.accuracy), en: Math.floor(Date.now() / 1000) };
  ultimaMedida = medida;
  const toca = !ultimaGuardada || medida.en - ultimaGuardada.en >= CADA_SEGUNDOS || metrosEntre(ultimaGuardada, medida) >= METROS_PARA_ENVIAR;
  if (!toca || medida.precision > 500) return;
  ultimaGuardada = medida;
  guardar(CLAVE_POSICIONES, [...colaDePosiciones(), medida].slice(-MAXIMO_EN_COLA));
  void enviarPosiciones();
  pintarUbicacion();
}

/** Envía lo medido en tandas. Sin señal quedan en el teléfono y salen después; si el servidor dice que no, se descartan. */
async function enviarPosiciones() {
  if (enviandoPosiciones) return;
  enviandoPosiciones = true;
  try {
    while (colaDePosiciones().length > 0) {
      const tanda = colaDePosiciones().slice(0, 30);
      const { estado } = await pedir('/api/repartidor/posiciones', { posiciones: tanda });
      if (estado === 401) return pedirClave();
      // 200 (guardadas), 409 (sin jornada o sin consentimiento) o 400: en todos, esa tanda ya no se reintenta.
      guardar(CLAVE_POSICIONES, colaDePosiciones().slice(tanda.length));
      if (estado === 409) {
        guardar(CLAVE_POSICIONES, null);
        void cargarRuta(); // algo cambió (terminó la jornada desde otro lado): se vuelve a leer
        return;
      }
    }
  } catch {
    /* sin señal: queda en la cola */
  } finally {
    enviandoPosiciones = false;
  }
}

// ---- Probar la ubicación en este teléfono (D79): solo local, no se envía a nadie ----

let prueba = null;

function pintarPrueba() {
  const registro = prueba?.registro ?? [];
  $('probar-ubicacion').textContent = prueba?.vigilancia !== null && prueba ? 'Terminar' : 'Empezar';
  const huecos = registro.filter((r) => r.hueco).length;
  $('resumen-prueba').hidden = registro.length === 0;
  $('resumen-prueba').textContent = `${registro.filter((r) => r.tipo === 'medida').length} lecturas · ${huecos} ${huecos === 1 ? 'hueco' : 'huecos'} de más de un minuto`;
  $('registro-prueba').replaceChildren(...registro.slice(-60).map((r) => h('li', { clase: r.hueco ? 'hueco' : null }, r.texto)));
}

function anotarPrueba(tipo, texto, hueco = false) {
  if (!prueba) return;
  prueba.registro.push({ tipo, texto: `${new Date().toLocaleTimeString('es-CL', { hour12: false })} · ${texto}`, hueco });
  pintarPrueba();
}

function alternarPrueba() {
  if (prueba && prueba.vigilancia !== null) {
    navigator.geolocation.clearWatch(prueba.vigilancia);
    prueba.vigilancia = null;
    anotarPrueba('fin', 'Prueba terminada.');
    return;
  }
  if (!('geolocation' in navigator)) return avisar('Este teléfono no da la ubicación al navegador.', true);
  prueba = { registro: [], ultima: null, vigilancia: null };
  prueba.vigilancia = navigator.geolocation.watchPosition(
    (p) => {
      const ahora = Date.now();
      const hueco = prueba.ultima !== null && ahora - prueba.ultima > 60_000;
      const segundos = prueba.ultima === null ? null : Math.round((ahora - prueba.ultima) / 1000);
      prueba.ultima = ahora;
      anotarPrueba('medida', `lectura (±${Math.round(p.coords.accuracy)} m${segundos === null ? '' : `, ${segundos} s después`})`, hueco);
    },
    (falla) => anotarPrueba('error', falla.code === 1 ? 'Sin permiso de ubicación para esta app.' : 'No se pudo leer la ubicación.', true),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
  );
  anotarPrueba('inicio', 'Prueba empezada.');
}

// ---- Marcar y enviar ----

/**
 * Una sola lectura del GPS al entregar (D63): con ella, esa dirección aprende su punto en el mapa. Si no hay permiso,
 * no hay señal de GPS o tarda más de unos segundos, la entrega se anota igual, sin ubicación.
 */
function ubicacionActual() {
  return new Promise((resolver) => {
    const listo = (valor) => resolver(valor);
    try {
      navigator.geolocation.getCurrentPosition(
        (posicion) => listo({ lat: posicion.coords.latitude, lng: posicion.coords.longitude, precision: Math.round(posicion.coords.accuracy) }),
        () => listo({}),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
      );
    } catch {
      listo({});
    }
  });
}

/** Envía una marca: `{ estado, datos }`, o lanza si no hay red (la cola la deja para después). */
const enviar = (marca) => pedir(`/api/repartidor/pedidos/${encodeURIComponent(marca.id)}/${marca.tipo}`, cuerpoParaEnviar(marca));

async function marcar(parada, tipo, cuerpo) {
  abierta = null;
  const marca = nuevaMarca({ parada, tipo, cuerpo, fecha: ruta?.fecha ?? hoy(), ahoraMs: Date.now() });
  guardarCola(agregar(cola(), marca));
  aplicarCola();
  pintar();
  const resumen = await vaciarCola();
  // Se dice "anotada" solo si el servidor la confirmó (D84).
  const quedo = cola().find((m) => m.op === marca.op);
  if (!quedo) avisar(tipo === 'entregado' ? 'Entrega anotada.' : 'Anotado: avisamos para reagendar.');
  else if (quedo.rechazo) avisar(`No se anotó: ${quedo.rechazo}`, true);
  else if (resumen?.detenida === 'sin_sesion') avisar('Entra de nuevo: lo marcado quedó guardado en el teléfono y se envía después.');
  else if (resumen?.detenida === 'servidor') avisar('El sistema no respondió: quedó guardado en el teléfono y se reintenta solo.');
  else avisar('Sin señal: quedó guardado en el teléfono y se envía cuando vuelva.');
}

/** Envía lo pendiente, en orden (uno a la vez). Si otro envío está en curso, espera a que termine y vuelve a revisar. */
async function vaciarCola() {
  while (envioEnCurso) await envioEnCurso;
  envioEnCurso = enviarPendientes({ leer: cola, guardar: guardarCola, enviar }).finally(() => {
    envioEnCurso = null;
  });
  pintarSincronizacion(); // "Enviando…"
  const resumen = await envioEnCurso;
  if (resumen.detenida === 'sin_sesion') {
    pedirClave();
    return resumen;
  }
  if (navigator.onLine) await cargarRuta();
  else {
    aplicarCola();
    pintar();
  }
  return resumen;
}

async function salir() {
  // Lo que no llegó al servidor se perdería al salir: se pregunta antes (D84).
  const sinEnviar = pendientes(cola()).length;
  if (sinEnviar > 0) {
    const texto = sinEnviar === 1 ? 'Hay 1 marca sin enviar' : `Hay ${sinEnviar} marcas sin enviar`;
    if (!window.confirm(`${texto}. Con señal, toca «Actualizar» para enviarlas. Si sales ahora, se pierden. ¿Salir igual?`)) return;
  }
  try {
    await pedir('/api/sesion/salir', {});
  } catch {
    /* sin conexión: igual se vuelve al ingreso; la sesión sigue viva hasta que haya señal */
  }
  guardar(CLAVE_RUTA, null);
  guardarCola([]);
  guardar(CLAVE_POSICIONES, null);
  if (vigilancia !== null) navigator.geolocation.clearWatch(vigilancia);
  vigilancia = null;
  ruta = null;
  void bloqueoDePantalla?.release();
  pedirClave();
}

/**
 * Lo guardado en el teléfono vence (D93). La ruta de otro día, que trae nombres, direcciones y teléfonos, se borra: sin
 * señal solo sirve la de hoy. Las posiciones de más de 6 horas también, porque el servidor ya no las acepta. Las marcas
 * no vencen solas: una de hace más de 3 días el servidor la rechaza y queda a la vista hasta que toque "Entendido".
 */
const POSICION_VIGENTE_S = 6 * 3600;
function limpiarVencido() {
  if (leer(CLAVE_RUTA) && leer(CLAVE_RUTA).fecha !== hoy()) guardar(CLAVE_RUTA, null);
  const posiciones = colaDePosiciones();
  const desde = Math.floor(Date.now() / 1000) - POSICION_VIGENTE_S;
  const vigentes = Array.isArray(posiciones) ? posiciones.filter((p) => typeof p?.en === 'number' && p.en >= desde) : [];
  if (vigentes.length !== posiciones.length) guardar(CLAVE_POSICIONES, vigentes.length > 0 ? vigentes : null);
}

async function iniciar() {
  limpiarVencido();
  registrarAplicacion();
  $('salir').addEventListener('click', () => void salir());
  $('cambiar-sesion').addEventListener('click', () => void salir());
  $('actualizar-ruta').addEventListener('click', () => void vaciarCola());
  prepararPantalla();
  $('probar-ubicacion').addEventListener('click', alternarPrueba);
  document.addEventListener('visibilitychange', () => {
    anotarPrueba('vista', document.visibilityState === 'visible' ? 'Volviste a la app.' : 'Saliste de la app.');
    ajustarSeguimiento();
    if (document.visibilityState === 'visible') void enviarPosiciones();
    // Al volver de Google Maps, la ruta se lee de nuevo si pasaron 2 minutos: así ve pronto un cambio de la oficina (D94).
    if (document.visibilityState === 'visible' && Date.now() - (ultimaSincronizacion ?? 0) > 120_000) void vaciarCola();
  });
  setInterval(() => {
    if (colaDePosiciones().length > 0) void enviarPosiciones();
  }, REINTENTO_MS);
  window.addEventListener('online', () => void vaciarCola());
  window.addEventListener('offline', () => {
    sinConexion = true;
    pintarSincronizacion();
  });
  setInterval(() => {
    if (pendientes(cola()).length > 0) void vaciarCola();
  }, REINTENTO_MS);

  let usuario = null;
  try {
    usuario = (await pedir('/api/sesion')).datos?.usuario ?? null;
  } catch {
    // Sin conexión: si quedó una ruta de hoy guardada, se sigue trabajando con ella.
    if (leer(CLAVE_RUTA)?.fecha === hoy()) usuario = { nombre: '', rol: 'repartidor' };
  }
  if (usuario?.rol === 'repartidor') mostrarRuta(usuario);
  else if (usuario?.rol === 'administrador') mostrarSolo('otra-sesion');
  else pedirClave();
}

void iniciar();
