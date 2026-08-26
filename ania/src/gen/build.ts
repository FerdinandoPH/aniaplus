/**
 * Convierte un Pokémon de la aplicación en un BK4 que el guardado de PBR acepta.
 *
 * El punto delicado es el PID. En la generación 4 no es un identificador suelto: de él se
 * derivan la naturaleza (`pid % 25`), la habilidad (`pid & 1`), el género (comparando el byte
 * bajo con el ratio de la especie) y el brillo (contra TID/SID). Así que no se puede elegir al
 * azar: hay que buscar uno que produzca a la vez la naturaleza, la habilidad y el género
 * pedidos. Es una búsqueda rápida —las tres condiciones son casi independientes— pero tiene que
 * estar acotada.
 */
import { BK4 } from '../core/bk4.ts';
import { SIZE_STORED } from '../core/constants.ts';
import { getPersonal, type Lang, movePP, PBR_LEVEL, speciesNames } from '../data/index.ts';
import experience from '../data/pkhex/experience.json' with { type: 'json' };
import { bk4FromLang } from './language.ts';
import { getEncounterMoves } from './learn.ts';
import { Rng } from './rng.ts';
import type { PokemonDraft } from './validate.ts';

const EXP_TABLES = experience as number[][];

/** Ratios de género especiales del personal data de Gen 4. */
const GENDER_GENDERLESS = 255;
const GENDER_ALWAYS_FEMALE = 254;
const GENDER_ALWAYS_MALE = 0;

export const enum Gender {
  Male = 0,
  Female = 1,
  Genderless = 2,
}

/** Género que produce un PID dado, según el ratio de la especie. */
export function genderFromPid(pid: number, genderRatio: number): Gender {
  if (genderRatio === GENDER_GENDERLESS) return Gender.Genderless;
  if (genderRatio === GENDER_ALWAYS_FEMALE) return Gender.Female;
  if (genderRatio === GENDER_ALWAYS_MALE) return Gender.Male;
  return (pid & 0xff) < genderRatio ? Gender.Female : Gender.Male;
}

export interface PidRequest {
  nature: number;
  /** 0 = primera habilidad, 1 = segunda. */
  abilitySlot: 0 | 1;
  gender?: Gender;
  genderRatio: number;
  shiny?: boolean;
  tid?: number;
  sid?: number;
}

const MAX_PID_ATTEMPTS = 100_000;

/**
 * Busca un PID que cumpla naturaleza, habilidad, género y brillo a la vez.
 *
 * Si se pide brillo, la búsqueda es mucho más estrecha (1 de cada 8192), de ahí el límite alto
 * de intentos. Lanza si no lo consigue en vez de devolver algo que no cumple lo pedido, porque
 * un PID silenciosamente incorrecto daría un Pokémon con otra naturaleza al abrirlo en el juego.
 */
export function findPid(rng: Rng, request: PidRequest): number {
  const { nature, abilitySlot, gender, genderRatio, shiny = false, tid = 0, sid = 0 } = request;

  for (let attempt = 0; attempt < MAX_PID_ATTEMPTS; attempt++) {
    const pid = rng.next() >>> 0;
    if (pid % 25 !== nature) continue;
    if ((pid & 1) !== abilitySlot) continue;
    if (gender !== undefined && genderFromPid(pid, genderRatio) !== gender) continue;
    if (shiny) {
      const xor = (tid ^ sid ^ (pid >>> 16) ^ (pid & 0xffff)) & 0xfff8;
      if (xor !== 0) continue;
    }
    return pid;
  }
  throw new Error('No se ha encontrado un PID que cumpla las condiciones pedidas');
}

export interface BuildOptions {
  /** Entrenador original que figurará en el Pokémon. */
  trainerName?: string;
  tid?: number;
  sid?: number;
  /** Idioma con el que se cría el Pokémon (mote por defecto y byte grabado en el BK4). */
  lang?: Lang;
  ball?: number;
  shiny?: boolean;
  gender?: Gender;
  /** Mote propio. Sin él va el nombre de la especie, que es lo que el juego enseña de serie. */
  nickname?: string;
}

/**
 * Los motes van en mayúsculas, como en los juegos de la época: en la generación 4 los nombres de
 * los Pokémon se enseñaban así, y un mote en minúsculas canta al lado de los demás.
 *
 * La tabla de caracteres de Gen 4 tiene las mayúsculas acentuadas (`Á`, `Ñ`, `Ü`…), así que esto
 * no puede convertir una letra válida en un interrogante.
 */
export function nicknameCase(text: string): string {
  return text.toUpperCase();
}

/** Mote de un Pokémon sin mote propio: el nombre de su especie, tal como lo enseña el juego. */
export function speciesNickname(species: number, lang: Lang = 'es'): string {
  return nicknameCase(speciesNames(lang)[species] ?? '');
}

/** Poké Ball. */
export const BALL_POKE = 4;

/**
 * Crea un BK4 completo a partir de un Pokémon de la aplicación.
 * Devuelve la vista en orden lógico; usa `toStored()` para escribirlo en un pase.
 */
export function buildBK4(rng: Rng, draft: PokemonDraft, options: BuildOptions = {}): BK4 {
  const {
    trainerName = 'ANIA+',
    tid = rng.int(65536),
    sid = rng.int(65536),
    lang = 'es',
    ball = BALL_POKE,
    shiny = false,
    gender,
    nickname,
  } = options;

  const info = getPersonal(draft.species, draft.form ?? 0);
  const level = draft.level ?? 50;

  // La habilidad pedida determina qué mitad del PID hace falta.
  const abilitySlot: 0 | 1 = info.abilities[1] === draft.ability && info.abilities[0] !== draft.ability ? 1 : 0;
  const nature = 'nature' in draft && typeof draft.nature === 'number' ? draft.nature : rng.int(25);

  const pid = findPid(rng, {
    nature,
    abilitySlot,
    gender,
    genderRatio: info.genderRatio,
    shiny,
    tid,
    sid,
  });

  const pk = new BK4(new Uint8Array(SIZE_STORED));
  pk.pid = pid;
  // Sanity: el juego marca los datos como descifrados en caja.
  pk.sanity = 0x4000;
  pk.species = draft.species;
  pk.heldItem = draft.heldItem;
  pk.tid = tid;
  pk.sid = sid;
  pk.exp = EXP_TABLES[info.growth]?.[level - 1] ?? 0;
  pk.friendship = 70;
  pk.ability = draft.ability;
  pk.language = bk4FromLang(lang);
  pk.evs = draft.evs;
  pk.ivs = draft.ivs;
  pk.moves = draft.moves;
  pk.pp = draft.moves.map((m) => movePP[m] ?? 0);
  pk.ppUps = [0, 0, 0, 0];
  pk.form = draft.form ?? 0;
  pk.gender = genderFromPid(pid, info.genderRatio);
  /*
   * Sin mote propio, pero el campo lleva el nombre de la especie, no un hueco: PBR enseña en
   * combate lo que haya escrito ahí, y con la cadena vacía los seis Pokémon salían sin nombre.
   * Es lo mismo que hace PKHeX al crear un Pokémon.
   */
  pk.nickname = nickname !== undefined ? nicknameCase(nickname) : speciesNickname(draft.species, lang);
  // Con mote propio hay que encender la bandera; si no, el juego lo trata como nombre de especie.
  pk.isNicknamed = nickname !== undefined;
  pk.trainerName = trainerName;
  pk.ball = ball;
  pk.metLevel = level;
  pk.version = 12; // Platino, la versión más permisiva de Gen 4 para PBR
  pk.refreshChecksum();
  return pk;
}

/**
 * Semilla para lo que no necesita ser reproducible. El reloj a secas no basta: añadir dos
 * Pokémon seguidos cae en el mismo milisegundo y saldrían idénticos, con el mismo PID.
 */
export function randomSeed(): number {
  return (Date.now() ^ (Math.random() * 0x100000000)) >>> 0;
}

/**
 * Pokémon de partida para montar un pase a mano: nivel 50, IV perfectos, sin EV ni objeto y con
 * los movimientos que el juego le pondría. Es un punto de partida editable, no una propuesta
 * competitiva; por eso no reparte EV.
 */
export function defaultPokemon(species = 1, form = 0, options: BuildOptions = {}): BK4 {
  const rng = new Rng(randomSeed());
  const info = getPersonal(species, form);
  return buildBK4(rng, {
    species,
    form,
    level: PBR_LEVEL,
    moves: getEncounterMoves(species, form, PBR_LEVEL),
    ability: info.abilities[0]!,
    heldItem: 0,
    evs: { hp: 0, atk: 0, def: 0, spe: 0, spa: 0, spd: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spe: 31, spa: 31, spd: 31 },
  }, options);
}

/**
 * Enciende o apaga el brillo moviendo el **SID**, no el PID.
 *
 * Es el camino que usa PKHeX y el único que sirve aquí: el PID ya codifica naturaleza, habilidad
 * y género, así que buscar uno variocolor (1 entre 8192) dentro de ese espacio ya restringido
 * podría no encontrar ninguno. Con el SID el resultado es inmediato y no cambia nada más.
 */
export function setShiny(pk: BK4, shiny: boolean, rng: Rng = new Rng(randomSeed())): void {
  const pid = pk.pid;
  const base = (pk.tid ^ (pid >>> 16) ^ (pid & 0xffff)) & 0xffff;
  // Variocolor es que los 13 bits altos del XOR sean 0; los 3 bajos dan igual.
  pk.sid = shiny ? ((base & 0xfff8) | rng.int(8)) : (base ^ 0x0010) & 0xffff;
  pk.refreshChecksum();
}
