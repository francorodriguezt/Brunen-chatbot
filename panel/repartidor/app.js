/**
 * Panel del repartidor (fase D, D61): la ruta de hoy, una tarjeta por parada, con Navegar, Llamar, Entregado (cuántos
 * vacíos retiró y si cobró) y No se pudo (el motivo).
 *
 * Sin señal: lo que marca se guarda en el teléfono y se envía solo cuando vuelve la conexión, y la última ruta que
 * cargó se sigue viendo. Ambas cosas se borran al salir.
 */

import { mostrarIngreso, pedir, registrarAplicacion } from '/ingreso.js';

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
let enviando = false;

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
const cola = () => leer(CLAVE_COLA) ?? [];

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

/** Lo marcado sin señal se ve en la tarjeta como si ya hubiera llegado. */
function aplicarCola() {
  if (!ruta) return;
  for (const accion of cola()) {
    const parada = ruta.paradas.find((p) => p.idPedido === accion.id);
    if (!parada) continue;
    if (accion.tipo === 'entregado') {
      const monto = parada.cobrar ?? parada.cobrado ?? parada.montoEfectivo ?? null;
      Object.assign(parada, { estado: 'entregado', vaciosRetirados: accion.cuerpo.vacios, cobrado: accion.cuerpo.cobrado ? monto : null, cobrar: null, porEnviar: true });
    }
    else Object.assign(parada, { estado: 'no_se_pudo', motivo: accion.cuerpo.motivo, porEnviar: true });
  }
}

async function cargarRuta() {
  try {
    const { estado, datos } = await pedir('/api/repartidor/ruta');
    if (estado === 401) return pedirClave();
    if (estado !== 200 || !datos) throw new Error('sin ruta');
    ruta = datos;
    guardar(CLAVE_RUTA, datos);
    $('aviso-conexion').hidden = true;
  } catch {
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
  const lista = $('paradas');
  const cifras = $('cifras-ruta');
  if (!ruta || ruta.paradas.length === 0) {
    cifras.replaceChildren();
    lista.replaceChildren(h('p', { clase: 'vacio' }, ruta ? 'No hay entregas confirmadas para hoy.' : 'Todavía no se pudo cargar la ruta de hoy.'));
    return;
  }
  const hechas = ruta.paradas.filter((p) => p.estado !== 'pendiente').length;
  const cifra = (numero, palabra) => h('li', {}, h('b', {}, String(numero)), ` ${palabra}`);
  // replaceChildren escribe "null" si recibe null: se filtran los que no van.
  cifras.replaceChildren(
    ...[
      cifra(ruta.paradas.length, ruta.paradas.length === 1 ? 'parada' : 'paradas'),
      cifra(ruta.totalBidones, ruta.totalBidones === 1 ? 'bidón' : 'bidones'),
      ruta.cargas.length > 1 ? cifra(ruta.cargas.length, 'cargas') : null,
      cifra(hechas, hechas === 1 ? 'lista' : 'listas'),
    ].filter(Boolean),
  );
  const conCargas = ruta.cargas.length > 1;
  lista.replaceChildren(
    ...ruta.paradas.flatMap((parada) => {
      const carga = conCargas ? ruta.cargas.find((c) => c.desde === parada.orden) : null;
      const titulo = carga ? h('h3', { clase: 'titulo-carga' }, `Carga ${carga.numero}: ${carga.totalBidones} bidones`, carga.numero > 1 ? ' (recarga en Actum si hace falta)' : '') : null;
      return titulo ? [titulo, tarjeta(parada)] : [tarjeta(parada)];
    }),
  );
}

function insignia(parada) {
  if (parada.estado === 'entregado') return h('span', { clase: 'insignia verde' }, parada.porEnviar ? 'Entregado (por enviar)' : 'Entregado');
  if (parada.estado === 'no_se_pudo') return h('span', { clase: 'insignia rojo' }, parada.porEnviar ? 'No se pudo (por enviar)' : 'No se pudo');
  return null;
}

function tarjeta(p) {
  const lugar = [p.direccion, p.comuna].filter(Boolean).join(', ') || 'sin dirección';
  const destino = encodeURIComponent(`${lugar}, Chile`);
  // Con el punto exacto de la dirección (D63) se navega a las coordenadas; si no, a la dirección escrita.
  const coordenadas = p.punto ? `${p.punto.lat},${p.punto.lng}` : null;
  const enGoogle = coordenadas ? `https://www.google.com/maps/dir/?api=1&destination=${coordenadas}&travelmode=driving` : `https://www.google.com/maps/search/?api=1&query=${destino}`;
  const enWaze = coordenadas ? `https://waze.com/ul?ll=${coordenadas}&navigate=yes` : `https://waze.com/ul?q=${destino}&navigate=yes`;
  const formulario = abierta?.id === p.idPedido ? (abierta.tipo === 'entregado' ? formularioEntregado(p) : formularioNoSePudo(p)) : null;
  return h(
    'article',
    { clase: `tarjeta parada parada-${p.estado}` },
    h('div', { clase: 'tarjeta-cabecera' }, h('span', { clase: 'persona-nombre' }, `${p.orden}. ${p.nombre || 'Sin nombre'}`), insignia(p)),
    h(
      'div',
      { clase: 'datos' },
      h('span', {}, h('b', {}, 'Dirección: '), lugar),
      h('span', {}, h('b', {}, 'Deja: '), textoBidones(p.bidones)),
      p.envasesARetirar > 0 ? h('span', {}, h('b', {}, 'Retirar: '), `${p.envasesARetirar} ${p.envasesARetirar === 1 ? 'vacío' : 'vacíos'}`) : null,
      p.cobrar !== null ? h('span', { clase: 'cobrar' }, h('b', {}, 'Cobrar en efectivo: '), pesos.format(p.cobrar)) : p.formaPago ? h('span', {}, h('b', {}, 'Pago: '), p.formaPago) : null,
      p.notas ? h('span', {}, h('b', {}, 'Notas: '), p.notas) : null,
      p.estado === 'entregado' && p.vaciosRetirados !== null ? h('span', { clase: 'suave' }, `Retiró ${p.vaciosRetirados} ${p.vaciosRetirados === 1 ? 'vacío' : 'vacíos'}.`) : null,
      p.estado === 'no_se_pudo' ? h('span', { clase: 'suave' }, `Motivo: ${textoMotivo(p.motivo)}.`) : null,
    ),
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
  const vacios = h('input', { type: 'number', min: 0, max: 200, inputmode: 'numeric', value: p.vaciosRetirados ?? p.envasesARetirar, clase: 'campo-corto', 'aria-label': 'Vacíos que retiraste' });
  // Al corregir una entrega, la casilla muestra lo que ya cobró: si no, se borraría el cobro.
  const corrigiendo = p.estado === 'entregado';
  const monto = corrigiendo ? (p.cobrado ?? p.montoEfectivo) : p.cobrar;
  const cobro = monto !== null && monto !== undefined ? h('input', { type: 'checkbox', checked: corrigiendo ? p.cobrado !== null : true }) : null;
  // Solo si esa dirección no tiene su punto en el mapa o el que tiene es impreciso, y solo al entregar (no al corregir).
  const ubicar = !corrigiendo && (!p.punto || p.punto.afinar) && 'geolocation' in navigator ? h('input', { type: 'checkbox', checked: true }) : null;
  const confirmar = async () => {
    const numero = Number(vacios.value);
    if (!Number.isInteger(numero) || numero < 0 || numero > 200) return avisar('Escribe cuántos vacíos retiraste (0 si ninguno).', true);
    const cuerpo = { vacios: numero, cobrado: cobro ? cobro.checked : false };
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

/** Envía una acción. true = llegó o el servidor la rechazó (no se reintenta); false = sin señal (se reintenta). */
async function enviar(accion) {
  try {
    const { estado, datos } = await pedir(`/api/repartidor/pedidos/${encodeURIComponent(accion.id)}/${accion.tipo}`, accion.cuerpo);
    if (estado === 401) {
      pedirClave();
      return false;
    }
    if (estado !== 200) avisar(datos?.error ?? 'No se pudo anotar. Revisa la parada.', true);
    return true;
  } catch {
    return false;
  }
}

async function marcar(parada, tipo, cuerpo) {
  abierta = null;
  const accion = { id: parada.idPedido, tipo, cuerpo };
  guardar(CLAVE_COLA, [...cola().filter((a) => !(a.id === accion.id && a.tipo === accion.tipo)), accion]);
  aplicarCola();
  pintar();
  await vaciarCola();
  if (cola().some((a) => a.id === accion.id && a.tipo === accion.tipo)) avisar('Sin señal: quedó guardado en el teléfono y se envía cuando vuelva.');
  else avisar(tipo === 'entregado' ? 'Entrega anotada.' : 'Anotado: avisamos para reagendar.');
}

/** Envía lo pendiente en orden; se detiene en el primero que no sale (sin señal). */
async function vaciarCola() {
  if (enviando) return;
  enviando = true;
  try {
    for (const accion of cola()) {
      if (!(await enviar(accion))) break;
      guardar(CLAVE_COLA, cola().filter((a) => !(a.id === accion.id && a.tipo === accion.tipo)));
    }
  } finally {
    enviando = false;
  }
  if (navigator.onLine) await cargarRuta();
}

async function salir() {
  try {
    await pedir('/api/sesion/salir', {});
  } catch {
    /* sin conexión: igual se vuelve al ingreso; la sesión sigue viva hasta que haya señal */
  }
  guardar(CLAVE_RUTA, null);
  guardar(CLAVE_COLA, null);
  ruta = null;
  void bloqueoDePantalla?.release();
  pedirClave();
}

async function iniciar() {
  registrarAplicacion();
  $('salir').addEventListener('click', () => void salir());
  $('cambiar-sesion').addEventListener('click', () => void salir());
  $('actualizar-ruta').addEventListener('click', () => void vaciarCola());
  prepararPantalla();
  window.addEventListener('online', () => void vaciarCola());
  setInterval(() => {
    if (cola().length > 0) void vaciarCola();
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
