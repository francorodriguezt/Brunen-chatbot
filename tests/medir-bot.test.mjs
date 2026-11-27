import { describe, expect, it } from 'vitest';
import { interpretar } from '../src/interprete';
import { agrupar, detectarNegocio, informe, leerChat, medir, ocultar } from '../scripts/medir/nucleo.mjs';

// Chats ficticios, con los dos formatos de exportación de WhatsApp.
const ANDROID = `26/11/26, 09:01 - Los mensajes y las llamadas están cifrados de extremo a extremo.
26/11/26, 09:02 - Ana Prueba: Hola!
26/11/26, 09:02 - Ana Prueba: quiero 3 de 20 para mañana
26/11/26, 09:10 - Brunen: Anotado Ana
26/11/26, 11:30 - Ana Prueba: <Multimedia omitido>
26/11/26, 11:31 - Ana Prueba: mi dirección es Calle Falsa 1234 depto 502
y mi fono +56 9 1234 5678
26/11/26, 15:00 - Ana Prueba: oiga el agua venia rara`;

const IOS = `‎[26/11/26, 10:15:02] Beto Ejemplo: buenas, llegan a Maipú?
[26/11/26, 10:20:11] Brunen: No, lo sentimos
‎[26/11/26, 10:21:40] Beto Ejemplo: ‎audio omitido
[26/11/26, 10:22:05] Beto Ejemplo: y cuanto salen 2 de 20? beto@correo.cl`;

describe('leer un chat exportado de WhatsApp (D96)', () => {
  it('Android: autor, minuto y texto; une las líneas de un mismo mensaje y salta lo del sistema y los archivos', () => {
    const mensajes = leerChat(ANDROID);
    expect(mensajes.map((m) => m.autor)).toEqual(['Ana Prueba', 'Ana Prueba', 'Brunen', 'Ana Prueba', 'Ana Prueba']);
    expect(mensajes[3].texto).toBe('mi dirección es Calle Falsa 1234 depto 502\ny mi fono +56 9 1234 5678');
    expect(mensajes[0].minuto).toBe(Date.UTC(2026, 10, 26, 9, 2) / 60000);
  });

  it('iPhone: entre corchetes y con segundos; los audios no cuentan', () => {
    expect(leerChat(IOS).map((m) => [m.autor, m.texto])).toEqual([
      ['Beto Ejemplo', 'buenas, llegan a Maipú?'],
      ['Brunen', 'No, lo sentimos'],
      ['Beto Ejemplo', 'y cuanto salen 2 de 20? beto@correo.cl'],
    ]);
  });
});

describe('iPhone en español, con guiones y "a. m." (D103)', () => {
  // Así exporta el iPhone de Brunen: fecha con guiones, segundos y "a. m."/"p. m." con espacios finos.
  const IOS_ES = '\u200e[28-10-26, 11:29:42\u202fa.\u00a0m.] Cata Ficticia: Hola\n[28-10-26, 1:05:10\u202fp.\u00a0m.] Brunen Spa: Hola, ¿cuántos necesitas?';
  it('lee el autor, el texto y la hora de la tarde', () => {
    const mensajes = leerChat(IOS_ES);
    expect(mensajes.map((m) => [m.autor, m.texto])).toEqual([['Cata Ficticia', 'Hola'], ['Brunen Spa', 'Hola, ¿cuántos necesitas?']]);
    expect(mensajes[1].minuto).toBe(Date.UTC(2026, 9, 28, 13, 5) / 60000);
  });

  it('salta el aviso de cifrado y "Esperando el mensaje", y quita la marca de un archivo al final del texto', () => {
    const chat = [
      '[28-10-26, 11:29:40] Cata Ficticia: Los mensajes y las llamadas están cifrados de extremo a extremo. Solo las personas en este chat pueden leerlos.',
      '[28-10-26, 11:29:41] Cata Ficticia: Esperando el mensaje. Esto puede tomar tiempo.',
      '[28-10-26, 11:29:42] Cata Ficticia: Aquí le dejo el pago imagen omitida',
    ].join('\n');
    expect(leerChat(chat).map((m) => m.texto)).toEqual(['Aquí le dejo el pago']);
  });
});

describe('quién es el negocio y qué escribió el cliente (D96)', () => {
  it('lo que responde a una pregunta por sus datos se marca: no se mide ni se muestra (D97)', () => {
    const chat = leerChat(`26/11/26, 09:00 - Ana Prueba: quiero 2 de 20
26/11/26, 09:01 - Brunen: ¿Me das tu nombre y tu dirección con comuna?
26/11/26, 09:05 - Ana Prueba: juan perez los aromos 1234 ñuñoa
26/11/26, 09:30 - Ana Prueba: gracias`);
    expect(agrupar(chat, new Set(['Brunen'])).map((g) => [g.texto, g.respondeADatos])).toEqual([
      ['quiero 2 de 20', false],
      ['juan perez los aromos 1234 ñuñoa', true],
      ['gracias', false],
    ]);
  });

  it('con dos o más chats, el negocio es quien aparece en todos', () => {
    expect(detectarNegocio([leerChat(ANDROID), leerChat(IOS)])).toEqual(['Brunen']);
    expect(detectarNegocio([leerChat(ANDROID)])).toEqual([]);
  });

  it('junta los mensajes seguidos del cliente (hasta 1 minuto entre uno y otro), como hace el bot', () => {
    const grupos = agrupar(leerChat(ANDROID), new Set(['Brunen']));
    expect(grupos.every((g) => !g.respondeADatos)).toBe(true);
    expect(grupos.map((g) => g.texto)).toEqual(['Hola!\nquiero 3 de 20 para mañana', 'mi dirección es Calle Falsa 1234 depto 502\ny mi fono +56 9 1234 5678', 'oiga el agua venia rara']);
  });
});

describe('ocultar lo que identifica a alguien (D96)', () => {
  it('teléfonos, correos, RUT, enlaces, nombres de los autores, direcciones y números de depto', () => {
    const nombres = ['Ana Prueba', 'Beto Ejemplo'];
    expect(ocultar('mi dirección es Calle Falsa 1234 depto 502\ny mi fono +56 9 1234 5678', nombres)).toBe(
      'mi dirección es [DIRECCIÓN] depto [N]\ny mi fono [TELÉFONO]',
    );
    expect(ocultar('soy Ana, rut 12.345.678-9, beto@correo.cl https://maps.app.goo.gl/abc', nombres)).toBe('soy [NOMBRE], rut [RUT], [CORREO] [ENLACE]');
    expect(ocultar('Pasaje Los Aromos 45, Ñuñoa', nombres)).toBe('[DIRECCIÓN], Ñuñoa');
    // Escritas en minúscula, con avenida, pasaje o casa, y el nombre que dice el mismo mensaje (D97).
    expect(ocultar('soy juan perez, los aromos 1234 depto 52, ñuñoa', nombres)).toBe('soy [NOMBRE], [DIRECCIÓN] depto [N], ñuñoa');
    expect(ocultar('av. grecia 2001 casa 4', nombres)).toBe('[DIRECCIÓN] casa [N]');
    expect(ocultar('pasaje el roble #45', nombres)).toBe('[DIRECCIÓN]');
    expect(ocultar('calle 5 de abril 345', nombres)).toContain('[DIRECCIÓN]');
    expect(ocultar('me llamo Rosa Muñoz', nombres)).toBe('me llamo [NOMBRE]');
    // Lo que sirve para probar el bot queda: cantidades, tamaños, comunas, fechas y horas.
    expect(ocultar('llegan a las 12? quiero 40 bidones, 2 de 20 para la casa 3 de 12', nombres)).toBe('llegan a las 12? quiero 40 bidones, 2 de 20 para la casa 3 de 12');
    expect(ocultar('quiero 3 de 20 para el Viernes 28, a Las Condes', nombres)).toBe('quiero 3 de 20 para el Viernes 28, a Las Condes');
  });
});

describe('medir cuánto entiende el bot (D96)', () => {
  it('cuenta por intención y deja los no entendidos ocultos, para revisarlos', () => {
    const negocio = new Set(['Brunen']);
    const grupos = [...agrupar(leerChat(ANDROID), negocio), ...agrupar(leerChat(IOS), negocio), { texto: 'juan perez los aromos 1234', respondeADatos: true }];
    const medicion = medir(grupos, interpretar, ['Ana Prueba', 'Beto Ejemplo']);
    expect(medicion.total).toBe(5);
    expect(medicion.porIntencion.get('pedido')).toBe(1);
    expect(medicion.porIntencion.get('pregunta')).toBe(2);
    expect(medicion.revisar).toHaveLength(medicion.porIntencion.get('desconocido'));
    expect(medicion.revisar[0]).toBe('mi dirección es [DIRECCIÓN] depto [N]\ny mi fono [TELÉFONO]');
    const texto = informe(medicion);
    expect(texto).toContain('Mensajes del cliente: 5');
    expect(medicion.respuestasADatos).toBe(1);
    expect(texto).toContain('Respuestas a una pregunta por sus datos (no se miden ni se muestran): 1');
    expect(texto).not.toContain('aromos');
    expect(texto).not.toContain('1234');
    expect(texto).not.toContain('Ana');
  });
});
