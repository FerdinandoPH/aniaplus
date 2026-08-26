/**
 * Acceso tipado a los datos extraídos de PKHeX (`npm run extract`).
 *
 * Detalle importante: los learnsets y los tutores NO están indexados por especie, sino por
 * índice de fila del personal table, que para las formas alternas no coincide con la especie.
 * Usa siempre `formIndex()`.
 */
import categoriesJson from './pkhex/categories.json' with { type: 'json' };
import eggmovesJson from './pkhex/eggmoves.json' with { type: 'json' };
import evolutionsJson from './pkhex/evolutions.json' with { type: 'json' };
import heldItemsJson from './pkhex/helditems.json' with { type: 'json' };
import abilitiesEs from './pkhex/i18n/es/abilities.json' with { type: 'json' };
import itemsEs from './pkhex/i18n/es/items.json' with { type: 'json' };
import movesEs from './pkhex/i18n/es/moves.json' with { type: 'json' };
import naturesEs from './pkhex/i18n/es/natures.json' with { type: 'json' };
import speciesEs from './pkhex/i18n/es/species.json' with { type: 'json' };
import typesEs from './pkhex/i18n/es/types.json' with { type: 'json' };
import abilitiesEn from './pkhex/i18n/en/abilities.json' with { type: 'json' };
import itemsEn from './pkhex/i18n/en/items.json' with { type: 'json' };
import movesEn from './pkhex/i18n/en/moves.json' with { type: 'json' };
import naturesEn from './pkhex/i18n/en/natures.json' with { type: 'json' };
import speciesEn from './pkhex/i18n/en/species.json' with { type: 'json' };
import typesEn from './pkhex/i18n/en/types.json' with { type: 'json' };
import abilitiesDe from './pkhex/i18n/de/abilities.json' with { type: 'json' };
import itemsDe from './pkhex/i18n/de/items.json' with { type: 'json' };
import movesDe from './pkhex/i18n/de/moves.json' with { type: 'json' };
import naturesDe from './pkhex/i18n/de/natures.json' with { type: 'json' };
import speciesDe from './pkhex/i18n/de/species.json' with { type: 'json' };
import typesDe from './pkhex/i18n/de/types.json' with { type: 'json' };
import abilitiesFr from './pkhex/i18n/fr/abilities.json' with { type: 'json' };
import itemsFr from './pkhex/i18n/fr/items.json' with { type: 'json' };
import movesFr from './pkhex/i18n/fr/moves.json' with { type: 'json' };
import naturesFr from './pkhex/i18n/fr/natures.json' with { type: 'json' };
import speciesFr from './pkhex/i18n/fr/species.json' with { type: 'json' };
import typesFr from './pkhex/i18n/fr/types.json' with { type: 'json' };
import abilitiesJa from './pkhex/i18n/ja/abilities.json' with { type: 'json' };
import itemsJa from './pkhex/i18n/ja/items.json' with { type: 'json' };
import movesJa from './pkhex/i18n/ja/moves.json' with { type: 'json' };
import naturesJa from './pkhex/i18n/ja/natures.json' with { type: 'json' };
import speciesJa from './pkhex/i18n/ja/species.json' with { type: 'json' };
import typesJa from './pkhex/i18n/ja/types.json' with { type: 'json' };
import abilitiesIt from './pkhex/i18n/it/abilities.json' with { type: 'json' };
import itemsIt from './pkhex/i18n/it/items.json' with { type: 'json' };
import movesIt from './pkhex/i18n/it/moves.json' with { type: 'json' };
import naturesIt from './pkhex/i18n/it/natures.json' with { type: 'json' };
import speciesIt from './pkhex/i18n/it/species.json' with { type: 'json' };
import typesIt from './pkhex/i18n/it/types.json' with { type: 'json' };
import learnsetsJson from './pkhex/learnsets.json' with { type: 'json' };
import machinesJson from './pkhex/machines.json' with { type: 'json' };
import movePpJson from './pkhex/movepp.json' with { type: 'json' };
import moveTypesJson from './pkhex/movetypes.json' with { type: 'json' };
import personalJson from './pkhex/personal.json' with { type: 'json' };
import specialTutorsJson from './pkhex/special-tutors.json' with { type: 'json' };
import statusMovesJson from './pkhex/statusmoves.json' with { type: 'json' };
import tutorsJson from './pkhex/tutors.json' with { type: 'json' };

export const MAX_SPECIES = 493;
export const MAX_MOVE = 467;
export const MAX_ABILITY = 123;
export const MAX_ITEM = 536;
/** Nivel fijo de todos los Pokémon en los pases de PBR. */
export const PBR_LEVEL = 50;

export interface PersonalEntry {
  stats: number[];
  types: [number, number];
  genderRatio: number;
  growth: number;
  eggGroups: [number, number];
  abilities: [number, number];
  /** Índices de bit de MT (0-91) y MO (92-99) que la especie puede aprender. */
  machines: number[];
  formCount: number;
  formStatsIndex: number;
}

export interface Evolution {
  method: number;
  argument: number;
  species: number;
  form: number;
  level: number;
}

/**
 * Los cinco idiomas de la versión PAL más el japonés, que es el de la versión RPBJ01. El español
 * es el idioma de referencia.
 */
export type Lang = 'es' | 'en' | 'de' | 'fr' | 'it' | 'ja';
export const LANGUAGES: readonly Lang[] = ['es', 'en', 'de', 'fr', 'it', 'ja'];

const speciesByLang: Record<Lang, string[]> = {
  es: speciesEs as string[], en: speciesEn as string[], de: speciesDe as string[],
  fr: speciesFr as string[], it: speciesIt as string[], ja: speciesJa as string[],
};
const moveNamesByLang: Record<Lang, string[]> = {
  es: movesEs as string[], en: movesEn as string[], de: movesDe as string[],
  fr: movesFr as string[], it: movesIt as string[], ja: movesJa as string[],
};
const abilityNamesByLang: Record<Lang, string[]> = {
  es: abilitiesEs as string[], en: abilitiesEn as string[], de: abilitiesDe as string[],
  fr: abilitiesFr as string[], it: abilitiesIt as string[], ja: abilitiesJa as string[],
};
const natureNamesByLang: Record<Lang, string[]> = {
  es: naturesEs as string[], en: naturesEn as string[], de: naturesDe as string[],
  fr: naturesFr as string[], it: naturesIt as string[], ja: naturesJa as string[],
};
const typeNamesByLang: Record<Lang, string[]> = {
  es: typesEs as string[], en: typesEn as string[], de: typesDe as string[],
  fr: typesFr as string[], it: typesIt as string[], ja: typesJa as string[],
};
const itemNamesByLang: Record<Lang, string[]> = {
  es: itemsEs as string[], en: itemsEn as string[], de: itemsDe as string[],
  fr: itemsFr as string[], it: itemsIt as string[], ja: itemsJa as string[],
};

export function speciesNames(lang: Lang): string[] { return speciesByLang[lang]; }
export function moveNames(lang: Lang): string[] { return moveNamesByLang[lang]; }
export function abilityNames(lang: Lang): string[] { return abilityNamesByLang[lang]; }
export function natureNames(lang: Lang): string[] { return natureNamesByLang[lang]; }
export function typeNames(lang: Lang): string[] { return typeNamesByLang[lang]; }
export function itemNames(lang: Lang): string[] { return itemNamesByLang[lang]; }

export const personal = personalJson as PersonalEntry[];
export const learnsets = learnsetsJson as [number, number][][];
export const eggMoves = eggmovesJson as number[][];
export const evolutions = evolutionsJson as Evolution[][];
export const tutors = tutorsJson as number[][];
export const machines = machinesJson as { tm: number[]; hm: number[] };
export const movePP = movePpJson as number[];
export const moveTypes = moveTypesJson as number[];
export const heldItems = heldItemsJson as number[];
export const specialTutors = specialTutorsJson as {
  blastBurn: number[];
  hydroCannon: number[];
  frenzyPlant: number[];
  dracoMeteor: number[];
  moveIds: { blastBurn: number; hydroCannon: number; frenzyPlant: number; dracoMeteor: number };
};

const statusMoveSet = new Set((statusMovesJson as { status: number[] }).status);
const noDamageRequiredSet = new Set((statusMovesJson as { noDamageRequired: number[] }).noDamageRequired);

export const legendary = new Set(categoriesJson.legendary);
export const subLegendary = new Set(categoriesJson.subLegendary);
export const mythical = new Set(categoriesJson.mythical);

/** Para el modo "al menos un legendario": incluye legendarios, sublegendarios y míticos. */
export function isSpecial(species: number): boolean {
  return legendary.has(species) || subLegendary.has(species) || mythical.has(species);
}

export const specialSpecies: number[] = [...legendary, ...subLegendary, ...mythical].sort((a, b) => a - b);

/** ¿El movimiento hace daño? Ver `tools/gen4-status-moves.ts` sobre el origen del dato. */
export const isDamagingMove = (move: number): boolean => move > 0 && !statusMoveSet.has(move);

/**
 * Tipo de un movimiento, en la misma numeración que `PersonalEntry.types` y que `typeNames`.
 * Tinieblas sale como Normal: su tipo real depende de los IV y no está en ninguna tabla.
 */
export const getMoveType = (move: number): number => moveTypes[move] ?? 0;

/** Especies a las que no se les exige un movimiento ofensivo (Ditto, Smeargle...). */
export const needsDamagingMove = (species: number): boolean => !noDamageRequiredSet.has(species);

/**
 * Fila del personal table para una especie y forma.
 * Fuente: PKHeX PersonalInfo.FormIndex — si la forma existe y hay tabla de formas, se usa
 * `formStatsIndex + form - 1`; si no, la propia especie.
 */
export function formIndex(species: number, form = 0): number {
  const entry = personal[species];
  if (entry === undefined) return 0;
  if (form <= 0 || form >= entry.formCount || entry.formStatsIndex === 0) return species;
  return entry.formStatsIndex + form - 1;
}

export function getPersonal(species: number, form = 0): PersonalEntry {
  return personal[formIndex(species, form)] ?? personal[0]!;
}

/** Pre-evoluciones directas de una especie, construidas invirtiendo la tabla de evolución. */
const preEvolutionMap = new Map<number, number[]>();
for (let from = 0; from < evolutions.length; from++) {
  for (const evo of evolutions[from]!) {
    if (evo.species === 0) continue;
    const list = preEvolutionMap.get(evo.species);
    if (list === undefined) preEvolutionMap.set(evo.species, [from]);
    else if (!list.includes(from)) list.push(from);
  }
}

/**
 * Cadena evolutiva hacia atrás, incluyendo a la propia especie.
 * En Gen 4 un Pokémon conserva los movimientos que aprendió siendo su pre-evolución, así que
 * el movepool legal es la unión de toda la cadena.
 */
export function evolutionChain(species: number): number[] {
  const chain = [species];
  const pending = [species];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const pre of preEvolutionMap.get(current) ?? []) {
      if (!chain.includes(pre)) {
        chain.push(pre);
        pending.push(pre);
      }
    }
  }
  return chain;
}

/** Todas las especies válidas de Gen 4 (1..493). */
export const allSpecies: number[] = Array.from({ length: MAX_SPECIES }, (_, i) => i + 1);

/** Especies que evolucionan en algo, sea por el método que sea. */
const evolvingSpecies = new Set<number>();
for (let from = 0; from < evolutions.length; from++) {
  if (evolutions[from]!.some((evo) => evo.species !== 0)) evolvingSpecies.add(from);
}

/**
 * Última fase de su línea: o no evoluciona en nada, o directamente no tiene línea evolutiva.
 * Las dos cosas cuentan igual —Tauros es tan definitivo como Charizard—, así que la pregunta no es
 * "¿tiene evoluciones detrás?" sino "¿le queda algo por delante?".
 */
export const isFinalForm = (species: number): boolean => !evolvingSpecies.has(species);

export const finalFormSpecies: number[] = allSpecies.filter(isFinalForm);
