/**
 * Conversión entre el byte `BK4.language` (numeración clásica de Gen 4: 1=JP, 2=EN, 3=FR,
 * 4=IT, 5=DE, 6=KO, 7=ES) y el `Lang` de la app.
 *
 * Cada Pokémon lleva su propio idioma grabado (con qué idioma de juego se creó), independiente
 * del idioma que tenga puesto la interfaz de ANIA+ en cada momento: al editar un Pokémon ya
 * existente no hay que sobrescribir ese byte ni el mote por defecto con el idioma de la
 * interfaz: el idioma y la región de un pase son los de quien lo creó, no los de quien lo edita.
 */
import type { Lang } from '../data/index.ts';

const BK4_TO_LANG: Record<number, Lang> = {
  1: 'ja',
  2: 'en',
  3: 'fr',
  4: 'it',
  5: 'de',
  7: 'es',
};

const LANG_TO_BK4: Record<Lang, number> = {
  ja: 1,
  es: 7,
  en: 2,
  de: 5,
  fr: 3,
  it: 4,
};

/**
 * El coreano (6) es el único que no se traduce: PBR no salió en Corea, y sus caracteres viven en
 * un rango aparte de la tabla de Gen 4 (`TableKOR`, desde 0x400) que la aplicación no maneja. Un
 * Pokémon coreano se enseña en inglés, pero su byte de idioma no se toca al editarlo.
 */
export function langFromBk4(bk4Language: number): Lang {
  return BK4_TO_LANG[bk4Language] ?? 'en';
}

export function bk4FromLang(lang: Lang): number {
  return LANG_TO_BK4[lang];
}
