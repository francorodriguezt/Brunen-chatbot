/**
 * Avisos al teléfono (D115). Este "service worker" solo recibe los avisos urgentes y los muestra como notificación,
 * aunque el panel esté cerrado. No guarda nada en el teléfono ni toca la red: ni archivos, ni respuestas del panel.
 *
 * Lo que llega es un texto genérico por tipo de aviso ("Reclamo de un cliente"), sin nombres ni teléfonos: el detalle se
 * ve en el panel. Vive en /admin/ para que lo proteja Cloudflare Access como el resto de la administración.
 */

const ICONO = '/iconos/icono-192.png';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener('push', (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    /* sin contenido legible: se muestra el aviso genérico */
  }
  const texto = (valor, porDefecto, largo) => (typeof valor === 'string' && valor.trim() ? valor.trim().slice(0, largo) : porDefecto);
  const url = typeof datos.url === 'string' && datos.url.startsWith('/admin/') ? datos.url : '/admin/';
  // iOS exige mostrar una notificación en cada aviso: siempre se muestra una, aunque el contenido no se haya podido leer.
  evento.waitUntil(
    self.registration.showNotification(texto(datos.titulo, 'Brunen: hay un aviso', 80), {
      body: texto(datos.cuerpo, 'Ábrelo en el panel.', 160),
      tag: texto(datos.etiqueta, 'brunen-aviso', 40),
      renotify: true,
      icon: ICONO,
      badge: ICONO,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const url = new URL(evento.notification.data?.url ?? '/admin/', self.location.origin).href;
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => new URL(v.url).pathname.startsWith('/admin/'));
      return abierta ? abierta.focus() : self.clients.openWindow(url);
    }),
  );
});
