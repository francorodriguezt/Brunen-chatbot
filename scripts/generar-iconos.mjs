/**
 * Genera los íconos de la aplicación (panel/iconos/): una gota blanca sobre el azul de Brunen.
 * Sin dependencias: arma el PNG a mano (un PNG es una cabecera, los píxeles comprimidos y sumas de comprobación).
 * Es un ícono provisional; cuando haya un logo definitivo, se reemplazan los tres archivos.
 *
 * Uso: node scripts/generar-iconos.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const FONDO = [0x0b, 0x6c, 0xb0];
const GOTA = [0xff, 0xff, 0xff];

// La gota, en coordenadas de 0 a 1: un círculo abajo y una punta arriba. Cabe en la zona central que los teléfonos
// no recortan cuando le dan forma al ícono (círculo, cuadrado redondeado...).
const CENTRO_X = 0.5;
const CENTRO_Y = 0.585;
const RADIO = 0.185;
const PUNTA_Y = 0.235;

function dentroDeLaGota(x, y) {
  if (y >= CENTRO_Y) return Math.hypot(x - CENTRO_X, y - CENTRO_Y) <= RADIO;
  if (y < PUNTA_Y) return false;
  const avance = (y - PUNTA_Y) / (CENTRO_Y - PUNTA_Y);
  return Math.abs(x - CENTRO_X) <= RADIO * Math.pow(avance, 0.8);
}

function trozo(tipo, datos) {
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const suma = Buffer.alloc(4);
  suma.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, suma]);
}

function icono(lado) {
  const MUESTRAS = 4; // cada píxel se mide en 16 puntos para que el borde de la gota no quede dentado
  const filas = Buffer.alloc(lado * (1 + lado * 3));
  for (let py = 0; py < lado; py++) {
    const inicio = py * (1 + lado * 3);
    filas[inicio] = 0; // sin filtro
    for (let px = 0; px < lado; px++) {
      let cubierto = 0;
      for (let sy = 0; sy < MUESTRAS; sy++) {
        for (let sx = 0; sx < MUESTRAS; sx++) {
          if (dentroDeLaGota((px + (sx + 0.5) / MUESTRAS) / lado, (py + (sy + 0.5) / MUESTRAS) / lado)) cubierto += 1;
        }
      }
      const mezcla = cubierto / (MUESTRAS * MUESTRAS);
      for (let canal = 0; canal < 3; canal++) filas[inicio + 1 + px * 3 + canal] = Math.round(FONDO[canal] + (GOTA[canal] - FONDO[canal]) * mezcla);
    }
  }
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(lado, 0);
  cabecera.writeUInt32BE(lado, 4);
  cabecera[8] = 8; // 8 bits por canal
  cabecera[9] = 2; // color RGB, sin transparencia
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo('IHDR', cabecera), trozo('IDAT', deflateSync(filas, { level: 9 })), trozo('IEND', Buffer.alloc(0))]);
}

mkdirSync('panel/iconos', { recursive: true });
for (const [nombre, lado] of [['icono-192.png', 192], ['icono-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`panel/iconos/${nombre}`, icono(lado));
  console.log(`panel/iconos/${nombre} (${lado} px)`);
}
