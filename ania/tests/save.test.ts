/**
 * Fase 1 — verificación bloqueante del núcleo binario.
 *
 * La prueba que de verdad importa es el round-trip byte a byte: si descifrar y volver a cifrar
 * no devuelve el fichero original, cualquier cosa que escribamos en una Wii es basura.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { computeBK4Checksum } from '../src/core/bk4.ts';
import { verifyChecksums } from '../src/core/checksum.ts';
import { PASS_COUNT, PASS_LANGUAGE, SIZE_PARTITION, SIZE_SAVE, SLOT_COUNT } from '../src/core/constants.ts';
import { decryptPartition, encryptPartition } from '../src/core/genius.ts';
import { PbrSave } from '../src/core/save.ts';
import { speciesNames } from '../src/data/index.ts';
import { describeSaves, diffBuffers, loadRaw, SAVE_FILES } from './fixtures.ts';

const species = speciesNames('es');

const NAMES = Object.keys(SAVE_FILES) as (keyof typeof SAVE_FILES)[];

describeSaves.each(NAMES)('guardado %s', (name) => {
  let raw: Uint8Array;
  beforeAll(() => { raw = loadRaw(name); });

  test('tiene el tamaño de un guardado de PBR', () => {
    expect(raw.length).toBe(SIZE_SAVE);
  });

  test('round-trip del cifrado: descifrar y recifrar devuelve el original', () => {
    const data = raw.slice();
    decryptPartition(data, 0);
    decryptPartition(data, SIZE_PARTITION);
    // Descifrado tiene que ser distinto del original, o no estaríamos cifrando nada.
    expect(diffBuffers(data, raw)).not.toBeNull();

    encryptPartition(data, 0);
    encryptPartition(data, SIZE_PARTITION);
    expect(diffBuffers(data, raw)).toBeNull();
  });

  test('las dos particiones tienen checksums válidos', () => {
    const data = raw.slice();
    decryptPartition(data, 0);
    decryptPartition(data, SIZE_PARTITION);
    expect(verifyChecksums(data, 0)).toBe(true);
    expect(verifyChecksums(data, SIZE_PARTITION)).toBe(true);
  });

  test('round-trip completo recalculando los checksums', () => {
    const save = PbrSave.load(raw);
    // serializeUnchanged no toca el contador; si nuestro cálculo de checksums coincide con el
    // del juego, el fichero resultante es idéntico al original byte a byte.
    expect(diffBuffers(save.serializeUnchanged(), raw)).toBeNull();
  });

  test('se reconoce como guardado válido', () => {
    expect(PbrSave.isValid(raw)).toBe(true);
  });

  test('todos los BK4 de todos los pases sobreviven al round-trip', () => {
    const save = PbrSave.load(raw);
    let checked = 0;
    let broken = 0;

    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      save.selectSlot(slot);
      for (let i = 0; i < PASS_COUNT; i++) {
        const pass = save.getPass(i);
        for (let p = 0; p < 6; p++) {
          const pk = pass.getPokemon(p);
          if (pk === null) continue;

          expect(pk.species).toBeGreaterThan(0);
          expect(pk.species).toBeLessThanOrEqual(493);

          /*
           * El round-trip solo tiene sentido donde el checksum guardado ya era correcto: al
           * serializar se recalcula, así que un Pokémon con el checksum mal —los hay, ver abajo—
           * sale distinto de como entró, y eso es justo lo que debe pasar.
           */
          if (pk.checksum !== computeBK4Checksum(pk.data)) {
            broken++;
            continue;
          }
          const original = pass.data.subarray(0x1fc + p * 140, 0x1fc + p * 140 + 136);
          expect(diffBuffers(pk.toStored(), new Uint8Array(original)), `pase ${i} ranura ${p} del perfil ${slot}`).toBeNull();
          checked++;
        }
      }
    }
    // Estos guardados vienen con decenas de equipos hechos; si no encontramos nada, algo falla.
    expect(checked).toBeGreaterThan(100);
    expect(broken).toBe(BROKEN_CHECKSUMS[name]);
  });
});

/**
 * Pokémon con el checksum del BK4 mal **en el propio fichero**, por guardado.
 *
 * No es un fallo nuestro: son equipos metidos con un editor que no lo recalculó. Los tres
 * guardados escritos por el juego están impecables; el americano trae 17, todos en el mismo pase
 * de un perfil que además tiene mal la bandera de idioma, señal de la misma mano. Se cuentan en
 * vez de ignorarse porque el día que aparezca uno de más en un guardado limpio, hay que enterarse.
 * ANIA+ los repara al escribir, que es lo único razonable.
 */
const BROKEN_CHECKSUMS: Record<keyof typeof SAVE_FILES, number> = {
  europa: 0,
  sudamerica: 0,
  usa: 17,
  japon: 0,
};

describeSaves('guardado europa: contenido conocido', () => {
  let save: PbrSave;
  beforeAll(() => { save = PbrSave.load(loadRaw('europa')); });

  test('gana la partición con el contador más alto', () => {
    expect(save.partition).toBe(0);
    expect(save.saveCount).toBe(8060);
  });

  test('los cuatro perfiles son los documentados', () => {
    expect(save.slots.map((s) => s.trainerName)).toEqual(['PKTOPIA', 'Joro', 'Azul', 'Verde']);
  });

  test('es una partida en español y no japonesa', () => {
    expect(save.language).toBe('es');
    expect(save.japanese).toBe(false);
  });

  test('los primeros pases coinciden con la lista del autor del guardado', () => {
    save.selectSlot(0);
    const names = Array.from({ length: 8 }, (_, i) => save.getPass(i).trainerName);
    expect(names).toEqual(['Lance', 'Máximo', 'Plubio', 'Cintia', 'Joro', 'Azul', 'Verde', 'Prof. Oak']);
  });

  test('el equipo de Cintia es el suyo', () => {
    save.selectSlot(0);
    const team = save.getPass(3).pokemon.map((pk) => species[pk.species]);
    expect(team).toEqual(['Spiritomb', 'Roserade', 'Gastrodon', 'Garchomp', 'Lucario', 'Milotic']);
  });

  /**
   * El idioma de un pase es el de quien lo creó, no el del perfil que lo tiene guardado: este
   * guardado lo hizo un angloparlante, así que sus pases dicen "en" aunque la partida sea
   * española. Lo comprobable es que nunca aparece un valor fuera del enum del juego, que es lo
   * que pasaría si estuviésemos leyendo el offset equivocado.
   */
  test('el idioma de los pases siempre es un valor del enum del juego', () => {
    // El byte crudo, no el getter con nombre: ese cae a inglés ante un valor raro y taparía
    // justo lo que esta prueba busca, que es estar leyendo el offset equivocado.
    const bytes = new Set<number>();
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      save.selectSlot(slot);
      for (let i = 0; i < PASS_COUNT; i++) bytes.add(save.getPass(i).languageByte);
    }
    expect([...bytes].every((b) => b < PASS_LANGUAGE.length)).toBe(true);
  });

  /**
   * El código de región lo escribe la consola que creó el pase, no la que lo lee. Este guardado
   * contiene las tres variantes: pases hechos con un editor (todo a cero), pases creados en una
   * consola PAL ("EURO") y pases de amigo importados de una NTSC ("USA "). Lo que se comprueba
   * es que solo aparecen valores del juego, no basura por leer el offset equivocado.
   */
  test('los códigos de región son valores válidos del juego', () => {
    const codes = new Set<string>();
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      save.selectSlot(slot);
      for (let i = 0; i < PASS_COUNT; i++) codes.add(save.getPass(i).regionCode);
    }
    expect([...codes].sort()).toEqual(['\0\0\0\0', 'EURO', 'USA ']);
  });

  test('los Pokémon de los pases traen nivel de encuentro y datos coherentes', () => {
    save.selectSlot(0);
    const garchomp = save.getPass(3).pokemon[3]!;
    expect(species[garchomp.species]).toBe('Garchomp');
    expect(garchomp.moves.filter((m) => m > 0).length).toBeGreaterThan(0);
    expect(Object.values(garchomp.ivs).every((iv) => iv >= 0 && iv <= 31)).toBe(true);
    expect(Object.values(garchomp.evs).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(510);
  });
});

/**
 * La región del juego, que no está escrita en ninguna parte con su nombre.
 *
 * Lo único que la delata dentro del fichero es el bit de juego japonés, y de él depende una
 * frontera muy real: dónde acaban los pases personales y empiezan los de alquiler. Estas pruebas
 * van contra guardados de verdad de las tres versiones (RPBP01, RPBE01 y RPBJ01).
 */
describeSaves('región del guardado', () => {
  /**
   * La frontera leída de los propios pases, sin mirar ninguna bandera.
   *
   * Los pases de alquiler llevan su bit puesto (`0x545` bit 6), así que el primero que lo tenga
   * marca dónde acaban los personales. Es la única fuente independiente que hay, y es la que
   * destapó que la bandera de japonés se estaba leyendo mal.
   */
  function firstRentalIndex(save: PbrSave): number {
    for (let i = 0; i < PASS_COUNT; i++) if (save.getPass(i).rental) return i;
    return -1;
  }

  test('el guardado americano es inglés y no japonés, con 37 pases personales', () => {
    const save = PbrSave.load(loadRaw('usa'));
    expect(save.japanese).toBe(false);
    expect(save.language).toBe('en');
    expect(save.customPassIndexes).toHaveLength(37);
    expect(firstRentalIndex(save)).toBe(37);
  });

  test('el guardado japonés es japonés, con 32 pases personales', () => {
    const save = PbrSave.load(loadRaw('japon'));
    expect(save.japanese).toBe(true);
    expect(save.language).toBe('ja');
    expect(save.customPassIndexes).toHaveLength(32);
    expect(save.slots.map((s) => s.trainerName)).toEqual(['ポケトピア', 'レッド', 'グリーン', 'ブルー']);
  });

  /*
   * La regresión concreta que había: la bandera se leía perfil a perfil, y en un perfil sin
   * estrenar ese byte está a cero, que significa japonés. El guardado americano tiene dos ranuras
   * vacías y una tercera con el byte a cero, así que tres de sus cuatro perfiles pasaban por
   * japoneses y se quedaban con 32 pases personales en vez de 37.
   */
  test('un perfil vacío no convierte el guardado en japonés', () => {
    const save = PbrSave.load(loadRaw('usa'));
    expect(save.slots.filter((s) => s.empty).length).toBeGreaterThan(0);
    for (const slot of save.slots) {
      save.selectSlot(slot.index);
      expect(save.japanese, `perfil ${slot.index}`).toBe(false);
      expect(save.customPassIndexes, `perfil ${slot.index}`).toHaveLength(37);
    }
  });

  test('los tres idiomas de perfil se distinguen entre sí', () => {
    expect(PbrSave.load(loadRaw('europa')).language).toBe('es');
    expect(PbrSave.load(loadRaw('usa')).language).toBe('en');
    expect(PbrSave.load(loadRaw('japon')).language).toBe('ja');
  });

  /*
   * El silabario japonés no necesita ninguna tabla aparte: la de Gen 4 es única y ya lo trae. Se
   * comprueba con un mote real del guardado japonés, ida y vuelta por el fichero entero.
   */
  test('un mote en kana sobrevive al ciclo de escritura y relectura', () => {
    const save = PbrSave.load(loadRaw('japon'));
    save.selectSlot(0);
    const pass = save.getPass(0);
    const original = pass.pokemon.map((pk) => pk.nickname);
    expect(original.some((name) => /[ぁ-んァ-ン]/.test(name))).toBe(true);

    const again = PbrSave.load(save.serialize());
    again.selectSlot(0);
    expect(again.getPass(0).pokemon.map((pk) => pk.nickname)).toEqual(original);
  });
});
