/**
 * Escritura: modificar el guardado y volver a leerlo.
 *
 * El round-trip de `save.test.ts` demuestra que sabemos *leer* sin romper nada. Esto demuestra
 * que sabemos *escribir*: que un cambio sobrevive al ciclo de cifrado y checksums, y que el
 * resultado sigue siendo un guardado que se valida a sí mismo.
 */
import { describe, expect, test } from 'vitest';
import { BK4 } from '../src/core/bk4.ts';
import { COLOSSEUM_UNLOCK, PASS_COUNT, SIZE_PARTITION } from '../src/core/constants.ts';
import { verifyChecksums } from '../src/core/checksum.ts';
import { decryptPartition } from '../src/core/genius.ts';
import { PbrSave } from '../src/core/save.ts';
import { speciesNames } from '../src/data/index.ts';
import { describeSaves, diffBuffers, loadRaw } from './fixtures.ts';

const species = speciesNames('es');

/** Guarda y vuelve a cargar, como haría el ciclo Wii -> web -> Wii. */
function cycle(save: PbrSave): PbrSave {
  return PbrSave.load(save.serialize());
}

describeSaves('escritura y relectura', () => {
  test('un cambio en el nombre del entrenador sobrevive al ciclo', () => {
    const save = PbrSave.load(loadRaw('europa'));
    save.selectSlot(0);
    save.getPass(0).trainerName = 'ANIA+';

    const reloaded = cycle(save);
    reloaded.selectSlot(0);
    expect(reloaded.getPass(0).trainerName).toBe('ANIA+');
    // El resto del pase no debe haberse tocado.
    expect(reloaded.getPass(0).pokemon.map((pk) => pk.species)).toEqual(
      PbrSave.load(loadRaw('europa')).getPass(0).pokemon.map((pk) => pk.species),
    );
  });

  test('el guardado resultante sigue teniendo checksums válidos', () => {
    const save = PbrSave.load(loadRaw('europa'));
    save.selectSlot(0);
    save.getPass(0).trainerName = 'ANIA+';

    const written = save.serialize();
    const decrypted = written.slice();
    decryptPartition(decrypted, 0);
    decryptPartition(decrypted, SIZE_PARTITION);
    expect(verifyChecksums(decrypted, save.partition * SIZE_PARTITION)).toBe(true);

    // Y se puede volver a abrir sin quejas.
    expect(() => PbrSave.load(written)).not.toThrow();
  });

  test('el contador de guardado se incrementa para que el juego prefiera esta partición', () => {
    const save = PbrSave.load(loadRaw('europa'));
    const before = save.saveCount;
    const reloaded = cycle(save);
    expect(reloaded.saveCount).toBe(before + 1);
    expect(reloaded.partition).toBe(save.partition);
  });

  test('escribir un Pokémon en un pase lo deja legible y con checksum correcto', () => {
    const save = PbrSave.load(loadRaw('europa'));
    save.selectSlot(0);

    // Tomamos un Garchomp real del pase de Cintia y lo copiamos al primer pase, cambiándole el mote.
    const garchomp = save.getPass(3).pokemon[3]!;
    garchomp.nickname = 'Colmillo';
    garchomp.isNicknamed = true;
    save.getPass(0).setPokemon(0, garchomp, { box: 255, slot: 0 });

    const reloaded = cycle(save);
    reloaded.selectSlot(0);
    const copy = reloaded.getPass(0).getPokemon(0)!;

    expect(species[copy.species]).toBe('Garchomp');
    expect(copy.nickname).toBe('Colmillo');
    expect(copy.checksumValid).toBe(true);
    expect(copy.ivs).toEqual(garchomp.ivs);
    expect(copy.moves).toEqual(garchomp.moves);
  });

  test('borrar un pase personalizado conserva el diseño y el desbloqueo', () => {
    const save = PbrSave.load(loadRaw('europa'));
    save.selectSlot(0);
    const original = save.getPass(0);
    const design = original.design;
    const available = original.available;
    expect(original.trainerName).not.toBe('');

    save.deletePass(0);

    const after = save.getPass(0);
    expect(after.trainerName).toBe('');
    expect(after.pokemon).toHaveLength(0);
    // El diseño y el desbloqueo son de la ranura, no del contenido: el juego los conserva.
    expect(after.design).toBe(design);
    expect(after.available).toBe(available);
  });

  test('desbloquear todos los pases personalizados no toca los demás tipos', () => {
    const save = PbrSave.load(loadRaw('europa'));
    save.selectSlot(2); // "Azul": partida sin jugar
    const others = [];
    for (let i = 0; i < PASS_COUNT; i++) {
      if (save.passType(i) !== 'custom') others.push(save.getPass(i).available);
    }

    save.unlockAllCustomPasses();

    expect(save.customPassIndexes.every((i) => save.getPass(i).available)).toBe(true);
    const othersAfter = [];
    for (let i = 0; i < PASS_COUNT; i++) {
      if (save.passType(i) !== 'custom') othersAfter.push(save.getPass(i).available);
    }
    expect(othersAfter).toEqual(others);
  });

  /**
   * Desbloquear coliseos toca bits sueltos dentro de dos bytes compartidos. Lo importante es
   * que no se desborde a bits vecinos: restaurar el estado original tiene que dejar el guardado
   * exactamente como estaba, byte a byte.
   */
  test('desbloquear coliseos solo toca sus propios bits', () => {
    const save = PbrSave.load(loadRaw('europa'));
    save.selectSlot(3); // "Verde": partida sin jugar

    const names = Object.keys(COLOSSEUM_UNLOCK) as (keyof typeof COLOSSEUM_UNLOCK)[];
    const before = save.data.slice();
    const originalState = names.map((n) => save.getColosseumUnlocked(n));

    save.unlockAllColosseums();
    expect(names.every((n) => save.getColosseumUnlocked(n))).toBe(true);

    names.forEach((n, i) => save.setColosseumUnlocked(n, originalState[i]!));
    expect(diffBuffers(save.data, before)).toBeNull();
  });
});
