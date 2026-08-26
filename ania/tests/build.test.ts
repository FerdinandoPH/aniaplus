/**
 * Construcción de BK4 a partir de Pokémon generados, y su escritura en un guardado real.
 *
 * Es la prueba que cierra la Fase 2 con la Fase 1: un pase generado de cero tiene que poder
 * meterse en el guardado, sobrevivir al ciclo de cifrado y volver a leerse idéntico.
 */
import { describe, expect, test } from 'vitest';
import { BK4 } from '../src/core/bk4.ts';
import { BattlePass } from '../src/core/pass.ts';
import { PbrSave } from '../src/core/save.ts';
import { getPersonal, moveNames as moveNamesFn, movePP, speciesNames as speciesNamesFn } from '../src/data/index.ts';
import { buildBK4, defaultPokemon, findPid, Gender, genderFromPid } from '../src/gen/build.ts';
import { DEFAULT_OPTIONS, generatePass, generatePasses } from '../src/gen/random.ts';
import { Rng } from '../src/gen/rng.ts';
import { describeSaves, loadRaw } from './fixtures.ts';

// Los tests siguen comprobando el idioma de referencia (español).
const speciesNames = speciesNamesFn('es');
const moveNames = moveNamesFn('es');

describe('PID', () => {
  test('produce la naturaleza y la habilidad pedidas', () => {
    const rng = new Rng(1);
    for (let nature = 0; nature < 25; nature++) {
      for (const slot of [0, 1] as const) {
        const pid = findPid(rng, { nature, abilitySlot: slot, genderRatio: 127 });
        expect(pid % 25).toBe(nature);
        expect(pid & 1).toBe(slot);
      }
    }
  });

  test('respeta el género pedido', () => {
    const rng = new Rng(2);
    const pid = findPid(rng, { nature: 3, abilitySlot: 0, gender: Gender.Female, genderRatio: 127 });
    expect(genderFromPid(pid, 127)).toBe(Gender.Female);
  });

  test('las especies sin género siempre salen sin género', () => {
    expect(genderFromPid(0x12345678, 255)).toBe(Gender.Genderless);
    expect(genderFromPid(0x00000000, 254)).toBe(Gender.Female);
    expect(genderFromPid(0xffffffff, 0)).toBe(Gender.Male);
  });

  test('encuentra un PID brillante cuando se pide', () => {
    const rng = new Rng(3);
    const pid = findPid(rng, { nature: 0, abilitySlot: 0, genderRatio: 127, shiny: true, tid: 12345, sid: 54321 });
    expect((12345 ^ 54321 ^ (pid >>> 16) ^ (pid & 0xffff)) & 0xfff8).toBe(0);
  });
});

describe('construcción de BK4', () => {
  test('el Pokémon construido conserva todo lo pedido', () => {
    const rng = new Rng(10);
    const pass = generatePass(rng, DEFAULT_OPTIONS);
    for (const draft of pass.pokemon) {
      const pk = buildBK4(rng, draft, { tid: 111, sid: 222 });
      expect(pk.species).toBe(draft.species);
      expect(pk.ability).toBe(draft.ability);
      expect(pk.moves).toEqual(draft.moves);
      expect(pk.ivs).toEqual(draft.ivs);
      expect(pk.evs).toEqual(draft.evs);
      expect(pk.heldItem).toBe(draft.heldItem);
      expect(pk.checksumValid).toBe(true);
    }
  });

  test('la naturaleza y la habilidad se derivan correctamente del PID', () => {
    const rng = new Rng(11);
    for (const draft of generatePass(rng, DEFAULT_OPTIONS).pokemon) {
      const pk = buildBK4(rng, draft);
      const info = getPersonal(draft.species);
      expect(pk.nature).toBe(draft.nature);
      // La habilidad activa en el juego es la que indica el bit bajo del PID.
      expect(info.abilities[pk.abilitySlot]).toBe(pk.ability);
    }
  });

  test('los PP se rellenan según el movimiento', () => {
    const rng = new Rng(12);
    const pk = buildBK4(rng, generatePass(rng, DEFAULT_OPTIONS).pokemon[0]!);
    pk.moves.forEach((move, i) => {
      expect(pk.pp[i], moveNames[move]).toBe(movePP[move] ?? 0);
    });
  });

  test('la experiencia corresponde al nivel 50 de la curva de la especie', () => {
    const rng = new Rng(13);
    // Slaking es de curva "lento": 156250 puntos a nivel 50.
    const pk = buildBK4(rng, {
      species: 289, moves: [1, 0, 0, 0], ability: getPersonal(289).abilities[0]!, heldItem: 0,
      evs: { hp: 0, atk: 0, def: 0, spe: 0, spa: 0, spd: 0 },
      ivs: { hp: 31, atk: 31, def: 31, spe: 31, spa: 31, spd: 31 },
      nature: 0, level: 50,
    });
    expect(pk.exp).toBe(156250);
    expect(pk.metLevel).toBe(50);
  });

  test('el round-trip de permutación deja el BK4 igual', () => {
    const rng = new Rng(14);
    for (const draft of generatePass(rng, DEFAULT_OPTIONS).pokemon) {
      const pk = buildBK4(rng, draft);
      const reloaded = BK4.fromStored(pk.toStored());
      expect(reloaded.species).toBe(pk.species);
      expect(reloaded.pid).toBe(pk.pid);
      expect(reloaded.checksumValid).toBe(true);
    }
  });
});

describeSaves('un pase generado de cero, escrito en un guardado real', () => {
  test('sobrevive al ciclo completo y se relee idéntico', () => {
    const save = PbrSave.load(loadRaw('europa'));
    save.selectSlot(0);
    const rng = new Rng(2024);

    const generated = generatePasses(1, { ...DEFAULT_OPTIONS, moves: 'legales', item: 'aleatorio' }, 2024)[0]!;
    const pass = save.getPass(0);
    // Vaciamos y metemos el equipo nuevo.
    for (let i = 5; i >= 0; i--) pass.deletePokemon(i);
    pass.trainerName = 'ALEATORIO';
    generated.pokemon.forEach((draft, i) => pass.setPokemon(i, buildBK4(rng, draft)));

    const reloaded = PbrSave.load(save.serialize());
    reloaded.selectSlot(0);
    const after = reloaded.getPass(0);

    expect(after.trainerName).toBe('ALEATORIO');
    expect(after.pokemon.map((pk) => pk.species)).toEqual(generated.pokemon.map((pk) => pk.species));
    for (const [i, pk] of after.pokemon.entries()) {
      expect(pk.checksumValid, speciesNames[pk.species]).toBe(true);
      expect(pk.moves).toEqual(generated.pokemon[i]!.moves);
      expect(pk.ivs).toEqual(generated.pokemon[i]!.ivs);
    }
  });
});

describeSaves('mote', () => {
  test('sin mote propio, el campo lleva el nombre de la especie', () => {
    const rng = new Rng(7);
    const draft = generatePass(rng, DEFAULT_OPTIONS).pokemon[0]!;
    const pk = buildBK4(rng, draft);

    // PBR enseña en combate lo que haya en el campo: vacío significa un Pokémon sin nombre.
    expect(pk.isNicknamed).toBe(false);
    // En mayúsculas, como los nombres de los juegos de la generación 4.
    expect(pk.nickname).toBe(speciesNames[pk.species]!.toUpperCase());
  });

  /**
   * Farfetch’d es el único de los 493 cuyo nombre no vuelve del guardado tal cual se metió, y
   * conviene que eso esté escrito en una prueba en vez de aparecer de vez en cuando en otra.
   *
   * PKHeX escribe el nombre con el apóstrofo tipográfico ’ (U+2019). La tabla de caracteres de
   * Gen 4 no lo tiene: `encodeG4String` guarda en su lugar el apóstrofo del juego (0x1B3), que al
   * releer sale como el recto. El byte guardado es el correcto —es el que el juego pinta—, así
   * que lo que cambia es la forma del apóstrofo y nada más.
   *
   * Antes de existir esta prueba, la de la interfaz comparaba contra el nombre de partida y
   * fallaba una de cada ochenta ejecuciones: justo cuando el generador sorteaba esta especie.
   */
  test('Farfetch’d: el apóstrofo tipográfico se guarda como el del juego', () => {
    const pk = defaultPokemon(83);

    expect(speciesNames[83]).toBe('Farfetch’d');
    expect(pk.nickname).toBe("FARFETCH'D");
    expect(pk.isNicknamed).toBe(false);
    expect(pk.checksumValid).toBe(true);
  });

  test('con mote pedido, se usa ese y queda marcado como propio', () => {
    const rng = new Rng(21);
    const draft = generatePass(rng, DEFAULT_OPTIONS).pokemon[0]!;
    const pk = buildBK4(rng, draft, { nickname: 'chorizo' });

    expect(pk.nickname).toBe('CHORIZO');
    expect(pk.isNicknamed).toBe(true);
    expect(pk.checksumValid).toBe(true);
  });

  test('el mote sobrevive al ciclo del guardado', () => {
    const save = PbrSave.load(loadRaw('europa'));
    save.selectSlot(0);
    const rng = new Rng(11);
    const pass = save.getPass(0);
    for (let i = 5; i >= 0; i--) pass.deletePokemon(i);

    const pk = buildBK4(rng, generatePass(rng, DEFAULT_OPTIONS).pokemon[0]!);
    pk.nickname = 'MOTAZO';
    pk.isNicknamed = true;
    pk.refreshChecksum();
    pass.setPokemon(0, pk);

    const reloaded = PbrSave.load(save.serialize());
    reloaded.selectSlot(0);
    const after = reloaded.getPass(0).getPokemon(0)!;
    expect(after.nickname).toBe('MOTAZO');
    expect(after.isNicknamed).toBe(true);
  });
});

/**
 * El sello de idioma de un pase.
 *
 * Un pase recién creado son 0x6EC bytes a cero, y el 0 de este campo significa japonés: sin
 * escribirlo, todo lo que generaba ANIA+ quedaba marcado como japonés, también en una partida
 * española. Ahora se sella con el idioma del guardado, que es lo que el juego va a enseñar.
 */
describeSaves('idioma de un pase creado desde cero', () => {
  test('se escribe el que se pide, y en japonés también', () => {
    expect(BattlePass.create('ES', 'es').language).toBe('es');
    expect(BattlePass.create('ES', 'es').languageByte).toBe(4);
    expect(BattlePass.create('JA', 'ja').language).toBe('ja');
    expect(BattlePass.create('JA', 'ja').languageByte).toBe(0);
    expect(BattlePass.create('EN', 'en').languageByte).toBe(1);
  });

  test('sobrevive al ciclo del guardado', () => {
    const save = PbrSave.load(loadRaw('europa'));
    save.selectSlot(0);
    const custom = save.customPassIndexes[0]!;
    save.getPass(custom).data.set(BattlePass.create('SELLO', 'ja').data);

    const reloaded = PbrSave.load(save.serialize());
    reloaded.selectSlot(0);
    expect(reloaded.getPass(custom).language).toBe('ja');
    expect(reloaded.getPass(custom).trainerName).toBe('SELLO');
  });
});
