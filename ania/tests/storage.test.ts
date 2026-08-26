import { describe, expect, test } from 'vitest';
import { SIZE_PASS } from '../src/core/constants.ts';
import { BattlePass } from '../src/core/pass.ts';
import { PbrSave } from '../src/core/save.ts';
import { MAX_STORED_PASSES, MemoryPassStore, newId, savePass, type StoredPass } from '../src/storage/db.ts';
import { packPasses, suggestFileName, unpackPasses } from '../src/storage/passfile.ts';
import { describeSaves, loadRaw } from './fixtures.ts';

function passesFromSave(count: number): BattlePass[] {
  const save = PbrSave.load(loadRaw('europa'));
  save.selectSlot(0);
  // Copias independientes: los pases del guardado son vistas sobre su buffer.
  return Array.from({ length: count }, (_, i) => new BattlePass(save.getPass(i).data.slice()));
}

describeSaves('fichero .aniapass', () => {
  test('empaquetar y desempaquetar devuelve los mismos bytes', () => {
    const original = passesFromSave(3);
    const { passes, version } = unpackPasses(packPasses(original));

    expect(version).toBe(1);
    expect(passes).toHaveLength(3);
    passes.forEach((p, i) => {
      expect(p.data).toEqual(original[i]!.data);
      expect(p.trainerName).toBe(original[i]!.trainerName);
      expect(p.pokemon.map((pk) => pk.species)).toEqual(original[i]!.pokemon.map((pk) => pk.species));
    });
  });

  test('un pase exportado se puede volver a meter en un guardado', () => {
    const [lance] = passesFromSave(1);
    const file = packPasses([lance!]);

    const save = PbrSave.load(loadRaw('sudamerica'));
    save.selectSlot(0);
    const destino = save.getPass(5);
    destino.data.set(unpackPasses(file).passes[0]!.data);

    const reloaded = PbrSave.load(save.serialize());
    reloaded.selectSlot(0);
    expect(reloaded.getPass(5).trainerName).toBe(lance!.trainerName);
    expect(reloaded.getPass(5).pokemon.every((pk) => pk.checksumValid)).toBe(true);
  });

  test('rechaza ficheros que no son suyos', () => {
    expect(() => unpackPasses(new Uint8Array(4))).toThrow(/truncado/);
    expect(() => unpackPasses(new Uint8Array(64))).toThrow(/no es un fichero de pases/i);
  });

  test('detecta corrupción', () => {
    const file = packPasses(passesFromSave(1));
    file[0x20] = file[0x20]! ^ 0xff;
    expect(() => unpackPasses(file)).toThrow(/corrupto/);
  });

  test('detecta un tamaño que no cuadra con la cabecera', () => {
    const file = packPasses(passesFromSave(2));
    expect(() => unpackPasses(file.slice(0, file.length - 10))).toThrow(/pero mide/);
  });

  test('avisa si el fichero es de una versión más nueva', () => {
    const file = packPasses(passesFromSave(1));
    new DataView(file.buffer).setUint16(0x04, 99, false);
    expect(() => unpackPasses(file)).toThrow(/versión 99/);
  });

  test('sugiere un nombre de fichero usable', () => {
    const [lance, maximo] = passesFromSave(2);
    expect(suggestFileName([lance!])).toBe('Lance.aniapass');
    expect(suggestFileName([lance!, maximo!])).toBe('2-pases.aniapass');
  });
});

describe('almacén local', () => {
  function makePass(name: string): StoredPass {
    return {
      id: newId(), name, data: new Uint8Array(SIZE_PASS),
      createdAt: Date.now(), updatedAt: Date.now(), secret: false,
    };
  }

  test('guarda, lee, actualiza y borra', async () => {
    const store = new MemoryPassStore();
    const pass = makePass('Prueba');
    await store.put(pass);

    expect((await store.get(pass.id))?.name).toBe('Prueba');
    await store.put({ ...pass, name: 'Cambiado', updatedAt: Date.now() + 1 });
    expect((await store.get(pass.id))?.name).toBe('Cambiado');

    await store.delete(pass.id);
    expect(await store.get(pass.id)).toBeUndefined();
  });

  test('la lista sale con lo más reciente primero', async () => {
    const store = new MemoryPassStore();
    await store.put({ ...makePass('viejo'), updatedAt: 1000 });
    await store.put({ ...makePass('nuevo'), updatedAt: 2000 });
    expect((await store.list()).map((p) => p.name)).toEqual(['nuevo', 'viejo']);
  });

  test('respeta el límite de 100 pases sin borrar nada', async () => {
    const store = new MemoryPassStore();
    for (let i = 0; i < MAX_STORED_PASSES; i++) {
      expect(await savePass(store, makePass(`pase ${i}`))).toBe(true);
    }
    expect(await savePass(store, makePass('el que sobra'))).toBe(false);
    expect(await store.list()).toHaveLength(MAX_STORED_PASSES);

    // Actualizar uno existente sí debe funcionar aunque esté lleno.
    const first = (await store.list())[0]!;
    expect(await savePass(store, { ...first, name: 'actualizado' })).toBe(true);
  });

  test('rechaza datos que no tienen el tamaño de un pase', async () => {
    const store = new MemoryPassStore();
    await expect(store.put({ ...makePass('malo'), data: new Uint8Array(10) })).rejects.toThrow(/debe medir/);
  });
});
