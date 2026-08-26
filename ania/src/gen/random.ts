/**
 * Generación aleatoria de Pokémon y de pases completos.
 *
 * Las opciones son las del enunciado del proyecto: siempre nivel 50, cuatro movimientos y al
 * menos uno o dos que hagan daño (salvo Ditto y compañía), con distintos grados de legalidad.
 */
import {
  allSpecies,
  finalFormSpecies,
  getMoveType,
  getPersonal,
  heldItems,
  isDamagingMove,
  isFinalForm,
  isSpecial,
  type Lang,
  MAX_MOVE,
  moveNames,
  needsDamagingMove,
  PBR_LEVEL,
  specialSpecies,
} from '../data/index.ts';
import { getEncounterMoves, getLegalMovepool } from './learn.ts';
import { Rng } from './rng.ts';
import { EV_SINGLE_MAX, EV_TOTAL_MAX, type PokemonDraft } from './validate.ts';

export type MoveMode = 'recomendados' | 'legales' | 'todo-vale';
/** Cuántos movimientos que hagan daño se garantizan al sortear el conjunto. */
export type DamagingMode = 'uno' | 'dos';
export type IvMode = 'perfectos' | 'aleatorios';
export type EvMode = 'aleatorios' | 'equitativos';
export type AbilityMode = 'legal' | 'aleatoria';
export type ItemMode = 'ninguno' | 'aleatorio';

export interface RandomOptions {
  moves: MoveMode;
  /**
   * Mínimo de movimientos ofensivos cuando los movimientos se sortean. Con uno solo, un Pokémon
   * puede acabar con tres movimientos de apoyo y un único ataque; con dos, el equipo pega más y
   * los combates se resuelven, a cambio de menos variedad. No afecta al modo "recomendados", que
   * copia lo que el Pokémon sabría de verdad a nivel 50.
   */
  damaging: DamagingMode;
  /**
   * Garantiza un movimiento de uno de los tipos del Pokémon. Solo tiene efecto con "todo vale":
   * ahí los cuatro salen del saco entero de Gen 4 y lo normal es que ninguno sea suyo, mientras
   * que un movepool legal ya tira por sí solo hacia los tipos de la especie.
   */
  sameTypeMove: boolean;
  ivs: IvMode;
  /**
   * Los EV siempre suman 510: la duda es cómo. Aleatorios da Pokémon especializados al azar;
   * equitativos reparte 85 por estadística, que es lo neutral cuando lo que se quiere comparar
   * son las especies y no el reparto.
   */
  evs: EvMode;
  ability: AbilityMode;
  item: ItemMode;
  /** Obliga a que al menos un Pokémon del pase sea legendario o mítico. */
  atLeastOneLegendary: boolean;
  /**
   * Sortea solo últimas fases. No excluye a los Pokémon sin línea evolutiva: la pregunta es si le
   * queda algo por delante, así que Tauros o Mew entran igual que Charizard. A nivel 50, una fase
   * intermedia solo es un equipo peor.
   */
  onlyFinalForms: boolean;
  /** Oculta el contenido hasta que se transfiera a la Wii. */
  secret: boolean;
  /**
   * Caos de nombre: un único mote para **todos** los Pokémon del lote, aunque sean de pases
   * distintos. Es cosa del momento de construir el BK4, no del sorteo del equipo, así que vive
   * aquí solo para viajar con el resto de opciones del formulario.
   */
  chaosName: boolean;
  /** Mote del caos. Vacío significa "pide una palabra al azar al diccionario". */
  chaosNameText: string;
}

export const DEFAULT_OPTIONS: RandomOptions = {
  moves: 'recomendados',
  damaging: 'uno',
  sameTypeMove: false,
  ivs: 'perfectos',
  evs: 'aleatorios',
  ability: 'legal',
  item: 'ninguno',
  atLeastOneLegendary: false,
  onlyFinalForms: false,
  secret: false,
  chaosName: false,
  chaosNameText: '',
};

const STAT_KEYS = ['hp', 'atk', 'def', 'spe', 'spa', 'spd'] as const;

/**
 * EV aleatorios que suman **exactamente** 510, con el tope de 255 por estadística.
 *
 * La clave es reservar sitio para lo que queda por repartir: al sortear cada estadística, el
 * mínimo es lo que las restantes no pueden absorber (nunca pasan de 255 cada una) y el máximo es
 * lo que queda. Así la última siempre puede cerrar el total y nadie se queda con EV sin gastar.
 */
function randomEvs(rng: Rng): PokemonDraft['evs'] {
  const evs = { hp: 0, atk: 0, def: 0, spe: 0, spa: 0, spd: 0 };
  let remaining = EV_TOTAL_MAX;
  // Reparto en orden aleatorio para no favorecer siempre a las mismas estadísticas.
  const order = rng.shuffle(STAT_KEYS);
  order.forEach((key, i) => {
    const left = order.length - i - 1;
    const min = Math.max(0, remaining - left * EV_SINGLE_MAX);
    const max = Math.min(EV_SINGLE_MAX, remaining);
    const value = min + rng.int(max - min + 1);
    evs[key] = value;
    remaining -= value;
  });
  return evs;
}

/** Reparto plano: 85 en cada estadística, que son los 510 justos. */
function evenEvs(): PokemonDraft['evs'] {
  const each = EV_TOTAL_MAX / STAT_KEYS.length;
  return Object.fromEntries(STAT_KEYS.map((k) => [k, each])) as PokemonDraft['evs'];
}

function randomIvs(rng: Rng, mode: IvMode): PokemonDraft['ivs'] {
  if (mode === 'perfectos') return { hp: 31, atk: 31, def: 31, spe: 31, spa: 31, spd: 31 };
  return Object.fromEntries(STAT_KEYS.map((k) => [k, rng.int(32)])) as PokemonDraft['ivs'];
}

/**
 * Sustituye movimientos ya elegidos hasta llegar al mínimo de ofensivos pedido.
 *
 * Se pisan siempre huecos o movimientos que no hacen daño, nunca uno ofensivo ya colocado, y no se
 * repite ninguno. Si el movepool no da para tanto —hay pre-evoluciones con un solo ataque, o con
 * ninguno—, se llega hasta donde se pueda: es mejor un equipo pobre que un generador que falla.
 */
function ensureDamaging(rng: Rng, chosen: number[], pool: readonly number[], min: number): void {
  const available = pool.filter((m) => isDamagingMove(m) && !chosen.includes(m));
  const slots = rng.shuffle(chosen.map((_, i) => i).filter((i) => !isDamagingMove(chosen[i]!)));

  let count = chosen.filter(isDamagingMove).length;
  while (count < min && slots.length > 0 && available.length > 0) {
    chosen[slots.pop()!] = available.splice(rng.int(available.length), 1)[0]!;
    count++;
  }
}

/**
 * Mete un movimiento de uno de los tipos del Pokémon, si no lo hay ya.
 *
 * Lo que se garantiza es un movimiento de su tipo **que haga daño**: llevar un Malicioso porque la
 * especie es de tipo Normal cumple la letra de la regla y no sirve de nada, así que un movimiento
 * de estado suyo no da la regla por satisfecha. Solo si en el saco no hay ningún ataque de sus
 * tipos se acepta uno de estado, y si tampoco lo hay el equipo se queda como esté.
 *
 * La víctima es un hueco que no haga daño, para no bajar el número de ataques que `ensureDamaging`
 * acaba de asegurar; solo si el candidato también pega se acepta pisar un ataque.
 */
function ensureSameType(rng: Rng, chosen: number[], pool: readonly number[], types: readonly number[]): void {
  const isOwnType = (move: number): boolean => move > 0 && types.includes(getMoveType(move));
  if (chosen.some((m) => isOwnType(m) && isDamagingMove(m))) return;

  const candidates = pool.filter((m) => isOwnType(m) && !chosen.includes(m));
  const offensive = candidates.filter(isDamagingMove);
  // Sin ataques de sus tipos disponibles, un movimiento de estado suyo ya colocado es lo mejor
  // que se puede ofrecer: no hay nada que cambiar.
  if (offensive.length === 0 && chosen.some(isOwnType)) return;

  const usable = offensive.length > 0 ? offensive : candidates;
  if (usable.length === 0) return;

  const chosenMove = usable[rng.int(usable.length)]!;
  const slots = chosen.map((_, i) => i).filter((i) => !isDamagingMove(chosen[i]!));
  if (slots.length === 0) {
    if (!isDamagingMove(chosenMove)) return;
    slots.push(...chosen.map((_, i) => i));
  }
  chosen[rng.pick(slots)] = chosenMove;
}

/**
 * Elige cuatro movimientos garantizando, si la especie lo requiere, el mínimo de ofensivos pedido.
 *
 * En el modo "legales" el movepool puede no tener ningún movimiento ofensivo (pasa con algunas
 * pre-evoluciones a nivel bajo); en ese caso se devuelve lo que haya en vez de fallar, y la
 * validación lo marcará.
 */
function pickMoves(
  rng: Rng,
  species: number,
  form: number,
  mode: MoveMode,
  damaging: DamagingMode,
  sameType: boolean,
): number[] {
  if (mode === 'recomendados') {
    return getEncounterMoves(species, form, PBR_LEVEL);
  }

  const pool =
    mode === 'legales'
      ? [...getLegalMovepool(species, form, { level: PBR_LEVEL })]
      : Array.from({ length: MAX_MOVE }, (_, i) => i + 1);

  if (pool.length === 0) return getEncounterMoves(species, form, PBR_LEVEL);

  const chosen = rng.sample(pool, 4);
  while (chosen.length < 4) chosen.push(0);

  if (needsDamagingMove(species)) {
    ensureDamaging(rng, chosen, pool, damaging === 'dos' ? 2 : 1);
  }
  // Después de los ataques, y no antes: al revés, `ensureDamaging` podría pisar el movimiento de
  // su tipo si resultara ser de estado.
  if (mode === 'todo-vale' && sameType) {
    ensureSameType(rng, chosen, pool, getPersonal(species, form).types);
  }
  return chosen;
}

export interface RandomPokemon extends PokemonDraft {
  nature: number;
  gender: number;
  shiny: boolean;
}

export function generatePokemon(rng: Rng, options: RandomOptions, species?: number): RandomPokemon {
  const chosen = species ?? rng.pick(options.onlyFinalForms ? finalFormSpecies : allSpecies);
  const form = 0; // PBR usa la forma base salvo casos concretos; se editan a mano.
  const info = getPersonal(chosen, form);

  const ability =
    options.ability === 'legal'
      ? rng.pick(info.abilities.filter((a) => a !== 0))
      : rng.range(1, 123);

  return {
    species: chosen,
    form,
    level: PBR_LEVEL,
    moves: pickMoves(rng, chosen, form, options.moves, options.damaging, options.sameTypeMove),
    ability: ability ?? info.abilities[0]!,
    heldItem: options.item === 'aleatorio' ? rng.pick(heldItems) : 0,
    evs: options.evs === 'equitativos' ? evenEvs() : randomEvs(rng),
    ivs: randomIvs(rng, options.ivs),
    nature: rng.int(25),
    gender: 0,
    shiny: false,
  };
}

export interface RandomPass {
  pokemon: RandomPokemon[];
  /** Se conserva para que la UI sepa que no debe mostrar el contenido todavía. */
  secret: boolean;
}

export function generatePass(rng: Rng, options: RandomOptions = DEFAULT_OPTIONS): RandomPass {
  const species: number[] = [];
  const pool = options.onlyFinalForms ? finalFormSpecies : allSpecies;

  if (options.atLeastOneLegendary) {
    // Hoy ningún legendario evoluciona, así que el filtro no quita nada; está para que las dos
    // reglas no puedan contradecirse si algún día cambian los datos.
    const specials = options.onlyFinalForms ? specialSpecies.filter(isFinalForm) : specialSpecies;
    species.push(rng.pick(specials));
  }
  while (species.length < 6) {
    const candidate = rng.pick(pool);
    if (!species.includes(candidate)) species.push(candidate);
  }

  return {
    pokemon: rng.shuffle(species).map((s) => generatePokemon(rng, options, s)),
    secret: options.secret,
  };
}

/** Lote de N pases a partir de una sola semilla, para poder reproducirlo entero. */
export function generatePasses(count: number, options: RandomOptions = DEFAULT_OPTIONS, seed?: number): RandomPass[] {
  const rng = new Rng(seed);
  return Array.from({ length: count }, () => generatePass(rng, options));
}

/** Resumen legible de un equipo, para depurar y para la vista previa. */
export function describePass(pass: RandomPass, names: string[], lang: Lang = 'es'): string {
  const moves = moveNames(lang);
  return pass.pokemon
    .map((pk) => `${names[pk.species]} (${pk.moves.map((m) => moves[m] ?? '-').join(', ')})`)
    .join(' | ');
}

export { isSpecial };
