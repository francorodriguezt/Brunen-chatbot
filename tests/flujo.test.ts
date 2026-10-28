import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BusquedaCliente, Cliente } from '../src/clientes';
import { MemoriaConversaciones } from '../src/conversacion';
import { proponerEntrega } from '../src/entrega';
import { atenderTexto, type Puertos } from '../src/flujo';
import { interpretar, type ItemInterpretado } from '../src/interprete';
import { TABLA_PRECIOS } from '../src/precios';
import type { TablaPrecios } from '../src/preciosHoja';
import { FERIADOS_2026_2027, crearBaseSqlite } from './ayudas';

afterEach(() => vi.restoreAllMocks());

// Miércoles 28 de octubre de 2026, 10:00 (Chile, UTC-3): ya pasó el corte de las 9:00, lo más pronto es el jueves 29.
const MIERCOLES_10 = new Date('2026-10-28T10:00:00-03:00');
const MIERCOLES_8 = new Date('2026-10-28T08:30:00-03:00');
const MIERCOLES_22 = new Date('2026-10-28T22:00:00-03:00');

// Todo ficticio: ningún dato real de clientes.
const ANA: Cliente = {
  telefono: '56911111111', nombre: 'Ana Prueba', direccion: 'Calle Falsa 123', comuna: 'Ñuñoa', tipo: 'normal',
  precioEspecial20L: null, envasesPendientes: 0, avisoHora: false, credito: '', notas: '', estado: 'activo', avisos: [],
};
const conocido = (cambios: Partial<Cliente> = {}): BusquedaCliente => ({ estado: 'encontrado', cliente: { ...ANA, ...cambios } });
const PRECIOS_HOJA: TablaPrecios = { tabla: TABLA_PRECIOS, origen: 'hoja', problemas: [] };

interface Opciones {
  cliente?: BusquedaCliente;
  ahora?: Date;
  precios?: TablaPrecios;
  feriados?: Set<string>;
  servicio?: { reducido: boolean; mensajeExcepcion: string };
  sinMemoria?: boolean;
  puertos?: Partial<Puertos>;
}

/** Un cliente conversando con el bot: lo que hará index.ts, con la memoria en una base SQLite real. */
function conversacion(opciones: Opciones = {}) {
  const ahora = opciones.ahora ?? MIERCOLES_10;
  const db = crearBaseSqlite();
  const memoria = new MemoriaConversaciones(db);
  let n = 0;
  const puertos: Puertos = {
    memoria: opciones.sinMemoria ? null : memoria,
    buscarCliente: async () => opciones.cliente ?? conocido(),
    cargarPrecios: async () => opciones.precios ?? PRECIOS_HOJA,
    proponerEntrega: (solicitada) => proponerEntrega({}, ahora, { cargar: async () => opciones.feriados ?? FERIADOS_2026_2027, solicitada }),
    servicio: async () => opciones.servicio ?? { reducido: false, mensajeExcepcion: '' },
    interpretar: async (texto) => ({ interpretacion: interpretar(texto), conIa: false }),
    ...opciones.puertos,
  };
  return {
    db,
    memoria,
    async decir(texto: string) {
      const { decision } = await atenderTexto({ texto, telefono: ANA.telefono, wamid: `wamid.T${++n}`, ahora }, puertos);
      return decision;
    },
  };
}

describe('un pedido completo de un cliente conocido', () => {
  it('se anota, se cotiza, se propone la entrega y se responde una vez', async () => {
    const d = await conversacion().decir('quiero 2 de 20 para el viernes');
    expect(d.respuesta).toBe(
      'Anotamos tu pedido:\n- 2 bidones de 20 L: $6.600\nEntrega estimada: viernes 30 de octubre.\nSi algo cambia, te avisamos por aquí.',
    );
    expect(d.intencion).toBe('pedido');
    expect(d.pedido).toMatchObject({
      telefono: '56911111111',
      nombre: 'Ana Prueba',
      lineas: [{ tipo: '20L', cantidad: 2, precioUnitario: 3300, subtotal: 6600 }],
      fechaEntrega: '2026-10-30',
      estado: 'Pendiente_Confirmacion',
      comuna: 'Ñuñoa',
      direccion: 'Calle Falsa 123',
      fechaHora: '2026-10-28 10:00',
    });
    expect(d.alerta).toMatchObject({ tipo: 'pedido', motivos: [], nombre: 'Ana Prueba' });
    expect(d.memoria).toEqual({ accion: 'borrar' });
    expect(d.ultimoPedido).toEqual([{ tipo: '20L', cantidad: 2 }]);
  });

  it('sin día pedido propone lo más pronto', async () => {
    const d = await conversacion().decir('necesito 1 bidon de 12');
    expect(d.respuesta).toContain('- 1 bidón de 12 L: $2.500');
    expect(d.respuesta).toContain('Entrega estimada: jueves 29 de octubre.');
  });

  it('un pedido mezclado suma las líneas y muestra el total', async () => {
    const d = await conversacion().decir('3 de 20 y 1 de 12 porfa');
    expect(d.respuesta).toContain('- 3 bidones de 20 L: $9.900');
    expect(d.respuesta).toContain('- 1 bidón de 12 L: $2.500');
    expect(d.respuesta).toContain('Total: $12.400');
    expect(d.pedido?.lineas).toHaveLength(2);
    // El supuesto de los pedidos mezclados es informativo: no frena el precio ni pide revisión.
    expect(d.alerta?.tipo).toBe('pedido');
    expect(d.pedido?.observaciones).toContain('Pedido mezclado');
  });

  it('el ID del pedido sale del mensaje: el mismo mensaje da el mismo ID y es legible', async () => {
    const a = await atenderTexto({ texto: 'quiero 2 de 20', telefono: ANA.telefono, wamid: 'wamid.IGUAL', ahora: MIERCOLES_10 }, puertosFijos());
    const b = await atenderTexto({ texto: 'quiero 2 de 20', telefono: ANA.telefono, wamid: 'wamid.IGUAL', ahora: MIERCOLES_10 }, puertosFijos());
    expect(a.decision.pedido?.idPedido).toBe(b.decision.pedido?.idPedido);
    expect(a.decision.pedido?.idPedido).toMatch(/^P261028-[0-9A-Z]{5}$/);
  });

  it('las notas de la ficha, el aviso de hora y los envases por retirar van para el repartidor', async () => {
    const d = await conversacion({ cliente: conocido({ notas: 'Tocar el timbre', avisoHora: true, envasesPendientes: 2 }) }).decir('quiero 2 de 20');
    expect(d.pedido).toMatchObject({ notasRepartidor: 'Tocar el timbre. Avisar hora aproximada de entrega', envasesARetirar: 2 });
  });

  function puertosFijos(): Puertos {
    return {
      memoria: null,
      buscarCliente: async () => conocido(),
      cargarPrecios: async () => PRECIOS_HOJA,
      proponerEntrega: (solicitada) => proponerEntrega({}, MIERCOLES_10, { cargar: async () => FERIADOS_2026_2027, solicitada }),
      servicio: async () => ({ reducido: false, mensajeExcepcion: '' }),
      interpretar: async (texto) => ({ interpretacion: interpretar(texto), conIa: false }),
    };
  }
});

describe('el precio según el tipo de cliente', () => {
  it('el mayorista paga $1.250 por bidón de 20 L', async () => {
    const d = await conversacion({ cliente: conocido({ tipo: 'mayorista' }) }).decir('quiero 3 de 20');
    expect(d.respuesta).toContain('- 3 bidones de 20 L: $3.750');
    expect(d.alerta?.tipo).toBe('pedido');
  });

  it('el cliente con precio especial paga su precio en 20 L', async () => {
    const d = await conversacion({ cliente: conocido({ tipo: 'especial', precioEspecial20L: 3500 }) }).decir('quiero 2 de 20');
    expect(d.respuesta).toContain('- 2 bidones de 20 L: $7.000');
  });

  it('un precio que depende de una decisión pendiente del dueño no se le promete: va a revisión', async () => {
    // El precio especial solo está definido para 20 L: para 12 L el dueño todavía no decidió.
    const d = await conversacion({ cliente: conocido({ tipo: 'especial', precioEspecial20L: 3500 }) }).decir('quiero 2 de 12');
    expect(d.respuesta).toContain('El valor te lo confirmamos a la brevedad.');
    expect(d.respuesta).not.toContain('$');
    expect(d.alerta?.tipo).toBe('pedido_revision');
    expect(d.alerta?.motivos.join(' ')).toContain('Precio especial definido solo para 20 L');
    expect(d.pedido?.observaciones).toContain('Precio especial definido solo para 20 L');
    // La operadora igual ve el precio calculado en la fila.
    expect(d.pedido?.lineas[0]).toMatchObject({ precioUnitario: 2400, subtotal: 4800 });
  });

  it('una empresa con plan mensual va a revisión', async () => {
    const d = await conversacion({ cliente: conocido({ tipo: 'empresa' }) }).decir('quiero 5 de 20');
    expect(d.alerta?.tipo).toBe('pedido_revision');
    expect(d.respuesta).not.toContain('$');
  });

  it('una cantidad inusual puede ser un error de tipeo: va a revisión sin precio', async () => {
    const d = await conversacion().decir('quiero 25 de 20');
    expect(d.alerta?.tipo).toBe('pedido_revision');
    expect(d.alerta?.motivos.join(' ')).toContain('Cantidad inusual');
    expect(d.respuesta).not.toContain('$');
  });

  it('una ficha con datos que no se entienden va a revisión', async () => {
    const d = await conversacion({ cliente: conocido({ avisos: ['Tipo de cliente "mayorsita" no reconocido; se trató como normal.'] }) }).decir('quiero 2 de 20');
    expect(d.alerta?.tipo).toBe('pedido_revision');
    expect(d.alerta?.motivos.join(' ')).toContain('mayorsita');
    expect(d.respuesta).not.toContain('$');
  });

  it('con la hoja PRECIOS dañada se usan los precios de respaldo pero no se le promete ninguno al cliente', async () => {
    const precios: TablaPrecios = { tabla: TABLA_PRECIOS, origen: 'respaldo', problemas: ['20L: el tramo que empieza en 3 debería empezar en 2'] };
    const d = await conversacion({ precios }).decir('quiero 2 de 20');
    expect(d.respuesta).not.toContain('$');
    expect(d.alerta?.tipo).toBe('pedido_revision');
    expect(d.alerta?.motivos.join(' ')).toContain('La hoja PRECIOS no es confiable');
  });
});

describe('la fecha de entrega', () => {
  it('un domingo no se despacha: se propone el siguiente día y se explica', async () => {
    const d = await conversacion().decir('quiero 2 de 20 para el domingo');
    expect(d.respuesta).toContain('Ese día no despachamos; la entrega más cercana es el lunes 2 de noviembre.');
    expect(d.pedido?.fechaEntrega).toBe('2026-11-02');
    expect(d.pedido?.observaciones).toContain('Pidió "domingo" (ese día no se despacha): se propuso otra fecha.');
  });

  it('"hoy" después del corte de las 9:00 no alcanza', async () => {
    const d = await conversacion().decir('quiero 2 de 20 para hoy');
    expect(d.respuesta).toContain('Para ese día ya no alcanzamos; la entrega más cercana es jueves 29 de octubre.');
  });

  it('"hoy" antes de las 9:00 sale hoy', async () => {
    const d = await conversacion({ ahora: MIERCOLES_8 }).decir('quiero 2 de 20 para hoy');
    expect(d.respuesta).toContain('Entrega estimada: hoy, miércoles 28 de octubre.');
  });

  it('una fecha que no se entiende no se promete: la confirma una persona', async () => {
    const d = await conversacion().decir('quiero 2 de 20 para el 31 de abril');
    expect(d.respuesta).toContain('La fecha de entrega te la confirmamos a la brevedad.');
    expect(d.respuesta).toContain('$6.600'); // el precio sí es seguro
    expect(d.alerta?.tipo).toBe('pedido_revision');
    expect(d.alerta?.motivos.join(' ')).toContain('No se entendió la fecha que pidió');
  });

  it('con la hoja FERIADOS sin feriados del año no se promete la fecha', async () => {
    const d = await conversacion({ feriados: new Set() }).decir('quiero 2 de 20');
    expect(d.respuesta).toContain('La fecha de entrega te la confirmamos a la brevedad.');
    expect(d.alerta?.motivos.join(' ')).toContain('FERIADOS');
  });
});

describe('un pedido que se completa en varios mensajes', () => {
  it('"4 bidones" y después "20": pregunta el tamaño y entiende la respuesta', async () => {
    const c = await conversacion();
    const pregunta = await c.decir('quiero 4 bidones');
    expect(pregunta.respuesta).toBe('¿De cuántos litros son los bidones: 20, 12 o 10?');
    expect(pregunta.pedido).toBeUndefined();
    expect(pregunta.memoria).toEqual({ accion: 'guardar', estado: { espera: 'tipo', items: [{ tipo: 'no_especificado', cantidad: 4 }] } });

    const final = await c.decir('20');
    expect(final.respuesta).toContain('- 4 bidones de 20 L: $11.000');
    expect(final.pedido?.lineas).toEqual([{ tipo: '20L', cantidad: 4, precioUnitario: 2750, subtotal: 11000 }]);
    expect(await c.memoria.obtener(ANA.telefono, Math.floor(MIERCOLES_10.getTime() / 1000))).toBeNull(); // ya no hay nada pendiente
  });

  it('"bidones de 20" y después "3": pregunta la cantidad', async () => {
    const c = await conversacion();
    const pregunta = await c.decir('necesito bidones de 20');
    expect(pregunta.respuesta).toBe('¿Cuántos bidones de 20 L necesitas?');
    const final = await c.decir('tres');
    expect(final.respuesta).toContain('- 3 bidones de 20 L: $9.900');
  });

  it('conserva el día pedido en el primer mensaje', async () => {
    const c = await conversacion();
    await c.decir('quiero 4 bidones para el viernes');
    const final = await c.decir('de 20');
    expect(final.respuesta).toContain('Entrega estimada: viernes 30 de octubre.');
  });

  it('"quiero pedir" a secas pregunta qué necesita', async () => {
    const c = await conversacion();
    expect((await c.decir('quiero hacer un pedido')).respuesta).toBe('¿Qué necesitas? Dime cuántos bidones y de cuántos litros (20, 12 o 10).');
    expect((await c.decir('2 de 20')).respuesta).toContain('- 2 bidones de 20 L');
  });

  it('si desiste, no queda nada anotado ni pendiente', async () => {
    const c = await conversacion();
    await c.decir('quiero 4 bidones');
    const d = await c.decir('no gracias');
    expect(d.respuesta).toBe('Listo, no anoté nada. Cuando quieras, escríbeme.');
    expect(d.intencion).toBe('cancelar');
    expect(d.pedido).toBeUndefined();
    expect(await c.memoria.obtener(ANA.telefono, Math.floor(MIERCOLES_10.getTime() / 1000))).toBeNull();
  });

  it('si en medio pregunta otra cosa, se le responde y el pedido a medias sigue esperando', async () => {
    const c = await conversacion();
    await c.decir('quiero 4 bidones');
    const precios = await c.decir('cuanto sale el bidon de 20?');
    expect(precios.respuesta).toContain('Estos son nuestros valores:');
    expect(precios.memoria).toEqual({ accion: 'mantener' });
    expect((await c.decir('20')).respuesta).toContain('- 4 bidones de 20 L: $11.000');
  });

  it('si manda un pedido completo, reemplaza al que estaba a medias', async () => {
    const c = await conversacion();
    await c.decir('quiero 4 bidones');
    const d = await c.decir('mejor 2 de 12');
    expect(d.respuesta).toContain('- 2 bidones de 12 L: $4.800');
  });

  it('un tamaño dado sin que haya nada pendiente no se interpreta como pedido', async () => {
    const d = await conversacion().decir('20');
    expect(d.alerta?.tipo).toBe('no_entendido');
    expect(d.pedido).toBeUndefined();
  });

  it('sin base de datos el bot no recuerda lo pendiente: la respuesta corta se escala a una persona', async () => {
    const c = await conversacion({ sinMemoria: true });
    await c.decir('quiero 4 bidones');
    expect((await c.decir('20')).alerta?.tipo).toBe('no_entendido');
  });
});

describe('"lo de siempre"', () => {
  it('repite el último pedido', async () => {
    const c = await conversacion();
    await c.decir('quiero 3 de 20 y 1 de 12');
    const d = await c.decir('lo de siempre');
    expect(d.respuesta).toContain('- 3 bidones de 20 L: $9.900');
    expect(d.respuesta).toContain('- 1 bidón de 12 L: $2.500');
    expect(d.pedido?.observaciones).toContain('Pidió repetir su último pedido.');
    expect(d.intencion).toBe('repetir_pedido');
  });

  it('acepta un día: "lo de siempre para el viernes"', async () => {
    const c = await conversacion();
    await c.decir('quiero 2 de 20');
    expect((await c.decir('lo de siempre para el viernes')).respuesta).toContain('Entrega estimada: viernes 30 de octubre.');
  });

  it('sin pedido anterior pregunta qué necesita, y entiende la respuesta', async () => {
    const c = await conversacion();
    const d = await c.decir('lo de siempre');
    expect(d.respuesta).toBe('No tengo anotado tu último pedido. ¿Cuántos bidones necesitas y de cuántos litros (20, 12 o 10)?');
    expect((await c.decir('2 de 20')).respuesta).toContain('- 2 bidones de 20 L: $6.600');
  });

  it('un pedido fuera de zona no se recuerda como "lo de siempre"', async () => {
    const c = await conversacion({ cliente: conocido({ comuna: 'Maipú' }) });
    await c.decir('quiero 2 de 20');
    expect(await c.memoria.ultimoPedido(ANA.telefono)).toBeNull();
  });
});

describe('quién escribe y dónde vive', () => {
  it('un cliente nuevo: se anota el pedido, sin precio ni fecha, y una persona coordina', async () => {
    const d = await conversacion({ cliente: { estado: 'nuevo' } }).decir('quiero 2 de 20');
    expect(d.respuesta).toBe('¡Hola! Anotamos tu pedido de 2 bidones de 20 L. Como es tu primer pedido, una persona del equipo te escribirá para confirmar tu dirección y los detalles.');
    expect(d.pedido).toMatchObject({ nombre: '', direccion: '', estado: 'Pendiente_Confirmacion' });
    expect(d.pedido?.observaciones).toContain('Cliente nuevo, sin ficha');
    expect(d.alerta?.tipo).toBe('cliente_nuevo');
  });

  it('un cliente nuevo que pide desde una comuna fuera de zona queda como Fuera_de_zona', async () => {
    const d = await conversacion({ cliente: { estado: 'nuevo' } }).decir('quiero 2 de 20 en Maipú');
    expect(d.respuesta).toContain('Por ahora no despachamos a Maipú.');
    expect(d.pedido?.estado).toBe('Fuera_de_zona');
  });

  it('un cliente bloqueado no hace pedidos: lo ve una persona', async () => {
    const d = await conversacion({ cliente: conocido({ estado: 'bloqueado' }) }).decir('quiero 2 de 20');
    expect(d.respuesta).toBe('Recibimos tu mensaje. Una persona del equipo te responderá en breve.');
    expect(d.pedido).toBeUndefined();
    expect(d.alerta?.tipo).toBe('escalamiento');
  });

  it('si no se pudo leer la hoja de clientes no se adivina: se avisa y una persona responde', async () => {
    const d = await conversacion({ cliente: { estado: 'no_disponible' } }).decir('quiero 2 de 20');
    expect(d.pedido).toBeUndefined();
    expect(d.alerta?.tipo).toBe('error');
    expect(d.alerta?.texto).toBe('quiero 2 de 20'); // la operadora ve qué pidió
    expect(d.respuesta).toBe('Recibimos tu mensaje. Una persona del equipo te responderá en breve.');
  });

  it('un cliente de una comuna que no se atiende queda como Fuera_de_zona y se le informa', async () => {
    const d = await conversacion({ cliente: conocido({ comuna: 'Maipú' }) }).decir('quiero 2 de 20');
    expect(d.respuesta).toContain('Por ahora no despachamos a Maipú. Atendemos: Ñuñoa, Macul');
    expect(d.pedido?.estado).toBe('Fuera_de_zona');
    expect(d.alerta?.tipo).toBe('fuera_de_zona');
    expect(d.ultimoPedido).toBeUndefined();
  });

  it('la comuna de la ficha se reconoce aunque esté mal escrita', async () => {
    const d = await conversacion({ cliente: conocido({ comuna: 'nunoa' }) }).decir('quiero 2 de 20');
    expect(d.pedido).toMatchObject({ estado: 'Pendiente_Confirmacion', comuna: 'Ñuñoa' });
  });

  it('si pide en otra comuna distinta de la ficha, una persona confirma la dirección', async () => {
    const d = await conversacion().decir('quiero 2 de 20 en Las Condes');
    expect(d.alerta?.tipo).toBe('pedido_revision');
    expect(d.alerta?.motivos.join(' ')).toContain('distinta de la comuna de su ficha');
  });

  it('una ficha sin comuna reconocible va a revisión', async () => {
    const d = await conversacion({ cliente: conocido({ comuna: '' }) }).decir('quiero 2 de 20');
    expect(d.alerta?.tipo).toBe('pedido_revision');
    expect(d.alerta?.motivos.join(' ')).toContain('comuna reconocible');
  });
});

describe('preguntas', () => {
  it('precios: los valores salen de la hoja', async () => {
    const d = await conversacion().decir('cuanto sale el bidon?');
    expect(d.respuesta).toBe(
      'Estos son nuestros valores:\n- Bidón 20 L: 1: $4.500 · 2 a 3: $3.300 c/u · 4 o más: $2.750 c/u\n- Bidón 12 L: 1: $2.500 · 2 o más: $2.400 c/u\n- Bidón 10 L: $2.200 c/u\nEl despacho es gratis.',
    );
    expect(d.alerta).toBeUndefined();
    expect(d.pedido).toBeUndefined();
  });

  it('precios con la hoja dañada: no se dice un valor dudoso, responde una persona', async () => {
    const precios: TablaPrecios = { tabla: TABLA_PRECIOS, origen: 'respaldo', problemas: ['La hoja PRECIOS está vacía.'] };
    const d = await conversacion({ precios }).decir('cuanto sale el bidon?');
    expect(d.respuesta).toBe('Recibimos tu mensaje. Una persona del equipo te responderá en breve.');
    expect(d.alerta?.tipo).toBe('error');
  });

  it('horario', async () => {
    const d = await conversacion().decir('reparten los domingos?');
    expect(d.respuesta).toContain('Despachamos de lunes a viernes de 10:00 a 18:00 y los sábados de 10:00 a 15:00.');
    expect(d.respuesta).toContain('hasta las 9:00 salen el mismo día');
    expect(d.alerta).toBeUndefined();
  });

  it('zona: dice si llegan a la comuna', async () => {
    expect((await conversacion().decir('llegan a Maipú?')).respuesta).toContain('Por ahora no despachamos a Maipú.');
    expect((await conversacion().decir('llegan a Vitacura?')).respuesta).toContain('Sí, despachamos a Vitacura.');
  });

  it('cómo pagar: responde una persona (los datos de pago no están en el código)', async () => {
    const d = await conversacion().decir('como se paga?');
    expect(d.alerta?.tipo).toBe('pago');
    expect(d.respuesta).toBe('Recibimos tu mensaje. Una persona del equipo te responderá en breve.');
  });
});

describe('lo que siempre atiende una persona', () => {
  it('un reclamo: respuesta inmediata y aviso con lo que escribió el cliente', async () => {
    const d = await conversacion().decir('el bidón de ayer venía con el sello roto');
    expect(d.respuesta).toBe('Lamentamos el inconveniente. Ya avisamos al equipo: te contactarán a la brevedad y lo resolvemos a más tardar mañana.');
    expect(d.alerta).toMatchObject({ tipo: 'reclamo', texto: 'el bidón de ayer venía con el sello roto', telefono: '56911111111' });
    expect(d.pedido).toBeUndefined();
  });

  it('un reclamo aunque pida bidones en el mismo mensaje no crea un pedido', async () => {
    const d = await conversacion().decir('el bidón llegó roto, mándeme 2 de 20 de nuevo');
    expect(d.alerta?.tipo).toBe('reclamo');
    expect(d.pedido).toBeUndefined();
  });

  it('una factura', async () => {
    const d = await conversacion().decir('necesito factura del mes pasado');
    expect(d.alerta?.tipo).toBe('factura');
  });

  it('un mensaje de proveedor o cobranza', async () => {
    expect((await conversacion().decir('soy proveedor, tengo un pago pendiente')).alerta?.tipo).toBe('proveedor');
  });

  it('el aviso de que pagó', async () => {
    const d = await conversacion().decir('ya transferí');
    expect(d.respuesta).toContain('Recibimos tu aviso de pago');
    expect(d.alerta?.tipo).toBe('pago');
  });

  it('envases para devolver: se anota para el repartidor', async () => {
    const d = await conversacion().decir('tengo 3 bidones vacios para devolver');
    expect(d.respuesta).toBe('Anotado: retiramos 3 envases vacíos en tu próxima entrega.');
    expect(d.alerta).toMatchObject({ tipo: 'envases', resumen: 'Tiene 3 envase(s) vacío(s) para retirar' });
    expect(d.pedido).toBeUndefined();
  });

  it('lo que no se entiende', async () => {
    const d = await conversacion().decir('xyz abc qwerty');
    expect(d.alerta).toMatchObject({ tipo: 'no_entendido', texto: 'xyz abc qwerty' });
  });
});

describe('saludos y cierres', () => {
  it('saluda por el nombre de la ficha', async () => {
    expect((await conversacion().decir('hola')).respuesta).toMatch(/^¡Hola Ana! Soy el asistente de Brunen/);
  });

  it('saluda sin nombre a quien no conoce', async () => {
    expect((await conversacion({ cliente: { estado: 'nuevo' } }).decir('buenas tardes')).respuesta).toMatch(/^¡Hola! Soy el asistente/);
  });

  it('un "gracias" no se responde (cada respuesta gasta el cupo gratis de WhatsApp)', async () => {
    const d = await conversacion().decir('ok perfecto gracias');
    expect(d.respuesta).toBeNull();
    expect(d.intencion).toBe('cierre');
  });
});

describe('contingencia y horario de atención', () => {
  it('con el servicio reducido se agrega el aviso de la hoja CONFIGURACION a cada respuesta', async () => {
    const servicio = { reducido: true, mensajeExcepcion: 'Hoy tenemos retrasos en el reparto.' };
    const d = await conversacion({ servicio }).decir('quiero 2 de 20');
    expect(d.respuesta?.endsWith('\n\nHoy tenemos retrasos en el reparto.')).toBe(true);
    expect((await conversacion({ servicio }).decir('hola')).respuesta).toContain('Hoy tenemos retrasos');
  });

  it('con el servicio reducido pero sin texto de aviso no agrega nada', async () => {
    const d = await conversacion({ servicio: { reducido: true, mensajeExcepcion: '  ' } }).decir('quiero 2 de 20');
    expect(d.respuesta?.endsWith('Si algo cambia, te avisamos por aquí.')).toBe(true);
  });

  it('un "gracias" sigue sin respuesta aunque haya aviso de contingencia', async () => {
    const servicio = { reducido: true, mensajeExcepcion: 'Hoy tenemos retrasos en el reparto.' };
    expect((await conversacion({ servicio }).decir('gracias')).respuesta).toBeNull();
  });

  it('fuera del horario de la operadora, lo que necesita a una persona avisa cuándo responderá', async () => {
    const d = await conversacion({ ahora: MIERCOLES_22 }).decir('el bidón llegó roto');
    expect(d.respuesta?.endsWith('Nuestro horario de atención es de 8:00 a 21:00: te respondemos apenas abramos.')).toBe(true);
  });

  it('un pedido normal no lleva ese aviso: queda anotado y no necesita a nadie ahora', async () => {
    const d = await conversacion({ ahora: MIERCOLES_22 }).decir('quiero 2 de 20');
    expect(d.respuesta).not.toContain('horario de atención');
  });

  it('un pedido que sí necesita revisión, fuera de horario, lo avisa', async () => {
    const d = await conversacion({ ahora: MIERCOLES_22, cliente: conocido({ tipo: 'empresa' }) }).decir('quiero 2 de 20');
    expect(d.respuesta).toContain('horario de atención');
  });
});

describe('si algo falla por dentro', () => {
  it('el cliente igual recibe una respuesta, la operadora un aviso de error y el log no lleva datos del cliente', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = conversacion({
      puertos: {
        buscarCliente: async () => {
          throw new Error('Google caído');
        },
      },
    });
    const d = await c.decir('quiero 2 de 20 para el viernes');
    expect(d.respuesta).toBe('Recibimos tu mensaje. Una persona del equipo te responderá en breve.');
    expect(d.alerta).toMatchObject({ tipo: 'error', telefono: '56911111111', texto: 'quiero 2 de 20 para el viernes' });
    expect(d.alerta?.resumen).toContain('Google caído');
    expect(d.memoria).toEqual({ accion: 'mantener' });
    expect(JSON.stringify(error.mock.calls)).not.toContain('56911111111');
    expect(JSON.stringify(error.mock.calls)).not.toContain('viernes');
  });

  it('un error al calcular la entrega tampoco deja al cliente sin respuesta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = conversacion({
      puertos: {
        proponerEntrega: async () => {
          throw new Error('No hay día de despacho en los próximos 31 días');
        },
      },
    });
    expect((await c.decir('quiero 2 de 20')).alerta?.tipo).toBe('error');
  });
});

describe('qué lee el flujo para cada mensaje (cada lectura gasta tiempo y cupo de Google)', () => {
  it('un "gracias" no lee nada de las hojas', async () => {
    const llamadas = { cliente: 0, precios: 0, entrega: 0, servicio: 0 };
    const c = conversacion({
      puertos: {
        buscarCliente: async () => (llamadas.cliente++, conocido()),
        cargarPrecios: async () => (llamadas.precios++, PRECIOS_HOJA),
        proponerEntrega: async () => (llamadas.entrega++, { fecha: '2026-10-29', mismoDia: false, feriadosAlDia: true }),
        servicio: async () => (llamadas.servicio++, { reducido: false, mensajeExcepcion: '' }),
      },
    });
    await c.decir('gracias');
    expect(llamadas).toEqual({ cliente: 0, precios: 0, entrega: 0, servicio: 0 });
  });

  it('un saludo solo necesita la ficha y el estado del servicio', async () => {
    const llamadas = { cliente: 0, precios: 0, entrega: 0, servicio: 0 };
    const c = conversacion({
      puertos: {
        buscarCliente: async () => (llamadas.cliente++, conocido()),
        cargarPrecios: async () => (llamadas.precios++, PRECIOS_HOJA),
        proponerEntrega: async () => (llamadas.entrega++, { fecha: '2026-10-29', mismoDia: false, feriadosAlDia: true }),
        servicio: async () => (llamadas.servicio++, { reducido: false, mensajeExcepcion: '' }),
      },
    });
    await c.decir('hola');
    expect(llamadas).toEqual({ cliente: 1, precios: 0, entrega: 0, servicio: 1 });
  });

  it('una respuesta corta a una pregunta del bot no gasta IA', async () => {
    const interpretarConIa = vi.fn(async (texto: string) => ({ interpretacion: interpretar(texto), conIa: true }));
    const c = conversacion({ puertos: { interpretar: interpretarConIa } });
    await c.decir('quiero 4 bidones');
    expect(interpretarConIa).toHaveBeenCalledTimes(1);
    await c.decir('20');
    expect(interpretarConIa).toHaveBeenCalledTimes(1); // "20" se entendió con el contexto, sin llamar a la IA
  });
});

describe('el aviso de horario según quién tiene que contestar', () => {
  it('los envases anotados y lo fuera de zona no esperan a la operadora: sin aviso de horario', async () => {
    const envases = await conversacion({ ahora: MIERCOLES_22 }).decir('tengo 3 bidones vacios para devolver');
    expect(envases.respuesta).not.toContain('horario de atención');
    const fuera = await conversacion({ ahora: MIERCOLES_22, cliente: conocido({ comuna: 'Maipú' }) }).decir('quiero 2 de 20');
    expect(fuera.respuesta).not.toContain('horario de atención');
  });

  it('un cliente nuevo o un reclamo, que sí esperan a una persona, lo llevan', async () => {
    const nuevo = await conversacion({ ahora: MIERCOLES_22, cliente: { estado: 'nuevo' } }).decir('quiero 2 de 20');
    expect(nuevo.respuesta).toContain('horario de atención');
  });
});
