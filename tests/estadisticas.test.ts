import { describe, expect, it } from 'vitest';
import { desdeParaEstadisticas, lunesDeLaSemana, resumirEntregas, type EntregaParaContar } from '../src/estadisticas';
import type { PedidoARegistrar } from '../src/pedidos';
import { RepositorioD1 } from '../src/repositorio';
import { crearBaseSqlite } from './ayudas';

// Viernes 13 de noviembre de 2026. Todo ficticio.
const HASTA = '2026-11-13';

function entrega(dia: string, veinte: number, cambios: Partial<EntregaParaContar> = {}): EntregaParaContar {
  return { dia, telefono: '56911111111', nombre: 'Ana Prueba', lineas: [{ tipo: '20L', cantidad: veinte }], envasesARetirar: 0, vaciosRetirados: null, ...cambios };
}

describe('bidones entregados por día, semana y mes (D65)', () => {
  it('la semana empieza el lunes y se lee desde el primer día del mes anterior', () => {
    expect(lunesDeLaSemana(HASTA)).toBe('2026-11-09');
    expect(lunesDeLaSemana('2026-11-09')).toBe('2026-11-09');
    expect(lunesDeLaSemana('2026-11-15')).toBe('2026-11-09'); // domingo
    expect(desdeParaEstadisticas(HASTA)).toBe('2026-10-01');
    expect(desdeParaEstadisticas('2026-01-05')).toBe('2025-12-01');
  });

  it('suma por día, semana, mes y mes anterior, por tamaño', () => {
    const e = resumirEntregas(
      [
        entrega('2026-11-13', 4, { lineas: [{ tipo: '20L', cantidad: 4 }, { tipo: '12L', cantidad: 2 }] }),
        entrega('2026-11-10', 10),
        entrega('2026-11-03', 5), // este mes, semana anterior
        entrega('2026-10-30', 7), // mes anterior
        entrega('2026-11-14', 99), // después de "hasta": no cuenta
      ],
      HASTA,
    );
    expect(e.dia).toEqual({ '20L': 4, '12L': 2, '10L': 0, total: 6 });
    expect(e.semana.total).toBe(16);
    expect(e.mes.total).toBe(21);
    expect(e.mesAnterior.total).toBe(7);
    expect(e.dias).toHaveLength(14);
    expect(e.dias.at(-1)).toEqual({ fecha: HASTA, bidones: { '20L': 4, '12L': 2, '10L': 0, total: 6 } });
    expect(e.dias[0]?.fecha).toBe('2026-10-31');
  });

  it('los vacíos que faltan, por cliente, del que más debe al que menos; sin marca del repartidor no cuentan', () => {
    const e = resumirEntregas(
      [
        entrega('2026-11-10', 3, { envasesARetirar: 3, vaciosRetirados: 1 }),
        entrega('2026-11-12', 3, { envasesARetirar: 3, vaciosRetirados: 2 }),
        entrega('2026-11-12', 5, { telefono: '56922222222', nombre: 'Luis Ficticio', envasesARetirar: 5, vaciosRetirados: 0 }),
        entrega('2026-11-12', 4, { telefono: '56933333333', envasesARetirar: 4, vaciosRetirados: null }),
        entrega('2026-11-12', 4, { telefono: '56944444444', envasesARetirar: 4, vaciosRetirados: 4 }),
      ],
      HASTA,
    );
    expect(e.vacios).toEqual([
      { telefono: '56922222222', nombre: 'Luis Ficticio', faltan: 5, ultimoDia: '2026-11-12' },
      { telefono: '56911111111', nombre: 'Ana Prueba', faltan: 3, ultimoDia: '2026-11-12' },
    ]);
  });

  it('lee de la base solo los entregados del rango, y una fila dañada no rompe la cuenta', async () => {
    const db = crearBaseSqlite();
    const r = new RepositorioD1(db, () => 1);
    const pedido = (id: string, fecha: string, estado: string): PedidoARegistrar => ({
      idPedido: id, telefono: '56911111111', nombre: 'Ana Prueba', lineas: [{ tipo: '20L', cantidad: 2, precioUnitario: 3300, subtotal: 6600 }],
      fechaEntrega: fecha, estado: estado as PedidoARegistrar['estado'], comuna: 'Ñuñoa', direccion: 'Calle Falsa 123', notasRepartidor: '',
      envasesARetirar: 2, observaciones: '',
    });
    await r.guardarPedido(pedido('P261112-AAAAA', '2026-11-12', 'Entregado'), 1);
    await r.guardarPedido(pedido('P261112-BBBBB', '2026-11-12', 'Confirmado'), 1);
    await r.guardarPedido(pedido('P260901-CCCCC', '2026-09-01', 'Entregado'), 1);
    await r.guardarPedido(pedido('P261111-DDDDD', '2026-11-11', 'Entregado'), 1);
    db.sql("UPDATE pedidos SET lineas = 'no es json' WHERE id = 'P261111-DDDDD'");
    const filas = await r.entregadosEntre('2026-10-01', HASTA);
    expect(filas.map((f) => f.dia).sort()).toEqual(['2026-11-11', '2026-11-12']);
    expect(resumirEntregas(filas, HASTA).mes.total).toBe(2);
  });
});
