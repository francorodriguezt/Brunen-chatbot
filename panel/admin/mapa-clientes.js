/**
 * Clientes por comuna y en el mapa (D75): lo que el dueño pidió ver el 2026-10-29. Una barra por comuna (tocarla filtra
 * la lista de clientes) y un mapa con un círculo por comuna con su cantidad, más un punto por cada cliente cuyo lugar
 * exacto ya se conoce (lo guardó el repartidor al entregar o alguien a mano en la ruta).
 *
 * El servidor no manda teléfonos ni direcciones: solo nombres, cantidades y coordenadas. Los mosaicos del mapa salen de
 * OpenFreeMap, que solo recibe la zona que se mira (igual que el mapa de la ruta, D63).
 */

import { TEXTOS_DEL_MAPA, cargarBiblioteca } from './mapa.js';

const ESTILO_DEL_MAPA = 'https://tiles.openfreemap.org/styles/liberty';
const CENTRO_DE_SANTIAGO = [-70.62, -33.44];

export function crearMapaDeClientes({ contenedor, api, h, alElegirComuna }) {
  const estado = { datos: null, mapa: null, biblioteca: null, marcadores: [], sinMapa: false, cargando: false, listo: false };
  const resumen = h('div', { clase: 'resumen-comunas' }, h('p', { clase: 'suave' }, 'Cargando…'));
  const lienzo = h('div', { clase: 'mapa-ruta mapa-clientes' });
  contenedor.replaceChildren(resumen, lienzo);

  function pintarLista() {
    const { datos } = estado;
    if (datos.total === 0) {
      resumen.replaceChildren(h('p', { clase: 'vacio' }, 'Todavía no hay clientes con dirección.'));
      lienzo.hidden = true;
      return;
    }
    const maximo = Math.max(1, ...datos.comunas.map((c) => c.clientes));
    const filas = datos.comunas.map((c) => {
      const barra = h('span', { clase: 'grafico-barra' });
      barra.style.width = `${Math.round((c.clientes / maximo) * 100)}%`; // por CSSOM: la política de contenido no deja estilos en línea
      return h(
        'li',
        {},
        h('button', { type: 'button', clase: 'enlace-comuna', title: `Ver los clientes de ${c.comuna}`, onclick: () => alElegirComuna(c.comuna) }, c.comuna),
        h('span', { clase: 'grafico-fondo' }, barra),
        h('span', { clase: 'grafico-numero' }, String(c.clientes)),
      );
    });
    resumen.replaceChildren(
      h(
        'p',
        { clase: 'suave' },
        `${datos.total} ${datos.total === 1 ? 'cliente' : 'clientes'} con dirección. ` +
          (datos.puntos.length > 0
            ? `${datos.puntos.length} con su lugar exacto (los puntos); los demás se cuentan en el círculo de su comuna.`
            : 'Los lugares exactos aparecen a medida que el repartidor entrega: por ahora se cuentan en el círculo de su comuna.'),
      ),
      h('ul', { clase: 'grafico comunas' }, ...filas),
    );
  }

  async function asegurarMapa() {
    if (estado.mapa || estado.sinMapa) return estado.mapa;
    try {
      const maplibre = await cargarBiblioteca();
      if (estado.mapa) return estado.mapa;
      const mapa = new maplibre.Map({
        container: lienzo,
        style: ESTILO_DEL_MAPA,
        center: CENTRO_DE_SANTIAGO,
        zoom: 10.3,
        cooperativeGestures: true, // en el celular se mueve con dos dedos: con uno se sigue bajando por la página
        attributionControl: { compact: true },
        locale: TEXTOS_DEL_MAPA,
      });
      mapa.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
      // Los puntos van en una capa del mapa, que necesita el estilo cargado. Los círculos de comuna no: se ven aunque
      // los mosaicos tarden o fallen.
      const alCargarEstilo = () => {
        if (estado.listo) return;
        mapa.addSource('clientes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        mapa.addLayer({
          id: 'clientes-puntos',
          type: 'circle',
          source: 'clientes',
          paint: { 'circle-radius': 4, 'circle-color': '#0b6cb0', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 },
        });
        estado.listo = true;
        dibujar();
      };
      mapa.once('style.load', alCargarEstilo);
      mapa.once('load', alCargarEstilo);
      mapa.on('error', (evento) => console.warn('Mapa de clientes:', evento.error?.message ?? evento));
      estado.biblioteca = maplibre;
      estado.mapa = mapa;
      return mapa;
    } catch (falla) {
      console.warn('No se pudo dibujar el mapa de clientes:', falla);
      estado.sinMapa = true;
      lienzo.replaceChildren(h('p', { clase: 'suave' }, 'No se pudo dibujar el mapa en este equipo: la lista por comuna funciona igual.'));
      return null;
    }
  }

  function dibujar() {
    const { mapa, datos, biblioteca } = estado;
    if (!mapa || !datos) return;
    for (const m of estado.marcadores) m.remove();
    const maximo = Math.max(1, ...datos.comunas.map((c) => c.clientes));
    estado.marcadores = datos.comunas
      .filter((c) => c.centro)
      .map((c) => {
        // El tamaño crece con la raíz de la cantidad: una comuna con el doble de clientes no tapa a las demás.
        const tamano = Math.round(28 + 34 * Math.sqrt(c.clientes / maximo));
        const elemento = h(
          'button',
          { type: 'button', clase: 'marcador-comuna', title: `${c.comuna}: ${c.clientes} ${c.clientes === 1 ? 'cliente' : 'clientes'}`, 'aria-label': `${c.comuna}, ${c.clientes} clientes` },
          String(c.clientes),
        );
        elemento.style.width = `${tamano}px`;
        elemento.style.height = `${tamano}px`;
        elemento.addEventListener('click', () => alElegirComuna(c.comuna));
        return new biblioteca.Marker({ element: elemento }).setLngLat([c.centro.lng, c.centro.lat]).addTo(mapa);
      });
    if (estado.listo) mapa.getSource('clientes')?.setData({
      type: 'FeatureCollection',
      features: datos.puntos.map((p) => ({ type: 'Feature', properties: { nombre: p.nombre }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })),
    });
    const limites = new biblioteca.LngLatBounds();
    for (const m of estado.marcadores) limites.extend(m.getLngLat());
    for (const p of datos.puntos) limites.extend([p.lng, p.lat]);
    if (!limites.isEmpty()) mapa.fitBounds(limites, { padding: 40, maxZoom: 13, duration: 0 });
  }

  return {
    /** Se carga al abrir el desplegable; volver a abrirlo trae los números al día. */
    async abrir() {
      if (estado.cargando) return;
      estado.cargando = true;
      try {
        estado.datos = await api('/api/clientes/mapa');
        pintarLista();
        if (estado.datos.total > 0) {
          lienzo.hidden = false;
          await asegurarMapa();
          if (estado.mapa) estado.mapa.resize(); // el desplegable estaba cerrado al crear el mapa
          dibujar();
        }
      } catch (falla) {
        resumen.replaceChildren(h('p', { clase: 'falta' }, falla.message));
      } finally {
        estado.cargando = false;
      }
    },
  };
}
