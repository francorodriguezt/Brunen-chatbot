/**
 * Comunas que atiende Brunen y reconocimiento de comunas en el texto del cliente.
 *
 * COMUNAS_ATENDIDAS: dato del negocio, docs/conocimiento_brunen.md sección 6. Si cambia, se cambia
 * aquí y en el documento.
 * OTRAS_COMUNAS_RM: el resto de las 52 comunas de la Región Metropolitana (dato geográfico público),
 * solo para reconocer cuándo preguntan por una comuna fuera de zona (regla 6: informar las comunas
 * y registrar el pedido como Fuera_de_zona).
 */

import { normalizar } from './texto';

export const COMUNAS_ATENDIDAS = [
  'Ñuñoa',
  'Macul',
  'San Joaquín',
  'Peñalolén',
  'Santiago Centro',
  'Providencia',
  'Las Condes',
  'Vitacura',
  'Lo Barnechea',
  'Recoleta',
  'Huechuraba',
  'La Reina',
] as const;

export const OTRAS_COMUNAS_RM = [
  'Alhué', 'Buin', 'Calera de Tango', 'Cerrillos', 'Cerro Navia', 'Colina', 'Conchalí', 'Curacaví',
  'El Bosque', 'El Monte', 'Estación Central', 'Independencia', 'Isla de Maipo', 'La Cisterna',
  'La Florida', 'La Granja', 'La Pintana', 'Lampa', 'Lo Espejo', 'Lo Prado', 'Maipú', 'María Pinto',
  'Melipilla', 'Padre Hurtado', 'Paine', 'Pedro Aguirre Cerda', 'Peñaflor', 'Pirque', 'Pudahuel',
  'Puente Alto', 'Quilicura', 'Quinta Normal', 'Renca', 'San Bernardo', 'San José de Maipo',
  'San Miguel', 'San Pedro', 'San Ramón', 'Talagante', 'Tiltil',
] as const;

/** Formas habituales de escribir una comuna que no coinciden con su nombre oficial. */
const ALIAS: Readonly<Record<string, string>> = {
  santiago: 'Santiago Centro',
  stgo: 'Santiago Centro',
};

export interface ComunaDetectada {
  nombre: string;
  atendida: boolean;
}

const ATENDIDAS = new Set<string>(COMUNAS_ATENDIDAS);

export function esComunaAtendida(nombre: string): boolean {
  return ATENDIDAS.has(nombre);
}

// [forma normalizada, nombre oficial]. Se calcula una vez al cargar el módulo.
const BUSCABLES: ReadonlyArray<readonly [string, string]> = [
  ...[...COMUNAS_ATENDIDAS, ...OTRAS_COMUNAS_RM].map((nombre) => [normalizar(nombre), nombre] as const),
  ...Object.entries(ALIAS).map(([alias, nombre]) => [alias, nombre] as const),
];

/**
 * Devuelve la primera comuna mencionada en el texto (palabras completas, sin importar tildes
 * ni mayúsculas), o null si no hay ninguna. Si coincide más de una en el mismo lugar gana la
 * más larga: "santiago centro" antes que "santiago".
 */
export function detectarComuna(texto: string): ComunaDetectada | null {
  const hayTexto = ` ${normalizar(texto).replace(/[?/]/g, ' ')} `;
  let mejor: { posicion: number; largo: number; nombre: string } | null = null;
  for (const [forma, nombre] of BUSCABLES) {
    const posicion = hayTexto.indexOf(` ${forma} `);
    if (posicion === -1) continue;
    if (mejor === null || posicion < mejor.posicion || (posicion === mejor.posicion && forma.length > mejor.largo)) {
      mejor = { posicion, largo: forma.length, nombre };
    }
  }
  return mejor === null ? null : { nombre: mejor.nombre, atendida: esComunaAtendida(mejor.nombre) };
}
