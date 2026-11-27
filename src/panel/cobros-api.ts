/**
 * Rutas de los cobros (D107). Solo para administradores: `index.ts` las atiende después de comprobar la sesión. `url` ya
 * viene sin el prefijo `/admin`.
 *
 *  GET  /api/cobros?fecha=            lo por verificar, la rendición de ese día y lo que deben los clientes
 *  GET  /api/pedidos/:id/pagos        los pagos de un pedido
 *  POST /api/pedidos/:id/pagos        { monto, forma, verificado?, nota? }  anota un pago (un abono, una transferencia)
 *  POST /api/pagos/:id/verificar      el dinero llegó
 *  POST /api/pagos/:id/rechazar       el dinero no llegó: el pago deja de contar
 *  POST /api/cobros/rendicion         { fecha, bencina?, entregado, nota? }  rinde el efectivo del día y lo verifica
 */

import { RepositorioCobros, estadoDeCobro, saldoDe, type ErrorDeCobro } from '../cobros';
import { fechaHoraLocal } from '../despacho';
import type { RepositorioD1 } from '../repositorio';
import { error, esperadoComoEscritura, json, leerCuerpo } from './api';

export interface ContextoCobros {
  cobros: RepositorioCobros;
  repositorio: RepositorioD1;
  ahoraSegundos: number;
  correo: string;
}

const MENSAJES: Record<ErrorDeCobro, [number, string]> = {
  no_existe: [404, 'Ese pedido o pago ya no existe.'],
  datos_invalidos: [422, 'Revisa el monto (un número entero de pesos), la forma de pago y la nota.'],
  ya_decidido: [409, 'Ese pago ya estaba verificado o rechazado. Si hay un error, anota otro pago.'],
};

const errorDeCobro = (codigo: ErrorDeCobro): Response => error(...MENSAJES[codigo]);
const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export async function manejarCobros(request: Request, url: URL, ctx: ContextoCobros): Promise<Response | null> {
  const ruta = url.pathname;
  const { cobros, repositorio, ahoraSegundos, correo } = ctx;
  const hoy = fechaHoraLocal(new Date(ahoraSegundos * 1000)).fecha;

  if (ruta === '/api/cobros' && request.method === 'GET') {
    const fecha = url.searchParams.get('fecha') ?? hoy;
    if (!esFecha(fecha)) return error(400, 'Fecha no válida.');
    const [porVerificar, rendicion, saldos] = await Promise.all([cobros.porVerificar(), cobros.rendicionDe(fecha), cobros.saldos()]);
    return json({ fecha, porVerificar, rendicion, saldos });
  }

  const delPedido = /^\/api\/pedidos\/([PHF]\d{6}-[0-9A-Z]{5})\/pagos$/.exec(ruta);
  if (delPedido) {
    const id = delPedido[1] as string;
    if (request.method === 'GET') {
      const pedido = await repositorio.obtenerPedido(id);
      if (!pedido) return errorDeCobro('no_existe');
      return json({
        pagos: await cobros.pagosDe(id),
        total: pedido.total,
        pagado: pedido.montoPagado,
        verificado: pedido.montoVerificado,
        saldo: saldoDe(pedido.total, pedido.montoPagado),
        estado: estadoDeCobro(pedido.total, pedido.montoPagado, pedido.montoVerificado),
      });
    }
    if (request.method === 'POST') {
      const rechazo = esperadoComoEscritura(request, url);
      if (rechazo) return rechazo;
      const cuerpo = await leerCuerpo(request);
      if (!cuerpo) return error(400, 'Solicitud no válida.');
      const r = await cobros.registrar(id, { monto: cuerpo.monto, forma: cuerpo.forma, verificado: cuerpo.verificado, nota: cuerpo.nota }, { quien: correo, ahora: ahoraSegundos, origen: 'panel' });
      return r.ok ? json({ ok: true, id: r.valor }, 201) : errorDeCobro(r.error);
    }
    return null;
  }

  const decision = /^\/api\/pagos\/(\d{1,9})\/(verificar|rechazar)$/.exec(ruta);
  if (decision && request.method === 'POST') {
    const rechazo = esperadoComoEscritura(request, url);
    if (rechazo) return rechazo;
    const r = await cobros.decidir(Number(decision[1]), decision[2] === 'verificar' ? 'verificado' : 'rechazado', correo, ahoraSegundos);
    return r.ok ? json({ ok: true }) : errorDeCobro(r.error);
  }

  if (ruta === '/api/cobros/rendicion' && request.method === 'POST') {
    const rechazo = esperadoComoEscritura(request, url);
    if (rechazo) return rechazo;
    const cuerpo = await leerCuerpo(request);
    if (!cuerpo || !esFecha(cuerpo.fecha)) return error(400, 'Solicitud no válida.');
    // Solo se rinden días que ya empezaron: un día futuro no tiene efectivo.
    if (cuerpo.fecha > hoy) return error(422, 'Ese día todavía no llega.');
    const r = await cobros.guardarRendicion(cuerpo.fecha, { bencina: cuerpo.bencina, entregado: cuerpo.entregado, nota: cuerpo.nota }, correo, ahoraSegundos);
    return r.ok ? json({ ok: true, rendicion: r.valor }) : errorDeCobro(r.error);
  }

  return null;
}
