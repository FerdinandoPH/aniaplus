/**
 * Contenedor "BinLinker" de PKHeX: el formato de todos los `.pkl`.
 * Fuente: PKHeX.Core/Legality/Assets/BinLinkerAccessor{,16}.cs
 *
 *   [0..2)            magia ASCII de 2 bytes ("hs", "dp", "g4", ...)
 *   [2..4)            uint16 LE = número de entradas N
 *   [4 + w*i ..]      offsets (uint16 LE en la variante de 16 bits, uint32 LE en la de 32)
 *
 * Los offsets se solapan: la entrada `i` va de `offset[i]` a `offset[i+1]`, así que hay N+1
 * posiciones legibles. No hay compresión ni cifrado.
 */

export interface BinLinker {
  magic: string;
  count: number;
  entry(index: number): Uint8Array;
}

function open(data: Uint8Array, identifier: string, width: 2 | 4): BinLinker {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = String.fromCharCode(data[0]!, data[1]!);
  if (magic !== identifier) {
    throw new Error(`Magia BinLinker incorrecta: esperaba '${identifier}', encontré '${magic}'`);
  }
  const count = view.getUint16(2, true);
  const readOffset = (i: number) =>
    width === 2 ? view.getUint16(4 + i * 2, true) : view.getUint32(4 + i * 4, true);

  return {
    magic,
    count,
    entry(index: number): Uint8Array {
      if (index < 0 || index >= count) throw new RangeError(`Entrada ${index} fuera de rango (0..${count - 1})`);
      return data.subarray(readOffset(index), readOffset(index + 1));
    },
  };
}

/** Variante con offsets de 16 bits: learnsets, egg moves, evoluciones. */
export const openBinLinker16 = (data: Uint8Array, magic: string) => open(data, magic, 2);

/** Variante con offsets de 32 bits: `tutors_g4.pkl`, `hmtm_g3.pkl`. */
export const openBinLinker32 = (data: Uint8Array, magic: string) => open(data, magic, 4);
