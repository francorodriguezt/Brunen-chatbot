/**
 * Aviso interno para la operadora (Etapa 5: se envía por Telegram, D7). Es solo el contenido: quién escribió,
 * qué pasó y por qué hace falta una persona. El motor de pedidos (motor.ts) los produce y `telegram.ts`
 * los da formato y los envía.
 */

export type TipoAlerta =
  /** Pedido normal, ya registrado: se puede confirmar con un toque. */
  | 'pedido'
  /** Pedido registrado, pero algo no se pudo resolver solo (precio, fecha, dirección...): hay que revisarlo. */
  | 'pedido_revision'
  | 'cliente_nuevo'
  | 'fuera_de_zona'
  | 'reclamo'
  | 'factura'
  | 'proveedor'
  | 'pago'
  | 'envases'
  /** El bot no entendió el mensaje. */
  | 'no_entendido'
  /** Otro caso que debe ver una persona (por ejemplo, un cliente bloqueado). */
  | 'escalamiento'
  /** Algo falló del lado del sistema (una hoja que no se pudo leer, la tabla de precios con errores...). */
  | 'error';

/**
 * Avisos que nacen junto con un pedido. El panel no los pone en la bandeja de avisos: el pedido ya está en "Por
 * confirmar", con sus observaciones y lo que escribió el cliente. En la bandeja quedan solo los casos que no tienen
 * pedido (reclamos, facturas, comprobantes, mensajes que el bot no entendió y fallas).
 */
export const TIPOS_DE_AVISO_DE_PEDIDO: readonly TipoAlerta[] = ['pedido', 'pedido_revision', 'cliente_nuevo', 'fuera_de_zona'];

export interface Alerta {
  tipo: TipoAlerta;
  /** Teléfono completo del cliente, en el formato de WhatsApp: la operadora lo necesita para contactarlo. */
  telefono: string;
  nombre?: string;
  /** Una línea: qué pasó. */
  resumen: string;
  /** Por qué hace falta revisar (vacío si no hace falta). */
  motivos: string[];
  /** Pedido registrado al que se refiere, si lo hay. */
  idPedido?: string;
  /** Lo que escribió el cliente, para darle contexto a la operadora. */
  texto?: string;
}
