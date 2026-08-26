/**
 * Constantes del guardado de Pokémon Battle Revolution.
 * Todos los enteros multi-byte del formato son BIG-ENDIAN.
 */
import type { Lang } from '../data/index.ts';

// ------------------------------------------------------------------ guardado

/** Tamaño exacto de `PbrSaveData`. Un fichero de otro tamaño no es un guardado de PBR. */
export const SIZE_SAVE = 0x380000;
/** Cada guardado contiene dos particiones completas; la buena se elige por contador. */
export const SIZE_PARTITION = 0x1c0000;
/** Cada partición contiene 4 perfiles de jugador. */
export const SIZE_SLOT = 0x6ff00;
export const SLOT_COUNT = 4;

/** Los 8 primeros bytes de cada partición son las claves de cifrado, en claro. */
export const KEY_SIZE = 8;

/** Los dos checksums de cada partición: [inicio de región, longitud, offset destino]. */
export const CHECKSUM_REGIONS = [
  { start: 0x000000, length: 0x000100, target: 0x000008 },
  { start: 0x000000, length: SIZE_PARTITION, target: SIZE_PARTITION - 0x80 },
] as const;
/** 16 acumuladores u32 = 64 bytes. */
export const CHECKSUM_SIZE = 64;

// ------------------------------------------------ offsets dentro de un perfil

export const SLOT = {
  saveCount: 0x4c,
  /** Bit 0 **negado**: si está a 0, la partida es japonesa. */
  japaneseFlag: 0x57,
  language: 0x384,
  playTime: 0x388,
  trainerName: 0x390,
  trainerNameLength: 16,
  birthMonth: 0x3b0,
  birthDay: 0x3b8,
  country: 0x3c0,
  region: 0x3c2,
  selfIntroduction: 0x3c4,
  selfIntroductionLength: 0x6c,
  party: 0x44c,
  boxes: 0x978,
  gearUnlock: 0x584ec,
  gearUnlockLength: 0xc0,
  boxNames: 0x58674,
  boxNameLength: 0x28,
  /** Bits de coliseos desbloqueados (ver `COLOSSEUM_UNLOCK`). */
  unlockLow: 0x12888,
  unlockHigh: 0x12889,
  postGame: 0x12891,
} as const;

export const BOX_COUNT = 18;
export const BOX_SLOT_COUNT = 30;
export const PARTY_COUNT = 6;

/** `[byte, bit]` de cada coliseo. El juego los va desbloqueando al progresar. */
export const COLOSSEUM_UNLOCK = {
  gateway: [SLOT.unlockHigh, 4],
  mainStreet: [SLOT.unlockHigh, 5],
  waterfall: [SLOT.unlockHigh, 6],
  neon: [SLOT.unlockHigh, 7],
  crystal: [SLOT.unlockLow, 0],
  sunnyPark: [SLOT.unlockLow, 1],
  magma: [SLOT.unlockLow, 2],
  courtyard: [SLOT.unlockLow, 3],
  sunset: [SLOT.unlockLow, 4],
  stargazer: [SLOT.unlockLow, 5],
} as const satisfies Record<string, readonly [number, number]>;

// ------------------------------------------------------------------- Pokémon

/** BK4 "stored": 136 bytes. */
export const SIZE_STORED = 136;
/** BK4 "party" dentro del guardado: 136 + 84. */
export const SIZE_PARTY = 220;
/** Entrada de Pokémon dentro de un pase: 136 de BK4 + Box + Slot + u16 de flags. */
export const SIZE_PASS_POKE = 140;

// --------------------------------------------------------------------- pases

export const SIZE_PASS = 0x6ec;

/** Los 187 pases del perfil viven en tres bancos no contiguos. */
export const PASS_BANKS = [
  { start: 0, end: 159, offset: 0x13858 },
  { start: 159, end: 171, offset: 0x58db8 },
  { start: 171, end: 187, offset: 0x5f578 },
] as const;
export const PASS_COUNT = 187;

export const PASS = {
  sid: 0x00,
  tid: 0x02,
  name: 0x04,
  nameLength: 0x18,
  trainerTitle: 0x1c,
  presetFlags: 0x1e,
  model: 0x21,
  head: 0x22,
  hair: 0x23,
  face: 0x24,
  top: 0x25,
  bottom: 0x26,
  shoes: 0x27,
  hands: 0x28,
  bag: 0x29,
  glasses: 0x2a,
  badge: 0x2b,
  greeting: 0x2c,
  sentOut: 0x60,
  shift1: 0x98,
  shift2: 0xcc,
  win: 0x100,
  lose: 0x168,
  unknown1ec: 0x1ec,
  skin: 0x1ee,
  presetIndexes: 0x1f0,
  party: 0x1fc,
  /** bit 0 = tipo de foto; bits 1-7 = diseño del pase. */
  designByte: 0x544,
  /** bit 3 Available, bit 4 Issued, bit 6 Rental, bit 7 Friend. */
  statusByte: 0x545,
  creatorName: 0x548,
  creatorNameLength: 0x20,
  birthMonth: 0x568,
  birthDay: 0x570,
  country: 0x578,
  region: 0x57a,
  selfIntroduction: 0x57c,
  selfIntroductionLength: 0x6c,
  battles: 0x5e8,
  regionCode: 0x5ed,
  recordColosseum: 0x6c4,
  recordFree: 0x6c8,
  recordWiFi: 0x6cc,
  recordClears: 0x6d0,
  playerId: 0x6dc,
  language: 0x6e6,
} as const;

/**
 * Las seis frases, en el orden en que el juego guarda sus banderas y sus índices.
 *
 * Ese orden es el que da la posición de cada una: bandera de "frase de fábrica" en el bit `i + 1`
 * de `PASS.presetFlags`, e índice de frase en `PASS.presetIndexes + 2 * i`.
 */
export const PHRASE_ORDER = ['greeting', 'sentOut', 'shift1', 'shift2', 'win', 'lose'] as const;
export type PhraseName = (typeof PHRASE_ORDER)[number];

/** Longitudes de las frases del entrenador, en bytes. */
export const PHRASE_LENGTHS = {
  greeting: 0x34,
  sentOut: 0x38,
  shift1: 0x34,
  shift2: 0x34,
  win: 0x68,
  lose: 0x68,
} as const;

export const PASS_STATUS_BIT = { available: 3, issued: 4, rental: 6, friend: 7 } as const;

/**
 * Tipo de pase por índice. Los cortes de Custom y Download dependen del idioma:
 * en japonés hay 32 Custom y 30 Download en vez de 37 y 25.
 */
export function passTypeAt(index: number, japanese = false): PassType {
  const custom = japanese ? 32 : 37;
  const rental = custom + 6;
  const friend = rental + 61;
  if (index < custom) return 'custom';
  if (index < rental) return 'rental';
  if (index < friend) return 'friend';
  if (index < 129) return 'download';
  if (index < 159) return 'other1';
  if (index < 171) return 'other2';
  return 'other3';
}

export type PassType = 'custom' | 'rental' | 'friend' | 'download' | 'other1' | 'other2' | 'other3';

/** Byte de offset del pase `index` dentro del perfil. */
export function passOffset(index: number): number {
  for (const bank of PASS_BANKS) {
    if (index >= bank.start && index < bank.end) {
      return bank.offset + (index - bank.start) * SIZE_PASS;
    }
  }
  throw new RangeError(`Índice de pase fuera de rango: ${index}`);
}

/** Idioma del pase (orden distinto al del perfil, cuidado). */
export const PASS_LANGUAGE = ['ja', 'en', 'de', 'fr', 'es', 'it'] as const;

/**
 * Idioma del perfil, por el byte `0x384` (`LanguageBR` en PKHeX).
 *
 * El 0 no dice si es japonés o inglés: un guardado americano y uno japonés valen los dos 0 ahí, y
 * la única forma de separarlos es la bandera de juego japonés. Por eso la entrada 0 de esta tabla
 * es solo un valor de reserva, y quien resuelve de verdad es `PbrSave.language`.
 */
export const SAVE_LANGUAGE_JP_OR_EN = 0;
export const SAVE_LANGUAGE = ['en', 'de', 'es', 'fr', 'it'] as const satisfies readonly Lang[];
