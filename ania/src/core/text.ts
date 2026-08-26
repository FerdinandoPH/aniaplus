/**
 * Las dos codificaciones de texto que conviven en un guardado de PBR.
 *
 *  (a) Perfil y pases: UTF-16 big-endian directo, con secuencias de escape que empiezan por
 *      0xFFFF. Terminador `0x0000` en texto escrito por el usuario, `0xFFFF 0xFFFF` en el
 *      texto nativo del juego. El relleno sobrante es 0xFFFF.
 *  (b) Mote y nombre del OT dentro de un BK4: tabla de caracteres de Gen 4, también en
 *      big-endian, con terminador 0xFFFF.
 *
 * Referencias: StringConverter4GC.cs (región PBR) y StringConverter4Util.cs
 */
import g4chars from '../data/pkhex/g4chars.json' with { type: 'json' };

const TERMINATOR = 0xffff;
const VARIABLE = 0xffff;

/** Marcadores propios para representar los escapes del juego como texto editable. */
export const LINE_BREAK = '⏎'; // ⏎
export const PROPORTIONAL = '￼'; // ￼ — fuente proporcional
export const POKEMON_NAME = 'Ⓟ'; // Ⓟ — variable "nombre del Pokémon"

const ESCAPE_TO_MARKER = new Map<number, string>([
  [0xfffe, LINE_BREAK],
  [0x0013, PROPORTIONAL],
  [0x0015, POKEMON_NAME],
]);
const MARKER_TO_ESCAPE = new Map<string, number>([...ESCAPE_TO_MARKER].map(([k, v]) => [v, k]));

// --------------------------------------------------------- (a) UTF-16 BE del guardado

/** Lee una cadena del perfil o de un pase. `length` es en bytes. */
export function decodeSaveString(data: Uint8Array, offset: number, length: number): string {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let out = '';
  for (let i = 0; i < length; i += 2) {
    const value = view.getUint16(offset + i, false);
    if (value === 0x0000) break;
    if (value === VARIABLE) {
      i += 2;
      if (i >= length) break;
      const next = view.getUint16(offset + i, false);
      if (next === TERMINATOR) break; // FFFF FFFF: terminador nativo
      const marker = ESCAPE_TO_MARKER.get(next);
      if (marker !== undefined) {
        out += marker;
      } else {
        // Pareja no reconocida: se conserva tal cual para no perder información.
        out += String.fromCharCode(value, next);
      }
      continue;
    }
    out += String.fromCharCode(value);
  }
  return out;
}

/**
 * Escribe una cadena en el perfil o en un pase, rellenando el resto con 0xFFFF igual que hace
 * el juego. Si el texto no cabe entero, se recorta (siempre queda hueco para el terminador).
 */
export function encodeSaveString(data: Uint8Array, offset: number, length: number, value: string): void {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const units: number[] = [];
  for (const ch of value) {
    const escape = MARKER_TO_ESCAPE.get(ch);
    if (escape !== undefined) units.push(VARIABLE, escape);
    else units.push(ch.charCodeAt(0));
  }

  const maxUnits = length / 2 - 1; // reservamos sitio para el terminador
  const written = Math.min(units.length, maxUnits);
  for (let i = 0; i < written; i++) view.setUint16(offset + i * 2, units[i]!, false);
  view.setUint16(offset + written * 2, 0x0000, false);
  for (let i = written + 1; i < length / 2; i++) view.setUint16(offset + i * 2, TERMINATOR, false);
}

// ------------------------------------------------------ (b) tabla Gen 4 de los BK4

const CHAR_TO_G4 = new Map<string, number>();
for (let i = g4chars.length - 1; i >= 0; i--) {
  // Recorrido descendente para que, ante duplicados, gane el índice más bajo (como IndexOf).
  const ch = g4chars[i]!;
  if (ch !== '￿') CHAR_TO_G4.set(ch, i);
}
/** '?' — lo que PKHeX escribe cuando un carácter no existe en la tabla de Gen 4. */
const INVALID_AS = 0x1ac;

/** ♂/♀ tienen un punto de código propio en la tabla; se normalizan solo para mostrarlos. */
function normalizeGender(ch: string): string {
  if (ch === '⑭') return '♂';
  if (ch === '⑮') return '♀';
  return ch;
}

/** Lee el mote o el nombre del OT de un BK4. `length` es en bytes. */
export function decodeG4String(data: Uint8Array, offset: number, length: number): string {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let out = '';
  for (let i = 0; i < length; i += 2) {
    const value = view.getUint16(offset + i, false);
    if (value === TERMINATOR) break;
    const ch = g4chars[value];
    if (ch === undefined || ch === '￿') break; // fuera de tabla (p. ej. coreano)
    out += normalizeGender(ch);
  }
  return out;
}

/** Escribe el mote o el nombre del OT de un BK4, rellenando con 0xFFFF. */
export function encodeG4String(
  data: Uint8Array,
  offset: number,
  length: number,
  value: string,
  maxChars: number,
): void {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const chars = [...value].slice(0, maxChars);
  let i = 0;
  for (const ch of chars) {
    const denormalized = ch === '♂' ? '⑭' : ch === '♀' ? '⑮' : ch;
    const raw = CHAR_TO_G4.get(denormalized) ?? (ch === '’' ? 0x1b3 : INVALID_AS);
    view.setUint16(offset + i * 2, raw, false);
    i++;
  }
  for (; i < length / 2; i++) view.setUint16(offset + i * 2, TERMINATOR, false);
}
