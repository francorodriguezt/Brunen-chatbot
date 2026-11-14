/**
 * La ruta del día en el mapa (fase C, D63). Muestra el orden en que conviene repartir, desde la planta hasta la planta,
 * con las recargas, y deja cambiarlo, ubicar a mano una dirección y publicar el orden para el repartidor.
 *
 * El orden lo calcula el servidor (`src/ruta.ts`); aquí solo se dibuja. El mapa es MapLibre (código abierto, copiado en
 * `vendor/`) con los mosaicos de OpenFreeMap: por esa dirección solo se piden los mosaicos de la zona que se mira, nunca
 * una dirección ni un nombre. Si el mapa no se puede dibujar (sin internet, sin WebGL), la lista sirve igual.
 */

const ESTILO_DEL_MAPA = 'https://tiles.openfreemap.org/styles/liberty';
const NOMBRES_DE_DEPOSITO = { planta: 'la planta', actum: 'Actum' };

let bibliotecaDelMapa = null;

/** MapLibre pesa más de 1 MB: se baja solo la primera vez que alguien abre el mapa. */
function cargarBiblioteca() {
  if (!bibliotecaDelMapa) {
    if (!document.querySelector('link[data-mapa]')) {
      const estilos = document.createElement('link');
      estilos.rel = 'stylesheet';
      estilos.href = '/admin/vendor/maplibre-gl.css';
      estilos.dataset.mapa = '';
      document.head.append(estilos);
    }
    bibliotecaDelMapa = import('/admin/vendor/maplibre-gl.mjs').catch((falla) => {
      bibliotecaDelMapa = null; // se puede intentar de nuevo más tarde
      throw falla;
    });
  }
  return bibliotecaDelMapa;
}

function duracion(minutos) {
  const total = Math.round(minutos);
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  if (horas === 0) return `${resto} min`;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

const kilometros = (km) => `${km.toLocaleString('es-CL', { maximumFractionDigits: 1 })} km`;
const lugarDe = (parada) => [parada.direccion, parada.comuna].filter(Boolean).join(', ');

/**
 * @param {object} piezas `contenedor` donde se dibuja, y lo que comparte la pantalla del panel: `api`, `h`, `boton`,
 *   `avisar`, y `alPublicar` para volver a pedir la lista del reparto cuando cambia el orden.
 */
export function crearRutaDelDia({ contenedor, api, h, boton, avisar, alPublicar }) {
  const estado = {
    fecha: null,
    datos: null,
    orden: [],
    /** El orden que ve el repartidor (ids unidos por coma), si se sabe; null si no hay uno vigente. */
    ordenPublicado: null,
    /** El orden se cambió a mano o se recalculó y no es el publicado: no se pisa solo. */
    cambiosSinPublicar: false,
    /** Mientras había cambios sin publicar, cambió el reparto del día (un pedido nuevo, una entrega). */
    desactualizada: false,
    ubicando: null,
    biblioteca: null,
    mapa: null,
    mapaListo: false,
    sinMapa: false,
    marcadores: [],
    encuadrada: null,
    ocupado: false,
    turno: 0,
    /** Tras mover una parada, el foco vuelve a su botón (para quien usa el teclado o un lector de pantalla). */
    enfocar: null,
  };

  const cabecera = h('div', { clase: 'ruta-cabecera' });
  const avisoUbicar = h('p', { clase: 'revision', hidden: true });
  const lienzo = h('div', { clase: 'mapa-ruta', role: 'region', 'aria-label': 'Mapa de la ruta' });
  const lista = h('div', { clase: 'lista ruta-lista' });
  contenedor.replaceChildren(cabecera, avisoUbicar, lienzo, lista);

  const porId = () => new Map((estado.datos?.paradas ?? []).map((p) => [p.idPedido, p]));

  /** `aMano`: el orden lo pidió una persona (recalcular o mover), no es el que se carga al abrir. */
  function recibir(datos, aMano) {
    if (!aMano) estado.ordenPublicado = datos.sigueLaPublicada ? datos.plan.orden.join() : null;
    estado.datos = datos;
    estado.orden = [...datos.plan.orden];
    estado.cambiosSinPublicar = aMano && datos.plan.orden.join() !== estado.ordenPublicado;
    estado.desactualizada = false;
    pintar();
  }

  const esLaPublicada = () => estado.ordenPublicado !== null && estado.orden.join() === estado.ordenPublicado;

  async function cargar(modo) {
    if (!estado.fecha) return;
    const turno = ++estado.turno;
    try {
      const datos = await api(`/api/ruta?fecha=${encodeURIComponent(estado.fecha)}${modo === 'optima' ? '&modo=optima' : ''}`);
      if (turno !== estado.turno) return;
      recibir(datos, modo === 'optima');
      if (modo === 'optima') avisar(`Ruta más eficiente: ${kilometros(datos.plan.km)}. Publícala para que el repartidor la vea.`);
    } catch (falla) {
      if (turno === estado.turno) avisar(falla.message, true);
    }
  }

  /** Kilómetros y cargas de un orden a mano. El servidor revisa que el orden use justo las paradas del día. */
  async function evaluar(orden) {
    const turno = ++estado.turno;
    try {
      const datos = await api('/api/ruta/evaluar', { fecha: estado.fecha, orden });
      if (turno === estado.turno) recibir(datos, true);
    } catch (falla) {
      avisar(falla.message, true);
      if (falla.codigo === 422) await cargar();
    }
  }

  function mover(indice, paso) {
    const destino = indice + paso;
    if (estado.ocupado || destino < 0 || destino >= estado.orden.length) return;
    const orden = [...estado.orden];
    [orden[indice], orden[destino]] = [orden[destino], orden[indice]];
    estado.orden = orden; // un segundo toque antes de la respuesta parte de este orden, no del anterior
    estado.enfocar = { id: orden[destino], subir: paso < 0 };
    void evaluar(orden);
  }

  async function publicar() {
    if (estado.ocupado) return;
    estado.ocupado = true;
    try {
      await api('/api/ruta/publicar', { fecha: estado.fecha, orden: estado.orden });
      avisar('Ruta publicada: el repartidor ya ve las paradas en este orden.');
      estado.ocupado = false;
      await cargar();
      alPublicar?.();
    } catch (falla) {
      avisar(falla.message, true);
      if (falla.codigo === 422) await cargar();
    } finally {
      estado.ocupado = false;
    }
  }

  function empezarAUbicar(parada) {
    estado.ubicando = parada;
    avisoUbicar.hidden = false;
    avisoUbicar.replaceChildren(`Toca el mapa justo donde queda ${lugarDe(parada) || 'esta parada'}. `, boton('Cancelar', 'boton boton-chico', terminarDeUbicar));
    lienzo.classList.add('ubicando');
    avisoUbicar.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function terminarDeUbicar() {
    estado.ubicando = null;
    avisoUbicar.hidden = true;
    lienzo.classList.remove('ubicando');
  }

  async function guardarPunto(lngLat) {
    const parada = estado.ubicando;
    terminarDeUbicar();
    try {
      await api('/api/puntos', { direccion: parada.direccion, comuna: parada.comuna, lat: lngLat.lat, lng: lngLat.lng });
      avisar('Punto guardado: esa dirección queda ubicada para los próximos repartos. Si la ruta cambió mucho, calcula de nuevo la más eficiente.');
      // Con cambios a mano sin publicar, se conserva ese orden (si la parada ya estaba en la ruta); si no, se pide de nuevo.
      if (estado.cambiosSinPublicar && estado.orden.includes(parada.idPedido)) await evaluar(estado.orden);
      else await cargar();
    } catch (falla) {
      avisar(falla.message, true);
    }
  }

  // ---- Lista ----

  function pintar() {
    const datos = estado.datos;
    if (!datos) return;
    const { plan } = datos;
    const paradas = porId();

    if (datos.paradas.length === 0) {
      cabecera.replaceChildren(h('p', { clase: 'vacio' }, 'No hay entregas confirmadas para este día.'));
      lista.replaceChildren();
      lienzo.hidden = true;
      return;
    }
    lienzo.hidden = estado.sinMapa;

    const porRecorrer = plan.orden.length;
    const cifra = (numero, palabra) => h('li', {}, h('b', {}, numero), ` ${palabra}`);
    let situacion;
    if (porRecorrer === 0) situacion = h('p', { clase: 'suave' }, 'No quedan paradas por recorrer.');
    else if (estado.desactualizada)
      situacion = h('p', { clase: 'revision' }, 'Cambió el reparto del día y tienes cambios sin publicar. ', boton('Ver la ruta de nuevo', 'boton boton-chico', () => void cargar()));
    else if (esLaPublicada()) situacion = h('p', { clase: 'suave' }, 'Publicada: el repartidor ve las paradas en este orden.');
    else if (estado.cambiosSinPublicar)
      situacion = h('p', { clase: 'revision' }, datos.publicada ? 'Cambios sin publicar: el repartidor sigue viendo el orden anterior.' : 'Sin publicar: el repartidor ve las paradas ordenadas por comuna.');
    else situacion = h('p', { clase: 'revision' }, datos.publicada ? 'Hay paradas nuevas desde que se publicó: publica de nuevo para ordenarlas.' : 'Sin publicar: el repartidor ve las paradas ordenadas por comuna.');

    cabecera.replaceChildren(
      ...[
        h(
          'ul',
          { clase: 'cifras' },
          cifra(String(porRecorrer), porRecorrer === 1 ? 'parada por recorrer' : 'paradas por recorrer'),
          porRecorrer > 0 ? cifra(`~${kilometros(plan.km)}`, 'en total') : null,
          porRecorrer > 0 ? cifra(`~${duracion(plan.minutos)}`, 'de reparto') : null,
          plan.cargas.length > 1 ? cifra(String(plan.cargas.length), 'cargas del furgón') : null,
        ),
        porRecorrer > 0 ? h('p', { clase: 'suave nota-ruta' }, 'Kilómetros y tiempo aproximados (en línea recta, con un margen por las calles): sirven para comparar órdenes, no para prometer horas.') : null,
        situacion,
        porRecorrer > 0
          ? h(
              'div',
              { clase: 'acciones' },
              boton('Calcular la más eficiente', 'boton', () => void cargar('optima')),
              boton('Publicar ruta', esLaPublicada() ? 'boton' : 'boton boton-principal', () => void publicar()),
            )
          : null,
        estado.sinMapa ? h('p', { clase: 'suave' }, 'No se pudo dibujar el mapa en este equipo: la lista y el orden funcionan igual.') : null,
      ].filter(Boolean),
    );

    let numero = 0;
    const filas = plan.cargas.flatMap((carga) => {
      const desde = carga.recargaEn ? `recarga en ${NOMBRES_DE_DEPOSITO[carga.recargaEn]}` : 'sale de la planta';
      const titulo = h(
        'h3',
        { clase: `titulo-carga${carga.excedeFurgon ? ' excede' : ''}` },
        `Carga ${carga.numero}: ${carga.bidones} bidones, ${desde}${carga.excedeFurgon ? ' (un pedido no cabe en un viaje: divídelo)' : ''}`,
      );
      return [titulo, ...carga.paradas.map((id) => filaDeParada(paradas.get(id), ++numero))];
    });
    const sinUbicar = datos.sinUbicar.map((id) => paradas.get(id)).filter(Boolean);
    const entregadas = datos.entregadas.length;
    lista.replaceChildren(
      ...[
        ...filas,
        porRecorrer > 0 ? h('p', { clase: 'suave fin-ruta' }, 'Al terminar, vuelve a la planta.') : null,
        sinUbicar.length > 0 ? h('h3', { clase: 'titulo-carga excede' }, sinUbicar.length === 1 ? '1 parada sin ubicar: va al final' : `${sinUbicar.length} paradas sin ubicar: van al final`) : null,
        ...sinUbicar.map((p) => filaDeParada(p, null)),
        entregadas > 0 ? h('p', { clase: 'suave' }, entregadas === 1 ? '1 parada ya entregada: sale de la ruta.' : `${entregadas} paradas ya entregadas: salen de la ruta.`) : null,
      ].filter(Boolean),
    );

    if (estado.enfocar) {
      const botones = [...(document.getElementById(`ruta-${estado.enfocar.id}`)?.querySelectorAll('.acciones button') ?? [])].slice(0, 2);
      const elegido = estado.enfocar.subir ? botones[0] : botones[1];
      (elegido && !elegido.disabled ? elegido : botones.find((b) => !b.disabled))?.focus({ preventScroll: false });
      estado.enfocar = null;
    }
    void dibujar();
  }

  function filaDeParada(parada, numero) {
    if (!parada) return null;
    const indice = numero === null ? -1 : numero - 1;
    const ubicable = !estado.sinMapa && parada.direccion.trim() !== '';
    const lugar = parada.aproximado ? 'Ubicación aproximada: el centro de la comuna.' : numero === null ? 'Sin ubicación: ubícala en el mapa para sumarla a la ruta.' : null;
    return h(
      'article',
      { clase: 'tarjeta parada-ruta', id: `ruta-${parada.idPedido}` },
      h(
        'div',
        { clase: 'tarjeta-cabecera' },
        h('span', { clase: 'orden' }, numero === null ? '–' : String(numero)),
        h('strong', { clase: 'direccion' }, lugarDe(parada) || 'Sin dirección'),
        h('span', { clase: 'insignia' }, `${parada.bidones} ${parada.bidones === 1 ? 'bidón' : 'bidones'}`),
      ),
      parada.nombre ? h('div', { clase: 'cliente' }, parada.nombre) : null,
      lugar ? h('p', { clase: 'falta' }, lugar) : null,
      h(
        'div',
        { clase: 'acciones' },
        indice >= 0 ? h('button', { type: 'button', clase: 'boton boton-chico', 'aria-label': `Subir la parada ${numero}`, disabled: indice === 0, onclick: () => mover(indice, -1) }, '↑ Antes') : null,
        indice >= 0 ? h('button', { type: 'button', clase: 'boton boton-chico', 'aria-label': `Bajar la parada ${numero}`, disabled: indice === estado.orden.length - 1, onclick: () => mover(indice, 1) }, '↓ Después') : null,
        ubicable ? boton(parada.aproximado || numero === null ? 'Ubicar en el mapa' : 'Corregir punto', 'boton boton-chico', () => empezarAUbicar(parada)) : null,
      ),
    );
  }

  // ---- Mapa ----

  async function asegurarMapa() {
    if (estado.mapa || estado.sinMapa || !estado.datos) return estado.mapa;
    try {
      const maplibre = await cargarBiblioteca();
      if (estado.mapa) return estado.mapa;
      const { planta } = estado.datos;
      const mapa = new maplibre.Map({
        container: lienzo,
        style: ESTILO_DEL_MAPA,
        center: [planta.lng, planta.lat],
        zoom: 11,
        cooperativeGestures: true, // en el celular se mueve con dos dedos: con uno se sigue bajando por la página
        attributionControl: { compact: true },
      });
      mapa.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
      mapa.on('load', () => {
        mapa.addSource('ruta', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        mapa.addLayer({
          id: 'ruta-linea',
          type: 'line',
          source: 'ruta',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#0b6cb0', 'line-width': 3, 'line-opacity': 0.8 },
        });
        estado.mapaListo = true;
        void dibujar();
      });
      mapa.on('click', (evento) => {
        if (estado.ubicando) void guardarPunto(evento.lngLat);
      });
      mapa.on('error', (evento) => console.warn('Mapa:', evento.error?.message ?? evento));
      estado.biblioteca = maplibre;
      estado.mapa = mapa;
      return mapa;
    } catch (falla) {
      console.warn('No se pudo dibujar el mapa:', falla);
      estado.sinMapa = true;
      pintar();
      return null;
    }
  }

  function marcador(texto, clase, titulo, punto) {
    const elemento = h('div', { clase: `marcador ${clase}`.trim(), title: titulo, 'aria-hidden': 'true' }, texto);
    return new estado.biblioteca.Marker({ element: elemento }).setLngLat([punto.lng, punto.lat]).addTo(estado.mapa);
  }

  async function dibujar() {
    const mapa = await asegurarMapa();
    if (!mapa || !estado.mapaListo || !estado.datos) return;
    const { datos } = estado;
    const paradas = porId();
    for (const m of estado.marcadores) m.remove();
    estado.marcadores = [marcador('P', 'deposito', 'Planta: salida y llegada', datos.planta), marcador('A', 'deposito', 'Actum: recarga', datos.actum)];
    datos.plan.orden.forEach((id, i) => {
      const p = paradas.get(id);
      if (!p || p.lat === null) return;
      estado.marcadores.push(marcador(String(i + 1), p.aproximado ? 'aproximado' : '', `${i + 1}. ${lugarDe(p)}${p.aproximado ? ' (aproximado)' : ''}`, p));
    });

    const coordenada = (clave) => {
      if (clave === 'planta' || clave === 'actum') return [datos[clave].lng, datos[clave].lat];
      const p = paradas.get(clave);
      return p && p.lat !== null ? [p.lng, p.lat] : null;
    };
    const linea = [];
    for (const tramo of datos.plan.tramos) {
      const desde = coordenada(tramo.desde);
      const hasta = coordenada(tramo.hasta);
      if (!desde || !hasta) continue;
      if (linea.length === 0) linea.push(desde);
      linea.push(hasta);
    }
    mapa.getSource('ruta')?.setData({
      type: 'FeatureCollection',
      features: linea.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: linea } }] : [],
    });

    // Se encuadra una vez por día elegido, para no mover el mapa mientras alguien lo está mirando.
    if (estado.encuadrada !== estado.fecha) {
      estado.encuadrada = estado.fecha;
      const limites = new estado.biblioteca.LngLatBounds();
      for (const m of estado.marcadores) limites.extend(m.getLngLat());
      mapa.fitBounds(limites, { padding: { top: 40, right: 50, bottom: 70, left: 40 }, maxZoom: 14, duration: 0 });
    }
  }

  return {
    /**
     * Cambió el reparto o se eligió otro día. Con la sección abierta, la ruta se actualiza sola, salvo que haya cambios a
     * mano sin publicar: esos no se pisan, se avisa.
     */
    actualizar(fecha, abierta) {
      const otroDia = fecha !== estado.fecha;
      estado.fecha = fecha;
      if (otroDia) {
        terminarDeUbicar();
        estado.datos = null;
        estado.ordenPublicado = null;
        estado.cambiosSinPublicar = false;
      }
      if (!abierta || estado.ubicando || estado.ocupado) return;
      if (!otroDia && estado.cambiosSinPublicar) {
        estado.desactualizada = true;
        pintar();
        return;
      }
      void cargar();
    },
    /** Se abrió la sección: la primera vez se baja el mapa. */
    abrir(fecha) {
      if (fecha !== estado.fecha || !estado.datos) this.actualizar(fecha, true);
      else estado.mapa?.resize();
    },
  };
}
