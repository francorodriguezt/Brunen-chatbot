# Bibliotecas copiadas

Se sirven tal cual desde el panel (`/admin/vendor/`), detrás de Cloudflare Access. No hay paso de compilación.

## MapLibre GL JS 6.18.0

- Licencia: BSD-3-Clause (`LICENSE-maplibre.txt`).
- Origen: paquete `maplibre-gl@6.18.0` del registro de npm. Huella del paquete, igual a la del registro (`npm view maplibre-gl@6.18.0 dist.integrity`):
  `sha512-8ucT+RhJtEZGFvWGPioVQwvOPMAIuUehEgxl2dELw9aJmX4SpUi+OCHHAD33B9EuohNC7kC/gccJacUgTMQfQQ==`
- Archivos: `dist/maplibre-gl.mjs`, `dist/maplibre-gl-worker.mjs` y `dist/maplibre-gl.css`. A los dos `.mjs` se les quitó solo la última línea (`//# sourceMappingURL=...`), porque los mapas de código no se publican.
- Por qué copiado y no instalado: instalarlo con npm trae 25 paquetes para usar 3 archivos (D63).
- Para actualizar: bajar el paquete con `npm pack maplibre-gl@<versión>`, comparar su huella con `npm view`, copiar los mismos tres archivos y la licencia, y probar el mapa en la pestaña Reparto.
