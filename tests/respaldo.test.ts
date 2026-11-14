import { describe, expect, it } from 'vitest';
import type { PedidoARegistrar } from '../src/pedidos';
import { RepositorioD1 } from '../src/repositorio';
import { RepositorioClientes } from '../src/fichas';
import {
  ENCABEZADO_CLIENTES,
  ENCABEZADO_PEDIDOS,
  HOJA_CLIENTES,
  HOJA_PEDIDOS,
  PEDIDOS_POR_VUELTA,
  bidonesEnTexto,
  fechaHoraLegible,
  respaldarClientes,
  respaldarPedidos,
  respaldoAtrasado,
  type HojasDeRespaldo,
} from '../src/respaldo';
import { fechaHoraLocal } from '../src/despacho';
import { crearBaseSqlite } from './ayudas';

const AHORA = Math.floor(new Date('2026-11-14T10:30:00-03:00').getTime() / 1000);

// Todo ficticio.
function pedido(id: string, cambios: Partial<PedidoARegistrar> = {}): PedidoARegistrar {
  return {
    idPedido: id,
    telefono: '56911111111',
    nombre: 'Ana Prueba',
    lineas: [{ tipo: '20L', cantidad: 3, precioUnitario: 3300, subtotal: 9900 }],
    fechaEntrega: '2026-11-16',
    estado: 'Pendiente_Confirmacion',
    comuna: 'Ñuñoa',
    direccion: 'Calle Falsa 123',
    notasRepartidor: '',
    envasesARetirar: 0,
    observaciones: '',
    ...cambios,
  };
}

/** Una planilla en memoria: guarda lo que se escribe en cada hoja. */
function planillaFalsa(opciones: { fallar?: boolean } = {}) {
  const hojas = new Map<string, Array<Array<string | number>>>([['CLIENTES', []]]);
  const llamadas: string[] = [];
  const revisar = () => {
    if (opciones.fallar) throw new Error('Google Sheets respondió 503');
  };
  const destino: HojasDeRespaldo = {
    async titulosDeHojas() {
      revisar();
      return [...hojas.keys()];
    },
    async crearHoja(titulo) {
      revisar();
      llamadas.push(`crear ${titulo}`);
      hojas.set(titulo, []);
    },
    async agregarFilas(hoja, filas) {
      revisar();
      llamadas.push(`agregar ${hoja} ${filas.length}`);
      hojas.get(hoja)?.push(...filas.map((f) => [...f]));
    },
    async escribirRango(rango, filas) {
      revisar();
      llamadas.push(`escribir ${rango} ${filas.length}`);
      const hoja = hojas.get(rango.split('!')[0] as string) as Array<Array<string | number>>;
      filas.forEach((f, i) => (hoja[i] = [...f]));
    },
    async limpiarRango(rango) {
      revisar();
      llamadas.push(`limpiar ${rango}`);
      const [nombre, celdas] = rango.split('!') as [string, string];
      const desde = Number(/A(\d+)/.exec(celdas)?.[1] ?? 1) - 1;
      hojas.get(nombre)?.splice(desde);
    },
  };
  return { destino, hojas, llamadas };
}

describe('respaldo de pedidos en Google Sheets (D66)', () => {
  it('la primera vez crea la hoja con su encabezado y copia todos los pedidos; después, solo los que cambiaron', async () => {
    const db = crearBaseSqlite();
    const r = new RepositorioD1(db, () => 1);
    await r.guardarPedido(pedido('P261114-AAAAA'), AHORA - 300);
    await r.guardarPedido(pedido('P261114-BBBBB', { nombre: '=HIPERVINCULO("x")', formaPago: 'efectivo' }), AHORA - 200);
    const { destino, hojas, llamadas } = planillaFalsa();

    expect(await respaldarPedidos(db, destino, AHORA)).toBe(2);
    const hoja = hojas.get(HOJA_PEDIDOS) as Array<Array<string | number>>;
    expect(hoja[0]).toEqual([...ENCABEZADO_PEDIDOS]);
    expect(hoja).toHaveLength(3);
    const fila = Object.fromEntries(ENCABEZADO_PEDIDOS.map((c, i) => [c, hoja[2]?.[i]]));
    expect(fila).toMatchObject({ ID_Pedido: 'P261114-BBBBB', Nombre: '=HIPERVINCULO("x")', Telefono: '56911111111', Bidones: '3 × 20 L', Total: 9900, Forma_Pago: 'efectivo', Estado: 'Pendiente_Confirmacion' });
    expect(JSON.parse(String(fila.Lineas_JSON))).toEqual([{ tipo: '20L', cantidad: 3, precioUnitario: 3300, subtotal: 9900 }]);

    // Nada cambió: no se escribe nada.
    expect(await respaldarPedidos(db, destino, AHORA + 60)).toBe(0);
    // Cambia uno: se agrega su nuevo estado al final, sin tocar las filas anteriores.
    await r.cambiarEstado('P261114-AAAAA', 'Confirmado', 'operadora@brunen.test', AHORA + 100);
    expect(await respaldarPedidos(db, destino, AHORA + 1800)).toBe(1);
    expect(hojas.get(HOJA_PEDIDOS)).toHaveLength(4);
    expect(hojas.get(HOJA_PEDIDOS)?.[3]?.[1]).toBe('P261114-AAAAA');
    expect(llamadas.filter((l) => l.startsWith('crear'))).toEqual([`crear ${HOJA_PEDIDOS}`]);
  });

  it('copia de a tandas: lo que no alcanzó queda para la vuelta siguiente', async () => {
    const db = crearBaseSqlite();
    const r = new RepositorioD1(db, () => 1);
    for (let i = 0; i < PEDIDOS_POR_VUELTA + 3; i++) await r.guardarPedido(pedido(`P261114-${String(i).padStart(5, '0')}`), AHORA - 1000);
    const { destino } = planillaFalsa();
    expect(await respaldarPedidos(db, destino, AHORA)).toBe(PEDIDOS_POR_VUELTA);
    expect(await respaldarPedidos(db, destino, AHORA + 1800)).toBe(3);
    expect(await respaldarPedidos(db, destino, AHORA + 3600)).toBe(0);
  });

  it('si Google falla no avanza: la vuelta siguiente copia lo mismo, y pasado un día la revisión avisa', async () => {
    const db = crearBaseSqlite();
    await new RepositorioD1(db, () => 1).guardarPedido(pedido('P261114-AAAAA'), AHORA - 300);
    await expect(respaldarPedidos(db, planillaFalsa({ fallar: true }).destino, AHORA)).rejects.toThrow('503');
    const atraso = await respaldoAtrasado(db, AHORA + 60);
    expect(atraso?.error).toContain('503');
    const { destino } = planillaFalsa();
    expect(await respaldarPedidos(db, destino, AHORA + 1800)).toBe(1);
    expect(await respaldoAtrasado(db, AHORA + 1900)).toBeNull();
  });

  it('no avisa de atraso si no hay nada pendiente, ni antes de la primera vuelta', async () => {
    const db = crearBaseSqlite();
    expect(await respaldoAtrasado(db, AHORA)).toBeNull();
    await new RepositorioD1(db, () => 1).guardarPedido(pedido('P261114-AAAAA'), AHORA - 300);
    expect(await respaldoAtrasado(db, AHORA)).toBeNull(); // recién publicado: todavía no corrió
    await respaldarPedidos(db, planillaFalsa().destino, AHORA);
    await new RepositorioD1(db, () => 1).guardarPedido(pedido('P261115-BBBBB'), AHORA + 100);
    expect(await respaldoAtrasado(db, AHORA + 3600)).toBeNull(); // pendiente, pero hace menos de un día
    expect((await respaldoAtrasado(db, AHORA + 27 * 3600))?.segundos).toBe(27 * 3600);
  });
});

describe('respaldo de las fichas de clientes', () => {
  it('escribe una copia completa y borra lo que sobra de la copia anterior', async () => {
    const db = crearBaseSqlite();
    const r = new RepositorioD1(db, () => 1);
    await r.guardarPedido(pedido('P261114-AAAAA'), AHORA - 300);
    await r.guardarPedido(pedido('P261114-BBBBB', { telefono: '56922222222', nombre: 'Luis Ficticio', direccion: 'Pasaje Uno 9', comuna: 'Macul' }), AHORA - 200);
    await new RepositorioClientes(db).vincularPendientes(AHORA);
    const { destino, hojas } = planillaFalsa();
    hojas.set(HOJA_CLIENTES, Array.from({ length: 10 }, () => ['viejo']));

    expect(await respaldarClientes(db, destino, AHORA)).toBe(2);
    const hoja = hojas.get(HOJA_CLIENTES) as Array<Array<string | number>>;
    expect(hoja).toHaveLength(3);
    expect(hoja[0]).toEqual([...ENCABEZADO_CLIENTES]);
    expect(hoja.slice(1).map((f) => [f[1], f[3], f[4], f[5]])).toEqual([
      ['Ana Prueba', '56911111111', 'Calle Falsa 123', 'Ñuñoa'],
      ['Luis Ficticio', '56922222222', 'Pasaje Uno 9', 'Macul'],
    ]);
  });
});

describe('formatos del respaldo', () => {
  it('fechas en hora de Santiago y bidones legibles', () => {
    expect(fechaHoraLegible(AHORA)).toBe('2026-11-14 10:30');
    expect(fechaHoraLegible(null)).toBe('');
    expect(bidonesEnTexto('[{"tipo":"20L","cantidad":3},{"tipo":"12L","cantidad":1}]')).toBe('3 × 20 L, 1 × 12 L');
    expect(bidonesEnTexto('no es json')).toBe('');
  });

  it('la hora es exacta también los días en que Chile cambia de horario (se calcula el desfase una vez por día)', () => {
    const comoAntes = (s: number) => {
      const l = fechaHoraLocal(new Date(s * 1000));
      return `${l.fecha} ${String(l.hora).padStart(2, '0')}:${String(l.minuto).padStart(2, '0')}`;
    };
    for (const desde of ['2026-04-03T00:00:00Z', '2026-09-04T00:00:00Z', '2027-04-02T00:00:00Z']) {
      const inicio = Date.parse(desde) / 1000;
      for (let s = inicio; s < inicio + 4 * 86_400; s += 37 * 60 + 11) expect(fechaHoraLegible(s)).toBe(comoAntes(s));
    }
  });
});
