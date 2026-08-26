/**
 * Checksums del guardado de PBR.
 *
 * NO son un CRC. Son 16 contadores de población de bits: `checksum[i]` es cuántos de los u16
 * big-endian de la región tienen el bit `i` a 1. Se escriben como 16 u32 big-endian (64 bytes).
 *
 * Referencia: PKHeX.Core/Saves/SAV4BR.cs (ComputeChecksums / SetChecksum / VerifyChecksum)
 */
import { CHECKSUM_REGIONS, CHECKSUM_SIZE } from './constants.ts';

/** Cuenta los bits a 1 en cada una de las 16 posiciones, sobre los u16 BE de la región. */
export function computeChecksums(data: Uint8Array, start: number, length: number): Uint32Array {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const counts = new Uint32Array(16);
  for (let offset = start; offset < start + length; offset += 2) {
    let value = view.getUint16(offset, false);
    // Recorre solo los bits presentes en lugar de las 16 posiciones siempre.
    while (value !== 0) {
      const bit = value & -value;
      counts[31 - Math.clz32(bit)]! += 1;
      value ^= bit;
    }
  }
  return counts;
}

function writeChecksum(data: Uint8Array, base: number, region: (typeof CHECKSUM_REGIONS)[number]): void {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // El destino tiene que estar a cero mientras se calcula: forma parte de la región cubierta.
  data.fill(0, base + region.target, base + region.target + CHECKSUM_SIZE);
  const counts = computeChecksums(data, base + region.start, region.length);
  for (let i = 0; i < 16; i++) view.setUint32(base + region.target + i * 4, counts[i]!, false);
}

/**
 * Recalcula los dos checksums de la partición.
 *
 * El orden importa: el checksum grande cubre la partición entera, incluidos los bytes del
 * pequeño, así que el pequeño tiene que estar ya escrito cuando se calcula el grande.
 */
export function setChecksums(data: Uint8Array, base: number): void {
  for (const region of CHECKSUM_REGIONS) writeChecksum(data, base, region);
}

/** Comprueba los dos checksums de la partición sin modificarla. */
export function verifyChecksums(data: Uint8Array, base: number): boolean {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (const region of CHECKSUM_REGIONS) {
    const stored = data.slice(base + region.target, base + region.target + CHECKSUM_SIZE);
    data.fill(0, base + region.target, base + region.target + CHECKSUM_SIZE);
    const counts = computeChecksums(data, base + region.start, region.length);
    data.set(stored, base + region.target);

    for (let i = 0; i < 16; i++) {
      if (view.getUint32(base + region.target + i * 4, false) !== counts[i]) return false;
    }
  }
  return true;
}
