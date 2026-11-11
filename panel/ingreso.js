/**
 * El formulario de ingreso, compartido por las dos entradas (administrador y repartidor): RUT, clave de 4 dígitos y
 * "recordar este dispositivo". Sin dependencias; todo texto se pone con `textContent`, nunca como HTML.
 *
 * La clave no se guarda en ningún lado del navegador: viaja una vez al servidor, que responde con una cookie que el
 * código de la página no puede leer.
 */

function crear(etiqueta, atributos = {}, ...hijos) {
  const elemento = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave === 'clase') elemento.className = valor;
    else elemento.setAttribute(clave, valor === true ? '' : String(valor));
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    elemento.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return elemento;
}

/**
 * Sin `cuerpo` es un GET; con `cuerpo`, un POST de JSON con la marca que el servidor exige a toda escritura.
 * Devuelve `{ estado, datos, redirigida }`; `redirigida` es que Cloudflare Access quiso mandar a su inicio de sesión.
 */
export async function pedir(ruta, cuerpo) {
  const comunes = { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' };
  const respuesta = await fetch(
    ruta,
    cuerpo === undefined
      ? { headers: comunes, cache: 'no-store', redirect: 'manual' }
      : { method: 'POST', headers: { ...comunes, 'content-type': 'application/json', 'x-panel': '1' }, body: JSON.stringify(cuerpo), cache: 'no-store', redirect: 'manual' },
  );
  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    /* la respuesta no era JSON */
  }
  return { estado: respuesta.status, datos, redirigida: respuesta.type === 'opaqueredirect' };
}

/** "123456785" → "12.345.678-5", mientras la persona escribe. */
export function darFormatoAlRut(texto) {
  const limpio = String(texto).toUpperCase().replace(/[^0-9K]/g, '').slice(0, 9);
  if (limpio.length < 2) return limpio;
  return `${limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${limpio.slice(-1)}`;
}

/**
 * Dibuja el formulario dentro de `contenedor`.
 * @param {{ contenedor: HTMLElement, titulo: string, descripcion?: string, rutaEntrar: string, primerIngreso?: boolean, alEntrar: (usuario: {nombre: string, rol: string}) => void }} opciones
 */
export function mostrarIngreso({ contenedor, titulo, descripcion = '', rutaEntrar, primerIngreso = false, alEntrar }) {
  const campoNombre = primerIngreso ? crear('input', { type: 'text', name: 'nombre', autocomplete: 'name', maxlength: 60, required: true }) : null;
  const campoRut = crear('input', { type: 'text', name: 'rut', inputmode: 'text', autocomplete: 'username', autocapitalize: 'characters', spellcheck: 'false', placeholder: '12.345.678-9', maxlength: 12, required: true });
  const atributosDeClave = { type: 'password', inputmode: 'numeric', pattern: '[0-9]{4}', maxlength: 4, placeholder: '••••', required: true, clase: 'clave' };
  const campoClave = crear('input', { ...atributosDeClave, name: 'clave', autocomplete: primerIngreso ? 'new-password' : 'current-password' });
  const campoRepetir = primerIngreso ? crear('input', { ...atributosDeClave, name: 'repetir', autocomplete: 'new-password' }) : null;
  const casilla = crear('input', { type: 'checkbox', name: 'recordar', checked: true });
  const falla = crear('p', { clase: 'error-formulario', role: 'alert', hidden: true });
  const enviar = crear('button', { type: 'submit', clase: 'boton boton-principal' }, primerIngreso ? 'Crear mi clave y entrar' : 'Entrar');

  const formulario = crear(
    'form',
    { clase: 'ingreso', novalidate: true },
    crear('h1', { clase: 'ingreso-titulo' }, titulo),
    descripcion && crear('p', { clase: 'suave' }, descripcion),
    campoNombre && crear('label', {}, 'Tu nombre', campoNombre),
    crear('label', {}, 'RUT', campoRut),
    crear('label', {}, primerIngreso ? 'Elige una clave de 4 dígitos' : 'Clave de 4 dígitos', campoClave),
    campoRepetir && crear('label', {}, 'Repite la clave', campoRepetir),
    crear('label', { clase: 'casilla' }, casilla, 'Recordar este dispositivo'),
    crear('p', { clase: 'ayuda' }, 'No lo marques en un computador o teléfono que use otra gente.'),
    falla,
    enviar,
    crear('a', { clase: 'volver', href: '/' }, 'Volver'),
  );

  const mostrarFalla = (texto) => {
    falla.textContent = texto;
    falla.hidden = false;
  };

  campoRut.addEventListener('input', () => {
    campoRut.value = darFormatoAlRut(campoRut.value);
  });
  for (const campo of [campoClave, campoRepetir]) {
    campo?.addEventListener('input', () => {
      campo.value = campo.value.replace(/\D/g, '').slice(0, 4);
    });
  }

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    falla.hidden = true;
    const rut = campoRut.value.trim();
    const clave = campoClave.value;
    if (campoNombre && campoNombre.value.trim().length < 2) return mostrarFalla('Escribe tu nombre.');
    if (rut.length < 8) return mostrarFalla('Escribe tu RUT completo, con el dígito verificador.');
    if (!/^\d{4}$/.test(clave)) return mostrarFalla('La clave tiene que ser de 4 dígitos.');
    if (campoRepetir && campoRepetir.value !== clave) return mostrarFalla('Las dos claves no son iguales.');

    enviar.disabled = true;
    try {
      const { estado, datos, redirigida } = await pedir(rutaEntrar, { rut, clave, recordar: casilla.checked, ...(campoNombre && { nombre: campoNombre.value.trim() }) });
      if (redirigida) return location.reload(); // venció el paso previo por correo: al recargar se vuelve a pedir
      if (estado === 200 && datos?.usuario) return alEntrar(datos.usuario);
      campoClave.value = '';
      if (campoRepetir) campoRepetir.value = '';
      mostrarFalla(datos?.error ?? 'No se pudo entrar. Intenta de nuevo.');
      campoClave.focus();
    } catch {
      mostrarFalla('Sin conexión. Revisa tu internet e intenta de nuevo.');
    } finally {
      enviar.disabled = false;
    }
  });

  contenedor.replaceChildren(formulario);
  contenedor.hidden = false;
  (campoNombre ?? campoRut).focus();
}

/** Deja la aplicación instalable y con su pantalla disponible sin señal. Si el navegador no lo permite, no pasa nada. */
export function registrarAplicacion() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
