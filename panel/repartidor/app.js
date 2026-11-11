/**
 * Panel del repartidor. Por ahora: entrar con RUT y clave, y la pantalla base de la ruta de hoy. Las paradas, los
 * botones (navegar, llamar, entregado, no se pudo) y el trabajo sin señal llegan con la fase D del diseño.
 */

import { mostrarIngreso, pedir, registrarAplicacion } from '/ingreso.js';

const $ = (id) => document.getElementById(id);
const formatoDeHoy = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long' });

function mostrarSolo(id) {
  for (const zona of ['ingreso', 'otra-sesion', 'ruta']) $(zona).hidden = zona !== id;
  $('barra').hidden = id !== 'ruta';
}

function mostrarRuta(usuario) {
  $('usuario').textContent = usuario.nombre;
  $('fecha-de-hoy').textContent = formatoDeHoy.format(new Date()).replace(',', '');
  mostrarSolo('ruta');
}

function pedirClave() {
  mostrarSolo('ingreso');
  mostrarIngreso({ contenedor: $('ingreso'), titulo: 'Repartidor', descripcion: 'Entra con tu RUT y tu clave.', rutaEntrar: '/api/sesion/entrar', alEntrar: mostrarRuta });
}

async function salir() {
  try {
    await pedir('/api/sesion/salir', {});
  } catch {
    /* sin conexión: igual se vuelve al ingreso; la sesión sigue viva hasta que haya señal */
  }
  pedirClave();
}

async function iniciar() {
  registrarAplicacion();
  $('salir').addEventListener('click', () => void salir());
  $('cambiar-sesion').addEventListener('click', () => void salir());

  let usuario = null;
  try {
    usuario = (await pedir('/api/sesion')).datos?.usuario ?? null;
  } catch {
    /* sin conexión: se pide la clave; al enviar el formulario se avisa que no hay internet */
  }
  if (usuario?.rol === 'repartidor') mostrarRuta(usuario);
  else if (usuario?.rol === 'administrador') mostrarSolo('otra-sesion');
  else pedirClave();
}

void iniciar();
