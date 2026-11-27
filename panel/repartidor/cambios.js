/**
 * Cambios de la ruta sin volver a publicarla (D102): un pedido confirmado después de publicar (va al final) o uno que
 * ya no va (cancelado o movido). La oficina no siempre vuelve a publicar, así que la app lo avisa igual, hasta que el
 * repartidor toque "Entendido". Funciones puras, para probarlas sin navegador.
 */

const quien = ({ nombre, comuna }) => {
  const n = String(nombre ?? '').trim() || 'un cliente';
  return comuna ? `${n} (${comuna})` : n;
};

function enLista(nombres) {
  if (nombres.length <= 1) return nombres.join('');
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
}

/** "Se agregó Ana (Ñuñoa) al final. Ya no va Pedro (Macul)." o '' si no hay cambios. */
export function textoDeCambios(cambios) {
  if (!cambios) return '';
  const agregadas = Array.isArray(cambios.agregadas) ? cambios.agregadas : [];
  const quitadas = Array.isArray(cambios.quitadas) ? cambios.quitadas : [];
  const partes = [];
  if (agregadas.length > 0) partes.push(`${agregadas.length === 1 ? 'Se agregó' : 'Se agregaron'} ${enLista(agregadas.map(quien))} al final.`);
  if (quitadas.length > 0) partes.push(`Ya no ${quitadas.length === 1 ? 'va' : 'van'} ${enLista(quitadas.map(quien))}.`);
  return partes.join(' ');
}

/** Lo que identifica estos cambios: si después cambia otra cosa, el aviso vuelve a salir. */
export function firmaDeCambios(fecha, cambios) {
  const texto = textoDeCambios(cambios);
  return texto ? `${fecha}|${texto}` : '';
}
