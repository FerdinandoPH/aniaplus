/**
 * `PbrSaveData` — el guardado completo de Pokémon Battle Revolution.
 *
 * Un fichero de 3,5 MB con dos particiones idénticas en estructura; el juego alterna entre
 * ellas y la buena es la que tiene el contador más alto con checksum válido.
 *
 * Referencia: PKHeX.Core/Saves/SAV4BR.cs
 */
import { BK4 } from './bk4.ts';
import { setChecksums, verifyChecksums } from './checksum.ts';
import {
  BOX_COUNT,
  BOX_SLOT_COUNT,
  COLOSSEUM_UNLOCK,
  PARTY_COUNT,
  PASS_COUNT,
  SAVE_LANGUAGE,
  SAVE_LANGUAGE_JP_OR_EN,
  SIZE_PARTITION,
  SIZE_PARTY,
  SIZE_PASS,
  SIZE_SAVE,
  SIZE_SLOT,
  SIZE_STORED,
  SLOT,
  SLOT_COUNT,
  passOffset,
  passTypeAt,
  type PassType,
} from './constants.ts';
import type { Lang } from '../data/index.ts';
import { decryptPartition, encryptPartition } from './genius.ts';
import { BattlePass } from './pass.ts';
import { decodeSaveString, encodeSaveString } from './text.ts';

export interface SlotSummary {
  index: number;
  trainerName: string;
  empty: boolean;
}

export class PbrSave {
  /** Contenido descifrado del fichero completo (las dos particiones). */
  readonly data: Uint8Array;
  private readonly view: DataView;
  /** Partición activa: la que el juego considera buena. */
  readonly partition: number;
  /**
   * ¿Es un guardado japonés? Es del **fichero**, no de cada perfil: un `PbrSaveData` pertenece a
   * un título (RPBP/RPBE/RPBJ) y los cuatro perfiles comparten juego. Ver `readJapanese`.
   */
  readonly japanese: boolean;
  /** Perfil seleccionado. Cambiable con `selectSlot`. */
  private slotIndex: number;

  private constructor(data: Uint8Array, partition: number, slot: number, japanese: boolean) {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.partition = partition;
    this.slotIndex = slot;
    this.japanese = japanese;
  }

  /**
   * Carga un `PbrSaveData`. Descifra las dos particiones y elige la activa.
   * Lanza si el fichero no es un guardado de PBR válido.
   */
  static load(raw: Uint8Array): PbrSave {
    if (raw.length !== SIZE_SAVE) {
      throw new Error(`Un guardado de PBR mide ${SIZE_SAVE} bytes, no ${raw.length}`);
    }
    const data = raw.slice();
    decryptPartition(data, 0);
    decryptPartition(data, SIZE_PARTITION);

    const partition = PbrSave.detectPartition(data);
    if (partition < 0) {
      throw new Error('Ninguna de las dos particiones tiene un checksum válido: el guardado está corrupto');
    }

    // Perfil por defecto: el primero que tenga nombre de entrenador.
    const base = partition * SIZE_PARTITION;
    let slot = 0;
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (decodeSaveString(data, base + i * SIZE_SLOT + SLOT.trainerName, SLOT.trainerNameLength) !== '') {
        slot = i;
        break;
      }
    }
    return new PbrSave(data, partition, slot, PbrSave.readJapanese(data, base, slot));
  }

  /**
   * De qué juego es el guardado, mirando el bit de `0x57` **del primer perfil estrenado**.
   *
   * El bit está negado —a 0 significa japonés— y ahí está la trampa: un perfil que nadie ha usado
   * tiene ese byte a cero, así que leerlo perfil a perfil hace pasar por japonés a cualquier ranura
   * vacía. Con un guardado americano de verdad se ve el destrozo: dos perfiles sin estrenar
   * salían como japoneses y, con ellos, 32 pases personalizados en vez de 37, que es una frontera
   * distinta dentro del mismo fichero.
   *
   * Se comprobó contra los tres guardados reales del proyecto, contrastándolo con los bits de
   * "alquiler" de los propios pases, que son la única fuente independiente de esta bandera:
   * PAL `0x11` y USA `0x11` (no japoneses, alquiler en 37-42), JAP `0x10` (japonés, 32-37).
   */
  private static readJapanese(data: Uint8Array, partitionBase: number, slot: number): boolean {
    return (data[partitionBase + slot * SIZE_SLOT + SLOT.japaneseFlag]! & 1) === 0;
  }

  /** ¿Es este buffer un guardado de PBR? No lanza. */
  static isValid(raw: Uint8Array): boolean {
    if (raw.length !== SIZE_SAVE) return false;
    const data = raw.slice();
    decryptPartition(data, 0);
    decryptPartition(data, SIZE_PARTITION);
    return PbrSave.detectPartition(data) >= 0;
  }

  /** Gana la partición 1 si su checksum es válido y (la 0 no lo es o su contador es mayor). */
  private static detectPartition(data: Uint8Array): number {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const count0 = view.getUint32(SLOT.saveCount, false);
    const count1 = view.getUint32(SIZE_PARTITION + SLOT.saveCount, false);
    const valid0 = verifyChecksums(data, 0);
    const valid1 = verifyChecksums(data, SIZE_PARTITION);

    if (valid1 && (!valid0 || count1 > count0)) return 1;
    if (valid0) return 0;
    return -1;
  }

  // --------------------------------------------------------------- perfiles

  private get partitionBase(): number { return this.partition * SIZE_PARTITION; }
  private get slotBase(): number { return this.partitionBase + this.slotIndex * SIZE_SLOT; }

  get currentSlot(): number { return this.slotIndex; }

  selectSlot(index: number): void {
    if (index < 0 || index >= SLOT_COUNT) throw new RangeError(`Perfil ${index} fuera de rango`);
    this.slotIndex = index;
  }

  /** Los 4 perfiles del guardado, para dejar elegir al usuario. */
  get slots(): SlotSummary[] {
    return Array.from({ length: SLOT_COUNT }, (_, i) => {
      const base = this.partitionBase + i * SIZE_SLOT;
      const name = decodeSaveString(this.data, base + SLOT.trainerName, SLOT.trainerNameLength);
      return { index: i, trainerName: name, empty: name === '' };
    });
  }

  get saveCount(): number { return this.view.getUint32(this.partitionBase + SLOT.saveCount, false); }
  private set saveCount(v: number) {
    this.view.setUint32(this.partitionBase + SLOT.saveCount, v >>> 0, false);
  }

  /**
   * Idioma del perfil, ya resuelto.
   *
   * El byte de `0x384` no distingue japonés de inglés —los dos son el 0, `JapaneseOrEnglish`—, así
   * que un guardado americano y uno japonés dicen exactamente lo mismo ahí. Quien los separa es la
   * bandera del juego, y por eso este getter la necesita.
   */
  get language(): Lang {
    const byte = this.data[this.slotBase + SLOT.language]!;
    if (byte === SAVE_LANGUAGE_JP_OR_EN) return this.japanese ? 'ja' : 'en';
    return SAVE_LANGUAGE[byte] ?? 'en';
  }

  get trainerName(): string {
    return decodeSaveString(this.data, this.slotBase + SLOT.trainerName, SLOT.trainerNameLength);
  }
  set trainerName(v: string) {
    encodeSaveString(this.data, this.slotBase + SLOT.trainerName, SLOT.trainerNameLength, v);
  }

  /** Se lee de 0x3C0; PKHeX tiene aquí un bug conocido en los setters (escribe en 0x578). */
  get country(): number { return this.view.getUint16(this.slotBase + SLOT.country, false); }
  set country(v: number) { this.view.setUint16(this.slotBase + SLOT.country, v, false); }
  get region(): number { return this.view.getUint16(this.slotBase + SLOT.region, false); }
  set region(v: number) { this.view.setUint16(this.slotBase + SLOT.region, v, false); }

  // ---------------------------------------------------------------- pases

  /** Vista sobre el pase `index` del perfil actual. Escribe directamente sobre el guardado. */
  getPass(index: number): BattlePass {
    if (index < 0 || index >= PASS_COUNT) throw new RangeError(`Pase ${index} fuera de rango`);
    const start = this.slotBase + passOffset(index);
    return new BattlePass(this.data.subarray(start, start + SIZE_PASS));
  }

  passType(index: number): PassType { return passTypeAt(index, this.japanese); }

  /** Índices de los pases personalizados, que son los que el usuario puede sobrescribir. */
  get customPassIndexes(): number[] {
    const list: number[] = [];
    for (let i = 0; i < PASS_COUNT; i++) if (this.passType(i) === 'custom') list.push(i);
    return list;
  }

  /**
   * Borra un pase personalizado igual que el juego: conserva el diseño y si estaba
   * desbloqueado, porque son propiedades de la ranura, no del contenido.
   * Los pases de alquiler no se pueden borrar.
   */
  deletePass(index: number): void {
    const type = this.passType(index);
    if (type === 'rental') return;

    const pass = this.getPass(index);
    if (type === 'custom') {
      const design = pass.design;
      const available = pass.available;
      pass.data.fill(0);
      pass.design = design;
      pass.available = available;
    } else {
      pass.data.fill(0);
    }
  }

  // ------------------------------------------------------------ desbloqueo

  /** Deja disponibles todas las ranuras de pase personalizado sin tener que avanzar en el juego. */
  unlockAllCustomPasses(): void {
    for (const i of this.customPassIndexes) this.getPass(i).available = true;
  }

  getColosseumUnlocked(name: keyof typeof COLOSSEUM_UNLOCK): boolean {
    const [offset, bit] = COLOSSEUM_UNLOCK[name];
    return (this.data[this.slotBase + offset]! >> bit & 1) !== 0;
  }

  setColosseumUnlocked(name: keyof typeof COLOSSEUM_UNLOCK, value: boolean): void {
    const [offset, bit] = COLOSSEUM_UNLOCK[name];
    const address = this.slotBase + offset;
    this.data[address] = value ? this.data[address]! | (1 << bit) : this.data[address]! & ~(1 << bit);
  }

  unlockAllColosseums(): void {
    for (const name of Object.keys(COLOSSEUM_UNLOCK) as (keyof typeof COLOSSEUM_UNLOCK)[]) {
      this.setColosseumUnlocked(name, true);
    }
  }

  // -------------------------------------------------------- equipo y cajas

  getPartyPokemon(index: number): BK4 | null {
    if (index < 0 || index >= PARTY_COUNT) throw new RangeError(`Ranura ${index} fuera de rango`);
    const start = this.slotBase + SLOT.party + index * SIZE_PARTY;
    const pk = BK4.fromStored(this.data.subarray(start, start + SIZE_STORED));
    return pk.species === 0 ? null : pk;
  }

  getBoxPokemon(box: number, slot: number): BK4 | null {
    if (box < 0 || box >= BOX_COUNT) throw new RangeError(`Caja ${box} fuera de rango`);
    if (slot < 0 || slot >= BOX_SLOT_COUNT) throw new RangeError(`Ranura ${slot} fuera de rango`);
    const start = this.slotBase + SLOT.boxes + (box * BOX_SLOT_COUNT + slot) * SIZE_STORED;
    const pk = BK4.fromStored(this.data.subarray(start, start + SIZE_STORED));
    return pk.species === 0 ? null : pk;
  }

  getBoxName(box: number): string {
    return decodeSaveString(this.data, this.slotBase + SLOT.boxNames + box * SLOT.boxNameLength, SLOT.boxNameLength);
  }

  // ------------------------------------------------------------- guardado

  /**
   * Devuelve el fichero listo para escribir en la Wii: recalcula los checksums de la partición
   * activa, incrementa el contador de guardado y cifra las dos particiones.
   *
   * El contador se incrementa para que el juego prefiera esta partición sobre la otra.
   */
  serialize(): Uint8Array {
    const out = this.data.slice();
    const view = new DataView(out.buffer);
    const base = this.partitionBase;

    const other = view.getUint32((1 - this.partition) * SIZE_PARTITION + SLOT.saveCount, false);
    view.setUint32(base + SLOT.saveCount, (Math.max(this.saveCount, other) + 1) >>> 0, false);

    setChecksums(out, base);
    encryptPartition(out, 0);
    encryptPartition(out, SIZE_PARTITION);
    return out;
  }

  /** Como `serialize`, pero sin tocar el contador: para comprobar el round-trip exacto. */
  serializeUnchanged(): Uint8Array {
    const out = this.data.slice();
    encryptPartition(out, 0);
    encryptPartition(out, SIZE_PARTITION);
    return out;
  }
}
