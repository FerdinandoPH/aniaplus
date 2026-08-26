/**
 * Battle Pass: el pase de batalla de PBR, 0x6EC bytes.
 *
 * Contiene al entrenador (aspecto, frases, récords) y sus 6 Pokémon. Cada Pokémon ocupa 140
 * bytes: 136 de BK4 permutado más `Box`, `Slot` y un u16 de flags cuyo bit 15 indica si la
 * ranura está ocupada.
 *
 * Referencias: PKHeX.Core/Saves/Substructures/Gen4/PBR/BattlePass{,Accessor}.cs
 */
import type { Lang } from '../data/index.ts';
import { BK4 } from './bk4.ts';
import {
  PARTY_COUNT,
  PASS,
  PASS_LANGUAGE,
  PASS_STATUS_BIT,
  PHRASE_LENGTHS,
  PHRASE_ORDER,
  type PhraseName,
  SIZE_PASS,
  SIZE_PASS_POKE,
  SIZE_STORED,
} from './constants.ts';
import { decodeSaveString, encodeSaveString } from './text.ts';

export interface PassPokemonSlot {
  /** 0 = equipo o vacío, 1-18 = caja, 255 = desaparecido o de alquiler. */
  box: number;
  /** 0-5 en equipo, 0-29 en caja, 255 desaparecido. */
  slot: number;
}

/**
 * Los 6 personajes jugables (`ModelBR` en PKHeX; 7-12 son NPC y no aparecen en pases del
 * jugador). 0 = "None": lo que trae una ranura vacía sin emitir, no un personaje elegible.
 */
export const enum TrainerModel {
  YoungBoy = 1,
  CoolBoy = 2,
  MuscleMan = 3,
  YoungGirl = 4,
  CoolGirl = 5,
  LittleGirl = 6,
}

/** Los seis, en orden, para recorrerlos o sortear uno. */
export const TRAINER_MODELS = [
  TrainerModel.YoungBoy,
  TrainerModel.CoolBoy,
  TrainerModel.MuscleMan,
  TrainerModel.YoungGirl,
  TrainerModel.CoolGirl,
  TrainerModel.LittleGirl,
] as const;

export const TRAINER_MODEL_NAMES: Record<TrainerModel, string> = {
  [TrainerModel.YoungBoy]: 'Chico',
  [TrainerModel.CoolBoy]: 'Chico deportista',
  [TrainerModel.MuscleMan]: 'Forzudo',
  [TrainerModel.YoungGirl]: 'Chica',
  [TrainerModel.CoolGirl]: 'Chica deportista',
  [TrainerModel.LittleGirl]: 'Niña',
};

/**
 * Primer índice del bloque de frases de cada personaje (`ResetPresetIndexes` en PKHeX).
 *
 * Son índices dentro de la tabla de textos del juego, no textos: no podemos leerlos aquí, pero sí
 * apuntar a los correctos, que es lo que hace que el entrenador diga lo suyo en vez de callarse.
 */
const PHRASE_BASE_INDEX: Record<TrainerModel, number> = {
  [TrainerModel.YoungBoy]: 6872,
  [TrainerModel.CoolBoy]: 7058,
  [TrainerModel.MuscleMan]: 7244,
  [TrainerModel.YoungGirl]: 7430,
  [TrainerModel.CoolGirl]: 7616,
  [TrainerModel.LittleGirl]: 7802,
};

/**
 * Bits 0 y 7 de `PASS.presetFlags`. Valen 1 en los pases del jugador y de amigos, y 0 en los de
 * alquiler, en los de NPC y en las ranuras sin emitir.
 */
const PRESET_FLAG_CUSTOM = 0b1000_0001;
/** Bits 1-6: una bandera de "frase de fábrica" por frase. */
const PRESET_FLAG_ALL_PHRASES = 0b0111_1110;

type GearFields = Record<'head' | 'hair' | 'face' | 'top' | 'bottom' | 'shoes' | 'hands' | 'bag' | 'glasses' | 'badge', number>;

/**
 * Prenda por defecto de cada categoría al elegir ese personaje (`GearUnlock.Info` en PKHeX).
 * Cada modelo tiene su propio vestuario —la ropa no se comparte entre personajes—, así que al
 * cambiar de modelo hay que reasignar las diez, no solo dejar los índices como estaban: el
 * mismo número puede señalar una prenda distinta o no existir en el vestuario del otro personaje.
 */
const GEAR_DEFAULTS: Record<TrainerModel, GearFields> = {
  [TrainerModel.YoungBoy]: { head: 0, hair: 0, face: 0, top: 0, bottom: 0, shoes: 0, hands: 1, bag: 1, glasses: 0, badge: 0 },
  [TrainerModel.CoolBoy]: { head: 0, hair: 0, face: 0, top: 0, bottom: 0, shoes: 0, hands: 0, bag: 0, glasses: 0, badge: 0 },
  [TrainerModel.MuscleMan]: { head: 0, hair: 0, face: 0, top: 0, bottom: 0, shoes: 0, hands: 1, bag: 1, glasses: 0, badge: 0 },
  [TrainerModel.YoungGirl]: { head: 0, hair: 0, face: 0, top: 0, bottom: 0, shoes: 0, hands: 1, bag: 1, glasses: 0, badge: 0 },
  [TrainerModel.CoolGirl]: { head: 0, hair: 0, face: 0, top: 0, bottom: 0, shoes: 0, hands: 1, bag: 0, glasses: 0, badge: 0 },
  [TrainerModel.LittleGirl]: { head: 0, hair: 0, face: 0, top: 0, bottom: 0, shoes: 0, hands: 1, bag: 0, glasses: 0, badge: 0 },
};

export class BattlePass {
  readonly data: Uint8Array;
  private readonly view: DataView;

  constructor(data: Uint8Array) {
    if (data.length !== SIZE_PASS) throw new Error(`Un pase mide ${SIZE_PASS} bytes, no ${data.length}`);
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  /**
   * Pase personalizado recién emitido, en blanco y sin Pokémon.
   *
   * `available` e `issued` son lo que distingue un pase creado por el jugador de una ranura
   * vacía, y `unknown1ec` vale -1 en todos los pases personalizados del guardado real.
   */
  static create(trainerName: string, lang: Lang = 'es'): BattlePass {
    const pass = new BattlePass(new Uint8Array(SIZE_PASS));
    pass.trainerName = trainerName;
    /*
     * El idioma hay que escribirlo: un pase recién creado son ceros, y el 0 de este campo es el
     * japonés. Sin esto, todo lo que hacía ANIA+ quedaba marcado como japonés, también en una
     * partida española.
     */
    pass.language = lang;
    pass.available = true;
    pass.issued = true;
    pass.view.setInt16(PASS.unknown1ec, -1, false);
    // Sin esto el modelo queda en 0 ("None"): una ranura vacía, no un personaje elegible.
    pass.model = TrainerModel.YoungBoy;
    pass.resetGearToDefault();
    /*
     * Frases de fábrica desde el principio. Sin estas banderas el juego cree que las seis son
     * personalizadas y las enseña vacías, que es como salían los pases generados.
     */
    pass.data[PASS.presetFlags] = PRESET_FLAG_CUSTOM | PRESET_FLAG_ALL_PHRASES;
    pass.resetPresetPhrases();
    return pass;
  }

  // ------------------------------------------------------------- entrenador

  get trainerName(): string { return decodeSaveString(this.data, PASS.name, PASS.nameLength); }
  set trainerName(v: string) { encodeSaveString(this.data, PASS.name, PASS.nameLength, v); }

  get creatorName(): string {
    return decodeSaveString(this.data, PASS.creatorName, PASS.creatorNameLength);
  }

  get trainerTitle(): number { return this.view.getInt16(PASS.trainerTitle, false); }
  set trainerTitle(v: number) { this.view.setInt16(PASS.trainerTitle, v, false); }

  get tid(): number { return this.view.getUint16(PASS.tid, false); }
  get sid(): number { return this.view.getUint16(PASS.sid, false); }

  get model(): number { return this.data[PASS.model]!; }
  set model(v: number) { this.data[PASS.model] = v; }

  get skin(): number { return this.data[PASS.skin]!; }
  set skin(v: number) { this.data[PASS.skin] = v; }

  /** Prendas y complementos, en el orden en que los guarda el juego. */
  get gear(): GearFields {
    return {
      head: this.data[PASS.head]!, hair: this.data[PASS.hair]!, face: this.data[PASS.face]!,
      top: this.data[PASS.top]!, bottom: this.data[PASS.bottom]!, shoes: this.data[PASS.shoes]!,
      hands: this.data[PASS.hands]!, bag: this.data[PASS.bag]!, glasses: this.data[PASS.glasses]!,
      badge: this.data[PASS.badge]!,
    };
  }

  /**
   * Repone el vestuario a lo que trae el juego de fábrica para el modelo actual. No hay forma
   * fiable de saber qué prenda concreta señala un índice arbitrario para *otro* modelo —el
   * nombre de cada prenda vive comprimido en el disco del juego, fuera de lo que sabemos leer
   * hoy—, así que al cambiar de personaje se repone el vestuario en vez de dejarlo a medias.
   */
  resetGearToDefault(): void {
    const defaults = GEAR_DEFAULTS[this.model as TrainerModel] ?? GEAR_DEFAULTS[TrainerModel.YoungBoy];
    this.data[PASS.head] = defaults.head;
    this.data[PASS.hair] = defaults.hair;
    this.data[PASS.face] = defaults.face;
    this.data[PASS.top] = defaults.top;
    this.data[PASS.bottom] = defaults.bottom;
    this.data[PASS.shoes] = defaults.shoes;
    this.data[PASS.hands] = defaults.hands;
    this.data[PASS.bag] = defaults.bag;
    this.data[PASS.glasses] = defaults.glasses;
    this.data[PASS.badge] = defaults.badge;
  }

  /**
   * ¿Esta frase es la de fábrica del personaje, o una escrita por el jugador?
   *
   * PBR no guarda "sin frase": guarda una bandera por frase que dice de dónde sale el texto. Si
   * está apagada, el juego enseña el texto del pase —vacío si nadie lo ha escrito, que es lo que
   * pasaba con los pases generados—, y si está encendida usa la frase que le toca al personaje.
   */
  usesPresetPhrase(name: PhraseName): boolean {
    return (this.data[PASS.presetFlags]! >> (PHRASE_ORDER.indexOf(name) + 1) & 1) !== 0;
  }

  setPresetPhrase(name: PhraseName, value: boolean): void {
    const mask = 1 << (PHRASE_ORDER.indexOf(name) + 1);
    this.data[PASS.presetFlags] = value
      ? this.data[PASS.presetFlags]! | mask
      : this.data[PASS.presetFlags]! & ~mask;
  }

  /**
   * Repone los índices de frase a los del personaje actual (`ResetPresetIndexes` en PKHeX).
   *
   * Cada modelo tiene su propio bloque de frases, y los índices son absolutos: quedarse con los
   * del personaje anterior al cambiar de modelo pone en su boca las frases de otro. Los pases del
   * jugador usan un reparto distinto al de los de alquiler para el saludo y los remates.
   */
  resetPresetPhrases(): void {
    const base = PHRASE_BASE_INDEX[this.model as TrainerModel];
    if (base === undefined) return;

    const indexes = [base + 6, base + 1, base + 2, base + 3, base + 7, base + 8];
    PHRASE_ORDER.forEach((_, i) => {
      this.view.setUint16(PASS.presetIndexes + i * 2, indexes[i]!, false);
    });
  }

  get phrases(): Record<keyof typeof PHRASE_LENGTHS, string> {
    return {
      greeting: decodeSaveString(this.data, PASS.greeting, PHRASE_LENGTHS.greeting),
      sentOut: decodeSaveString(this.data, PASS.sentOut, PHRASE_LENGTHS.sentOut),
      shift1: decodeSaveString(this.data, PASS.shift1, PHRASE_LENGTHS.shift1),
      shift2: decodeSaveString(this.data, PASS.shift2, PHRASE_LENGTHS.shift2),
      win: decodeSaveString(this.data, PASS.win, PHRASE_LENGTHS.win),
      lose: decodeSaveString(this.data, PASS.lose, PHRASE_LENGTHS.lose),
    };
  }

  /** Escribir una frase propia apaga su bandera de fábrica: si no, el juego no la enseñaría. */
  setPhrase(name: keyof typeof PHRASE_LENGTHS, value: string): void {
    encodeSaveString(this.data, PASS[name], PHRASE_LENGTHS[name], value);
    this.setPresetPhrase(name, false);
  }

  get selfIntroduction(): string {
    return decodeSaveString(this.data, PASS.selfIntroduction, PASS.selfIntroductionLength);
  }
  set selfIntroduction(v: string) {
    encodeSaveString(this.data, PASS.selfIntroduction, PASS.selfIntroductionLength, v);
  }

  /**
   * Idioma del pase, que es el de quien lo creó y no el del perfil que lo guarda.
   *
   * `languageByte` es el valor crudo, que es lo que hay que mirar para comprobar que se está
   * leyendo el sitio correcto: si el offset se torciera, aparecerían números fuera del enum del
   * juego, y el getter con nombre los taparía cayendo a inglés.
   */
  get languageByte(): number { return this.data[PASS.language]!; }
  get language(): Lang { return PASS_LANGUAGE[this.languageByte] ?? 'en'; }
  set language(v: Lang) {
    const index = PASS_LANGUAGE.indexOf(v);
    if (index >= 0) this.data[PASS.language] = index;
  }

  /** `"EURO"` en PAL, `"USA "` en NTSC, cuatro ceros en japonés. */
  get regionCode(): string {
    return String.fromCharCode(...this.data.subarray(PASS.regionCode, PASS.regionCode + 4));
  }

  // ------------------------------------------------------------- estado

  /** Diseño del pase (0-41). Es lo que se elige al transferir, no al diseñar. */
  get design(): number { return this.data[PASS.designByte]! >> 1; }
  set design(v: number) {
    this.data[PASS.designByte] = ((v & 0x7f) << 1) | (this.data[PASS.designByte]! & 1);
  }

  /** 0 = cuerpo entero, 1 = retrato. */
  get pictureType(): number { return this.data[PASS.designByte]! & 1; }
  set pictureType(v: number) {
    this.data[PASS.designByte] = (this.data[PASS.designByte]! & ~1) | (v & 1);
  }

  private getStatus(bit: number): boolean { return (this.data[PASS.statusByte]! >> bit & 1) !== 0; }
  private setStatus(bit: number, value: boolean): void {
    const mask = 1 << bit;
    this.data[PASS.statusByte] = value
      ? this.data[PASS.statusByte]! | mask
      : this.data[PASS.statusByte]! & ~mask;
  }

  /** En los pases personalizados: desbloqueado. En los de alquiler: disponible en Gateway. */
  get available(): boolean { return this.getStatus(PASS_STATUS_BIT.available); }
  set available(v: boolean) { this.setStatus(PASS_STATUS_BIT.available, v); }

  /** En los personalizados: ya emitido (es decir, el jugador lo ha creado). */
  get issued(): boolean { return this.getStatus(PASS_STATUS_BIT.issued); }
  set issued(v: boolean) { this.setStatus(PASS_STATUS_BIT.issued, v); }

  get rental(): boolean { return this.getStatus(PASS_STATUS_BIT.rental); }
  get friend(): boolean { return this.getStatus(PASS_STATUS_BIT.friend); }

  /** Un pase sin emitir y sin nombre es una ranura vacía. */
  get isEmpty(): boolean { return !this.issued && this.trainerName.length === 0; }

  // ------------------------------------------------------------- Pokémon

  private pokeSpan(index: number): Uint8Array {
    if (index < 0 || index >= PARTY_COUNT) throw new RangeError(`Ranura ${index} fuera de rango`);
    const start = PASS.party + index * SIZE_PASS_POKE;
    return this.data.subarray(start, start + SIZE_PASS_POKE);
  }

  /**
   * ¿Hay un Pokémon de verdad en esta ranura?
   *
   * El bit 15 del u16 final dice que la ranura está ocupada, pero **no basta con creérselo**: en
   * el guardado japonés del proyecto hay 320 ranuras con ese bit puesto y el Pokémon entero a
   * cero (PID 0, sin especie, solo un `0xC000` en el campo de control). Fiándose de la bandera
   * salían Pokémon fantasma con especie 0, que ni se pueden enseñar ni tienen checksum válido.
   *
   * Así que se exige además contenido, con el mismo criterio que PKHeX (`EntityDetection.
   * IsPresent`): PID distinto de cero, y si el PID es cero —posible, aunque rarísimo—, especie
   * distinta de cero. Descifrar solo hace falta en ese segundo caso.
   */
  isSlotPresent(index: number): boolean {
    const span = this.pokeSpan(index);
    if ((span[SIZE_PASS_POKE - 2]! & 0x80) === 0) return false;

    const view = new DataView(span.buffer, span.byteOffset, span.byteLength);
    if (view.getUint32(0, false) !== 0) return true;
    return BK4.fromStored(span.subarray(0, SIZE_STORED)).species !== 0;
  }

  setSlotPresent(index: number, value: boolean): void {
    const span = this.pokeSpan(index);
    span[SIZE_PASS_POKE - 2] = value
      ? span[SIZE_PASS_POKE - 2]! | 0x80
      : span[SIZE_PASS_POKE - 2]! & ~0x80;
  }

  /** Enlace con el Pokémon original de las cajas del guardado. */
  getSlotOrigin(index: number): PassPokemonSlot {
    const span = this.pokeSpan(index);
    return { box: span[SIZE_PASS_POKE - 4]!, slot: span[SIZE_PASS_POKE - 3]! };
  }

  setSlotOrigin(index: number, origin: PassPokemonSlot): void {
    const span = this.pokeSpan(index);
    span[SIZE_PASS_POKE - 4] = origin.box;
    span[SIZE_PASS_POKE - 3] = origin.slot;
  }

  getPokemon(index: number): BK4 | null {
    if (!this.isSlotPresent(index)) return null;
    return BK4.fromStored(this.pokeSpan(index).subarray(0, SIZE_STORED));
  }

  /**
   * Escribe un Pokémon en la ranura. Igual que el juego, no deja huecos: si las ranuras
   * anteriores están vacías, el Pokémon se desplaza hacia arriba.
   */
  setPokemon(index: number, pokemon: BK4, origin: PassPokemonSlot = { box: 255, slot: 0 }): void {
    let target = index;
    while (target > 0 && !this.isSlotPresent(target - 1)) target--;

    const span = this.pokeSpan(target);
    span.set(pokemon.toStored(), 0);
    this.setSlotOrigin(target, origin);
    this.setSlotPresent(target, pokemon.species !== 0);
  }

  /** Borra una ranura compactando las siguientes hacia arriba. */
  deletePokemon(index: number): void {
    let target = index;
    while (target < PARTY_COUNT - 1 && this.isSlotPresent(target + 1)) {
      this.pokeSpan(target).set(this.pokeSpan(target + 1));
      target++;
    }
    this.pokeSpan(target).fill(0);
  }

  /** Todos los Pokémon presentes, en orden. */
  get pokemon(): BK4[] {
    const list: BK4[] = [];
    for (let i = 0; i < PARTY_COUNT; i++) {
      const pk = this.getPokemon(i);
      if (pk !== null) list.push(pk);
    }
    return list;
  }
}
