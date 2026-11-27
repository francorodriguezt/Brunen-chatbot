// Página /conectar (D116): abre el registro integrado de Meta y muestra lo que devuelve. No manda nada a ningún servidor:
// el código de un solo uso y los identificadores se ven en pantalla y los canjea el comando local `npm run conectar-numero`.
const raiz = document.getElementById('conectar');
const boton = document.getElementById('iniciar');
const estado = document.getElementById('estado');
const resultado = document.getElementById('resultado');
const datosEl = document.getElementById('datos');
const comandoEl = document.getElementById('comando');
const copiar = document.getElementById('copiar');

const appId = raiz.dataset.appId;
const configId = raiz.dataset.configId;
const version = raiz.dataset.version;

const recibido = { evento: '', waba: '', telefono: '', codigo: '' };

// Solo se aceptan mensajes de las ventanas de Facebook, con el dominio exacto (no basta con que termine en "facebook.com").
const ORIGENES = new Set(['https://www.facebook.com', 'https://web.facebook.com']);

const ESTADOS = {
  FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING: '',
  FINISH: 'Meta terminó el registro como número nuevo, no como número que ya usa la app. Brunen necesita la otra opción: vuelve a empezar y elige conectar la app WhatsApp Business existente.',
  CANCEL: 'Se cerró la ventana antes de terminar. Puedes volver a intentarlo.',
  ERROR: 'Meta informó un error. Puedes volver a intentarlo.',
};

function pintar() {
  datosEl.replaceChildren();
  const filas = [
    ['Evento', recibido.evento],
    ['Cuenta de WhatsApp (waba_id)', recibido.waba],
    ['Número (phone_number_id)', recibido.telefono],
    ['Código de un solo uso', recibido.codigo],
  ];
  for (const [nombre, valor] of filas) {
    const dt = document.createElement('dt');
    dt.textContent = nombre;
    const dd = document.createElement('dd');
    dd.textContent = valor || 'todavía no llega';
    datosEl.append(dt, dd);
  }
  const listo = recibido.waba && recibido.telefono && recibido.codigo;
  resultado.hidden = !(recibido.evento || recibido.codigo);
  comandoEl.textContent = listo
    ? `npm run conectar-numero -- --code ${recibido.codigo} --waba ${recibido.waba} --telefono ${recibido.telefono} --guardar`
    : 'Falta que lleguen los tres datos: espera unos segundos o vuelve a intentarlo.';
  copiar.disabled = !listo;
}

window.addEventListener('message', (evento) => {
  if (!ORIGENES.has(evento.origin)) return;
  let datos;
  try {
    datos = JSON.parse(evento.data);
  } catch {
    return;
  }
  if (!datos || datos.type !== 'WA_EMBEDDED_SIGNUP') return;
  recibido.evento = String(datos.event ?? '');
  if (datos.data && typeof datos.data === 'object') {
    if (datos.data.waba_id) recibido.waba = String(datos.data.waba_id);
    if (datos.data.phone_number_id) recibido.telefono = String(datos.data.phone_number_id);
  }
  const aviso = ESTADOS[recibido.evento];
  estado.textContent = aviso === undefined ? 'Meta mandó un evento que no esperábamos. Mira el resultado.' : aviso;
  pintar();
});

function iniciar() {
  recibido.evento = recibido.waba = recibido.telefono = recibido.codigo = '';
  estado.textContent = 'Sigue los pasos en la ventana de Meta…';
  window.FB.login(
    (respuesta) => {
      if (respuesta.authResponse && respuesta.authResponse.code) {
        recibido.codigo = String(respuesta.authResponse.code);
        estado.textContent = 'Listo. Copia el comando y ejecútalo en tu computador: el código vale 5 minutos.';
      } else {
        estado.textContent = 'No se recibió el código. Puedes volver a intentarlo.';
      }
      pintar();
    },
    {
      config_id: configId,
      response_type: 'code',
      override_default_response_type: true,
      // `featureType` activa la opción de conectar la app WhatsApp Business que ya se usa (coexistencia); en la versión 5 de
      // Embedded Signup viene activa por omisión y esta línea no molesta.
      extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' },
    },
  );
}

window.fbAsyncInit = () => {
  window.FB.init({ appId, autoLogAppEvents: false, xfbml: false, version });
  boton.disabled = false;
  estado.textContent = 'Listo para empezar.';
};

boton.addEventListener('click', iniciar);
copiar.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(comandoEl.textContent ?? '');
    estado.textContent = 'Comando copiado.';
  } catch {
    estado.textContent = 'No se pudo copiar solo: selecciona el comando y cópialo.';
  }
});

const sdk = document.createElement('script');
sdk.src = 'https://connect.facebook.net/en_US/sdk.js';
sdk.async = true;
sdk.crossOrigin = 'anonymous';
sdk.onerror = () => {
  estado.textContent = 'No se pudo cargar la herramienta de Meta. Revisa la conexión o los bloqueadores del navegador.';
};
document.head.append(sdk);
pintar();
