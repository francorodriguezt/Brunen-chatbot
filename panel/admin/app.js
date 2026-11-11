/**
 * Pantalla del panel: bandeja de pedidos y avisos, pedidos anotados a mano y reparto del día. JavaScript sin dependencias ni compilación: se sirve tal
 * cual desde `panel/`. Todo lo que viene de la API (nombres, direcciones, lo que escribió el cliente) se muestra con
 * `textContent`, nunca como HTML, y la política de seguridad de `_headers` no deja correr scripts ni estilos en línea.
 */

import { darFormatoAlRut, mostrarIngreso, pedir, registrarAplicacion } from '/ingreso.js';

// Cada consulta es una solicitud al Worker (el plan gratis permite 100.000 al día): con la pestaña a la vista se consulta
// seguido para enterarse rápido de un pedido, y con la pestaña oculta o la ventana tapada, más espaciado.
const INTERVALO_MS = 8000;
const INTERVALO_OCULTO_MS = 20_000;
const REFRESCO_FORZADO_MS = 60_000;
const ZONA = 'America/Santiago';
const MAX_LINEAS = 5; // el mismo tope que impone el servidor

const VISTAS = ['pedidos', 'reparto', 'avisos', 'equipo'];
const ESPERA_AL_BUSCAR_MS = 350; // se busca cuando la persona deja de escribir, no en cada letra

const GRUPOS = [
  ['por_confirmar', 'Por confirmar'],
  ['confirmados', 'Confirmados'],
  ['cerrados', 'Cerrados'],
  ['todos', 'Todos'],
];

const VACIO_DE_PEDIDOS = {
  por_confirmar: 'No hay pedidos por confirmar. Cuando llegue uno, suena un aviso.',
  confirmados: 'No hay pedidos confirmados.',
  cerrados: 'Todavía no hay pedidos entregados ni cancelados.',
  todos: 'Todavía no hay pedidos.',
};

const ESTADOS = {
  Pendiente_Confirmacion: { texto: 'Por confirmar', color: 'ambar' },
  Fuera_de_zona: { texto: 'Fuera de zona', color: 'rojo' },
  Confirmado: { texto: 'Confirmado', color: 'azul' },
  En_Ruta: { texto: 'En ruta', color: 'azul' },
  Entregado: { texto: 'Entregado', color: 'verde' },
  Cancelado: { texto: 'Cancelado', color: '' },
};

const AVISOS = {
  reclamo: ['Reclamo', 'rojo'],
  error: ['Falla del sistema', 'rojo'],
  factura: ['Factura', 'ambar'],
  proveedor: ['Proveedor', 'ambar'],
  pago: ['Comprobante o pago', 'verde'],
  envases: ['Envases', ''],
  no_entendido: ['Mensaje no entendido', 'ambar'],
  escalamiento: ['Para una persona', 'ambar'],
};
const AVISOS_URGENTES = new Set(['reclamo', 'error']);

const TIPOS_BIDON = [
  ['10L', '10 L'],
  ['12L', '12 L'],
  ['20L', '20 L'],
];
const TAMANOS_DE_MAYOR_A_MENOR = [...TIPOS_BIDON].reverse(); // para el reparto: primero los de 20 L
const NOMBRE_BIDON = Object.fromEntries(TIPOS_BIDON.map(([valor, texto]) => [valor, `Bidón ${texto}`]));

const MENSAJE_DE_CAMBIO = {
  Confirmado: 'Pedido confirmado.',
  En_Ruta: 'Pedido en ruta.',
  Entregado: 'Pedido entregado.',
  Cancelado: 'Pedido cancelado.',
  Pendiente_Confirmacion: 'Pedido reabierto.',
};

const estado = {
  vista: 'pedidos',
  grupo: 'por_confirmar',
  fecha: '',
  buscar: '',
  fechaReparto: '',
  estadoDeAvisos: 'abierto',
  resumen: null,
  opciones: { comunas: [], fechaSugerida: '' },
  firmas: { pedidos: '', avisos: '', reparto: '' },
  turnoDeCarga: 0,
  ultimaCarga: 0,
  sondeando: false,
  sinConexion: false,
  sesionVencida: false,
  fallosSeguidos: 0,
};
const historiales = new Map(); // id de pedido -> historial ya cargado
const historialesAbiertos = new Set(); // los que la persona dejó desplegados
let pedidoEnEdicion = null;
let anotandoNuevo = false; // el mismo formulario sirve para cambiar un pedido y para anotar uno nuevo

const $ = (id) => document.getElementById(id);

/** Crea un elemento. `clase` es el class; las claves "onclick", "onchange"... son eventos; false/null se ignoran. */
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

// ---- Formatos ----

const pesos = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const formatoHora = new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false });
const formatoDiaCorto = new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, day: 'numeric', month: 'short' });
const formatoDiaClave = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }); // YYYY-MM-DD
const formatoFechaLarga = new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

/** "2026-10-29" -> "jueves 29 de octubre". Se arma a mediodía UTC para que la zona horaria no corra el día. */
function fechaLarga(iso) {
  const [anio, mes, dia] = String(iso).split('-').map(Number);
  if (!anio || !mes || !dia) return String(iso);
  return formatoFechaLarga.format(new Date(Date.UTC(anio, mes - 1, dia, 12))).replace(',', '');
}

/** Segundos Unix -> "hoy 14:32", "ayer 09:10" o "27 oct 16:05", en hora de Santiago. */
function cuando(segundos) {
  if (!segundos) return '';
  const fecha = new Date(segundos * 1000);
  const hora = formatoHora.format(fecha);
  const dia = formatoDiaClave.format(fecha);
  if (dia === formatoDiaClave.format(new Date())) return `hoy ${hora}`;
  if (dia === formatoDiaClave.format(new Date(Date.now() - 86_400_000))) return `ayer ${hora}`;
  return `${formatoDiaCorto.format(fecha).replace('.', '')} ${hora}`;
}

const hoyEnSantiago = () => formatoDiaClave.format(new Date());

/** "2026-10-31" + 1 -> "2026-11-01". */
function sumarDias(iso, dias) {
  const [anio, mes, dia] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

const soloDigitos = (telefono) => String(telefono ?? '').replace(/\D/g, '');

function telefonoLegible(telefono) {
  const digitos = soloDigitos(telefono);
  const movil = /^56(9)(\d{4})(\d{4})$/.exec(digitos);
  return movil ? `+56 ${movil[1]} ${movil[2]} ${movil[3]}` : digitos ? `+${digitos}` : '';
}

function enlaceWhatsApp(telefono) {
  const digitos = soloDigitos(telefono);
  if (!digitos) return h('span', { clase: 'suave' }, 'sin teléfono');
  return h('a', { href: `https://wa.me/${digitos}`, target: '_blank', rel: 'noopener noreferrer' }, telefonoLegible(digitos));
}

const humanizarEstados = (texto) => String(texto).replace(new RegExp(Object.keys(ESTADOS).join('|'), 'g'), (nombre) => ESTADOS[nombre].texto);

function totalDe(lineas) {
  if (lineas.length === 0) return null;
  let suma = 0;
  for (const linea of lineas) {
    if (!Number.isFinite(linea.precioUnitario) || !Number.isFinite(linea.cantidad)) return null;
    suma += linea.precioUnitario * linea.cantidad;
  }
  return suma;
}

// ---- Comunicación con el servidor ----

const SESION_VENCIDA = 'Se cerró tu sesión: no verás pedidos nuevos hasta que vuelvas a entrar.';

class ErrorApi extends Error {
  constructor(mensaje, codigo) {
    super(mensaje);
    this.codigo = codigo;
    /** Se arregla volviendo a entrar, no revisando el internet. */
    this.sesionVencida = codigo === 401;
  }
}

/** La sesión se avisa a toda la pantalla (no solo a quien hizo la llamada) y corta la llamada en curso. */
function fallarPorSesion() {
  marcarConexion(false, SESION_VENCIDA, true);
  throw new ErrorApi(SESION_VENCIDA, 401);
}

/**
 * Sin `cuerpo` es un GET; con `cuerpo` es un POST de JSON. La cabecera X-Panel es parte de la defensa contra CSRF.
 * `X-Requested-With` hace que Cloudflare Access conteste 401 cuando venció la sesión; sin ella redirige al inicio de
 * sesión y la página no puede leer esa respuesta (https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/).
 */
async function api(ruta, cuerpo) {
  const cabeceras = { 'x-requested-with': 'XMLHttpRequest' };
  let respuesta;
  try {
    // Todo lo de administración vive bajo /admin, que es lo que protege Cloudflare Access.
    respuesta = await fetch(
      `/admin${ruta}`,
      cuerpo === undefined
        ? { headers: { ...cabeceras, accept: 'application/json' }, cache: 'no-store', redirect: 'manual' }
        : { method: 'POST', headers: { ...cabeceras, 'content-type': 'application/json', 'x-panel': '1' }, body: JSON.stringify(cuerpo), cache: 'no-store', redirect: 'manual' },
    );
  } catch {
    throw new ErrorApi('Sin conexión con el panel. Revisa tu internet.', 0);
  }
  // Con `redirect: 'manual'`, que Access mande al inicio de sesión llega como "opaqueredirect": también es la sesión vencida.
  if (respuesta.type === 'opaqueredirect' || respuesta.status === 401) fallarPorSesion();
  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    /* la respuesta no era JSON */
  }
  if (!respuesta.ok) throw new ErrorApi(datos?.error ?? 'No se pudo completar. Intenta de nuevo.', respuesta.status);
  return datos ?? {};
}

let temporizadorDelMensaje;
function avisar(texto, esError = false) {
  const mensaje = $('mensaje');
  mensaje.textContent = texto;
  mensaje.className = esError ? 'mensaje error' : 'mensaje';
  mensaje.hidden = false;
  clearTimeout(temporizadorDelMensaje);
  temporizadorDelMensaje = setTimeout(() => {
    mensaje.hidden = true;
  }, esError ? 7000 : 3500);
}

const FALLOS_ANTES_DE_AVISAR = 3; // sondeos seguidos (~25 s a la vista) antes de molestar por un tropiezo de la red

function actualizarTitulo() {
  const pendientes = estado.resumen ? estado.resumen.porConfirmar + estado.resumen.avisosAbiertos : 0;
  if (estado.sesionVencida) document.title = '⚠ Vuelve a entrar · Brunen · Panel';
  else if (estado.sinConexion) document.title = '⚠ Sin conexión · Brunen · Panel';
  else document.title = pendientes > 0 ? `(${pendientes}) Brunen · Panel` : 'Brunen · Panel';
}

/**
 * Si la pantalla deja de enterarse de los pedidos y nadie la mira (otra pestaña, otro programa), el silencio parece
 * "no hay pedidos". Por eso la caída se ve en el título de la pestaña y, la primera vez, suena y notifica.
 */
function marcarConexion(conectado, texto = '', sesionVencida = false) {
  const vencidaAntes = estado.sesionVencida;
  estado.sinConexion = !conectado;
  estado.sesionVencida = !conectado && sesionVencida;
  estado.fallosSeguidos = conectado ? 0 : estado.fallosSeguidos + 1;

  const aviso = $('conexion');
  aviso.hidden = conectado;
  aviso.replaceChildren(...(conectado ? [] : sesionVencida ? [texto, ' ', boton('Volver a entrar', 'boton', () => location.reload())] : [texto]));
  actualizarTitulo();

  if (conectado) return;
  if (sesionVencida ? !vencidaAntes : estado.fallosSeguidos === FALLOS_ANTES_DE_AVISAR) {
    pitar();
    notificarDelNavegador(
      sesionVencida ? 'Se cerró tu sesión: abre el panel para volver a entrar.' : 'El panel perdió la conexión: no verás pedidos nuevos hasta que vuelva.',
      'Brunen: el panel dejó de actualizarse',
    );
  }
}

// ---- Pedidos ----

function listaDeLineas(pedido) {
  const lineas = pedido.lineas.map((linea) =>
    h(
      'li',
      {},
      h('span', {}, `${linea.cantidad} × ${NOMBRE_BIDON[linea.tipo] ?? linea.tipo}`, linea.precioUnitario === null ? null : h('span', { clase: 'suave' }, ` · ${pesos.format(linea.precioUnitario)} c/u`)),
      linea.subtotal === null ? h('span', { clase: 'falta' }, 'sin precio') : h('span', {}, pesos.format(linea.subtotal)),
    ),
  );
  return h(
    'div',
    {},
    h('ul', { clase: 'lineas' }, lineas.length > 0 ? lineas : h('li', {}, h('span', { clase: 'falta' }, 'Sin productos'))),
    h('div', { clase: 'total' }, h('span', {}, 'Total'), pedido.total === null ? h('span', { clase: 'falta' }, 'falta precio') : h('span', {}, pesos.format(pedido.total))),
  );
}

function datosDelPedido(pedido) {
  const dato = (nombre, valor, falta = false) => h('span', {}, h('b', {}, `${nombre}: `), falta ? h('span', { clase: 'falta' }, valor) : valor);
  return h(
    'div',
    { clase: 'datos' },
    dato('Entrega', `${fechaLarga(pedido.fechaConfirmada ?? pedido.fechaEntrega)}${pedido.fechaConfirmada ? '' : ' (propuesta)'}`),
    dato('Comuna', pedido.comuna || 'falta', !pedido.comuna),
    dato('Dirección', pedido.direccion || 'falta', !pedido.direccion),
    pedido.envasesARetirar > 0 ? dato('Envases por retirar', pedido.envasesARetirar) : null,
    pedido.notasRepartidor ? dato('Notas', pedido.notasRepartidor) : null,
    pedido.confirmadoPor ? dato('Confirmó', pedido.confirmadoPor) : null,
  );
}

function historialDe(pedido) {
  const lista = h('ul', { clase: 'historial-lista' });
  const pintar = (eventos) =>
    lista.replaceChildren(
      ...eventos.map((e) => h('li', {}, `${cuando(e.en)} · ${e.quien} · ${humanizarEstados(e.accion)}${e.detalle ? ` (${e.detalle})` : ''}`)),
    );
  if (historiales.has(pedido.id)) pintar(historiales.get(pedido.id));

  const detalles = h('details', { clase: 'historial', open: historialesAbiertos.has(pedido.id) }, h('summary', {}, 'Historial'), lista);
  detalles.addEventListener('toggle', async () => {
    if (!detalles.open) {
      historialesAbiertos.delete(pedido.id);
      return;
    }
    historialesAbiertos.add(pedido.id);
    try {
      const { historial } = await api(`/api/pedidos/${encodeURIComponent(pedido.id)}`);
      historiales.set(pedido.id, historial);
      pintar(historial);
    } catch (falla) {
      avisar(falla.message, true);
    }
  });
  return detalles;
}

function accionesDe(pedido) {
  const cambiar = boton('Cambiar', 'boton', () => abrirEditor(pedido));
  const cancelar = boton('Cancelar pedido', 'boton boton-peligro', () => cancelarPedido(pedido));
  const pasarA = (nuevo, texto, clase = 'boton') => boton(texto, clase, () => cambiarEstado(pedido, nuevo));

  switch (pedido.estado) {
    case 'Pendiente_Confirmacion':
    case 'Fuera_de_zona':
      // Sin precio no se puede confirmar (lo impide también el servidor): primero se completa.
      return pedido.total === null
        ? [boton('Completar precio', 'boton boton-principal', () => abrirEditor(pedido)), cancelar]
        : [pasarA('Confirmado', pedido.estado === 'Fuera_de_zona' ? 'Confirmar igual' : 'Confirmar', 'boton boton-principal'), cambiar, cancelar];
    case 'Confirmado':
      return [pasarA('En_Ruta', 'En ruta', 'boton boton-principal'), boton('Entregado', 'boton', () => entregarPedido(pedido)), cambiar, cancelar];
    case 'En_Ruta':
      return [boton('Entregado', 'boton boton-principal', () => entregarPedido(pedido)), cambiar, cancelar];
    case 'Cancelado':
      return [pasarA('Pendiente_Confirmacion', 'Reabrir')];
    default:
      return [];
  }
}

function tarjetaDePedido(pedido) {
  const insignia = ESTADOS[pedido.estado] ?? { texto: pedido.estado, color: '' };
  const observaciones = pedido.observaciones.split(' | ').filter(Boolean);
  const acciones = accionesDe(pedido);
  return h(
    'article',
    { clase: 'tarjeta', id: `pedido-${pedido.id}` },
    h('div', { clase: 'tarjeta-cabecera' }, h('span', { clase: 'id' }, pedido.id), h('span', { clase: `insignia ${insignia.color}` }, insignia.texto), h('span', { clase: 'hora' }, cuando(pedido.creadoEn))),
    h('div', { clase: 'cliente' }, pedido.nombre ? h('strong', {}, pedido.nombre) : h('strong', { clase: 'nuevo' }, 'Cliente sin ficha'), enlaceWhatsApp(pedido.telefono)),
    pedido.mensajeCliente ? h('blockquote', { clase: 'cita' }, h('small', {}, 'El cliente escribió'), h('div', {}, pedido.mensajeCliente)) : null,
    listaDeLineas(pedido),
    datosDelPedido(pedido),
    observaciones.length > 0 ? h('div', { clase: 'revision' }, h('b', {}, 'Observaciones'), h('ul', {}, observaciones.map((o) => h('li', {}, o)))) : null,
    acciones.length > 0 ? h('div', { clase: 'acciones' }, acciones) : null,
    historialDe(pedido),
  );
}

function pintarPedidos(pedidos) {
  const lista = $('lista-pedidos');
  if (pedidos.length === 0) {
    const vacio = estado.buscar ? 'No encontré pedidos con ese texto.' : estado.fecha ? 'No hay pedidos para ese día.' : VACIO_DE_PEDIDOS[estado.grupo];
    lista.replaceChildren(h('p', { clase: 'vacio' }, vacio));
    return;
  }
  lista.replaceChildren(...pedidos.map(tarjetaDePedido));
}

async function cargarPedidos() {
  const turno = ++estado.turnoDeCarga;
  const consulta = new URLSearchParams({ grupo: estado.grupo });
  if (estado.fecha) consulta.set('fecha', estado.fecha);
  // Lo que se busca (un nombre, un teléfono) va en el cuerpo, no en la dirección: las direcciones quedan en los registros.
  const { pedidos } = estado.buscar ? await api('/api/pedidos/buscar', { texto: estado.buscar }) : await api(`/api/pedidos?${consulta}`);
  if (turno !== estado.turnoDeCarga) return; // llegó otra carga más nueva mientras esta esperaba
  // Si no cambió nada no se vuelve a dibujar: así no se pierde el foco ni lo que la persona dejó desplegado.
  const firma = JSON.stringify([estado.grupo, estado.fecha, estado.buscar, pedidos]);
  if (firma === estado.firmas.pedidos) return;
  estado.firmas.pedidos = firma;
  pintarPedidos(pedidos);
}

function bloquearTarjeta(idDePedido, bloqueada) {
  for (const b of document.querySelectorAll(`[id="pedido-${idDePedido}"] .acciones button, [id="parada-${idDePedido}"] .acciones button`)) b.disabled = bloqueada;
}

const versionDe = (pedido) => (Number.isInteger(pedido.actualizadoEn) ? { actualizadoEn: pedido.actualizadoEn } : {});

async function cambiarEstado(pedido, nuevo, motivo = '') {
  bloquearTarjeta(pedido.id, true); // para que un segundo toque no mande el mismo cambio dos veces
  try {
    // `actualizadoEn` es la versión del pedido que se estaba viendo: si otra persona lo cambió, el servidor rechaza el cambio.
    await api(`/api/pedidos/${encodeURIComponent(pedido.id)}/estado`, { estado: nuevo, ...(motivo && { motivo }), ...versionDe(pedido) });
    avisar(MENSAJE_DE_CAMBIO[nuevo] ?? 'Listo.');
  } catch (falla) {
    bloquearTarjeta(pedido.id, false); // si la lista no cambia, la tarjeta no se vuelve a dibujar y los botones quedarían apagados
    avisar(falla.message, true);
  }
  await refrescar();
}

async function cancelarPedido(pedido) {
  const respuesta = await pedirConfirmacion({
    titulo: '¿Cancelar este pedido?',
    texto: `${pedido.id} · ${pedido.nombre || telefonoLegible(pedido.telefono)}. Si fue un error, después lo puedes reabrir.`,
    etiqueta: 'Cancelar pedido',
    clase: 'boton-peligro',
    conMotivo: true,
  });
  if (respuesta) await cambiarEstado(pedido, 'Cancelado', respuesta.motivo);
}

async function entregarPedido(pedido) {
  const respuesta = await pedirConfirmacion({
    titulo: '¿Marcar como entregado?',
    texto: `${pedido.id} · ${pedido.nombre || telefonoLegible(pedido.telefono)}. Un pedido entregado ya no se puede cambiar.`,
    etiqueta: 'Sí, entregado',
    clase: 'boton-principal',
    conMotivo: false,
  });
  if (respuesta) await cambiarEstado(pedido, 'Entregado');
}

/** Pregunta antes de una acción que no se puede deshacer. Devuelve `{ motivo }` si la persona acepta, o null. */
function pedirConfirmacion({ titulo, texto, etiqueta, clase, conMotivo }) {
  const dialogo = $('dialogo-accion');
  const formulario = $('formulario-accion');
  $('titulo-accion').textContent = titulo;
  $('texto-accion').textContent = texto;
  $('confirmar-accion').textContent = etiqueta;
  $('confirmar-accion').className = `boton ${clase}`;
  $('campo-motivo').hidden = !conMotivo;
  formulario.elements.motivo.value = '';

  return new Promise((resolver) => {
    const terminar = (resultado) => {
      formulario.removeEventListener('submit', alEnviar);
      $('volver-accion').removeEventListener('click', alVolver);
      dialogo.removeEventListener('close', alVolver);
      if (dialogo.open) dialogo.close();
      resolver(resultado);
    };
    const alEnviar = (evento) => {
      evento.preventDefault();
      terminar({ motivo: formulario.elements.motivo.value.trim() });
    };
    const alVolver = () => terminar(null); // el botón "Volver" o la tecla Esc
    formulario.addEventListener('submit', alEnviar);
    $('volver-accion').addEventListener('click', alVolver);
    dialogo.addEventListener('close', alVolver);
    dialogo.showModal();
  });
}

// ---- Editar un pedido ----

function filaDeLinea(linea = { tipo: '20L', cantidad: 1, precioUnitario: null }) {
  const fila = h(
    'div',
    { clase: 'linea-editable' },
    h('label', {}, 'Cantidad', h('input', { type: 'number', name: 'cantidad', min: 1, max: 999, step: 1, inputmode: 'numeric', value: linea.cantidad, required: true })),
    h('label', {}, 'Bidón', h('select', { name: 'tipo' }, TIPOS_BIDON.map(([valor, texto]) => h('option', { value: valor, selected: valor === linea.tipo }, texto)))),
    h('label', {}, 'Precio c/u ($)', h('input', { type: 'number', name: 'precio', min: 0, max: 1000000, step: 1, inputmode: 'numeric', value: linea.precioUnitario ?? '', placeholder: 'sin precio' })),
    boton('Quitar', 'boton boton-chico', () => {
      fila.remove();
      actualizarTotalDelEditor();
    }),
  );
  return fila;
}

function leerLineasDelEditor() {
  return [...$('editar-lineas').querySelectorAll('.linea-editable')].map((fila) => {
    const precio = fila.querySelector('[name=precio]').value.trim();
    return { tipo: fila.querySelector('[name=tipo]').value, cantidad: Number(fila.querySelector('[name=cantidad]').value), precioUnitario: precio === '' ? null : Number(precio) };
  });
}

function actualizarTotalDelEditor() {
  const lineas = leerLineasDelEditor();
  const total = totalDe(lineas);
  $('editar-total').textContent = total === null ? 'Total: falta precio' : `Total: ${pesos.format(total)}`;
  $('agregar-linea').disabled = lineas.length >= MAX_LINEAS;
}

function mostrarErrorDelEditor(texto) {
  $('error-editar').textContent = texto;
  $('error-editar').hidden = texto === '';
}

/** Los campos que solo tiene un pedido nuevo (teléfono, nombre, "dejarlo confirmado") se esconden al cambiar uno que ya existe. */
function prepararFormulario(esNuevo, titulo, textoDelBoton) {
  anotandoNuevo = esNuevo;
  for (const campo of document.querySelectorAll('#dialogo-editar .solo-nuevo')) campo.hidden = !esNuevo;
  $('cliente-reconocido').hidden = true;
  $('titulo-editar').textContent = titulo;
  $('guardar-editar').textContent = textoDelBoton;
  mostrarErrorDelEditor('');
}

function abrirEditor(pedido) {
  pedidoEnEdicion = pedido;
  prepararFormulario(false, `Cambiar pedido ${pedido.id}`, 'Guardar');
  const formulario = $('formulario-editar');
  formulario.elements.fecha.value = pedido.fechaConfirmada ?? pedido.fechaEntrega;
  formulario.elements.comuna.value = pedido.comuna;
  formulario.elements.direccion.value = pedido.direccion;
  formulario.elements.notas.value = pedido.notasRepartidor;
  formulario.elements.envases.value = pedido.envasesARetirar;
  $('editar-lineas').replaceChildren(...pedido.lineas.map(filaDeLinea));
  actualizarTotalDelEditor();
  $('dialogo-editar').showModal();
}

/** Para los pedidos que no llegan por el bot: una llamada, un audio, una empresa con plan mensual. */
function abrirNuevoPedido() {
  pedidoEnEdicion = null;
  prepararFormulario(true, 'Nuevo pedido', 'Anotar pedido');
  const formulario = $('formulario-editar');
  formulario.reset();
  // La fecha sugerida ya aplica el corte de las 9:00 y salta el domingo; los feriados los revisa la persona.
  formulario.elements.fecha.value = estado.opciones.fechaSugerida || hoyEnSantiago();
  $('editar-lineas').replaceChildren(filaDeLinea());
  actualizarTotalDelEditor();
  $('dialogo-editar').showModal();
  formulario.elements.telefono.focus();
}

/** Si ese teléfono ya pidió antes, se completan su nombre y su dirección para no escribirlos de nuevo. Es solo una ayuda. */
async function reconocerCliente() {
  if (!anotandoNuevo) return;
  const formulario = $('formulario-editar');
  const pista = $('cliente-reconocido');
  pista.hidden = true;
  const telefono = formulario.elements.telefono.value.trim();
  if (soloDigitos(telefono).length < 8) return;
  try {
    const { datos } = await api('/api/clientes/anterior', { telefono });
    if (!datos || !anotandoNuevo || formulario.elements.telefono.value.trim() !== telefono) return;
    const completados = [['nombre', datos.nombre], ['direccion', datos.direccion], ['comuna', datos.comuna], ['notas', datos.notasRepartidor]].filter(
      ([campo, valor]) => valor && formulario.elements[campo].value.trim() === '',
    );
    for (const [campo, valor] of completados) formulario.elements[campo].value = valor;
    pista.textContent = completados.length > 0 ? `Ya pidió antes: completé sus datos con los del pedido ${datos.idPedido}. Revísalos.` : `Ya pidió antes (pedido ${datos.idPedido}).`;
    pista.hidden = false;
  } catch {
    /* sin la ayuda, la persona escribe los datos */
  }
}

/** Devuelve el problema en palabras, o '' si está bien. El servidor valida lo mismo: esto solo ahorra una ida y vuelta. */
function problemaDeLaEdicion(fecha, lineas, envases) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return 'Elige la fecha de entrega.';
  if (!Number.isInteger(envases) || envases < 0 || envases > 999) return 'Los envases por retirar deben ser un número entero (0 si no hay).';
  if (lineas.length === 0) return 'El pedido necesita al menos un producto.';
  for (const linea of lineas) {
    if (!Number.isInteger(linea.cantidad) || linea.cantidad < 1 || linea.cantidad > 999) return 'La cantidad debe ser un número entero entre 1 y 999.';
    const precio = linea.precioUnitario;
    if (precio !== null && (!Number.isInteger(precio) || precio < 0 || precio > 1_000_000)) return 'El precio debe ser un número entero de pesos.';
  }
  return '';
}

/** Solo se manda lo que cambió: así el historial dice qué se tocó de verdad. */
function cambiosDeLaEdicion(pedido, formulario, lineas) {
  const cambios = {};
  const fecha = formulario.elements.fecha.value;
  if (fecha !== (pedido.fechaConfirmada ?? pedido.fechaEntrega)) cambios.fechaConfirmada = fecha;
  for (const [campo, clave] of [['comuna', 'comuna'], ['direccion', 'direccion'], ['notas', 'notasRepartidor']]) {
    const valor = formulario.elements[campo].value.trim();
    if (valor !== pedido[clave]) cambios[clave] = valor;
  }
  const envases = Number(formulario.elements.envases.value || 0);
  if (envases !== pedido.envasesARetirar) cambios.envasesARetirar = envases;
  const originales = pedido.lineas.map(({ tipo, cantidad, precioUnitario }) => ({ tipo, cantidad, precioUnitario }));
  if (JSON.stringify(lineas) !== JSON.stringify(originales)) cambios.lineas = lineas;
  return cambios;
}

async function guardarNuevoPedido(formulario, lineas) {
  const campo = (nombre) => formulario.elements[nombre].value.trim();
  const cuerpo = {
    telefono: campo('telefono'),
    nombre: campo('nombre'),
    comuna: campo('comuna'),
    direccion: campo('direccion'),
    fecha: formulario.elements.fecha.value,
    lineas,
    notasRepartidor: campo('notas'),
    envasesARetirar: Number(formulario.elements.envases.value || 0),
    confirmar: formulario.elements.confirmar.checked,
  };
  $('guardar-editar').disabled = true;
  try {
    const { pedido } = await api('/api/pedidos', cuerpo);
    $('dialogo-editar').close();
    avisar(pedido.estado === 'Confirmado' ? `Pedido ${pedido.id} anotado y confirmado.` : `Pedido ${pedido.id} anotado: quedó por confirmar.`);
  } catch (falla) {
    mostrarErrorDelEditor(falla.message);
  } finally {
    $('guardar-editar').disabled = false;
  }
  await refrescar();
}

async function guardarEdicion(evento) {
  evento.preventDefault();
  const formulario = $('formulario-editar');
  const lineas = leerLineasDelEditor();
  const problema = problemaDeLaEdicion(formulario.elements.fecha.value, lineas, Number(formulario.elements.envases.value || 0));
  if (problema) return mostrarErrorDelEditor(problema);
  if (anotandoNuevo) return guardarNuevoPedido(formulario, lineas);
  const pedido = pedidoEnEdicion;
  if (!pedido) return;
  const cambios = cambiosDeLaEdicion(pedido, formulario, lineas);
  if (Object.keys(cambios).length === 0) {
    $('dialogo-editar').close();
    return avisar('No cambiaste nada.');
  }

  $('guardar-editar').disabled = true;
  try {
    const { pedido: guardado } = await api(`/api/pedidos/${encodeURIComponent(pedido.id)}/editar`, { ...cambios, ...versionDe(pedido) });
    $('dialogo-editar').close();
    const yaSePuedeConfirmar = pedido.total === null && guardado.total !== null && (guardado.estado === 'Pendiente_Confirmacion' || guardado.estado === 'Fuera_de_zona');
    avisar(yaSePuedeConfirmar ? 'Guardado. Ya puedes confirmar el pedido.' : 'Cambios guardados.');
  } catch (falla) {
    mostrarErrorDelEditor(falla.message);
    if (falla.codigo === 409) $('dialogo-editar').close(); // otra persona lo cambió: se recarga con lo último
  } finally {
    $('guardar-editar').disabled = false;
  }
  await refrescar();
}

// ---- Reparto del día ----

/** Copia al portapapeles; si el navegador no deja, muestra el texto ya seleccionado para copiarlo a mano. */
async function copiar(texto, mensaje) {
  try {
    await navigator.clipboard.writeText(texto);
    avisar(mensaje);
  } catch {
    $('texto-copiar').value = texto;
    $('dialogo-copiar').showModal();
    $('texto-copiar').select();
  }
}

function tarjetaDeParada(parada) {
  const insignia = ESTADOS[parada.estado] ?? { texto: parada.estado, color: '' };
  const pedido = { id: parada.idPedido, nombre: parada.nombre, telefono: parada.telefono, actualizadoEn: parada.actualizadoEn };
  const entregado = boton('Entregado', 'boton boton-chico boton-principal', () => entregarPedido(pedido));
  const acciones = parada.estado === 'Confirmado' ? [boton('En ruta', 'boton boton-chico', () => cambiarEstado(pedido, 'En_Ruta')), entregado] : parada.estado === 'En_Ruta' ? [entregado] : [];
  const bidones = TAMANOS_DE_MAYOR_A_MENOR.filter(([tipo]) => parada.bidones[tipo] > 0).map(([tipo, texto]) => `${parada.bidones[tipo]} × ${texto}`).join(', ');
  const dato = (nombre, valor) => h('span', {}, h('b', {}, `${nombre}: `), valor);
  return h(
    'article',
    { clase: `tarjeta parada${parada.estado === 'Entregado' ? ' hecha' : ''}`, id: `parada-${parada.idPedido}` },
    h(
      'div',
      { clase: 'tarjeta-cabecera' },
      h('span', { clase: 'orden' }, String(parada.orden)),
      h('strong', { clase: 'direccion' }, [parada.direccion, parada.comuna].filter(Boolean).join(', ') || 'Sin dirección'),
      h('span', { clase: `insignia ${insignia.color}` }, insignia.texto),
    ),
    h('div', { clase: 'cliente' }, parada.nombre ? h('span', {}, parada.nombre) : null, enlaceWhatsApp(parada.telefono)),
    h(
      'div',
      { clase: 'datos' },
      dato('Deja', bidones || 'sin bidones'),
      dato('Cobra', parada.total === null ? h('span', { clase: 'falta' }, 'sin precio') : pesos.format(parada.total)),
      parada.envasesARetirar > 0 ? dato('Retira', `${parada.envasesARetirar} ${parada.envasesARetirar === 1 ? 'envase' : 'envases'}`) : null,
      parada.notas ? dato('Notas', parada.notas) : null,
    ),
    h('div', { clase: 'acciones' }, acciones, boton('Ver pedido', 'boton boton-chico', () => verPedido(parada.idPedido))),
  );
}

function pintarReparto({ reparto, texto, tsv }) {
  const resumen = $('resumen-reparto');
  const lista = $('lista-reparto');
  const titulo = h('h2', { clase: 'titulo-reparto' }, `Reparto del ${fechaLarga(reparto.fecha)}`);
  const sinConfirmar =
    reparto.sinConfirmar > 0
      ? h(
          'p',
          { clase: 'revision' },
          reparto.sinConfirmar === 1 ? 'Hay 1 pedido de este día sin confirmar: todavía no está en la lista. ' : `Hay ${reparto.sinConfirmar} pedidos de este día sin confirmar: todavía no están en la lista. `,
          boton('Verlos', 'boton boton-chico', () => verPorConfirmarDelDia(reparto.fecha)),
        )
      : null;
  resumen.hidden = false;

  if (reparto.paradas.length === 0) {
    resumen.replaceChildren(titulo, sinConfirmar ?? '');
    lista.replaceChildren(h('p', { clase: 'vacio' }, 'No hay entregas confirmadas para este día.'));
    return;
  }
  const cifra = (numero, palabra) => h('li', {}, h('b', {}, String(numero)), ` ${palabra}`);
  resumen.replaceChildren(
    titulo,
    h(
      'ul',
      { clase: 'cifras' },
      cifra(reparto.paradas.length, reparto.paradas.length === 1 ? 'parada' : 'paradas'),
      ...TAMANOS_DE_MAYOR_A_MENOR.filter(([tipo]) => reparto.carga[tipo] > 0).map(([tipo, nombre]) => cifra(reparto.carga[tipo], `de ${nombre}`)),
      reparto.envasesARetirar > 0 ? cifra(reparto.envasesARetirar, reparto.envasesARetirar === 1 ? 'envase por retirar' : 'envases por retirar') : null,
      reparto.entregadas > 0 ? cifra(reparto.entregadas, reparto.entregadas === 1 ? 'entregada' : 'entregadas') : null,
    ),
    sinConfirmar ?? '',
    h(
      'div',
      { clase: 'acciones' },
      boton('Copiar lista', 'boton boton-principal', () => copiar(texto, 'Lista copiada: pégala en WhatsApp.')),
      boton('Copiar para Excel', 'boton', () => copiar(tsv, 'Copiado: pégalo en Excel o en la app de rutas.')),
      h('a', { clase: 'boton', href: `/admin/api/reparto.csv?fecha=${encodeURIComponent(reparto.fecha)}`, download: `reparto-${reparto.fecha}.csv` }, 'Descargar archivo'),
    ),
  );
  lista.replaceChildren(...reparto.paradas.map(tarjetaDeParada));
}

function pintarDiaDelReparto() {
  const hoy = hoyEnSantiago();
  $('reparto-hoy').setAttribute('aria-pressed', String(estado.fechaReparto === hoy));
  $('reparto-manana').setAttribute('aria-pressed', String(estado.fechaReparto === sumarDias(hoy, 1)));
  $('fecha-reparto').value = estado.fechaReparto;
}

function elegirDiaDelReparto(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
  estado.fechaReparto = fecha;
  pintarDiaDelReparto();
  void recargarVistaActual();
}

async function cargarReparto() {
  estado.fechaReparto ||= hoyEnSantiago();
  pintarDiaDelReparto();
  const turno = ++estado.turnoDeCarga;
  const datos = await api(`/api/reparto?fecha=${encodeURIComponent(estado.fechaReparto)}`);
  if (turno !== estado.turnoDeCarga) return;
  const firma = JSON.stringify(datos);
  if (firma === estado.firmas.reparto) return;
  estado.firmas.reparto = firma;
  pintarReparto(datos);
}

/** Desde el reparto: los pedidos de ese día que todavía nadie confirmó. */
async function verPorConfirmarDelDia(fecha) {
  estado.grupo = 'por_confirmar';
  estado.fecha = fecha;
  limpiarBusqueda();
  $('filtro-fecha').value = fecha;
  pintarFiltros();
  await activarVista('pedidos');
}

// ---- Avisos ----

function tarjetaDeAviso(aviso) {
  const [texto, color] = AVISOS[aviso.tipo] ?? [aviso.tipo, ''];
  return h(
    'article',
    { clase: `tarjeta${AVISOS_URGENTES.has(aviso.tipo) ? ' urgente' : ''}`, id: `aviso-${aviso.id}` },
    h('div', { clase: 'tarjeta-cabecera' }, h('span', { clase: `insignia ${color}` }, texto), h('span', { clase: 'hora' }, cuando(aviso.creadoEn))),
    aviso.nombre || aviso.telefono ? h('div', { clase: 'cliente' }, aviso.nombre ? h('strong', {}, aviso.nombre) : null, aviso.telefono ? enlaceWhatsApp(aviso.telefono) : null) : null,
    h('p', { clase: 'resumen' }, aviso.resumen),
    aviso.motivos.length > 0 ? h('ul', { clase: 'motivos' }, aviso.motivos.map((m) => h('li', {}, m))) : null,
    aviso.texto ? h('blockquote', { clase: 'cita' }, h('small', {}, 'El cliente escribió'), h('div', {}, aviso.texto)) : null,
    aviso.idPedido ? h('p', { clase: 'suave' }, 'Pedido ', h('span', { clase: 'id' }, aviso.idPedido), ' ', boton('Ver pedido', 'boton boton-chico', () => verPedido(aviso.idPedido))) : null,
    aviso.estado === 'abierto'
      ? h('div', { clase: 'acciones' }, boton('Marcar resuelto', 'boton boton-principal', (evento) => resolverAviso(aviso, evento.currentTarget)))
      : h('p', { clase: 'suave' }, ['Resuelto', aviso.resueltoPor ? `por ${aviso.resueltoPor}` : '', cuando(aviso.resueltoEn)].filter(Boolean).join(' · ')),
  );
}

function pintarAvisos(avisos) {
  const lista = $('lista-avisos');
  const vacio = estado.estadoDeAvisos === 'abierto' ? 'No hay avisos abiertos. Aquí aparecen reclamos, facturas, comprobantes y lo que el bot no entiende.' : 'Todavía no hay avisos resueltos.';
  if (avisos.length === 0) lista.replaceChildren(h('p', { clase: 'vacio' }, vacio));
  else lista.replaceChildren(...avisos.map(tarjetaDeAviso));
}

async function cargarAvisos() {
  const turno = ++estado.turnoDeCarga;
  const { avisos } = await api(`/api/avisos?estado=${estado.estadoDeAvisos}`);
  if (turno !== estado.turnoDeCarga) return;
  const firma = JSON.stringify([estado.estadoDeAvisos, avisos]);
  if (firma === estado.firmas.avisos) return;
  estado.firmas.avisos = firma;
  pintarAvisos(avisos);
}

async function resolverAviso(aviso, elementoBoton) {
  elementoBoton.disabled = true;
  try {
    await api(`/api/avisos/${aviso.id}/resolver`, {});
    avisar('Aviso resuelto.');
  } catch (falla) {
    elementoBoton.disabled = false; // igual que con los pedidos: si nada cambia, el botón no se vuelve a dibujar
    avisar(falla.message, true);
  }
  await refrescar();
}

/** Desde un aviso se salta a su pedido: se muestran todos y se lo marca un momento. */
async function verPedido(idDePedido) {
  estado.grupo = 'todos';
  estado.fecha = '';
  limpiarBusqueda();
  $('filtro-fecha').value = '';
  pintarFiltros();
  await activarVista('pedidos');
  const tarjeta = document.querySelector(`[id="pedido-${idDePedido}"]`);
  if (!tarjeta) return avisar('No encontré ese pedido entre los más recientes.', true);
  tarjeta.scrollIntoView({ block: 'center', behavior: 'smooth' });
  tarjeta.classList.add('destacada');
  setTimeout(() => tarjeta.classList.remove('destacada'), 2500);
}

// ---- Qué mostrar, y cuándo recargar ----

function pintarFiltros() {
  for (const b of $('filtros-pedidos').querySelectorAll('[data-grupo]')) b.setAttribute('aria-pressed', String(b.dataset.grupo === estado.grupo));
  for (const b of $('filtros-avisos').querySelectorAll('[data-estado]')) b.setAttribute('aria-pressed', String(b.dataset.estado === estado.estadoDeAvisos));
  $('quitar-fecha').hidden = estado.fecha === '';
}

function construirFiltros() {
  $('filtros-pedidos').append(
    ...GRUPOS.map(([clave, texto]) =>
      h('button', {
        type: 'button',
        'data-grupo': clave,
        'aria-pressed': 'false',
        onclick: () => {
          estado.grupo = clave;
          pintarFiltros();
          void recargarVistaActual();
        },
      }, texto),
    ),
    h('label', { clase: 'filtro-fecha' }, 'Entrega del día', h('input', {
      type: 'date',
      id: 'filtro-fecha',
      onchange: (evento) => {
        estado.fecha = evento.currentTarget.value;
        pintarFiltros();
        void recargarVistaActual();
      },
    })),
    h('button', {
      type: 'button',
      id: 'quitar-fecha',
      clase: 'boton boton-chico',
      onclick: () => {
        estado.fecha = '';
        $('filtro-fecha').value = '';
        pintarFiltros();
        void recargarVistaActual();
      },
    }, 'Todos los días'),
  );

  $('filtros-avisos').append(
    ...[['abierto', 'Abiertos'], ['resuelto', 'Resueltos']].map(([clave, texto]) =>
      h('button', {
        type: 'button',
        'data-estado': clave,
        'aria-pressed': 'false',
        onclick: () => {
          estado.estadoDeAvisos = clave;
          pintarFiltros();
          void recargarVistaActual();
        },
      }, texto),
    ),
  );
  pintarFiltros();
}

function limpiarBusqueda() {
  estado.buscar = '';
  $('buscar-pedidos').value = '';
}

let esperaDelBuscador;
function alEscribirEnElBuscador(evento) {
  const texto = evento.currentTarget.value.trim();
  clearTimeout(esperaDelBuscador);
  esperaDelBuscador = setTimeout(() => {
    // Con una sola letra no se busca: se vuelve a la lista normal.
    estado.buscar = texto.length >= 2 ? texto : '';
    void recargarVistaActual();
  }, ESPERA_AL_BUSCAR_MS);
}

function activarVista(nombre) {
  estado.vista = nombre;
  for (const vista of VISTAS) {
    const activa = vista === nombre;
    $(`pestana-${vista}`).setAttribute('aria-selected', String(activa));
    $(`pestana-${vista}`).tabIndex = activa ? 0 : -1;
    $(`vista-${vista}`).hidden = !activa;
  }
  return recargarVistaActual();
}

async function recargarVistaActual() {
  try {
    await { pedidos: cargarPedidos, reparto: cargarReparto, avisos: cargarAvisos, equipo: cargarEquipo }[estado.vista]();
    estado.ultimaCarga = Date.now();
  } catch (falla) {
    avisar(falla.message, true);
  }
}

/** Después de una acción propia: se recarga la lista y se actualizan los contadores sin sonar por lo que uno mismo hizo. */
async function refrescar() {
  await Promise.all([recargarVistaActual(), sondear({ silencioso: true })]);
}

function pintarContadores({ porConfirmar, avisosAbiertos }) {
  for (const [id, cantidad] of [['cuenta-pedidos', porConfirmar], ['cuenta-avisos', avisosAbiertos]]) {
    $(id).hidden = cantidad === 0;
    $(id).textContent = String(cantidad);
  }
  actualizarTitulo();
}

/** Pregunta lo mínimo al servidor y recién recarga la lista si algo cambió (o si pasó un minuto, por si acaso). */
async function sondear({ silencioso = false } = {}) {
  if (!silencioso) {
    if (estado.sondeando) return; // ya hay una consulta en camino
    estado.sondeando = true;
  }
  try {
    const { resumen } = await api('/api/estado');
    const volvio = estado.sinConexion;
    marcarConexion(true);
    const anterior = estado.resumen;
    estado.resumen = resumen;
    pintarContadores(resumen);
    if (silencioso) return;
    if (anterior) avisarDeNovedades(anterior, resumen);
    const cambio = !anterior || Object.keys(resumen).some((clave) => resumen[clave] !== anterior[clave]);
    if (volvio || cambio || Date.now() - estado.ultimaCarga > REFRESCO_FORZADO_MS) await recargarVistaActual();
  } catch (falla) {
    // La sesión vencida ya quedó marcada dentro de `api`.
    if (!falla.sesionVencida) marcarConexion(false, falla.message);
  } finally {
    if (!silencioso) estado.sondeando = false;
  }
}

function programarSondeo() {
  setTimeout(async () => {
    await sondear(); // no lanza: los fallos quedan en el aviso de conexión
    programarSondeo();
  }, document.hidden ? INTERVALO_OCULTO_MS : INTERVALO_MS);
}

// ---- Equipo: quién puede entrar y con qué clave ----

const ROLES = { administrador: ['Administrador', 'azul'], repartidor: ['Repartidor', 'verde'] };
let personaDelDialogo = null; // null = repartidor nuevo; si no, la persona a la que se le cambia la clave

function tarjetaDePersona(persona) {
  const [rol, color] = ROLES[persona.rol] ?? [persona.rol, ''];
  const abiertos = persona.dispositivos === 0 ? 'Ningún dispositivo con la sesión abierta' : `${persona.dispositivos} ${persona.dispositivos === 1 ? 'dispositivo' : 'dispositivos'} con la sesión abierta`;
  const situacion = !persona.activo
    ? 'Desactivado: no puede entrar.'
    : persona.bloqueadoHasta
      ? `Bloqueado hasta las ${formatoHora.format(new Date(persona.bloqueadoHasta * 1000))} por varios intentos con una clave equivocada. Cambiarle la clave quita el bloqueo.`
      : '';
  const acciones = [];
  if (persona.soyYo) {
    acciones.push(boton('Cambiar mi clave', 'boton', () => abrirDialogoDeUsuario(persona)));
    if (persona.dispositivos > 1) acciones.push(boton('Cerrar mis otros dispositivos', 'boton', () => void cerrarSesiones(persona)));
  } else if (persona.rol === 'repartidor') {
    acciones.push(boton('Cambiar clave', 'boton', () => abrirDialogoDeUsuario(persona)));
    if (persona.dispositivos > 0) acciones.push(boton('Cerrar sus sesiones', 'boton', () => void cerrarSesiones(persona)));
    acciones.push(persona.activo ? boton('Desactivar', 'boton boton-peligro', () => void cambiarEstadoDePersona(persona, false)) : boton('Activar', 'boton boton-principal', () => void cambiarEstadoDePersona(persona, true)));
  }
  return h(
    'article',
    { clase: 'tarjeta persona' },
    h('div', { clase: 'tarjeta-cabecera' }, h('span', { clase: 'persona-nombre' }, persona.nombre, persona.soyYo ? ' (tú)' : ''), h('span', { clase: `insignia ${color}` }, rol)),
    h('div', { clase: 'datos' }, h('span', {}, h('b', {}, 'RUT '), persona.rut), h('span', {}, abiertos), persona.ultimoUso ? h('span', {}, `Último uso: ${cuando(persona.ultimoUso)}`) : null),
    situacion ? h('p', { clase: 'revision' }, situacion) : null,
    acciones.length > 0 ? h('div', { clase: 'acciones' }, acciones) : h('p', { clase: 'suave' }, 'Su clave y sus dispositivos los administra esa persona.'),
  );
}

async function cargarEquipo() {
  const { usuarios } = await api('/api/usuarios');
  $('lista-equipo').replaceChildren(...usuarios.map(tarjetaDePersona));
}

function abrirDialogoDeUsuario(persona = null) {
  personaDelDialogo = persona;
  const formulario = $('formulario-usuario');
  formulario.reset();
  for (const campo of formulario.querySelectorAll('.solo-alta')) campo.hidden = persona !== null;
  $('titulo-usuario').textContent = persona === null ? 'Nuevo repartidor' : persona.soyYo ? 'Cambiar mi clave' : `Cambiar la clave de ${persona.nombre}`;
  $('texto-usuario').textContent =
    persona === null
      ? 'Dile su clave en persona. Podrá entrar de inmediato desde la entrada "Repartidor".'
      : persona.soyYo
        ? 'Al guardar se cierra tu sesión en todos tus dispositivos y vuelves a entrar con la clave nueva.'
        : 'Al guardar se cierra su sesión en todos sus dispositivos y se quita el bloqueo, si lo tenía.';
  $('error-usuario').hidden = true;
  $('dialogo-usuario').showModal();
}

async function guardarUsuario(evento) {
  evento.preventDefault();
  const formulario = $('formulario-usuario');
  const fallar = (texto) => {
    $('error-usuario').textContent = texto;
    $('error-usuario').hidden = false;
  };
  const clave = formulario.elements.clave.value.trim();
  if (!/^\d{4}$/.test(clave)) return fallar('La clave tiene que ser de 4 dígitos.');
  $('guardar-usuario').disabled = true;
  try {
    if (personaDelDialogo === null) {
      await api('/api/usuarios', { nombre: formulario.elements.nombre.value, rut: formulario.elements.rut.value, clave });
      avisar('Repartidor creado.');
    } else {
      const { salir } = await api(`/api/usuarios/${personaDelDialogo.id}/clave`, { clave });
      if (salir) return location.reload(); // era la clave propia: hay que volver a entrar
      avisar('Clave cambiada.');
    }
    $('dialogo-usuario').close();
    await cargarEquipo();
  } catch (falla) {
    fallar(falla.message);
  } finally {
    $('guardar-usuario').disabled = false;
  }
}

async function cerrarSesiones(persona) {
  const respuesta = await pedirConfirmacion({
    titulo: persona.soyYo ? 'Cerrar mis otros dispositivos' : `Cerrar las sesiones de ${persona.nombre}`,
    texto: persona.soyYo ? 'Los demás dispositivos donde entraste tendrán que volver a pedir tu RUT y tu clave. Este queda abierto.' : 'Tendrá que volver a entrar con su RUT y su clave en todos sus dispositivos.',
    etiqueta: 'Cerrar sesiones',
    clase: 'boton-peligro',
    conMotivo: false,
  });
  if (!respuesta) return;
  try {
    await api(`/api/usuarios/${persona.id}/sesiones/cerrar`, {});
    avisar('Sesiones cerradas.');
    await cargarEquipo();
  } catch (falla) {
    avisar(falla.message, true);
  }
}

async function cambiarEstadoDePersona(persona, activo) {
  if (!activo) {
    const respuesta = await pedirConfirmacion({
      titulo: `Desactivar a ${persona.nombre}`,
      texto: 'No podrá entrar y se cierran sus sesiones. Se puede volver a activar cuando quieras.',
      etiqueta: 'Desactivar',
      clase: 'boton-peligro',
      conMotivo: false,
    });
    if (!respuesta) return;
  }
  try {
    await api(`/api/usuarios/${persona.id}/estado`, { activo });
    avisar(activo ? 'Usuario activado.' : 'Usuario desactivado.');
    await cargarEquipo();
  } catch (falla) {
    avisar(falla.message, true);
  }
}

async function salirDelPanel() {
  try {
    await api('/api/sesion/salir', {});
  } catch {
    /* si no hay conexión, igual se vuelve a la portada */
  }
  location.href = '/';
}

// ---- Avisos sonoros y del navegador ----

let audio = null;

/** Los navegadores solo dejan sonar después de un clic o una tecla de la persona: se prepara en la primera. */
function prepararAudio() {
  try {
    audio ??= new (window.AudioContext ?? window.webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

function pitar() {
  if (!audio || audio.state !== 'running') return;
  const inicio = audio.currentTime;
  for (const [frecuencia, desfase] of [[880, 0], [1175, 0.2]]) {
    const oscilador = audio.createOscillator();
    const volumen = audio.createGain();
    oscilador.frequency.value = frecuencia;
    volumen.gain.setValueAtTime(0.0001, inicio + desfase);
    volumen.gain.exponentialRampToValueAtTime(0.25, inicio + desfase + 0.02);
    volumen.gain.exponentialRampToValueAtTime(0.0001, inicio + desfase + 0.18);
    oscilador.connect(volumen).connect(audio.destination);
    oscilador.start(inicio + desfase);
    oscilador.stop(inicio + desfase + 0.2);
  }
}

function notificarDelNavegador(cuerpo, titulo = 'Brunen: hay novedades') {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try {
    const notificacion = new Notification(titulo, { body: cuerpo, tag: 'brunen-panel', renotify: true });
    notificacion.addEventListener('click', () => {
      window.focus();
      notificacion.close();
    });
  } catch {
    /* algunos navegadores de celular no dejan crear notificaciones así */
  }
}

function avisarDeNovedades(antes, ahora) {
  if (ahora.porConfirmar <= antes.porConfirmar && ahora.ultimoAviso <= antes.ultimoAviso) return;
  pitar();
  notificarDelNavegador(`${ahora.porConfirmar} por confirmar · ${ahora.avisosAbiertos} avisos abiertos`);
}

async function activarAvisosDelNavegador() {
  prepararAudio();
  try {
    await Notification.requestPermission();
  } catch {
    /* el navegador no lo permite */
  }
  mostrarBotonDeAvisos();
}

function mostrarBotonDeAvisos() {
  $('activar-avisos').hidden = !('Notification' in window) || Notification.permission !== 'default';
}

// ---- Arranque ----

/** Las comunas que se atienden (para escribirlas siempre igual) y la fecha de entrega sugerida para un pedido nuevo. */
async function cargarOpciones() {
  try {
    const { comunas, fechaSugerida } = await api('/api/opciones');
    estado.opciones = { comunas: comunas ?? [], fechaSugerida: fechaSugerida ?? '' };
    $('lista-comunas').replaceChildren(...estado.opciones.comunas.map((comuna) => h('option', { value: comuna })));
  } catch {
    /* sin opciones el formulario funciona igual: la comuna y la fecha se escriben a mano */
  }
}

function iniciar() {
  construirFiltros();
  mostrarBotonDeAvisos();

  VISTAS.forEach((vista, i) => {
    const pestana = $(`pestana-${vista}`);
    pestana.addEventListener('click', () => void activarVista(vista));
    pestana.addEventListener('keydown', (evento) => {
      if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return;
      evento.preventDefault();
      const otra = VISTAS[(i + (evento.key === 'ArrowRight' ? 1 : VISTAS.length - 1)) % VISTAS.length];
      void activarVista(otra);
      $(`pestana-${otra}`).focus();
    });
  });

  $('salir').addEventListener('click', () => void salirDelPanel());
  $('nuevo-repartidor').addEventListener('click', () => abrirDialogoDeUsuario());
  $('formulario-usuario').addEventListener('submit', (evento) => void guardarUsuario(evento));
  $('cancelar-usuario').addEventListener('click', () => $('dialogo-usuario').close());
  $('formulario-usuario').elements.rut.addEventListener('input', (evento) => {
    evento.currentTarget.value = darFormatoAlRut(evento.currentTarget.value);
  });
  $('formulario-usuario').elements.clave.addEventListener('input', (evento) => {
    evento.currentTarget.value = evento.currentTarget.value.replace(/\D/g, '').slice(0, 4);
  });

  $('nuevo-pedido').addEventListener('click', abrirNuevoPedido);
  $('buscar-pedidos').addEventListener('input', alEscribirEnElBuscador);
  $('formulario-editar').elements.telefono.addEventListener('change', () => void reconocerCliente());
  $('reparto-hoy').addEventListener('click', () => elegirDiaDelReparto(hoyEnSantiago()));
  $('reparto-manana').addEventListener('click', () => elegirDiaDelReparto(sumarDias(hoyEnSantiago(), 1)));
  $('fecha-reparto').addEventListener('change', (evento) => elegirDiaDelReparto(evento.currentTarget.value));
  void cargarOpciones();

  $('activar-avisos').addEventListener('click', () => void activarAvisosDelNavegador());
  $('formulario-editar').addEventListener('submit', (evento) => void guardarEdicion(evento));
  $('cancelar-editar').addEventListener('click', () => $('dialogo-editar').close());
  $('agregar-linea').addEventListener('click', () => {
    $('editar-lineas').append(filaDeLinea());
    actualizarTotalDelEditor();
  });
  $('editar-lineas').addEventListener('input', actualizarTotalDelEditor);
  $('dialogo-editar').addEventListener('close', () => {
    pedidoEnEdicion = null;
    anotandoNuevo = false;
  });

  document.addEventListener('pointerdown', prepararAudio);
  document.addEventListener('keydown', prepararAudio);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void sondear();
  });

  $('lista-pedidos').replaceChildren(h('p', { clase: 'vacio' }, 'Cargando…'));
  void sondear();
  programarSondeo();
}

function fallarAlArrancar(texto) {
  $('ingreso').replaceChildren(h('div', { clase: 'ingreso' }, h('h1', { clase: 'ingreso-titulo' }, 'Brunen'), h('p', { clase: 'error-formulario' }, texto), boton('Reintentar', 'boton', () => location.reload())));
  $('ingreso').hidden = false;
}

/** Recarga la página para que Cloudflare Access vuelva a pedir el código por correo, sin quedar en un ciclo si eso falla. */
function recargarUnaVez() {
  let ultima = 0;
  try {
    ultima = Number(sessionStorage.getItem('brunen-recarga') ?? 0);
    sessionStorage.setItem('brunen-recarga', String(Date.now()));
  } catch {
    /* sin almacenamiento: se recarga igual */
  }
  if (Date.now() - ultima < 15_000) return fallarAlArrancar('No se pudo comprobar tu acceso. Cierra esta ventana y vuelve a abrir Brunen.');
  location.reload();
}

/**
 * Antes de mostrar nada se comprueba quién es. Llegar hasta aquí ya significa haber pasado por Cloudflare Access; falta
 * el RUT y la clave (o, la primera vez, elegirlos).
 */
async function arrancar() {
  registrarAplicacion();
  let sesion;
  try {
    sesion = await pedir('/admin/api/sesion');
  } catch {
    return fallarAlArrancar('Sin conexión. Revisa tu internet e intenta de nuevo.');
  }
  if (sesion.redirigida || sesion.estado === 401) return recargarUnaVez();
  if (sesion.estado !== 200 || !sesion.datos) return fallarAlArrancar('El panel no está disponible en este momento. Intenta de nuevo en un rato.');

  const { usuario, primerIngreso, correo } = sesion.datos;
  if (usuario) {
    $('usuario').textContent = usuario.nombre;
    $('barra').hidden = false;
    $('aplicacion').hidden = false;
    return iniciar();
  }
  mostrarIngreso({
    contenedor: $('ingreso'),
    titulo: primerIngreso ? 'Crea tu clave' : 'Administrador',
    descripcion: primerIngreso ? `Es tu primer ingreso con ${correo}. Elige el RUT y la clave con los que vas a entrar.` : 'Entra con tu RUT y tu clave.',
    rutaEntrar: primerIngreso ? '/admin/api/sesion/primer-ingreso' : '/admin/api/sesion/entrar',
    primerIngreso,
    alEntrar: () => location.reload(),
  });
}

void arrancar();
