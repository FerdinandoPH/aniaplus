/**
 * Idioma de la interfaz (localStorage) frente a idioma propio de cada Pokémon (`pk.language`).
 *
 * El caso que de verdad importa: editar un Pokémon creado en un idioma con la interfaz puesta en
 * otro no debe cambiarle el idioma grabado ni el mote por defecto — ver `gen/language.ts`.
 */
import { describe, expect, test } from 'vitest';
import { LANGUAGES, speciesNames } from '../src/data/index.ts';
import { buildBK4, defaultPokemon, speciesNickname } from '../src/gen/build.ts';
import { bk4FromLang, langFromBk4 } from '../src/gen/language.ts';
import { Rng } from '../src/gen/rng.ts';

describe('conversión BK4.language <-> Lang', () => {
  test('ida y vuelta para todos los idiomas', () => {
    for (const lang of LANGUAGES) {
      expect(langFromBk4(bk4FromLang(lang))).toBe(lang);
    }
  });

  test('valores conocidos de la numeración clásica de Gen 4', () => {
    expect(bk4FromLang('ja')).toBe(1);
    expect(bk4FromLang('es')).toBe(7);
    expect(bk4FromLang('en')).toBe(2);
    expect(bk4FromLang('de')).toBe(5);
    expect(bk4FromLang('fr')).toBe(3);
    expect(bk4FromLang('it')).toBe(4);
  });

  /*
   * El japonés sí se traduce desde que hay guardados de la versión japonesa. El coreano no: PBR no
   * salió en Corea y sus caracteres viven en un rango aparte de la tabla de Gen 4 que la
   * aplicación no maneja, así que se enseña en inglés.
   */
  test('el coreano (6) cae a inglés; el japonés (1) ya no', () => {
    expect(langFromBk4(6)).toBe('en');
    expect(langFromBk4(1)).toBe('ja');
  });
});

describe('idioma propio del Pokémon al editar', () => {
  test('un Pokémon nuevo se cría en el idioma pedido', () => {
    const pk = defaultPokemon(1, 0, { lang: 'fr' });
    expect(pk.language).toBe(bk4FromLang('fr'));
    expect(pk.nickname).toBe(speciesNames('fr')[1]!.toUpperCase());
  });

  test('cambiar de especie en un Pokémon existente no le cambia el idioma grabado', () => {
    const pk = defaultPokemon(1, 0, { lang: 'de' });
    const originalLanguageByte = pk.language;

    // Simula lo que hace pokemoneditor.ts al cambiar de especie sin mote propio: usa el idioma
    // del propio Pokémon (`langFromBk4`), no el que tenga puesto la interfaz en ese momento
    // (aquí, 'es' — distinto del 'de' con que se creó este Pokémon).
    const ownLang = langFromBk4(pk.language);
    pk.species = 6; // Charizard/Glurak: el nombre difiere entre alemán y español
    pk.nickname = speciesNickname(pk.species, ownLang);

    expect(pk.language).toBe(originalLanguageByte);
    expect(ownLang).toBe('de');
    expect(pk.nickname).toBe(speciesNames('de')[6]!.toUpperCase());
    expect(pk.nickname).not.toBe(speciesNames('es')[6]!.toUpperCase());
  });

  test('copiar un Pokémon (buildBK4) conserva su propio idioma pase lo que pase con la interfaz', () => {
    const rng = new Rng(1);
    const pk = buildBK4(rng, {
      species: 1, ability: 65, heldItem: 0, moves: [33, 0, 0, 0],
      evs: { hp: 0, atk: 0, def: 0, spe: 0, spa: 0, spd: 0 },
      ivs: { hp: 31, atk: 31, def: 31, spe: 31, spa: 31, spd: 31 },
    }, { lang: 'de' });
    expect(pk.language).toBe(bk4FromLang('de'));
  });
});
