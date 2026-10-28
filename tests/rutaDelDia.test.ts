import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COLUMNAS_PEDIDOS } from '../src/pedidos';
import { COLUMNAS_RUTA, armarRuta, filasDeRuta, textoDeRuta } from '../src/rutaDelDia';

// Todo ficticio.
const fila = (valores: Partial<Record<(typeof COLUMNAS_PEDIDOS)[number], string>>): string[] =>
  COLUMNAS_PEDIDOS.map((columna) => valores[columna] ?? '');

const PEDIDOS: string[][] = [
  [...COLUMNAS_PEDIDOS],
  // Ana (Ñuñoa): dos líneas del mismo pedido, confirmado para el 29.
  fila({ ID_Pedido: 'P261028-AAAAA', Telefono: '56911111111', Nombre: 'Ana Prueba', Producto: 'Bidón 20 L', Cantidad: '3', Fecha_Entrega_Solicitada: '2026-10-29', Fecha_Entrega_Confirmada: '2026-10-29', Estado: 'Confirmado', Comuna: 'Ñuñoa', Direccion: 'Calle Falsa 123', Notas_Repartidor: 'Tocar el timbre', Envases_A_Retirar: '2' }),
  fila({ ID_Pedido: 'P261028-AAAAA', Telefono: '56911111111', Nombre: 'Ana Prueba', Producto: 'Bidón 12 L', Cantidad: '1', Fecha_Entrega_Solicitada: '2026-10-29', Fecha_Entrega_Confirmada: '2026-10-29', Estado: 'Confirmado', Comuna: 'Ñuñoa', Direccion: 'Calle Falsa 123' }),
  // Luis (Las Condes), confirmado para el 29.
  fila({ ID_Pedido: 'P261028-BBBBB', Telefono: '56922222222', Nombre: 'Luis Demo', Producto: 'Bidón 20 L', Cantidad: '2', Fecha_Entrega_Solicitada: '2026-10-29', Fecha_Entrega_Confirmada: '2026-10-29', Estado: 'Confirmado', Comuna: 'Las Condes', Direccion: 'Av. Inventada 456' }),
  // Marta (Ñuñoa), otra calle, sin fecha confirmada pero ya confirmado el estado: cuenta la propuesta.
  fila({ ID_Pedido: 'P261028-CCCCC', Telefono: '56933333333', Nombre: 'Marta Ejemplo', Producto: 'Bidón 10 L', Cantidad: '4', Fecha_Entrega_Solicitada: '2026-10-29', Estado: 'Confirmado', Comuna: 'Ñuñoa', Direccion: 'Avenida Ficticia 9' }),
  // No salen: otro día, sin confirmar, cancelado.
  fila({ ID_Pedido: 'P261028-DDDDD', Producto: 'Bidón 20 L', Cantidad: '1', Fecha_Entrega_Confirmada: '2026-10-30', Estado: 'Confirmado', Comuna: 'Macul', Direccion: 'Otra 1' }),
  fila({ ID_Pedido: 'P261028-EEEEE', Producto: 'Bidón 20 L', Cantidad: '1', Fecha_Entrega_Solicitada: '2026-10-29', Estado: 'Pendiente_Confirmacion', Comuna: 'Macul', Direccion: 'Otra 2' }),
  fila({ ID_Pedido: 'P261028-FFFFF', Producto: 'Bidón 20 L', Cantidad: '1', Fecha_Entrega_Solicitada: '2026-10-29', Estado: 'Cancelado', Comuna: 'Macul', Direccion: 'Otra 3' }),
];

describe('armarRuta', () => {
  const ruta = armarRuta(PEDIDOS, '2026-10-29');

  it('incluye solo los pedidos confirmados de ese día', () => {
    expect(ruta.map((p) => p.idPedido).sort()).toEqual(['P261028-AAAAA', 'P261028-BBBBB', 'P261028-CCCCC']);
  });

  it('ordena por comuna y dirección, para que los vecinos queden juntos, y numera las paradas', () => {
    expect(ruta.map((p) => [p.orden, p.comuna, p.direccion])).toEqual([
      [1, 'Las Condes', 'Av. Inventada 456'],
      [2, 'Ñuñoa', 'Avenida Ficticia 9'],
      [3, 'Ñuñoa', 'Calle Falsa 123'],
    ]);
  });

  it('junta las líneas de un mismo pedido en una sola parada', () => {
    expect(ruta.find((p) => p.idPedido === 'P261028-AAAAA')?.productos).toBe('3x20 L, 1x12 L');
    expect(ruta.find((p) => p.idPedido === 'P261028-CCCCC')?.productos).toBe('4x10 L');
  });

  it('las notas de la ficha y los envases por retirar van juntos para el repartidor', () => {
    expect(ruta.find((p) => p.idPedido === 'P261028-AAAAA')?.notas).toBe('Tocar el timbre. Retirar 2 envase(s) vacío(s)');
  });

  it('un día sin pedidos da una lista vacía', () => {
    expect(armarRuta(PEDIDOS, '2030-01-01')).toEqual([]);
    expect(armarRuta([], '2026-10-29')).toEqual([]);
  });

  it('se puede pedir otros estados (por ejemplo, para ver también lo pendiente)', () => {
    const todos = armarRuta(PEDIDOS, '2026-10-29', { estados: ['Confirmado', 'Pendiente_Confirmacion'] });
    expect(todos.map((p) => p.idPedido)).toContain('P261028-EEEEE');
    expect(todos).not.toContainEqual(expect.objectContaining({ idPedido: 'P261028-FFFFF' }));
  });
});

describe('filasDeRuta y textoDeRuta', () => {
  const ruta = armarRuta(PEDIDOS, '2026-10-29');

  it('las filas siguen el orden de las columnas de RUTA_DEL_DIA', () => {
    const filas = filasDeRuta(ruta);
    for (const f of filas) expect(f).toHaveLength(COLUMNAS_RUTA.length);
    expect(filas[2]).toEqual([3, '56911111111', 'Ana Prueba', 'Calle Falsa 123', 'Ñuñoa', '3x20 L, 1x12 L', 'Tocar el timbre. Retirar 2 envase(s) vacío(s)']);
  });

  it('el texto copiable lleva una línea por parada', () => {
    const lineas = textoDeRuta(ruta).split('\n');
    expect(lineas).toHaveLength(3);
    expect(lineas[0]).toBe('1. Av. Inventada 456, Las Condes · Luis Demo · 2x20 L · +56922222222');
    expect(lineas[2]).toBe('3. Calle Falsa 123, Ñuñoa · Ana Prueba · 3x20 L, 1x12 L · +56911111111 · Tocar el timbre. Retirar 2 envase(s) vacío(s)');
  });

  it('las columnas son las que crea scripts/preparar-planilla.mjs para RUTA_DEL_DIA', () => {
    const script = readFileSync(fileURLToPath(new URL('../scripts/preparar-planilla.mjs', import.meta.url)), 'utf8');
    const lista = /RUTA_DEL_DIA: \[(.*?)\]/.exec(script)?.[1] ?? '';
    expect([...lista.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...COLUMNAS_RUTA]);
  });
});
