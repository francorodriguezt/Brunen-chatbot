/**
 * Portada: las dos entradas. Si este dispositivo ya está recordado, no se muestra: se va directo al panel de esa
 * persona, para que abrir la aplicación sea llegar a lo suyo.
 */

import { pedir, registrarAplicacion } from '/ingreso.js';

const DESTINOS = { administrador: '/admin/', repartidor: '/repartidor/' };

async function iniciar() {
  registrarAplicacion();
  // `?elegir` muestra las dos entradas aunque haya una sesión (es a donde lleva "Cambiar de entrada").
  if (!new URLSearchParams(location.search).has('elegir')) {
    try {
      const { datos } = await pedir('/api/sesion');
      const destino = DESTINOS[datos?.usuario?.rol];
      if (destino) return location.replace(destino);
    } catch {
      /* sin conexión: se muestran las entradas igual */
    }
  }
  document.getElementById('portada').hidden = false;
}

void iniciar();
