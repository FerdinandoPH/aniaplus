/**
 * BK4 — el formato de Pokémon exclusivo de Battle Revolution.
 *
 * Es un PK4 en big-endian y **solo permutado**: a diferencia de PK4 no lleva cifrado XOR.
 * Los 128 bytes de `[0x08, 0x88)` son 4 bloques de 32 que se reordenan según el PID.
 *
 * Cuidado con las diferencias respecto a PK4, que son fáciles de pasar por alto:
 *   - SID va en 0x0C y TID en 0x0E (al revés).
 *   - Los bytes de cintas van en orden inverso.
 *   - El desempaquetado de IVs está invertido.
 *
 * Referencias: PKHeX.Core/PKM/BK4.cs y PKM/Util/PokeCrypto.cs
 */
import { SIZE_STORED } from './constants.ts';
import { decodeG4String, encodeG4String } from './text.ts';

/** Orden de los 4 bloques para cada uno de los 24 valores de shuffle. */
const BLOCK_ORDER: readonly (readonly number[])[] = [
  [0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 1, 3], [0, 3, 1, 2], [0, 2, 3, 1], [0, 3, 2, 1],
  [1, 0, 2, 3], [1, 0, 3, 2], [2, 0, 1, 3], [3, 0, 1, 2], [2, 0, 3, 1], [3, 0, 2, 1],
  [1, 2, 0, 3], [1, 3, 0, 2], [2, 1, 0, 3], [3, 1, 0, 2], [2, 3, 0, 1], [3, 2, 0, 1],
  [1, 2, 3, 0], [1, 3, 2, 0], [2, 1, 3, 0], [3, 1, 2, 0], [2, 3, 1, 0], [3, 2, 1, 0],
];

/** Permutación inversa, para volver del orden lógico al almacenado. */
const BLOCK_ORDER_INVERT = [
  0, 1, 2, 4, 3, 5, 6, 7, 12, 18, 13, 19, 8, 10, 14, 20, 16, 22, 9, 11, 15, 21, 17, 23,
];

const BLOCK_SIZE = 32;
const BLOCK_START = 8;

function reorder(data: Uint8Array, order: readonly number[]): void {
  const source = data.slice(BLOCK_START, BLOCK_START + BLOCK_SIZE * 4);
  for (let i = 0; i < 4; i++) {
    const from = order[i]! * BLOCK_SIZE;
    data.set(source.subarray(from, from + BLOCK_SIZE), BLOCK_START + i * BLOCK_SIZE);
  }
}

/**
 * `sv` puede valer 0..31 aunque solo haya 24 permutaciones. PKHeX duplica las 8 primeras
 * entradas al final de la tabla para evitar el módulo; aquí se aplica directamente.
 */
function shuffleValue(data: Uint8Array): number {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return ((view.getUint32(0, false) >>> 13) & 31) % 24;
}

/** Pasa del orden almacenado al orden lógico (bloques A,B,C,D). */
export function unshuffleBK4(data: Uint8Array): void {
  reorder(data, BLOCK_ORDER[shuffleValue(data)]!);
}

/** Pasa del orden lógico al orden almacenado. */
export function shuffleBK4(data: Uint8Array): void {
  reorder(data, BLOCK_ORDER[BLOCK_ORDER_INVERT[shuffleValue(data)]! % 24]!);
}

/** Suma de los 64 u16 big-endian de `[0x08, 0x88)`, truncada a 16 bits. */
export function computeBK4Checksum(data: Uint8Array): number {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let sum = 0;
  for (let offset = 8; offset < SIZE_STORED; offset += 2) sum += view.getUint16(offset, false);
  return sum & 0xffff;
}

const STAT_ORDER = ['hp', 'atk', 'def', 'spe', 'spa', 'spd'] as const;
export type StatName = (typeof STAT_ORDER)[number];
export type Stats = Record<StatName, number>;

/**
 * Vista sobre un BK4 **ya en orden lógico** (es decir, tras `unshuffleBK4`).
 * No copia: escribe directamente sobre el buffer que se le pasa.
 */
export class BK4 {
  readonly data: Uint8Array;
  private readonly view: DataView;

  constructor(data: Uint8Array) {
    if (data.length < SIZE_STORED) throw new Error(`Un BK4 necesita al menos ${SIZE_STORED} bytes`);
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  /** Crea la vista a partir de datos en orden almacenado, deshaciendo la permutación. */
  static fromStored(stored: Uint8Array): BK4 {
    const copy = stored.slice();
    unshuffleBK4(copy);
    return new BK4(copy);
  }

  /** Devuelve una copia en orden almacenado, con el checksum ya actualizado. */
  toStored(): Uint8Array {
    this.refreshChecksum();
    const copy = this.data.slice(0, SIZE_STORED);
    shuffleBK4(copy);
    return copy;
  }

  get pid(): number { return this.view.getUint32(0x00, false); }
  set pid(v: number) { this.view.setUint32(0x00, v >>> 0, false); }

  /** bit 14 = descifrado en caja, bit 15 = descifrado en equipo. */
  get sanity(): number { return this.view.getUint16(0x04, false); }
  set sanity(v: number) { this.view.setUint16(0x04, v & 0xffff, false); }

  get checksum(): number { return this.view.getUint16(0x06, false); }
  refreshChecksum(): void { this.view.setUint16(0x06, computeBK4Checksum(this.data), false); }
  get checksumValid(): boolean { return this.checksum === computeBK4Checksum(this.data); }

  get species(): number { return this.view.getUint16(0x08, false); }
  set species(v: number) { this.view.setUint16(0x08, v, false); }

  get heldItem(): number { return this.view.getUint16(0x0a, false); }
  set heldItem(v: number) { this.view.setUint16(0x0a, v, false); }

  // Invertidos respecto a PK4: el secundario va primero.
  get sid(): number { return this.view.getUint16(0x0c, false); }
  set sid(v: number) { this.view.setUint16(0x0c, v, false); }
  get tid(): number { return this.view.getUint16(0x0e, false); }
  set tid(v: number) { this.view.setUint16(0x0e, v, false); }

  get exp(): number { return this.view.getUint32(0x10, false); }
  set exp(v: number) { this.view.setUint32(0x10, v >>> 0, false); }

  get friendship(): number { return this.data[0x14]!; }
  set friendship(v: number) { this.data[0x14] = v; }

  get ability(): number { return this.data[0x15]!; }
  set ability(v: number) { this.data[0x15] = v; }

  get language(): number { return this.data[0x17]!; }
  set language(v: number) { this.data[0x17] = v; }

  get evs(): Stats {
    return Object.fromEntries(STAT_ORDER.map((s, i) => [s, this.data[0x18 + i]!])) as Stats;
  }
  set evs(value: Stats) {
    STAT_ORDER.forEach((s, i) => { this.data[0x18 + i] = value[s]; });
  }

  get moves(): number[] {
    return [0, 1, 2, 3].map((i) => this.view.getUint16(0x28 + i * 2, false));
  }
  set moves(value: number[]) {
    for (let i = 0; i < 4; i++) this.view.setUint16(0x28 + i * 2, value[i] ?? 0, false);
  }

  get pp(): number[] { return [0, 1, 2, 3].map((i) => this.data[0x30 + i]!); }
  set pp(value: number[]) { for (let i = 0; i < 4; i++) this.data[0x30 + i] = value[i] ?? 0; }

  get ppUps(): number[] { return [0, 1, 2, 3].map((i) => this.data[0x34 + i]!); }
  set ppUps(value: number[]) { for (let i = 0; i < 4; i++) this.data[0x34 + i] = value[i] ?? 0; }

  /** Desempaquetado invertido respecto a PK4: SPD ocupa los bits bajos y HP los altos. */
  get ivs(): Stats {
    const packed = this.view.getUint32(0x38, false);
    return {
      hp: (packed >>> 27) & 0x1f,
      atk: (packed >>> 22) & 0x1f,
      def: (packed >>> 17) & 0x1f,
      spe: (packed >>> 12) & 0x1f,
      spa: (packed >>> 7) & 0x1f,
      spd: (packed >>> 2) & 0x1f,
    };
  }
  set ivs(value: Stats) {
    const flags = this.view.getUint32(0x38, false) & 0b11; // conserva IsNicknamed / IsEgg
    const packed =
      ((value.hp & 0x1f) * 2 ** 27 +
        ((value.atk & 0x1f) << 22) +
        ((value.def & 0x1f) << 17) +
        ((value.spe & 0x1f) << 12) +
        ((value.spa & 0x1f) << 7) +
        ((value.spd & 0x1f) << 2) +
        flags) >>>
      0;
    this.view.setUint32(0x38, packed, false);
  }

  get isNicknamed(): boolean { return (this.data[0x3b]! & 1) !== 0; }
  set isNicknamed(v: boolean) { this.data[0x3b] = (this.data[0x3b]! & ~1) | (v ? 1 : 0); }

  get isEgg(): boolean { return (this.data[0x3b]! & 2) !== 0; }

  /** bits 0-4 forma, bits 5-6 género, bit 7 encuentro fatídico. */
  get form(): number { return this.data[0x40]! & 0x1f; }
  set form(v: number) { this.data[0x40] = (this.data[0x40]! & ~0x1f) | (v & 0x1f); }
  get gender(): number { return (this.data[0x40]! >> 5) & 3; }
  set gender(v: number) { this.data[0x40] = (this.data[0x40]! & ~0x60) | ((v & 3) << 5); }

  get nickname(): string { return decodeG4String(this.data, 0x48, 22); }
  set nickname(v: string) { encodeG4String(this.data, 0x48, 22, v, 10); }

  get version(): number { return this.data[0x5f]!; }
  set version(v: number) { this.data[0x5f] = v; }

  get trainerName(): string { return decodeG4String(this.data, 0x68, 16); }
  set trainerName(v: string) { encodeG4String(this.data, 0x68, 16, v, 7); }

  get ball(): number { return this.data[0x83]!; }
  set ball(v: number) { this.data[0x83] = v; }

  get metLevel(): number { return this.data[0x84]! >> 1; }
  set metLevel(v: number) { this.data[0x84] = ((v & 0x7f) << 1) | (this.data[0x84]! & 1); }
  get trainerGender(): number { return this.data[0x84]! & 1; }
  set trainerGender(v: number) { this.data[0x84] = (this.data[0x84]! & ~1) | (v & 1); }

  /** La naturaleza en Gen 4 se deriva del PID. */
  get nature(): number { return this.pid % 25; }

  /** En Gen 4 la habilidad activa la elige el bit bajo del PID (no hay habilidad oculta). */
  get abilitySlot(): 0 | 1 { return (this.pid & 1) as 0 | 1; }

  get isShiny(): boolean {
    const pid = this.pid;
    return ((this.tid ^ this.sid ^ (pid >>> 16) ^ (pid & 0xffff)) & 0xfff8) === 0;
  }
}
