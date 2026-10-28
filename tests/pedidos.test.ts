import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COLUMNAS_PEDIDOS, filasDePedido, generarIdPedido, type PedidoARegistrar } from '../src/pedidos';

const PEDIDO: PedidoARegistrar = {
  idPedido: 'P261028-ABCDE',
  fechaHora: '2026-10-28 10:00',
  telefono: '56911111111',
  nombre: 'Ana Prueba',
  lineas: [
    { tipo: '20L', cantidad: 3, precioUnitario: 3300, subtotal: 9900 },
    { tipo: '12L', cantidad: 1, precioUnitario: 2500, subtotal: 2500 },
  ],
  fechaEntrega: '2026-10-29',
  estado: 'Pendiente_Confirmacion',
  comuna: 'Ñuñoa',
  direccion: 'Calle Falsa 123',
  notasRepartidor: 'Tocar el timbre',
  envasesARetirar: 2,
  observaciones: 'Pidió "viernes"',
};

describe('columnas de la hoja PEDIDOS', () => {
  it('son las mismas que crea scripts/preparar-planilla.mjs (si una cambia, la otra también)', () => {
    const script = readFileSync(fileURLToPath(new URL('../scripts/preparar-planilla.mjs', import.meta.url)), 'utf8');
    const lista = /PEDIDOS: \[(.*?)\]/.exec(script)?.[1] ?? '';
    const columnas = [...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(columnas).toEqual([...COLUMNAS_PEDIDOS]);
  });
});

describe('filasDePedido', () => {
  const filas = filasDePedido(PEDIDO);

  it('hace una fila por producto, en el orden de las columnas', () => {
    expect(filas).toHaveLength(2);
    for (const fila of filas) expect(fila).toHaveLength(COLUMNAS_PEDIDOS.length);
    const columna = (nombre: (typeof COLUMNAS_PEDIDOS)[number]) => COLUMNAS_PEDIDOS.indexOf(nombre);
    expect(filas[0]?.[columna('ID_Pedido')]).toBe('P261028-ABCDE');
    expect(filas[0]?.slice(columna('Producto'), columna('Total') + 1)).toEqual(['Bidón 20 L', 3, 3300, 9900]);
    expect(filas[1]?.slice(columna('Producto'), columna('Total') + 1)).toEqual(['Bidón 12 L', 1, 2500, 2500]);
  });

  it('todas las filas llevan el mismo pedido, cliente, entrega y estado', () => {
    const columna = (nombre: (typeof COLUMNAS_PEDIDOS)[number]) => COLUMNAS_PEDIDOS.indexOf(nombre);
    for (const fila of filas) {
      expect(fila[columna('ID_Pedido')]).toBe('P261028-ABCDE');
      expect(fila[columna('Telefono')]).toBe('56911111111');
      expect(fila[columna('Nombre')]).toBe('Ana Prueba');
      expect(fila[columna('Fecha_Entrega_Solicitada')]).toBe('2026-10-29');
      expect(fila[columna('Estado')]).toBe('Pendiente_Confirmacion');
      expect(fila[columna('Comuna')]).toBe('Ñuñoa');
      expect(fila[columna('Direccion')]).toBe('Calle Falsa 123');
    }
  });

  it('la fecha confirmada y quién confirmó quedan vacías: las llena la operadora', () => {
    const columna = (nombre: (typeof COLUMNAS_PEDIDOS)[number]) => COLUMNAS_PEDIDOS.indexOf(nombre);
    expect(filas[0]?.[columna('Fecha_Entrega_Confirmada')]).toBe('');
    expect(filas[0]?.[columna('Confirmado_Por')]).toBe('');
  });

  it('las notas, los envases y las observaciones van solo en la primera fila, para no contarlos dos veces', () => {
    const columna = (nombre: (typeof COLUMNAS_PEDIDOS)[number]) => COLUMNAS_PEDIDOS.indexOf(nombre);
    expect(filas[0]?.[columna('Notas_Repartidor')]).toBe('Tocar el timbre');
    expect(filas[0]?.[columna('Envases_A_Retirar')]).toBe(2);
    expect(filas[0]?.[columna('Observaciones')]).toBe('Pidió "viernes"');
    expect(filas[1]?.[columna('Notas_Repartidor')]).toBe('');
    expect(filas[1]?.[columna('Envases_A_Retirar')]).toBe('');
    expect(filas[1]?.[columna('Observaciones')]).toBe('');
  });

  it('un precio que no se pudo calcular queda en blanco, no en cero', () => {
    const sinPrecio = filasDePedido({ ...PEDIDO, lineas: [{ tipo: '20L', cantidad: 2, precioUnitario: null, subtotal: null }], envasesARetirar: 0 });
    const columna = (nombre: (typeof COLUMNAS_PEDIDOS)[number]) => COLUMNAS_PEDIDOS.indexOf(nombre);
    expect(sinPrecio[0]?.[columna('Precio_Unitario')]).toBe('');
    expect(sinPrecio[0]?.[columna('Total')]).toBe('');
    expect(sinPrecio[0]?.[columna('Envases_A_Retirar')]).toBe('');
  });
});

describe('generarIdPedido', () => {
  it('tiene la fecha del pedido y 5 caracteres', () => {
    expect(generarIdPedido('wamid.HBgLNTY5', '2026-10-28')).toMatch(/^P261028-[0-9A-Z]{5}$/);
    expect(generarIdPedido('wamid.HBgLNTY5', '2027-01-05')).toMatch(/^P270105-[0-9A-Z]{5}$/);
  });

  it('el mismo mensaje da siempre el mismo ID', () => {
    expect(generarIdPedido('wamid.ABC', '2026-10-28')).toBe(generarIdPedido('wamid.ABC', '2026-10-28'));
  });

  it('mensajes distintos dan IDs distintos (sin choques en 5.000 pedidos de un día)', () => {
    const ids = new Set(Array.from({ length: 5000 }, (_, i) => generarIdPedido(`wamid.HBgLNTY5MTIzNDU2Nzg5FQIAEhgg${i}`, '2026-10-28')));
    expect(ids.size).toBe(5000);
  });
});
