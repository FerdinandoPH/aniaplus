/**
 * Cifrado "Genius Sonority" del guardado de PBR (el mismo de Pokémon XD).
 *
 * NO es una permutación: es un cifrado aditivo sobre u16 big-endian. Los 8 primeros bytes de
 * cada partición son 4 claves u16 en claro; el resto se descifra restando la clave que toca
 * y avanzando el juego de claves cada 4 valores (8 bytes).
 *
 * Referencia: PKHeX.Core/Saves/Encryption/Gen3/GeniusCrypto.cs
 */
import { KEY_SIZE, SIZE_PARTITION } from './constants.ts';

/**
 * Avance del juego de claves: sesga cada u16 con una constante distinta y luego rota los
 * grupos de 4 bits a través de la diagonal.
 *
 * Ojo al reimplementar: en C# las sumas se hacen sobre `int` sin truncar a 16 bits, y son las
 * máscaras las que descartan el desbordamiento. En JavaScript los operadores de bits trabajan
 * sobre enteros de 32 bits con signo, así que el comportamiento coincide siempre que NO se
 * enmascare a 0xFFFF antes de aplicar las máscaras.
 */
export function advanceKeys(keys: Uint16Array): void {
  const k0 = keys[0]! + 0x43;
  const k1 = keys[1]! + 0x29;
  const k2 = keys[2]! + 0x17;
  const k3 = keys[3]! + 0x13;

  keys[3] = ((k0 >> 12) & 0xf) | ((k1 >> 8) & 0xf0) | ((k2 >> 4) & 0xf00) | (k3 & 0xf000);
  keys[2] = ((k0 >> 8) & 0xf) | ((k1 >> 4) & 0xf0) | (k2 & 0xf00) | ((k3 << 4) & 0xf000);
  keys[1] = ((k0 >> 4) & 0xf) | (k1 & 0xf0) | ((k2 << 4) & 0xf00) | ((k3 << 8) & 0xf000);
  keys[0] = (k0 & 0xf) | ((k1 << 4) & 0xf0) | ((k2 << 8) & 0xf00) | ((k3 << 12) & 0xf000);
}

function crypt(data: Uint8Array, base: number, encrypt: boolean): void {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const keys = new Uint16Array(4);
  for (let i = 0; i < 4; i++) keys[i] = view.getUint16(base + i * 2, false);

  const end = base + SIZE_PARTITION;
  for (let offset = base + KEY_SIZE; offset < end; ) {
    for (let j = 0; j < 4; j++, offset += 2) {
      const value = view.getUint16(offset, false);
      view.setUint16(offset, (encrypt ? value + keys[j]! : value - keys[j]!) & 0xffff, false);
    }
    advanceKeys(keys);
  }
}

/** Descifra in situ la partición que empieza en `base`. */
export const decryptPartition = (data: Uint8Array, base: number): void => crypt(data, base, false);

/** Cifra in situ la partición que empieza en `base`. */
export const encryptPartition = (data: Uint8Array, base: number): void => crypt(data, base, true);
