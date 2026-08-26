/**
 * Formato de fichero para compartir pases (`.aniapass`).
 *
 * Se valoró usar el formato nativo del juego, `PbrPassData`. Se descartó tras decompilar su
 * rutina de E/S (`FUN_80161504` y `FUN_80162a90` en el DOL): la cabecera de 0x48 bytes no
 * contiene un checksum sino **banderas de progreso de la partida que creó el pase**, leídas del
 * área de progreso del guardado. Es decir, ata el fichero a un guardado concreto y no se puede
 * reproducir de forma independiente.
 *
 * Así que el contenedor es propio, pero **el contenido es el registro nativo del juego**: los
 * 0x6EC bytes exactos del pase. Convertirlo a `PbrPassData` en el futuro sería solo añadirle la
 * cabecera correspondiente.
 *
 *   offset  tam   contenido
 *   0x00    4     magia "ANIA"
 *   0x04    2     versión del formato (big-endian, como todo lo demás de PBR)
 *   0x06    2     número de pases que vienen a continuación
 *   0x08    2     reservado (0)
 *   0x0A    2     checksum del bloque de pases (suma de u16 BE, truncada)
 *   0x0C    n×0x6EC   los pases, tal cual están en el guardado
 */
import { SIZE_PASS } from '../core/constants.ts';
import { BattlePass } from '../core/pass.ts';

export const MAGIC = 'ANIA';
export const FORMAT_VERSION = 1;
const HEADER_SIZE = 0x0c;

function checksum(data: Uint8Array, start: number, length: number): number {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let sum = 0;
  for (let offset = start; offset + 1 < start + length; offset += 2) sum += view.getUint16(offset, false);
  return sum & 0xffff;
}

/** Empaqueta uno o varios pases en un fichero compartible. */
export function packPasses(passes: readonly BattlePass[]): Uint8Array {
  if (passes.length === 0) throw new Error('No hay pases que exportar');
  if (passes.length > 0xffff) throw new Error('Demasiados pases para un solo fichero');

  const out = new Uint8Array(HEADER_SIZE + passes.length * SIZE_PASS);
  const view = new DataView(out.buffer);

  for (let i = 0; i < MAGIC.length; i++) out[i] = MAGIC.charCodeAt(i);
  view.setUint16(0x04, FORMAT_VERSION, false);
  view.setUint16(0x06, passes.length, false);
  view.setUint16(0x08, 0, false);

  passes.forEach((pass, i) => out.set(pass.data, HEADER_SIZE + i * SIZE_PASS));
  view.setUint16(0x0a, checksum(out, HEADER_SIZE, passes.length * SIZE_PASS), false);
  return out;
}

export interface UnpackResult {
  version: number;
  passes: BattlePass[];
}

/** Lee un fichero `.aniapass`. Lanza con un mensaje concreto si algo no cuadra. */
export function unpackPasses(data: Uint8Array): UnpackResult {
  if (data.length < HEADER_SIZE) throw new Error('El fichero está truncado');

  const magic = String.fromCharCode(...data.subarray(0, 4));
  if (magic !== MAGIC) throw new Error(`No es un fichero de pases de ANIA+ (magia "${magic}")`);

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = view.getUint16(0x04, false);
  if (version > FORMAT_VERSION) {
    throw new Error(`El fichero usa la versión ${version} del formato; esta versión de ANIA+ llega a la ${FORMAT_VERSION}`);
  }

  const count = view.getUint16(0x06, false);
  const expectedLength = HEADER_SIZE + count * SIZE_PASS;
  if (data.length !== expectedLength) {
    throw new Error(`El fichero dice tener ${count} pases (${expectedLength} bytes) pero mide ${data.length}`);
  }

  const stored = view.getUint16(0x0a, false);
  const actual = checksum(data, HEADER_SIZE, count * SIZE_PASS);
  if (stored !== actual) throw new Error('El fichero está corrupto: el checksum no coincide');

  const passes: BattlePass[] = [];
  for (let i = 0; i < count; i++) {
    const start = HEADER_SIZE + i * SIZE_PASS;
    passes.push(new BattlePass(data.slice(start, start + SIZE_PASS)));
  }
  return { version, passes };
}

/** Nombre de fichero sugerido al exportar. */
export function suggestFileName(passes: readonly BattlePass[]): string {
  if (passes.length === 1) {
    const name = passes[0]!.trainerName.replace(/[^\p{L}\p{N} _-]/gu, '').trim();
    return `${name === '' ? 'pase' : name}.aniapass`;
  }
  return `${passes.length}-pases.aniapass`;
}
