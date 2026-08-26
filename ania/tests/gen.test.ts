import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  allSpecies,
  getMoveType,
  getPersonal,
  isDamagingMove,
  isFinalForm,
  isSpecial,
  MAX_SPECIES,
  moveNames as moveNamesFn,
  needsDamagingMove,
  PBR_LEVEL,
  speciesNames as speciesNamesFn,
} from '../src/data/index.ts';
import { canLearn, getEncounterMoves, getLegalMovepool } from '../src/gen/learn.ts';
import { DEFAULT_OPTIONS, generatePass, generatePasses, type RandomOptions } from '../src/gen/random.ts';
import { Rng } from '../src/gen/rng.ts';
import { describeMoveDatabase, PBR_DATABASE, PKHEX_MOVES_EN } from './fixtures.ts';
import { validatePokemon } from '../src/gen/validate.ts';

// Los tests siguen comprobando el idioma de referencia (español).
const speciesNames = speciesNamesFn('es');
const moveNames = moveNamesFn('es');

describe('movimientos recomendados', () => {
  test('todas las especies obtienen 4 movimientos a nivel 50', () => {
    const sinCuatro: string[] = [];
    for (const species of allSpecies) {
      const moves = getEncounterMoves(species, 0, PBR_LEVEL);
      if (moves.filter((m) => m > 0).length !== 4) sinCuatro.push(speciesNames[species]!);
    }
    // No es un fallo: son las especies con movepool minúsculo (larvas, Ditto, Unown, Smeargle...).
    // Se fija la lista para enterarnos si alguna vez cambia por un error en los datos.
    expect(sinCuatro).toEqual([
      'Caterpie', 'Metapod', 'Weedle', 'Kakuna', 'Abra', 'Magikarp', 'Ditto', 'Unown',
      'Delibird', 'Smeargle', 'Silcoon', 'Cascoon', 'Feebas', 'Beldum', 'Kricketot', 'Combee',
    ]);
  });

  test('los movimientos recomendados son siempre legales', () => {
    const ilegales: string[] = [];
    for (const species of allSpecies) {
      const pool = getLegalMovepool(species, 0, { level: PBR_LEVEL });
      for (const move of getEncounterMoves(species, 0, PBR_LEVEL)) {
        if (move > 0 && !pool.has(move)) ilegales.push(`${speciesNames[species]}: ${moveNames[move]}`);
      }
    }
    expect(ilegales).toEqual([]);
  });

  test('nunca hay movimientos repetidos', () => {
    for (const species of allSpecies) {
      const moves = getEncounterMoves(species, 0, PBR_LEVEL).filter((m) => m > 0);
      expect(new Set(moves).size, speciesNames[species]).toBe(moves.length);
    }
  });

  test('el orden es el del juego: el último aprendido va al final', () => {
    // Garchomp a nivel 50 aprende Triturar (nivel 48) como último movimiento por nivel.
    const moves = getEncounterMoves(445, 0, 50);
    expect(moveNames[moves[3]!]).toBe('Triturar');
  });

  test('a menor nivel solo se obtienen los movimientos ya aprendidos', () => {
    // Bulbasaur en HGSS: Placaje (1), Gruñido (3), Drenadoras (7), Látigo Cepa (9).
    expect(getEncounterMoves(1, 0, 3).filter((m) => m > 0).map((m) => moveNames[m]))
      .toEqual(['Placaje', 'Gruñido']);
    expect(getEncounterMoves(1, 0, 9).filter((m) => m > 0).map((m) => moveNames[m]))
      .toEqual(['Placaje', 'Gruñido', 'Drenadoras', 'Látigo Cepa']);
  });
});

describe('movepool legal', () => {
  test('incluye los movimientos aprendidos como pre-evolución', () => {
    // Charizard no aprende Ascuas por nivel, pero Charmander sí: en Gen 4 se conserva.
    expect(canLearn(6, 52)).toBe(true);
  });

  test('incluye MT y tutores', () => {
    const garchomp = getLegalMovepool(445);
    expect(garchomp.has(89)).toBe(true); // Terremoto: MT26
    expect(garchomp.has(414)).toBe(true); // Tierra Viva: tutor de Pt/HGSS
    // Danza Dragón NO es legal para Garchomp en la generación 4: no la aprende por ningún medio.
    expect(garchomp.has(349)).toBe(false);
  });

  test('incluye los tutores especiales de la Ruta 210', () => {
    expect(canLearn(6, 307)).toBe(true); // Charizard - Anillo Ígneo
    expect(canLearn(9, 308)).toBe(true); // Blastoise - Hidrocañón
    expect(canLearn(3, 338)).toBe(true); // Venusaur - Planta Feroz
    expect(canLearn(445, 434)).toBe(true); // Garchomp - Cometa Draco
    expect(canLearn(25, 307)).toBe(false); // Pikachu no
  });

  test('rechaza movimientos que la especie no puede aprender', () => {
    expect(canLearn(1, 89)).toBe(false); // Bulbasaur no aprende Terremoto
  });
});

describe('generación aleatoria', () => {
  const seeds = [1, 42, 1234, 99999];

  test('es reproducible con la misma semilla', () => {
    const a = generatePasses(3, DEFAULT_OPTIONS, 12345);
    const b = generatePasses(3, DEFAULT_OPTIONS, 12345);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = generatePasses(3, DEFAULT_OPTIONS, 54321);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  test('cada pase trae 6 Pokémon distintos de nivel 50', () => {
    for (const seed of seeds) {
      for (const pass of generatePasses(20, DEFAULT_OPTIONS, seed)) {
        expect(pass.pokemon).toHaveLength(6);
        expect(new Set(pass.pokemon.map((p) => p.species)).size).toBe(6);
        for (const pk of pass.pokemon) {
          expect(pk.level).toBe(PBR_LEVEL);
          expect(pk.species).toBeGreaterThanOrEqual(1);
          expect(pk.species).toBeLessThanOrEqual(MAX_SPECIES);
        }
      }
    }
  });

  test('el modo "legales" no produce ninguna advertencia de legalidad', () => {
    const options: RandomOptions = { ...DEFAULT_OPTIONS, moves: 'legales', ability: 'legal', item: 'aleatorio' };
    const problemas: string[] = [];
    for (const seed of seeds) {
      for (const pass of generatePasses(25, options, seed)) {
        for (const pk of pass.pokemon) {
          for (const w of validatePokemon(pk)) {
            if (w.kind !== 'sin-movimiento-ofensivo' && w.kind !== 'movimiento-vacio') {
              problemas.push(`${speciesNames[pk.species]}: ${w.kind} ${w.message}`);
            }
          }
        }
      }
    }
    expect(problemas.slice(0, 10)).toEqual([]);
  });

  test('el modo "recomendados" tampoco produce advertencias de legalidad', () => {
    const problemas: string[] = [];
    for (const pass of generatePasses(50, DEFAULT_OPTIONS, 7)) {
      for (const pk of pass.pokemon) {
        for (const w of validatePokemon(pk)) {
          if (w.kind === 'movimiento-ilegal' || w.kind === 'habilidad-ilegal' || w.kind === 'objeto-ilegal') {
            problemas.push(`${speciesNames[pk.species]}: ${w.message}`);
          }
        }
      }
    }
    expect(problemas.slice(0, 10)).toEqual([]);
  });

  test('siempre hay un movimiento ofensivo cuando la especie lo permite', () => {
    const options: RandomOptions = { ...DEFAULT_OPTIONS, moves: 'legales' };
    const sinAtaque: string[] = [];
    for (const seed of seeds) {
      for (const pass of generatePasses(30, options, seed)) {
        for (const pk of pass.pokemon) {
          if (!needsDamagingMove(pk.species)) continue;
          if (!pk.moves.some(isDamagingMove)) sinAtaque.push(speciesNames[pk.species]!);
        }
      }
    }
    expect([...new Set(sinAtaque)]).toEqual([]);
  });

  test('con "al menos dos" hay dos ataques siempre que el movepool dé para ello', () => {
    const options: RandomOptions = { ...DEFAULT_OPTIONS, moves: 'legales', damaging: 'dos' };
    const cortos: string[] = [];
    for (const seed of seeds) {
      for (const pass of generatePasses(30, options, seed)) {
        for (const pk of pass.pokemon) {
          if (!needsDamagingMove(pk.species)) continue;
          // El tope real es el del movepool: hay pre-evoluciones con un solo ataque legal.
          const enElMovepool = [...getLegalMovepool(pk.species, pk.form, { level: PBR_LEVEL })]
            .filter(isDamagingMove).length;
          const esperados = Math.min(2, enElMovepool);
          if (pk.moves.filter(isDamagingMove).length < esperados) {
            cortos.push(`${speciesNames[pk.species]} (${esperados} posibles)`);
          }
        }
      }
    }
    expect([...new Set(cortos)]).toEqual([]);
  });

  test('con "todo vale" y dos ataques nunca falta ninguno, y no se repiten movimientos', () => {
    const options: RandomOptions = { ...DEFAULT_OPTIONS, moves: 'todo-vale', damaging: 'dos' };
    for (const seed of seeds) {
      for (const pass of generatePasses(30, options, seed)) {
        for (const pk of pass.pokemon) {
          if (needsDamagingMove(pk.species)) {
            expect(pk.moves.filter(isDamagingMove).length).toBeGreaterThanOrEqual(2);
          }
          const usados = pk.moves.filter((m) => m > 0);
          expect(new Set(usados).size).toBe(usados.length);
        }
      }
    }
  });

  test('"un movimiento de su tipo" lo garantiza, y encima que haga daño', () => {
    const options: RandomOptions = { ...DEFAULT_OPTIONS, moves: 'todo-vale', sameTypeMove: true };
    const sinTipo: string[] = [];
    for (const seed of seeds) {
      for (const pass of generatePasses(30, options, seed)) {
        for (const pk of pass.pokemon) {
          const suyos = getPersonal(pk.species, pk.form).types;
          if (!pk.moves.some((m) => m > 0 && suyos.includes(getMoveType(m)) && isDamagingMove(m))) {
            sinTipo.push(speciesNames[pk.species]!);
          }
        }
      }
    }
    expect([...new Set(sinTipo)]).toEqual([]);
  });

  test('sin la opción, el azar completo deja Pokémon sin nada de su tipo', () => {
    const options: RandomOptions = { ...DEFAULT_OPTIONS, moves: 'todo-vale' };
    const sinTipo = generatePasses(30, options, 4242)
      .flatMap((pass) => pass.pokemon)
      .filter((pk) => {
        const suyos = getPersonal(pk.species, pk.form).types;
        return !pk.moves.some((m) => m > 0 && suyos.includes(getMoveType(m)));
      });
    expect(sinTipo.length).toBeGreaterThan(0);
  });

  test('el movimiento de su tipo no se come el mínimo de ataques', () => {
    const options: RandomOptions = {
      ...DEFAULT_OPTIONS, moves: 'todo-vale', damaging: 'dos', sameTypeMove: true,
    };
    for (const seed of seeds) {
      for (const pass of generatePasses(30, options, seed)) {
        for (const pk of pass.pokemon) {
          if (!needsDamagingMove(pk.species)) continue;
          expect(pk.moves.filter(isDamagingMove).length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  test('la opción no toca los otros dos modos de movimientos', () => {
    for (const moves of ['recomendados', 'legales'] as const) {
      const sin = generatePasses(10, { ...DEFAULT_OPTIONS, moves }, 55);
      const con = generatePasses(10, { ...DEFAULT_OPTIONS, moves, sameTypeMove: true }, 55);
      expect(con).toEqual(sin);
    }
  });

  test('"solo formas finales" no saca ninguna fase intermedia', () => {
    const options: RandomOptions = { ...DEFAULT_OPTIONS, onlyFinalForms: true, atLeastOneLegendary: true };
    const evolucionables: string[] = [];
    for (const seed of seeds) {
      for (const pass of generatePasses(30, options, seed)) {
        for (const pk of pass.pokemon) {
          if (!isFinalForm(pk.species)) evolucionables.push(speciesNames[pk.species]!);
        }
      }
    }
    expect([...new Set(evolucionables)]).toEqual([]);
  });

  test('sin la opción sí salen fases intermedias', () => {
    const intermedias = generatePasses(30, DEFAULT_OPTIONS, 99)
      .flatMap((pass) => pass.pokemon)
      .filter((pk) => !isFinalForm(pk.species));
    expect(intermedias.length).toBeGreaterThan(0);
  });

  test('los Pokémon sin línea evolutiva cuentan como forma final', () => {
    // Tauros y Ditto no evolucionan ni son evolución de nada: la opción no debe excluirlos.
    for (const nombre of ['Tauros', 'Ditto', 'Mew', 'Wormadam']) {
      expect(isFinalForm(speciesNames.indexOf(nombre))).toBe(true);
    }
    // Y las que sí tienen algo por delante quedan fuera, aunque ya sean una evolución.
    for (const nombre of ['Ivysaur', 'Eevee', 'Dusclops', 'Porygon2']) {
      expect(isFinalForm(speciesNames.indexOf(nombre))).toBe(false);
    }
  });

  test('el modo "al menos un legendario" siempre coloca uno', () => {
    const options: RandomOptions = { ...DEFAULT_OPTIONS, atLeastOneLegendary: true };
    for (const seed of seeds) {
      for (const pass of generatePasses(30, options, seed)) {
        expect(pass.pokemon.some((pk) => isSpecial(pk.species))).toBe(true);
      }
    }
  });

  test('los EV aleatorios gastan los 510 enteros y respetan el tope por estadística', () => {
    const repartos = new Set<string>();
    for (const pass of generatePasses(50, DEFAULT_OPTIONS, 3)) {
      for (const pk of pass.pokemon) {
        const values = Object.values(pk.evs);
        expect(values.reduce((a, b) => a + b, 0)).toBe(510);
        expect(Math.max(...values)).toBeLessThanOrEqual(255);
        expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
        repartos.add(values.join(','));
      }
    }
    // Y siguen siendo aleatorios: no es que se haya fijado un reparto único que suma 510.
    expect(repartos.size).toBeGreaterThan(100);
  });

  test('los EV equitativos son 85 en cada estadística', () => {
    for (const pass of generatePasses(10, { ...DEFAULT_OPTIONS, evs: 'equitativos' }, 4)) {
      for (const pk of pass.pokemon) {
        expect(Object.values(pk.evs)).toEqual([85, 85, 85, 85, 85, 85]);
      }
    }
  });

  test('con IV perfectos salen todos a 31, y aleatorios varían', () => {
    const perfect = generatePass(new Rng(1), { ...DEFAULT_OPTIONS, ivs: 'perfectos' });
    expect(perfect.pokemon.every((pk) => Object.values(pk.ivs).every((v) => v === 31))).toBe(true);

    const random = generatePasses(20, { ...DEFAULT_OPTIONS, ivs: 'aleatorios' }, 1);
    const todos = random.flatMap((p) => p.pokemon.flatMap((pk) => Object.values(pk.ivs)));
    expect(new Set(todos).size).toBeGreaterThan(20);
  });

  test('la habilidad legal siempre es una de las dos de la especie', () => {
    for (const pass of generatePasses(40, DEFAULT_OPTIONS, 11)) {
      for (const pk of pass.pokemon) {
        expect(getPersonal(pk.species).abilities).toContain(pk.ability);
      }
    }
  });

  test('sin objeto no se equipa nada; con objeto siempre se equipa algo', () => {
    const ninguno = generatePasses(10, { ...DEFAULT_OPTIONS, item: 'ninguno' }, 5);
    expect(ninguno.every((p) => p.pokemon.every((pk) => pk.heldItem === 0))).toBe(true);

    const aleatorio = generatePasses(10, { ...DEFAULT_OPTIONS, item: 'aleatorio' }, 5);
    expect(aleatorio.every((p) => p.pokemon.every((pk) => pk.heldItem > 0))).toBe(true);
  });
});

/**
 * Comprobación independiente de la lista de movimientos de estado, que es el único dato escrito
 * a mano del proyecto. La base de datos del guardado de ejemplo trae cientos de equipos
 * competitivos reales; ninguno debería quedarse sin un solo movimiento ofensivo.
 */
describeMoveDatabase('lista de movimientos de estado, contra la base de datos de PBR', () => {
  /**
   * Ni la base de datos ni la fuente de PKHeX viajan en el repositorio, así que se leen dentro
   * de `beforeAll` y no en el cuerpo del bloque: vitest ejecuta el cuerpo al recolectar, incluso
   * cuando el bloque está saltado, y ahí una lectura de fichero tumbaría el archivo entero.
   */
  /** Nombres en inglés -> ID, porque la base de datos está en inglés. */
  let idByName: Map<string, number>;
  const sets: { species: string; moves: string[] }[] = [];

  beforeAll(() => {
    const enNames = readFileSync(PKHEX_MOVES_EN, 'utf8').replace(/\r/g, '').split('\n');
    idByName = new Map(enNames.map((n, i) => [n, i]));

    for (const line of readFileSync(PBR_DATABASE, 'utf8').replace(/\r/g, '').split('\n')) {
      const m = /^\[\d+\]\s{2,}(.+)$/.exec(line.trim());
      if (m === null) continue;
      const fields = m[1]!.split(/\s{2,}/).map((f) => f.trim()).filter((f) => f !== '');
      // especie, género, objeto, habilidad, 4 movimientos, y luego 6 números de estadísticas
      const statsAt = fields.findIndex((f, i) => i > 4 && /^\d+$/.test(f));
      if (statsAt < 5) continue;
      const moves = fields.slice(statsAt - 4, statsAt);
      if (moves.length === 4) sets.push({ species: fields[0]!, moves });
    }
  });

  test('la base de datos se ha parseado', () => {
    expect(sets.length).toBeGreaterThan(300);
  });

  /**
   * La base de datos la escribió una persona a mano y tiene ruido propio: una errata
   * ("Sel-Destruct"), una habilidad colada en la columna de movimientos ("Levitate"), un
   * tabulador en vez de espacios, huecos "(None)" y los Poder Oculto anotados con su tipo.
   * Se fija esa lista para que el test detecte nombres nuevos sin dar por bueno el ruido.
   */
  const RUIDO_CONOCIDO = [
    '(None)', 'Hidden Power (E)', 'Hidden Power (F)', 'Hidden Power (I)', 'Levitate',
    'Sel-Destruct', 'Stealth\tRock U-Turn',
  ];

  test('todos los movimientos reconocibles existen en la generación 4', () => {
    const desconocidos = new Set<string>();
    for (const set of sets) {
      for (const move of set.moves) {
        if (RUIDO_CONOCIDO.includes(move)) continue;
        const id = idByName.get(move);
        if (id === undefined || id === 0 || id > 467) desconocidos.add(move);
      }
    }
    expect([...desconocidos]).toEqual([]);
  });

  /**
   * Esta es la comprobación que de verdad valida la lista de movimientos de estado: se aplica a
   * más de 2000 movimientos de equipos competitivos reales. Los únicos que salen sin ataque son
   * equipos de apoyo legítimos, así que la clasificación no tiene falsos positivos.
   */
  test('los únicos equipos sin movimiento ofensivo son los de apoyo genuinos', () => {
    const sinAtaque: string[] = [];
    for (const set of sets) {
      const ids = set.moves.map((m) => idByName.get(m) ?? 0);
      if (!ids.some(isDamagingMove)) sinAtaque.push(`${set.species}: ${set.moves.join(', ')}`);
    }
    expect(sinAtaque).toEqual([
      'Ditto: Transform, (None), (None), (None)',
      'Ditto: Transform, (None), (None), (None)',
      'Ledian: Agility, Swords Dance, Baton Pass, Encore',
      'Hoppip: Sleep Powder, Sunny Day, Encore, Memento',
    ]);
  });

  test('la lista cubre una muestra grande de movimientos reales', () => {
    const total = sets.flatMap((s) => s.moves).length;
    expect(total).toBeGreaterThan(2000);
  });
});
