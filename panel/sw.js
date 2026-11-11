/**
 * "Service worker": el programa que el navegador deja instalado para que Brunen funcione como una aplicación y su
 * pantalla abra aunque no haya señal.
 *
 * Guarda solo archivos sin datos: la portada, la pantalla del repartidor, los estilos y los íconos. Nunca guarda nada
 * de la administración (`/admin`) ni respuestas con datos (`/api`): esas solicitudes pasan de largo, directo a la red.
 * Con señal siempre se usa la versión del servidor; la copia guardada es solo para cuando la red falla.
 */

const COPIA = 'brunen-v1';
const BASE = ['/', '/estilos.css', '/portada.js', '/ingreso.js', '/repartidor/', '/repartidor/app.js', '/manifest.webmanifest', '/iconos/icono-192.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(COPIA)
      .then((copia) => copia.addAll(BASE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) => Promise.all(nombres.filter((nombre) => nombre !== COPIA).map((nombre) => caches.delete(nombre))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const solicitud = evento.request;
  const url = new URL(solicitud.url);
  if (solicitud.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/') || url.pathname.startsWith('/api/') || url.pathname === '/salud') return;

  evento.respondWith(
    fetch(solicitud)
      .then((respuesta) => {
        if (respuesta.ok) {
          const duplicado = respuesta.clone();
          void caches.open(COPIA).then((copia) => copia.put(solicitud, duplicado));
        }
        return respuesta;
      })
      .catch(async () => (await caches.match(solicitud, { ignoreSearch: true })) ?? Response.error()),
  );
});
