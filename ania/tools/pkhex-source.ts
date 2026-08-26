/**
 * Lectura de las tablas que PKHeX tiene *hardcodeadas* en C# (no hay fichero binario para ellas).
 *
 * En vez de transcribirlas a mano —92 TM, 52 tutores, ~300 objetos: garantía de erratas—
 * se parsean del propio fuente. Así, si algún día se actualiza PKHeX, basta con volver a
 * ejecutar el extractor.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PKHEX_ROOT = join(import.meta.dirname, '..', '..', 'PKHeX-master', 'PKHeX.Core');

function read(relative: string): string {
  return readFileSync(join(PKHEX_ROOT, relative), 'utf8');
}

/** Elimina comentarios `//` de línea y `/* *\/` de bloque, para no confundir al parser. */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Extrae `... Nombre => [ 1, 2, 3, ];` de un fichero C#.
 * Acepta enteros con ceros a la izquierda (PKHeX escribe `006`) y referencias `(int)Move.Cut`.
 */
export function parseArray(relative: string, name: string, resolve?: (token: string) => number): number[] {
  const src = read(relative);
  const re = new RegExp(`\\b${name}\\s*(?:=>|=)\\s*\\[([^\\]]*)\\]`);
  const m = re.exec(src);
  if (!m) throw new Error(`No se encontró la tabla '${name}' en ${relative}`);

  const body = stripComments(m[1]!);
  const out: number[] = [];
  for (const raw of body.split(',')) {
    const token = raw.trim();
    if (token.length === 0) continue;
    if (/^\d+$/.test(token)) {
      out.push(Number.parseInt(token, 10)); // parseInt, no Number(): '006' es decimal, no octal
    } else if (resolve) {
      out.push(resolve(token));
    } else {
      throw new Error(`Token no numérico en '${name}': ${token}`);
    }
  }
  return out;
}

/**
 * Valores del enum `Move`. Los miembros son implícitos (autoincremento desde 0), con algún
 * `= N` explícito por medio, así que hay que llevar un contador.
 */
export function parseMoveEnum(): Map<string, number> {
  const src = stripComments(read('Game/Enums/Move.cs'));
  const bodyStart = src.indexOf('{', src.indexOf('enum Move'));
  const body = src.slice(bodyStart + 1, src.indexOf('\n}', bodyStart));

  const map = new Map<string, number>();
  let next = 0;
  for (const line of body.split('\n')) {
    const m = /^\s*([A-Za-z_]\w*)\s*(?:=\s*(\d+)\s*)?,/.exec(line);
    if (!m) continue;
    const value = m[2] !== undefined ? Number.parseInt(m[2], 10) : next;
    map.set(m[1]!, value);
    next = value + 1;
  }
  return map;
}

/** Resolutor para tokens `(int)Move.Cut` dentro de las tablas de MO/MT. */
export function makeMoveResolver(moves: Map<string, number>) {
  return (token: string): number => {
    const m = /^\(int\)Move\.(\w+)$/.exec(token);
    if (!m) throw new Error(`Token no reconocido: ${token}`);
    const value = moves.get(m[1]!);
    if (value === undefined) throw new Error(`Move.${m[1]} no está en el enum`);
    return value;
  };
}

/**
 * Tabla de caracteres de Gen 4 (`StringConverter4Util.TableINT`): el índice es el valor
 * codificado y el contenido el carácter Unicode. Es un array de literales `char` de C#,
 * con `NUL` como primer elemento.
 *
 * No se extrae `TableKOR` (coreano, a partir de 0x400): PBR PAL no lo usa.
 */
export function parseG4CharTable(): string[] {
  const src = read('PKM/Strings/StringConverter4Util.cs');
  const start = src.indexOf('TableINT =>');
  const open = src.indexOf('[', start);
  const close = src.indexOf('];', open);
  const body = stripComments(src.slice(open + 1, close));

  const table: string[] = [];
  // Literales `'x'`, `'\''`, y las constantes con nombre de StringConverter4Util:
  //   NUL = terminador (0xFFFF); EMP = hueco sin tecla en el teclado del juego, también NUL.
  //   HGM/HGF son U+246D/U+246E, NO ♂/♀ — PKHeX solo los convierte a ♂/♀ al mostrarlos
  //   (NormalizeGenderSymbol). Guardamos el valor interno para no romper el round-trip.
  const re = /'((?:\\.|[^'\\])+)'|\b(NUL|EMP|HGM|HGF)\b/g;
  const named: Record<string, string> = {
    NUL: '\uFFFF',
    EMP: '\uFFFF',
    HGM: '\u246D',
    HGF: '\u246E',
  };
  for (let m = re.exec(body); m !== null; m = re.exec(body)) {
    if (m[2] !== undefined) {
      table.push(named[m[2]]!);
    } else {
      const lit = m[1]!;
      table.push(lit.startsWith('\\') ? lit.slice(1) : lit);
    }
  }
  return table;
}

/** Fichero de texto de PKHeX: una entrada por línea, el número de línea es el ID. */
export function readTextList(relative: string): string[] {
  return read(relative).replace(/\r/g, '').split('\n');
}

export function readBinary(relative: string): Uint8Array {
  return new Uint8Array(readFileSync(join(PKHEX_ROOT, relative)));
}
