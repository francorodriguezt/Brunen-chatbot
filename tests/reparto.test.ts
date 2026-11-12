import { describe, expect, it } from 'vitest';
import { armarReparto, csvDeReparto, textoDeReparto, tsvDeReparto } from '../src/reparto';
import type { PedidoGuardado } from '../src/repositorio';

const DIA = '2026-11-10'; // martes

/** Un pedido confirmado para el día de la prueba, con datos ficticios. */
function pedido(id: string, cambios: Partial<PedidoGuardado> = {}): PedidoGuardado {
  return {
    id,
    creadoEn: 1793000000,
    telefono: '56955550001',
    nombre: 'Ana Prueba',
    comuna: 'Ñuñoa',
    direccion: 'Calle Falsa 123',
    fechaEntrega: DIA,
    fechaConfirmada: DIA,
    estado: 'Confirmado',
    lineas: [{ tipo: '20L', cantidad: 2, precioUnitario: 3300, subtotal: 6600 }],
    total: 6600,
    notasRepartidor: '',
    envasesARetirar: 0,
    observaciones: '',
    confirmadoPor: 'operadora@brunen.test',
    actualizadoEn: 1793000000,
    mensajeCliente: '',
    formaPago: '',
    estadoPago: 'pendiente',
    documento: '',
    numeroDocumento: '',
    tipoCliente: '',
    ...cambios,
  };
}

const ids = (pedidos: PedidoGuardado[], fecha = DIA) => armarReparto(pedidos, fecha).paradas.map((p) => p.idPedido);

describe('armarReparto: qué pedidos salen a reparto', () => {
  it('entran los confirmados, en ruta y entregados de ese día', () => {
    const pedidos = [pedido('P261109-AAAAA'), pedido('P261109-BBBBB', { estado: 'En_Ruta' }), pedido('P261109-CCCCC', { estado: 'Entregado' })];
    expect(ids(pedidos).sort()).toEqual(['P261109-AAAAA', 'P261109-BBBBB', 'P261109-CCCCC']);
  });

  it('la fecha que cuenta es la confirmada, aunque el bot haya propuesto otra', () => {
    const movido = pedido('P261109-AAAAA', { fechaEntrega: '2026-11-09', fechaConfirmada: DIA });
    const deOtroDia = pedido('P261109-BBBBB', { fechaEntrega: DIA, fechaConfirmada: '2026-11-11' });
    expect(ids([movido, deOtroDia])).toEqual(['P261109-AAAAA']);
  });

  it('los que siguen por confirmar o fuera de zona no entran, pero se cuentan para avisar', () => {
    const reparto = armarReparto(
      [pedido('P261109-AAAAA'), pedido('P261109-BBBBB', { estado: 'Pendiente_Confirmacion', fechaConfirmada: null }), pedido('P261109-CCCCC', { estado: 'Fuera_de_zona', fechaConfirmada: null })],
      DIA,
    );
    expect(reparto.paradas.map((p) => p.idPedido)).toEqual(['P261109-AAAAA']);
    expect(reparto.sinConfirmar).toBe(2);
  });

  it('un pedido cancelado ni entra ni se cuenta', () => {
    const reparto = armarReparto([pedido('P261109-AAAAA', { estado: 'Cancelado' })], DIA);
    expect([reparto.paradas, reparto.sinConfirmar]).toEqual([[], 0]);
  });

  it('un día sin pedidos da un reparto vacío', () => {
    expect(armarReparto([], DIA)).toEqual({
      fecha: DIA,
      paradas: [],
      carga: { '20L': 0, '12L': 0, '10L': 0 },
      totalBidones: 0,
      envasesARetirar: 0,
      entregadas: 0,
      sinConfirmar: 0,
      cargas: [],
    });
  });
});

describe('armarReparto: orden y carga', () => {
  it('ordena por comuna y después por dirección, para que los vecinos queden juntos, y numera desde 1', () => {
    const reparto = armarReparto(
      [
        pedido('P261109-AAAAA', { comuna: 'Ñuñoa', direccion: 'Calle Falsa 123' }),
        pedido('P261109-BBBBB', { comuna: 'Macul', direccion: 'Pasaje Dos 5' }),
        pedido('P261109-CCCCC', { comuna: 'Ñuñoa', direccion: 'Avenida Uno 9' }),
        pedido('P261109-DDDDD', { comuna: 'Macul', direccion: 'Avenida Tres 1' }),
      ],
      DIA,
    );
    expect(reparto.paradas.map((p) => [p.orden, p.comuna, p.direccion])).toEqual([
      [1, 'Macul', 'Avenida Tres 1'],
      [2, 'Macul', 'Pasaje Dos 5'],
      [3, 'Ñuñoa', 'Avenida Uno 9'],
      [4, 'Ñuñoa', 'Calle Falsa 123'],
    ]);
  });

  it('la Ñ va después de la N, como en el diccionario', () => {
    const reparto = armarReparto([pedido('P261109-AAAAA', { comuna: 'Ñuñoa' }), pedido('P261109-BBBBB', { comuna: 'Providencia' }), pedido('P261109-CCCCC', { comuna: 'Macul' })], DIA);
    expect(reparto.paradas.map((p) => p.comuna)).toEqual(['Macul', 'Ñuñoa', 'Providencia']);
  });

  it('cada parada dice cuántos bidones de cada tamaño lleva', () => {
    const mezclado = pedido('P261109-AAAAA', {
      lineas: [
        { tipo: '20L', cantidad: 3, precioUnitario: 3300, subtotal: 9900 },
        { tipo: '12L', cantidad: 1, precioUnitario: 2500, subtotal: 2500 },
      ],
      total: 12400,
    });
    const [parada] = armarReparto([mezclado], DIA).paradas;
    expect(parada).toMatchObject({ bidones: { '20L': 3, '12L': 1, '10L': 0 }, totalBidones: 4, total: 12400 });
  });

  it('la carga del furgón suma los bidones de todas las paradas, por tamaño', () => {
    const reparto = armarReparto(
      [
        pedido('P261109-AAAAA', { lineas: [{ tipo: '20L', cantidad: 4, precioUnitario: 2750, subtotal: 11000 }] }),
        pedido('P261109-BBBBB', { lineas: [{ tipo: '20L', cantidad: 1, precioUnitario: 4500, subtotal: 4500 }, { tipo: '10L', cantidad: 2, precioUnitario: 2200, subtotal: 4400 }] }),
      ],
      DIA,
    );
    expect(reparto.carga).toEqual({ '20L': 5, '12L': 0, '10L': 2 });
    expect(reparto.totalBidones).toBe(7);
  });

  it('suma los envases por retirar y cuenta las entregas ya hechas', () => {
    const reparto = armarReparto([pedido('P261109-AAAAA', { envasesARetirar: 2 }), pedido('P261109-BBBBB', { envasesARetirar: 1, estado: 'Entregado' })], DIA);
    expect([reparto.envasesARetirar, reparto.entregadas]).toEqual([3, 1]);
  });
});

describe('textoDeReparto: lo que se copia para mandarle al repartidor', () => {
  it('lleva el día, el resumen de la carga y una línea por parada', () => {
    const reparto = armarReparto(
      [
        pedido('P261109-AAAAA', { notasRepartidor: 'Tocar el timbre', envasesARetirar: 2 }),
        pedido('P261109-BBBBB', { comuna: 'Macul', direccion: 'Avenida Ficticia 987', nombre: 'Pedro Muestra', telefono: '56955550004', lineas: [{ tipo: '20L', cantidad: 4, precioUnitario: 2750, subtotal: 11000 }, { tipo: '12L', cantidad: 1, precioUnitario: 2500, subtotal: 2500 }], total: 13500 }),
      ],
      DIA,
    );
    expect(textoDeReparto(reparto).split('\n')).toEqual([
      'Reparto del martes 10 de noviembre',
      '2 paradas · 7 bidones (6 de 20 L, 1 de 12 L) · retirar 2 envases',
      '',
      '1. Avenida Ficticia 987, Macul · Pedro Muestra · 4 × 20 L, 1 × 12 L · $13.500 · +56955550004',
      '2. Calle Falsa 123, Ñuñoa · Ana Prueba · 2 × 20 L · $6.600 · +56955550001 · Tocar el timbre · Retirar 2 envases',
    ]);
  });

  it('una sola parada y un solo envase se escriben en singular', () => {
    const texto = textoDeReparto(armarReparto([pedido('P261109-AAAAA', { envasesARetirar: 1, lineas: [{ tipo: '20L', cantidad: 1, precioUnitario: 4500, subtotal: 4500 }], total: 4500 })], DIA));
    expect(texto).toContain('1 parada · 1 bidón (1 de 20 L) · retirar 1 envase');
    expect(texto).toContain('Retirar 1 envase');
  });

  it('sin precio dice "sin precio" y una entrega ya hecha queda marcada', () => {
    const texto = textoDeReparto(
      armarReparto([pedido('P261109-AAAAA', { estado: 'Entregado', total: null, lineas: [{ tipo: '20L', cantidad: 2, precioUnitario: null, subtotal: null }] })], DIA),
    );
    expect(texto).toContain('· sin precio ·');
    expect(texto.endsWith('· ENTREGADO')).toBe(true);
  });

  it('sin paradas lo dice en una línea', () => {
    expect(textoDeReparto(armarReparto([], DIA))).toBe('Reparto del martes 10 de noviembre\nSin entregas confirmadas para este día.');
  });
});

describe('tsvDeReparto: lo que se pega en Excel', () => {
  it('tiene encabezado y una fila por parada, separadas por tabuladores', () => {
    const tsv = tsvDeReparto(armarReparto([pedido('P261109-AAAAA', { envasesARetirar: 2, notasRepartidor: 'Tocar el timbre' })], DIA));
    expect(tsv.split('\n').map((fila) => fila.split('\t'))).toEqual([
      ['Orden', 'Pedido', 'Nombre', 'Teléfono', 'Dirección', 'Comuna', '20 L', '12 L', '10 L', 'Bidones', 'Envases por retirar', 'Total', 'Notas', 'Estado'],
      ['1', 'P261109-AAAAA', 'Ana Prueba', '56955550001', 'Calle Falsa 123', 'Ñuñoa', '2', '0', '0', '2', '2', '6600', 'Tocar el timbre', 'Confirmado'],
    ]);
  });

  it('un tabulador o un salto de línea dentro de un dato no rompe las columnas', () => {
    const tsv = tsvDeReparto(armarReparto([pedido('P261109-AAAAA', { notasRepartidor: 'Portón\tverde\nsegundo piso' })], DIA));
    expect(tsv.split('\n')).toHaveLength(2);
    expect(tsv.split('\n')[1]?.split('\t')).toHaveLength(14);
    expect(tsv).toContain('Portón verde segundo piso');
  });

  it('un dato que Excel leería como fórmula se escribe como texto', () => {
    const tsv = tsvDeReparto(armarReparto([pedido('P261109-AAAAA', { nombre: '=HYPERLINK("http://malo.test")', direccion: '+56 calle', notasRepartidor: '@cmd', comuna: '-Macul' })], DIA));
    const fila = tsv.split('\n')[1]?.split('\t') ?? [];
    expect([fila[2], fila[4], fila[5], fila[12]]).toEqual(["'=HYPERLINK(\"http://malo.test\")", "'+56 calle", "'-Macul", "'@cmd"]);
  });

  it('sin precio la columna Total queda vacía, y el estado se lee en palabras', () => {
    const fila = tsvDeReparto(armarReparto([pedido('P261109-AAAAA', { estado: 'En_Ruta', total: null })], DIA)).split('\n')[1]?.split('\t') ?? [];
    expect([fila[11], fila[13]]).toEqual(['', 'En ruta']);
  });
});

describe('csvDeReparto: el archivo que se descarga', () => {
  it('empieza con la marca que hace que Excel lea bien los acentos, separa con punto y coma y termina cada fila con CRLF', () => {
    const csv = csvDeReparto(armarReparto([pedido('P261109-AAAAA')], DIA));
    expect(csv.startsWith('﻿Orden;Pedido;Nombre;Teléfono;Dirección;Comuna;20 L;12 L;10 L;Bidones;Envases por retirar;Total;Notas;Estado\r\n')).toBe(true);
    expect(csv.endsWith('1;P261109-AAAAA;Ana Prueba;56955550001;Calle Falsa 123;Ñuñoa;2;0;0;2;0;6600;;Confirmado\r\n')).toBe(true);
  });

  it('un dato con punto y coma, comillas o salto de línea va entre comillas', () => {
    const csv = csvDeReparto(armarReparto([pedido('P261109-AAAAA', { direccion: 'Calle Uno 1; depto 2', notasRepartidor: 'Dice "ojo"\ncon el perro' })], DIA));
    expect(csv).toContain(';"Calle Uno 1; depto 2";');
    expect(csv).toContain(';"Dice ""ojo""\ncon el perro";');
  });

  it('también neutraliza las fórmulas', () => {
    expect(csvDeReparto(armarReparto([pedido('P261109-AAAAA', { nombre: '=1+1' })], DIA))).toContain(";'=1+1;");
  });
});

describe('armarReparto: la versión de cada pedido', () => {
  it('cada parada lleva la versión del pedido, para que marcar "entregado" desde el reparto no pise un cambio ajeno', () => {
    const [parada] = armarReparto([pedido('P261109-AAAAA', { actualizadoEn: 1793000123 })], DIA).paradas;
    expect(parada?.actualizadoEn).toBe(1793000123);
  });
});

describe('cargas del furgón (fase C, D60)', () => {
  const de20 = (id: string, cantidad: number, direccion: string) =>
    pedido(id, { direccion, lineas: [{ tipo: '20L', cantidad, precioUnitario: null, subtotal: null }], total: null });

  it('con 65 bidones o menos hay una sola carga y el texto no cambia', () => {
    const reparto = armarReparto([de20('P1', 30, 'Calle 1'), de20('P2', 35, 'Calle 2')], DIA);
    expect(reparto.cargas).toEqual([{ numero: 1, desde: 1, hasta: 2, totalBidones: 65, excedeFurgon: false }]);
    expect(textoDeReparto(reparto)).not.toContain('Carga');
  });

  it('pasado el tope, se arma otra carga siguiendo el orden de las paradas', () => {
    const reparto = armarReparto([de20('P1', 30, 'Calle 1'), de20('P2', 30, 'Calle 2'), de20('P3', 10, 'Calle 3'), de20('P4', 20, 'Calle 4')], DIA);
    expect(reparto.cargas.map((c) => [c.desde, c.hasta, c.totalBidones])).toEqual([[1, 2, 60], [3, 4, 30]]);
    expect(reparto.paradas.map((p) => p.carga)).toEqual([1, 1, 2, 2]);
    const texto = textoDeReparto(reparto);
    expect(texto).toContain('2 cargas (el furgón lleva 65)');
    expect(texto).toContain('— Carga 1: 60 bidones —');
    expect(texto).toContain('— Carga 2: 30 bidones —');
  });

  it('un pedido más grande que el furgón va solo en su carga y queda marcado', () => {
    const reparto = armarReparto([de20('P1', 10, 'Calle 1'), de20('P2', 80, 'Calle 2'), de20('P3', 5, 'Calle 3')], DIA);
    expect(reparto.cargas.map((c) => [c.desde, c.hasta, c.excedeFurgon])).toEqual([[1, 1, false], [2, 2, true], [3, 3, false]]);
    expect(textoDeReparto(reparto)).toContain('— Carga 2: 80 bidones (no cabe en un viaje) —');
  });
});
