import { describe, expect, it } from 'vitest';
// @ts-expect-error: script de Node sin tipos (scripts/restaurar/nucleo.mjs)
import { leerCsv, pedidosVigentes, sqlDeRestauracion } from '../scripts/restaurar/nucleo.mjs';
import { RepositorioEntregas } from '../src/entregas';
import type { PedidoARegistrar } from '../src/pedidos';
import { ENCABEZADO_PEDIDOS, RepositorioRespaldo, filaDePedido } from '../src/respaldo';
import { RepositorioD1 } from '../src/repositorio';
import { crearBaseSqlite } from './ayudas';

const AHORA = Math.floor(new Date('2026-11-14T10:30:00-03:00').getTime() / 1000);

// Todo ficticio, con los casos difíciles: comillas, punto y coma, saltos de línea y algo que parece fórmula.
function pedido(id: string, cambios: Partial<PedidoARegistrar> = {}): PedidoARegistrar {
  return {
    idPedido: id, telefono: '56911111111', nombre: 'Ana Prueba', lineas: [{ tipo: '20L', cantidad: 3, precioUnitario: 3300, subtotal: 9900 }],
    fechaEntrega: '2026-11-14', estado: 'Confirmado' as PedidoARegistrar['estado'], comuna: 'Ñuñoa', direccion: 'Calle Falsa 123', notasRepartidor: '', envasesARetirar: 2, observaciones: '',
    ...cambios,
  };
}

const COLUMNAS = `id, creado_en, telefono, nombre, comuna, direccion, fecha_entrega, fecha_confirmada, estado, lineas, total, notas_repartidor,
  envases_a_retirar, observaciones, confirmado_por, actualizado_en, forma_pago, estado_pago, documento, numero_documento, tipo_cliente,
  entregado_en, vacios_retirados, cobrado_en_entrega, no_entregado_en, no_entregado_motivo`;

async function baseConPedidos() {
  const db = crearBaseSqlite();
  const r = new RepositorioD1(db, () => 1);
  await r.guardarPedido(pedido('P261114-AAAAA', { nombre: 'Ana "la del 3B"; Prueba', observaciones: 'Línea 1\nLínea 2', formaPago: 'efectivo' }), AHORA - 500);
  await r.guardarPedido(pedido('P261114-BBBBB', { nombre: '=SUMA(1;2)', direccion: '-Pasaje, sin número', lineas: [{ tipo: '12L', cantidad: 1, precioUnitario: null, subtotal: null }] }), AHORA - 400);
  await r.guardarPedido(pedido('P261114-CCCCC', { estado: 'Pendiente_Confirmacion' }), AHORA - 300);
  await new RepositorioEntregas(db).entregar('P261114-AAAAA', { vacios: 1, cobrado: true }, { fecha: '2026-11-14', quien: 'Repartidor: Prueba', ahora: AHORA - 100 });
  return db;
}

/** Como lo exporta Google Sheets: separado por comas y con comillas donde hace falta. */
const csvDeSheets = (filas: Array<Array<string | number>>) =>
  filas.map((f) => f.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(',')).join('\n');

/** Como lo arma el panel (panel/admin/app.js, celdaDeExcel): punto y coma, BOM y apóstrofo ante lo que parece fórmula. */
const csvDelPanel = (filas: Array<Array<string | number>>) =>
  `﻿${filas
    .map((f) =>
      f
        .map((v) => {
          if (typeof v === 'number') return String(v);
          const t = /^[=+\-@]/.test(v) ? `'${v}` : v;
          return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
        })
        .join(';'),
    )
    .join('\r\n')}\r\n`;

function aplicar(db: ReturnType<typeof crearBaseSqlite>, sql: string) {
  for (const sentencia of sql.split(/(?<=WHERE excluded\.actualizado_en > pedidos\.actualizado_en;)\n?/).filter((s) => s.trim())) db.sql(sentencia);
}

describe('restaurar desde el respaldo (D66)', () => {
  it.each([
    ['la hoja de Google Sheets', csvDeSheets],
    ['el Excel del panel', csvDelPanel],
  ])('con %s, la base queda igual a la original', async (_nombre, aCsv) => {
    const original = await baseConPedidos();
    const filas = (await new RepositorioRespaldo(original).pagina('', 100)).map((p) => filaDePedido(p, AHORA));
    const { pedidos, descartadas } = pedidosVigentes(leerCsv(aCsv([[...ENCABEZADO_PEDIDOS], ...filas])));
    expect(descartadas).toEqual([]);
    expect(pedidos).toHaveLength(3);

    const nueva = crearBaseSqlite();
    aplicar(nueva, sqlDeRestauracion(pedidos));
    const leer = (db: ReturnType<typeof crearBaseSqlite>) => db.sql(`SELECT ${COLUMNAS} FROM pedidos ORDER BY id`);
    expect(leer(nueva)).toEqual(leer(original));
  });

  it('con varias versiones del mismo pedido, queda la más nueva; y un pedido más nuevo en la base no se pisa', async () => {
    const db = await baseConPedidos();
    const repo = new RepositorioRespaldo(db);
    const antes = (await repo.pagina('', 100)).map((p) => filaDePedido(p, AHORA));
    await new RepositorioD1(db, () => 1).cambiarEstado('P261114-CCCCC', 'Confirmado', 'operadora@brunen.test', AHORA + 50);
    const despues = (await repo.pagina('', 100)).map((p) => filaDePedido(p, AHORA + 60));
    const { pedidos } = pedidosVigentes(leerCsv(csvDeSheets([[...ENCABEZADO_PEDIDOS], ...despues, ...antes])));
    expect(pedidos.find((p: { id: string }) => p.id === 'P261114-CCCCC')?.estado).toBe('Confirmado');

    // La base tiene una versión más nueva que el respaldo viejo: restaurar el viejo no la cambia.
    const soloViejo = pedidosVigentes(leerCsv(csvDeSheets([[...ENCABEZADO_PEDIDOS], ...antes]))).pedidos;
    aplicar(db, sqlDeRestauracion(soloViejo));
    expect(db.sql("SELECT estado FROM pedidos WHERE id = 'P261114-CCCCC'")).toEqual([{ estado: 'Confirmado' }]);
  });

  it('descarta las filas que no sirven y avisa por qué, sin cortar el resto', () => {
    const fila = (cambios: Record<string, string | number>) => ENCABEZADO_PEDIDOS.map((c) => cambios[c] ?? '');
    const buena = { ID_Pedido: 'P261114-AAAAA', Estado: 'Confirmado', Fecha_Entrega: '2026-11-14', Lineas_JSON: '[]', Creado_Unix: 1, Actualizado_Unix: 2, Envases_A_Retirar: 0 };
    const { pedidos, descartadas } = pedidosVigentes(
      leerCsv(
        csvDeSheets([
          [...ENCABEZADO_PEDIDOS],
          fila(buena),
          fila({ ...buena, ID_Pedido: 'hola' }),
          fila({ ...buena, ID_Pedido: 'P261114-BBBBB', Estado: 'Perdido' }),
          fila({ ...buena, ID_Pedido: 'P261114-CCCCC', Lineas_JSON: '{roto' }),
          fila({ ...buena, ID_Pedido: 'P261114-DDDDD', Total: 'mil' }),
        ]),
      ),
    );
    expect(pedidos).toHaveLength(1);
    expect(descartadas.map((d: { motivo: string }) => d.motivo)).toEqual(['número de pedido no válido', 'estado no válido', 'Lineas_JSON no válido', 'Total no es un número entero']);
  });

  it('un archivo que no es el respaldo se rechaza con un mensaje claro', () => {
    expect(() => pedidosVigentes(leerCsv('Nombre,Telefono\nAna,569'))).toThrow('le faltan columnas');
  });
});
