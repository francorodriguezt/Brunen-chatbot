import { describe, expect, it } from 'vitest';
import { leerDatosDelCliente, leerEdificio } from '../src/datos';

// Todo ficticio. Casos de lo que un cliente nuevo contesta cuando el bot le pide su nombre y su dirección (D37).

describe('leerDatosDelCliente: nombre, dirección y comuna', () => {
  it('separa el nombre cuando va primero, separado por coma', () => {
    expect(leerDatosDelCliente('Juan Pérez, Los Leones 123, Providencia')).toEqual({
      nombre: 'Juan Pérez',
      direccion: 'Los Leones 123, Providencia',
      comuna: { nombre: 'Providencia', atendida: true },
      esDepartamento: false,
      tieneEdificio: false,
    });
  });

  it('separa el nombre cuando cada dato va en su línea (mensajes seguidos)', () => {
    expect(leerDatosDelCliente('Pedro Soto\nCalle Falsa 123\nMacul\nEdificio Torre Norte, depto 12')).toEqual({
      nombre: 'Pedro Soto',
      direccion: 'Calle Falsa 123, Macul, Edificio Torre Norte, depto 12',
      comuna: { nombre: 'Macul', atendida: true },
      esDepartamento: true,
      tieneEdificio: true,
    });
  });

  it('entiende "me llamo" y quita el relleno "vivo en"', () => {
    expect(leerDatosDelCliente('Me llamo Ana Torres, vivo en Av. Irarrázaval 2345 depto 502, Ñuñoa')).toEqual({
      nombre: 'Ana Torres',
      direccion: 'Av. Irarrázaval 2345 depto 502, Ñuñoa',
      comuna: { nombre: 'Ñuñoa', atendida: true },
      esDepartamento: true,
      tieneEdificio: false,
    });
  });

  it('el nombre termina antes de "y vivo en" aunque todo vaya en una sola frase', () => {
    expect(leerDatosDelCliente('Soy María González y vivo en Pasaje Los Alerces 45, La Reina')).toMatchObject({
      nombre: 'María González',
      direccion: 'Pasaje Los Alerces 45, La Reina',
      comuna: { nombre: 'La Reina', atendida: true },
    });
  });

  it('sin una forma segura de separar el nombre, lo deja vacío y conserva todo lo escrito', () => {
    expect(leerDatosDelCliente('Los Leones 123 Providencia')).toMatchObject({ nombre: '', direccion: 'Los Leones 123 Providencia' });
    // Una calle sin número seguida de la comuna no es un nombre.
    expect(leerDatosDelCliente('Irarrázaval, Ñuñoa')).toMatchObject({ nombre: '', direccion: 'Irarrázaval, Ñuñoa' });
  });

  it('acepta solo la comuna', () => {
    expect(leerDatosDelCliente('Providencia')).toMatchObject({
      nombre: '',
      direccion: 'Providencia',
      comuna: { nombre: 'Providencia', atendida: true },
    });
  });

  it('reconoce una comuna fuera de zona', () => {
    expect(leerDatosDelCliente('Sofía Rojas, Camino Real 456, Maipú')?.comuna).toEqual({ nombre: 'Maipú', atendida: false });
  });

  it('ordena los espacios', () => {
    expect(leerDatosDelCliente('  Juan   Pérez ,  Los Leones   123 ,Providencia ')).toMatchObject({
      nombre: 'Juan Pérez',
      direccion: 'Los Leones 123, Providencia',
    });
  });

  it('ignora el saludo del principio y la cortesía del final', () => {
    expect(leerDatosDelCliente('Hola, soy Juan Pérez, vivo en Los Leones 123, depto 45, Providencia, gracias')).toMatchObject({
      nombre: 'Juan Pérez',
      direccion: 'Los Leones 123, depto 45, Providencia',
      esDepartamento: true,
    });
    expect(leerDatosDelCliente('Buenas tardes, Ana Torres, Av. Grecia 1000, Ñuñoa')).toMatchObject({
      nombre: 'Ana Torres',
      direccion: 'Av. Grecia 1000, Ñuñoa',
    });
  });

  it('quita las etiquetas "Dirección:" y "Comuna:" cuando las escriben', () => {
    expect(leerDatosDelCliente('Nombre: Luis Díaz\nDirección: Pasaje 5 #123\nComuna: Macul')).toMatchObject({
      nombre: 'Luis Díaz',
      direccion: 'Pasaje 5 #123, Macul',
      comuna: { nombre: 'Macul', atendida: true },
    });
  });

  it('un guion con espacios separa los datos igual que una coma', () => {
    expect(leerDatosDelCliente('Juan Pérez - Los Leones 123 - Providencia')).toMatchObject({
      nombre: 'Juan Pérez',
      direccion: 'Los Leones 123, Providencia',
    });
  });

  it('detecta el departamento y el edificio por separado', () => {
    expect(leerDatosDelCliente('Los Leones 123 dpto 45, Providencia')).toMatchObject({ esDepartamento: true, tieneEdificio: false });
    expect(leerDatosDelCliente('Los Leones 123, torre B, Providencia')).toMatchObject({ esDepartamento: false, tieneEdificio: true });
  });

  it.each([
    'gracias',
    'ok',
    'hola',
    '20',
    'de 20',
    'soy María',
    'no',
    'quiero 3 bidones de 20 litros',
    'cuánto cuesta el bidón de 12 L en Ñuñoa',
    'necesito 2 bidones para Providencia',
  ])('"%s" no es una dirección', (texto) => {
    expect(leerDatosDelCliente(texto)).toBeNull();
  });
});

describe('leerEdificio', () => {
  it.each([
    ['Torre Norte', 'Torre Norte'],
    ['Edificio Mirador', 'Mirador'],
    ['el edificio se llama Mirador del Sol', 'Mirador del Sol'],
    ['Condominio Los Robles', 'Condominio Los Robles'],
    ['Torre 3', 'Torre 3'],
  ])('"%s" -> "%s"', (texto, edificio) => {
    expect(leerEdificio(texto)).toBe(edificio);
  });

  it.each(['no', 'no sé', 'no tiene', 'no tengo edificio', 'es una casa', 'casa', 'nada', '', '   ', 'quiero 2 bidones de 20', 'un edificio muy muy muy muy largo de verdad', 'x'.repeat(41)])(
    '"%s" no es el nombre de un edificio',
    (texto) => {
      expect(leerEdificio(texto)).toBeNull();
    },
  );
});
