/**
 * @vitest-environment jsdom
 *
 * Pruebas de interfaz. No comprueban el aspecto, sino que las vistas se montan sin reventar y
 * que las acciones importantes hacen lo que dicen: generar guarda pases, la selección múltiple
 * funciona, y el modo secreto de verdad oculta el equipo.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { speciesNames as speciesNamesFn } from '../src/data/index.ts';

// Los tests siguen comprobando el idioma de referencia (español).
const speciesNames = speciesNamesFn('es');

import { passName, renderGenerator } from '../src/ui/generator.ts';
import { renderPassEditor } from '../src/ui/passeditor.ts';
import { renderPassList } from '../src/ui/passlist.ts';
import { renderPokemonEditor } from '../src/ui/pokemoneditor.ts';
import { progressDialog } from '../src/ui/dom.ts';
import { sprite, spriteCell } from '../src/ui/sprite.ts';
import { renderWii } from '../src/ui/wii.ts';
import { contentLang, currentLang, makeEntry, persist, preferredLanguage, setLanguage, state, store, update } from '../src/ui/state.ts';
import { bk4FromLang } from '../src/gen/language.ts';
import { PASS, SIZE_PASS } from '../src/core/constants.ts';
import { BattlePass } from '../src/core/pass.ts';
import { PbrSave } from '../src/core/save.ts';
import { buildBK4, defaultPokemon } from '../src/gen/build.ts';
import { getPersonal } from '../src/data/index.ts';
import { DEFAULT_OPTIONS, generatePass } from '../src/gen/random.ts';
import { Rng } from '../src/gen/rng.ts';
import { describeSaves, loadRaw } from './fixtures.ts';
import type { StoredPass } from '../src/storage/db.ts';

/**
 * El nombre de una especie tal y como vuelve del guardado.
 *
 * Farfetch’d es la única de las 493 que no sobrevive intacta: PKHeX lo escribe con el apóstrofo
 * tipográfico ’ (U+2019), que no está en la tabla de Gen 4, así que `encodeG4String` guarda el
 * apóstrofo del juego (0x1B3) y al releer sale el recto. El byte guardado es el correcto —es el
 * que el juego pinta—, de modo que lo que hay que comparar es esto y no el nombre de partida.
 *
 * Comparar el de partida hacía fallar al generador una de cada ochenta ejecuciones: es lo que
 * tarda en salir sorteada una especie de 493 en un equipo de seis.
 */
const asStored = (name: string): string => name.toUpperCase().replaceAll('’', "'");

/** Un pase de verdad, con seis Pokémon generados. */
function samplePass(name: string): Uint8Array {
  const pass = new BattlePass(new Uint8Array(SIZE_PASS));
  pass.trainerName = name;
  const rng = new Rng(99);
  generatePass(rng, DEFAULT_OPTIONS).pokemon.forEach((draft, i) =>
    pass.setPokemon(i, buildBK4(rng, draft)));
  return pass.data;
}

/*
 * jsdom no implementa el modo modal de <dialog>: sin esto, `showModal()` no existe y cualquier
 * prueba que abra un diálogo revienta. Se apaña con lo justo que usa la aplicación —abrir, cerrar
 * y el evento `close`—, que es lo que hace falta para poder probar el camino entero.
 */
type FakeDialog = HTMLDialogElement & { showModal(): void };
if (typeof HTMLDialogElement !== 'undefined' && HTMLDialogElement.prototype.showModal === undefined) {
  HTMLDialogElement.prototype.showModal = function showModal(this: FakeDialog) { this.open = true; };
  HTMLDialogElement.prototype.close = function close(this: FakeDialog) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}

/** Fila del diálogo abierto cuyo nombre coincide. */
function pickRow(label: string): HTMLButtonElement {
  const row = [...document.querySelectorAll('dialog.dialog .pick-row')]
    .find((r) => r.querySelector('.name')?.textContent === label);
  if (row === undefined) throw new Error(`No hay ninguna opción «${label}»`);
  return row as HTMLButtonElement;
}

beforeEach(async () => {
  document.body.replaceChildren();
  await store.clear();
  // El idioma se fija aquí y no se da por supuesto: sin elección guardada, la aplicación abre en
  // el del navegador, y el de jsdom es inglés. Estas pruebas comparan contra nombres en español.
  setLanguage('es');
  update({ view: 'pases', stored: [], selected: new Set(), editing: null, save: null, backup: null, saveSource: null, busy: false });
});

describe('lista de pases', () => {
  test('sin pases, invita a crear alguno y enseña el logo', () => {
    const node = renderPassList();
    expect(node.textContent).toContain('Todavía no hay pases guardados');
    const hero = node.querySelector('img.hero') as HTMLImageElement | null;
    expect(hero?.getAttribute('src')).toBe('/logo.png');
    // El logo es decorativo pero lleva texto, así que su alt debe nombrar la aplicación.
    expect(hero?.getAttribute('alt')).toBe('ANIA+');
  });

  test('muestra el equipo de cada pase', async () => {
    await persist(makeEntry(samplePass('Prueba')));
    const node = renderPassList();
    expect(node.textContent).toContain('Prueba');
    // Los seis Pokémon aparecen por su nombre.
    const cards = node.querySelectorAll('.pass-card .mon');
    expect(cards).toHaveLength(6);
    expect([...cards].every((c) => speciesNames.includes(c.textContent ?? ''))).toBe(true);
  });

  test('el modo secreto oculta el equipo', async () => {
    await persist(makeEntry(samplePass('Oculto'), { secret: true }));
    const node = renderPassList();
    const mons = [...node.querySelectorAll('.pass-card .mon')];
    expect(mons).toHaveLength(6);
    expect(mons.every((m) => m.textContent === '?')).toBe(true);
    expect(node.textContent).toContain('secreto');
  });

  test('el redondel selecciona sin abrir el pase', async () => {
    await persist(makeEntry(samplePass('Uno')));
    const node = renderPassList();

    (node.querySelector('.pass-card .check') as HTMLButtonElement).click();

    expect(state.selected.size).toBe(1);
    // Lo que más molesta de un redondel mal hecho: que además te meta en el editor.
    expect(state.editing).toBeNull();
  });

  test('mantener pulsado selecciona, y el clic de soltar no abre el editor', async () => {
    await persist(makeEntry(samplePass('Uno')));
    const node = renderPassList();
    const cardNode = node.querySelector('.pass-card') as HTMLElement;

    cardNode.dispatchEvent(new Event('pointerdown'));
    await new Promise((r) => setTimeout(r, 500));
    cardNode.dispatchEvent(new Event('pointerup'));
    cardNode.dispatchEvent(new Event('click'));

    expect(state.selected.size).toBe(1);
    expect(state.editing).toBeNull();
  });

  test('un clic normal abre el editor y no selecciona', async () => {
    await persist(makeEntry(samplePass('Uno')));
    const node = renderPassList();
    const cardNode = node.querySelector('.pass-card') as HTMLElement;

    cardNode.dispatchEvent(new Event('pointerdown'));
    cardNode.dispatchEvent(new Event('pointerup'));
    cardNode.dispatchEvent(new Event('click'));

    expect(state.selected.size).toBe(0);
    expect(state.editing).toBe(state.stored[0]!.id);
  });

  test('con algo ya seleccionado, un clic normal alterna en vez de abrir', async () => {
    await persist(makeEntry(samplePass('Uno')));
    await persist(makeEntry(samplePass('Dos')));
    update({ selected: new Set([state.stored[0]!.id]) });

    const node = renderPassList();
    (node.querySelectorAll('.pass-card')[1] as HTMLElement).dispatchEvent(new Event('click'));

    expect(state.selected.size).toBe(2);
    expect(state.editing).toBeNull();
  });

  test('la selección múltiple saca la barra de acciones', async () => {
    await persist(makeEntry(samplePass('Uno')));
    const id = state.stored[0]!.id;
    update({ selected: new Set([id]) });

    const node = renderPassList();
    expect(node.querySelector('.action-bar')).not.toBeNull();
    expect(node.textContent).toContain('1 seleccionados');
    expect(node.querySelector('.pass-card')?.getAttribute('data-selected')).toBe('true');
  });
});

describe('editor de pase', () => {
  test('lista los seis Pokémon y las frases', async () => {
    await persist(makeEntry(samplePass('Editable')));
    const node = renderPassEditor(state.stored[0]!);
    expect(node.querySelectorAll('.mon-row')).toHaveLength(6);
    expect(node.textContent).toContain('Saludo');
    expect(node.textContent).toContain('Al perder');
  });

  test('explica por qué no se edita el diseño aquí', async () => {
    await persist(makeEntry(samplePass('Editable')));
    const node = renderPassEditor(state.stored[0]!);
    expect(node.textContent).toContain('El diseño se elige al transferir');
  });

  test('un pase secreto no deja ver ni editar el equipo', async () => {
    await persist(makeEntry(samplePass('Oculto'), { secret: true }));
    const node = renderPassEditor(state.stored[0]!);
    expect(node.querySelectorAll('.mon-row')).toHaveLength(0);
    expect(node.textContent).toContain('modo secreto');
    expect(node.textContent).toContain('Revelar');
  });

  test('cambiar el nombre lo guarda', async () => {
    await persist(makeEntry(samplePass('Antes')));
    const node = renderPassEditor(state.stored[0]!);
    const input = node.querySelector('input') as HTMLInputElement;
    input.value = 'Después';
    input.dispatchEvent(new Event('input'));

    await new Promise((r) => setTimeout(r, 0));
    expect(new BattlePass((await store.list())[0]!.data).trainerName).toBe('Después');
  });
});

describeSaves('sesión con la Wii al esconder la pestaña', () => {
  /**
   * Conecta la vista con una Wii de mentira. Se simula `fetch` porque lo que se prueba aquí no es
   * el protocolo —eso está en transport.test.ts, contra un servidor de verdad— sino qué hace la
   * pestaña al esconderse y al volver.
   */
  async function connect(): Promise<{ beacons: string[]; calls: string[] }> {
    const beacons: string[] = [];
    const calls: string[] = [];
    const save = loadRaw('europa');

    vi.stubGlobal('fetch', (url: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('/api/session')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ token: 'tok', timeout: 90 }),
          text: () => Promise.resolve(''),
        });
      }
      return Promise.resolve({
        ok: true, status: 200,
        arrayBuffer: () => Promise.resolve(save.buffer.slice(0)),
        text: () => Promise.resolve(''),
      });
    });
    vi.stubGlobal('navigator', { sendBeacon: (url: string) => { beacons.push(url); return true; } });

    const node = renderWii();
    const host = node.querySelector('input') as HTMLInputElement;
    host.value = '192.168.1.50';
    host.dispatchEvent(new Event('input'));
    ([...node.querySelectorAll('button')].find((b) => b.textContent?.includes('Conectar')) as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 30));

    return { beacons, calls };
  }

  /*
   * La sesión vive en el módulo de la vista, no en el estado: si se deja abierta, las pruebas
   * siguientes heredan una Wii conectada. Se cierra por donde lo haría el usuario.
   */
  afterEach(async () => {
    const cerrar = [...renderWii().querySelectorAll('button')].find((b) => b.textContent === 'Cerrar');
    cerrar?.click();
    await new Promise((r) => setTimeout(r, 10));
    vi.unstubAllGlobals();
  });

  test('al cerrar la pestaña se suelta la sesión', async () => {
    const { beacons } = await connect();
    expect(state.save).not.toBeNull();

    const event = new Event('pagehide') as Event & { persisted: boolean };
    Object.defineProperty(event, 'persisted', { value: false });
    window.dispatchEvent(event);

    expect(beacons).toHaveLength(1);
    expect(beacons[0]).toContain('/api/session/release/tok');
  });

  test('al congelarse la pestaña también se suelta, y al volver se recupera', async () => {
    const { beacons, calls } = await connect();

    /*
     * Cerrar una pestaña en el móvil llega aquí igual que un cambio de aplicación: con
     * `persisted`. Distinguirlos es imposible, así que se suelta en los dos casos y se paga el
     * `acquire` de vuelta, en vez de dejar la Wii bloqueada en el caso que de verdad importa.
     */
    const hide = new Event('pagehide') as Event & { persisted: boolean };
    Object.defineProperty(hide, 'persisted', { value: true });
    window.dispatchEvent(hide);
    expect(beacons).toHaveLength(1);

    // Y al volver se revalida la sesión, que se acaba de soltar.
    const before = calls.length;
    const show = new Event('pageshow') as Event & { persisted: boolean };
    Object.defineProperty(show, 'persisted', { value: true });
    window.dispatchEvent(show);
    await new Promise((r) => setTimeout(r, 10));

    expect(calls.slice(before).some((c) => c.startsWith('POST') && c.includes('/api/session'))).toBe(true);
  });

  /*
   * Los temporizadores de una pestaña oculta dejan de ser de fiar, así que el latido automático no
   * basta: se manda uno a mano justo antes de que el navegador la congele, que es lo que evita que
   * la sesión caduque por un vistazo a otra aplicación.
   */
  test('al ocultarse la pestaña se manda un latido', async () => {
    const { calls } = await connect();

    const before = calls.length;
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 10));

    expect(calls.slice(before).some((c) => c === 'POST http://192.168.1.50:8080/api/session')).toBe(true);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
});

/*
 * La otra mitad del problema de la sesión pegada: cuando el aviso de cierre no llega —y siempre
 * habrá cierres en los que no llegue—, el siguiente dispositivo se topaba con un «está ocupada» sin
 * saber cuánto durará ni qué hacer. Ahora se le dice desde cuándo está callada y, si lleva un rato,
 * se le ofrece quedársela.
 */
describeSaves('sesión ocupada por otro dispositivo', () => {
  /** Wii de mentira que ya tiene la sesión tomada, callada desde hace `idle` segundos. */
  function busyWii(idle: number): { calls: string[] } {
    const calls: string[] = [];
    const save = loadRaw('europa');

    vi.stubGlobal('fetch', (url: string, init?: { method?: string }) => {
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${url}`);
      if (url.endsWith('/api/session') && method === 'POST') {
        return Promise.resolve({
          ok: false, status: 409,
          text: () => Promise.resolve('otro dispositivo esta editando el guardado'),
        });
      }
      if (url.endsWith('/api/session') && method === 'GET') {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ busy: true, mine: false, timeout: 45, idle }),
          text: () => Promise.resolve(''),
        });
      }
      if (url.endsWith('/api/session/takeover')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ token: 'relevo', timeout: 45 }),
          text: () => Promise.resolve(''),
        });
      }
      return Promise.resolve({
        ok: true, status: 200,
        arrayBuffer: () => Promise.resolve(save.buffer.slice(0)),
        text: () => Promise.resolve(''),
      });
    });
    return { calls };
  }

  async function tryConnect(): Promise<void> {
    const node = renderWii();
    const host = node.querySelector('input') as HTMLInputElement;
    host.value = '192.168.1.50';
    host.dispatchEvent(new Event('input'));
    ([...node.querySelectorAll('button')].find((b) => b.textContent?.includes('Conectar')) as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 30));
  }

  afterEach(async () => {
    const cerrar = [...renderWii().querySelectorAll('button')].find((b) => b.textContent === 'Cerrar');
    cerrar?.click();
    await new Promise((r) => setTimeout(r, 10));
    vi.unstubAllGlobals();
  });

  test('si lleva un rato callada se ofrece el relevo, y aceptarlo conecta', async () => {
    const { calls } = busyWii(30);
    await tryConnect();

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.textContent).toContain('30 s');
    // 45 de plazo menos 30 callada: lo que le queda antes de caducar sola.
    expect(dialog.textContent).toContain('15 s');
    ([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Tomar el relevo') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 30));

    expect(calls.some((c) => c.endsWith('/api/session/takeover'))).toBe(true);
    expect(state.save).not.toBeNull();
  });

  /* Mientras el otro siga latiendo la sesión es suya: no se ofrece nada, solo se dice la espera. */
  test('si sigue viva no se ofrece el relevo', async () => {
    busyWii(3);
    await tryConnect();

    expect(document.querySelector('dialog')).toBeNull();
    expect(document.body.textContent).toContain('42 s');
    expect(state.save).toBeNull();
  });
});

describe('pasar Pokémon de un pase a otro', () => {
  /** Dos pases guardados: el primero con equipo, el segundo con una ranura libre. */
  async function twoPasses(): Promise<[StoredPass, StoredPass]> {
    await persist(makeEntry(samplePass('ORIGEN')));
    const second = new BattlePass(samplePass('DESTINO'));
    second.deletePokemon(5);
    await persist(makeEntry(second.data));
    const origen = state.stored.find((e) => e.name === 'ORIGEN')!;
    const destino = state.stored.find((e) => e.name === 'DESTINO')!;
    return [origen, destino];
  }

  test('copiar deja el Pokémon en el destino y no toca el origen', async () => {
    const [origen] = await twoPasses();
    const before = new BattlePass(origen.data).pokemon[0]!;

    const node = renderPassEditor(origen);
    (node.querySelector('.mon-row button[title="Copiar a otro pase"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    pickRow('DESTINO').click();
    await new Promise((r) => setTimeout(r, 20));

    const saved = await store.list();
    const destino = new BattlePass(saved.find((e) => e.name === 'DESTINO')!.data);
    const origenAfter = new BattlePass(saved.find((e) => e.name === 'ORIGEN')!.data);

    // Es copia: el origen sigue con sus seis.
    expect(origenAfter.pokemon).toHaveLength(6);
    expect(destino.pokemon).toHaveLength(6);

    const copied = destino.pokemon[5]!;
    expect(copied.species).toBe(before.species);
    expect(copied.moves).toEqual(before.moves);
    expect(copied.ivs).toEqual(before.ivs);
    expect(copied.nickname).toBe(before.nickname);
    // Lo que demuestra que sirve para el juego: sigue validándose solo.
    expect(copied.checksumValid).toBe(true);
  });

  test('un pase lleno se ofrece como destino, pero deshabilitado', async () => {
    await persist(makeEntry(samplePass('ORIGEN')));
    await persist(makeEntry(samplePass('LLENO')));
    const origen = state.stored.find((e) => e.name === 'ORIGEN')!;

    const node = renderPassEditor(origen);
    (node.querySelector('.mon-row button[title="Copiar a otro pase"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));

    const row = pickRow('LLENO');
    expect(row.disabled).toBe(true);
    expect(row.textContent).toContain('6/6');
  });

  test('los pases secretos no salen como destino', async () => {
    await persist(makeEntry(samplePass('ORIGEN')));
    await persist(makeEntry(samplePass('SECRETO'), { secret: true }));
    const origen = state.stored.find((e) => e.name === 'ORIGEN')!;

    const node = renderPassEditor(origen);
    (node.querySelector('.mon-row button[title="Copiar a otro pase"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));

    expect(() => pickRow('SECRETO')).toThrow();
  });

  test('traer de otro pase mete el Pokémon en la ranura libre', async () => {
    const [origen, destino] = await twoPasses();
    const wanted = new BattlePass(origen.data).pokemon[2]!;

    const node = renderPassEditor(destino);
    const bring = [...node.querySelectorAll('.mon-row.empty button')]
      .find((b) => b.textContent === '+ De otro pase') as HTMLButtonElement;
    bring.click();
    await new Promise((r) => setTimeout(r, 0));

    pickRow('ORIGEN').click();
    await new Promise((r) => setTimeout(r, 0));
    pickRow(speciesNames[wanted.species]!).click();
    await new Promise((r) => setTimeout(r, 20));

    const saved = await store.list();
    const after = new BattlePass(saved.find((e) => e.name === 'DESTINO')!.data);
    expect(after.pokemon).toHaveLength(6);
    expect(after.pokemon[5]!.species).toBe(wanted.species);
    expect(after.pokemon[5]!.checksumValid).toBe(true);
    // Y el de origen sigue teniendo el suyo.
    expect(new BattlePass(saved.find((e) => e.name === 'ORIGEN')!.data).pokemon).toHaveLength(6);
  });
});

describe('generador', () => {
  test('presenta todas las opciones del enunciado', () => {
    const node = renderGenerator();
    const text = node.textContent ?? '';
    for (const expected of ['Recomendados', 'Legales', 'Todo vale', 'Al menos un legendario', 'Modo secreto', 'Semilla']) {
      expect(text, expected).toContain(expected);
    }
  });

  test('la vista previa muestra seis Pokémon', () => {
    const badges = renderGenerator().querySelectorAll('.card:last-child .badge');
    expect(badges).toHaveLength(6);
  });

  /** Genera `n` pases con una semilla concreta y devuelve el modelo de entrenador de cada uno. */
  async function generateModels(seed: string, n: number): Promise<number[]> {
    const node = renderGenerator();
    const inputs = [...node.querySelectorAll('input')];
    const countInput = inputs.find((i) => i.type === 'number')!;
    const seedInput = inputs.find((i) => i.getAttribute('placeholder')?.includes('distinto cada vez'))!;

    countInput.value = String(n);
    countInput.dispatchEvent(new Event('input'));
    seedInput.value = seed;
    seedInput.dispatchEvent(new Event('input'));

    [...node.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Generar'))!.click();
    await new Promise((r) => setTimeout(r, 80));

    // El formulario recuerda sus valores entre vistas: se devuelven a lo de siempre.
    countInput.value = '1';
    countInput.dispatchEvent(new Event('input'));
    seedInput.value = '';
    seedInput.dispatchEvent(new Event('input'));

    return (await store.list())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => new BattlePass(entry.data).model);
  }

  test('cada pase sale con un personaje al azar, y la semilla lo reproduce', async () => {
    const first = await generateModels('modelos', 8);
    expect(first).toHaveLength(8);
    expect(first.every((m) => m >= 1 && m <= 6)).toBe(true);
    // Con ocho pases, que salieran los ocho iguales seria casualidad (1 entre 6^7).
    expect(new Set(first).size).toBeGreaterThan(1);

    await store.clear();
    update({ stored: [] });
    expect(await generateModels('modelos', 8)).toEqual(first);
  });

  test('el vestuario y las frases corresponden al personaje que ha tocado', async () => {
    await generateModels('coherencia', 4);
    for (const entry of await store.list()) {
      const pass = new BattlePass(entry.data);
      const expected = BattlePass.create('X');
      expected.model = pass.model;
      expected.resetGearToDefault();
      expected.resetPresetPhrases();
      expect(pass.gear).toEqual(expected.gear);
      expect(pass.data.slice(PASS.presetIndexes, PASS.presetIndexes + 12))
        .toEqual(expected.data.slice(PASS.presetIndexes, PASS.presetIndexes + 12));
    }
  });

  test('el caos de nombre pone el mismo mote a todos, incluso de pases distintos', async () => {
    const node = renderGenerator();
    const inputs = [...node.querySelectorAll('input')];
    const countInput = inputs.find((i) => i.type === 'number')!;

    countInput.value = '3';
    countInput.dispatchEvent(new Event('input'));

    // Se marca la casilla y aparece el campo del mote.
    const chaos = [...node.querySelectorAll('.field')]
      .find((f) => f.textContent?.includes('Caos de nombre'))!
      .querySelector('input[type="checkbox"]') as HTMLInputElement;
    chaos.checked = true;
    chaos.dispatchEvent(new Event('change'));

    const withField = renderGenerator();
    const nickInput = [...withField.querySelectorAll('input')]
      .find((i) => i.getAttribute('maxlength') === '10')!;
    nickInput.value = 'chorizo';
    nickInput.dispatchEvent(new Event('input'));

    [...withField.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Generar'))!.click();
    await new Promise((r) => setTimeout(r, 80));

    const saved = await store.list();
    expect(saved).toHaveLength(3);
    const motes = saved.flatMap((entry) => new BattlePass(entry.data).pokemon.map((pk) => pk.nickname));
    expect(motes).toHaveLength(18);
    expect(new Set(motes)).toEqual(new Set(['CHORIZO']));
    expect(saved.every((e) => new BattlePass(e.data).pokemon.every((pk) => pk.isNicknamed))).toBe(true);

    // Se devuelve el formulario a lo de siempre: sus valores viven en el modulo.
    countInput.value = '1';
    countInput.dispatchEvent(new Event('input'));
    nickInput.value = '';
    nickInput.dispatchEvent(new Event('input'));
    chaos.checked = false;
    chaos.dispatchEvent(new Event('change'));
  });

  test('sin caos de nombre, cada Pokemon conserva el nombre de su especie', async () => {
    const node = renderGenerator();
    [...node.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Generar'))!.click();
    await new Promise((r) => setTimeout(r, 80));

    const pass = new BattlePass((await store.list())[0]!.data);
    expect(pass.pokemon.every((pk) => pk.nickname === asStored(speciesNames[pk.species]!))).toBe(true);
    expect(pass.pokemon.every((pk) => !pk.isNicknamed)).toBe(true);
  });

  test('generar guarda pases de verdad', async () => {
    const node = renderGenerator();
    const button = [...node.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Generar'))!;
    button.click();

    await new Promise((r) => setTimeout(r, 50));
    const saved = await store.list();
    expect(saved).toHaveLength(1);
    const pass = new BattlePass(saved[0]!.data);
    expect(pass.pokemon).toHaveLength(6);
    expect(pass.pokemon.every((pk) => pk.checksumValid)).toBe(true);
  });
});

describe('pases hechos a mano', () => {
  /** Busca un botón por su texto exacto. */
  function button(node: HTMLElement, label: string): HTMLButtonElement {
    const found = [...node.querySelectorAll('button')].find((b) => b.textContent === label);
    if (found === undefined) throw new Error(`No hay ningún botón «${label}»`);
    return found;
  }

  test('«Pase nuevo» guarda un pase en blanco y lo abre', async () => {
    button(renderPassList(), 'Crear un pase').click();
    await new Promise((r) => setTimeout(r, 10));

    const saved = await store.list();
    expect(saved).toHaveLength(1);
    const pass = new BattlePass(saved[0]!.data);
    expect(pass.pokemon).toHaveLength(0);
    // Un pase creado por el jugador va marcado como emitido; si no, el juego lo ve como hueco.
    expect(pass.issued).toBe(true);
    expect(pass.available).toBe(true);
    expect(state.editing).toBe(saved[0]!.id);
  });

  test('un pase vacío ofrece añadir Pokémon en las seis ranuras', async () => {
    await persist(makeEntry(new BattlePass(new Uint8Array(SIZE_PASS)).data));
    const node = renderPassEditor(state.stored[0]!);
    expect([...node.querySelectorAll('.mon-row .name')].map((b) => b.textContent))
      .toEqual(Array(6).fill('+ Nuevo+ De otro pase'));
  });

  test('añadir un Pokémon deja la ranura ocupada y con checksum válido', async () => {
    await persist(makeEntry(BattlePass.create('A mano').data));
    button(renderPassEditor(state.stored[0]!), '+ Nuevo').click();
    await new Promise((r) => setTimeout(r, 10));

    const pass = new BattlePass((await store.list())[0]!.data);
    expect(pass.pokemon).toHaveLength(1);
    expect(pass.pokemon[0]!.checksumValid).toBe(true);
    expect(pass.pokemon[0]!.moves.filter((m) => m !== 0).length).toBeGreaterThan(0);
  });
});

describe('editor de Pokémon', () => {
  /** Editor montado sobre un Pokémon recién creado, como al montar un pase a mano. */
  function editor(pokemon = defaultPokemon(6)) {
    const node = renderPokemonEditor({ pokemon, onChange: () => {}, onBack: () => {} });
    return { node, pokemon };
  }

  test('un Pokémon nuevo lleva el nombre de su especie como mote, sin marcar mote propio', () => {
    const { pokemon } = editor();
    expect(pokemon.isNicknamed).toBe(false);
    expect(pokemon.nickname).toBe(speciesNames[6]!.toUpperCase());
  });

  test('marcar «propio» deja escribir el mote, y desmarcarlo lo devuelve a la especie', () => {
    const { node, pokemon } = editor();
    const check = node.querySelector('.field input[type="checkbox"]') as HTMLInputElement;
    const text = [...node.querySelectorAll('.field input')]
      .find((i) => (i as HTMLInputElement).getAttribute('maxlength') === '10') as HTMLInputElement;

    expect(text.hasAttribute('disabled')).toBe(true);

    check.checked = true;
    check.dispatchEvent(new Event('change'));
    expect(pokemon.isNicknamed).toBe(true);

    // Repintado: ahora el campo se puede escribir.
    const again = renderPokemonEditor({ pokemon, onChange: () => {}, onBack: () => {} });
    const editable = [...again.querySelectorAll('.field input')]
      .find((i) => (i as HTMLInputElement).getAttribute('maxlength') === '10') as HTMLInputElement;
    expect(editable.hasAttribute('disabled')).toBe(false);
    editable.value = 'PELUCHE';
    editable.dispatchEvent(new Event('input'));
    expect(pokemon.nickname).toBe('PELUCHE');
    expect(pokemon.checksumValid).toBe(true);

    const off = again.querySelector('.field input[type="checkbox"]') as HTMLInputElement;
    off.checked = false;
    off.dispatchEvent(new Event('change'));
    expect(pokemon.isNicknamed).toBe(false);
    expect(pokemon.nickname).toBe(speciesNames[6]!.toUpperCase());
  });

  test('cambiar de especie reescribe el mote si no es propio', () => {
    const { node, pokemon } = editor();
    const species = [...node.querySelectorAll('select')]
      .find((s) => [...s.options].some((o) => o.text === speciesNames[25]))!;
    species.value = '25';
    species.dispatchEvent(new Event('change'));
    expect(pokemon.nickname).toBe(speciesNames[25]!.toUpperCase());
  });

  test('los IV se pueden editar uno a uno', () => {
    const { node, pokemon } = editor();
    const boxes = [...node.querySelectorAll('.stat-row input[type="number"]')] as HTMLInputElement[];
    expect(boxes).toHaveLength(6);

    boxes[0]!.value = '7';
    boxes[0]!.dispatchEvent(new Event('input'));
    expect(pokemon.ivs.hp).toBe(7);
    expect(pokemon.checksumValid).toBe(true);
  });

  test('un IV fuera de rango se recorta en vez de guardarse mal', () => {
    const { node, pokemon } = editor();
    const box = node.querySelector('.stat-row input[type="number"]') as HTMLInputElement;
    box.value = '99';
    box.dispatchEvent(new Event('input'));
    // 5 bits por IV: un 99 se guardaría como 3 y el Pokémon saldría con otra estadística.
    expect(pokemon.ivs.hp).toBe(31);
    expect(box.value).toBe('31');
  });

  test('cambiar la naturaleza conserva habilidad y género', () => {
    const { node, pokemon } = editor();
    const before = { ability: pokemon.ability, gender: pokemon.gender, slot: pokemon.abilitySlot };
    const target = (pokemon.nature + 7) % 25;

    // Selects en orden: género (Charizard puede ser de los dos), especie, naturaleza, habilidad.
    const natures = [...node.querySelectorAll('select')][2] as HTMLSelectElement;
    natures.value = String(target);
    natures.dispatchEvent(new Event('change'));

    expect(pokemon.nature).toBe(target);
    expect(pokemon.ability).toBe(before.ability);
    expect(pokemon.abilitySlot).toBe(before.slot);
    expect(pokemon.gender).toBe(before.gender);
    expect(pokemon.checksumValid).toBe(true);
  });

  test('el género se puede elegir en una especie con los dos', () => {
    const { node, pokemon } = editor(); // Charizard: macho o hembra
    const before = { ability: pokemon.ability, nature: pokemon.nature, slot: pokemon.abilitySlot };
    const target = pokemon.gender === 0 ? 1 : 0;

    const genderSelect = node.querySelector('.badge-select') as HTMLSelectElement;
    expect(genderSelect).not.toBeNull();
    genderSelect.value = String(target);
    genderSelect.dispatchEvent(new Event('change'));

    expect(pokemon.gender).toBe(target);
    expect(pokemon.nature).toBe(before.nature);
    expect(pokemon.ability).toBe(before.ability);
    expect(pokemon.abilitySlot).toBe(before.slot);
    expect(pokemon.checksumValid).toBe(true);
  });

  test('una especie de género fijo no ofrece selector', () => {
    // Chansey: siempre hembra (ratio 254). No hay nada que elegir.
    const { node } = editor(defaultPokemon(113));
    expect(node.querySelector('.badge-select')).toBeNull();
    expect(node.textContent).toContain('♀');
  });

  test('una especie sin género no ofrece selector', () => {
    // Magnemite: sin género (ratio 255).
    const { node } = editor(defaultPokemon(81));
    expect(node.querySelector('.badge-select')).toBeNull();
  });

  test('hacer variocolor no toca el PID', () => {
    const { node, pokemon } = editor();
    const pid = pokemon.pid;
    expect(pokemon.isShiny).toBe(false);

    const check = [...node.querySelectorAll('input[type="checkbox"]')]
      .find((c) => c.parentElement?.textContent?.includes('Variocolor')) as HTMLInputElement;
    check.checked = true;
    check.dispatchEvent(new Event('change'));

    expect(pokemon.isShiny).toBe(true);
    expect(pokemon.pid).toBe(pid);
    expect(pokemon.nature).toBe(pid % 25);
    expect(pokemon.checksumValid).toBe(true);
  });

  test('un PID escrito a mano actualiza el género guardado', () => {
    // Nidoran hembra no vale: hace falta una especie con los dos géneros.
    const { node, pokemon } = editor(defaultPokemon(25)); // Pikachu, ratio 127
    const ratio = getPersonal(25).genderRatio;
    const input = node.querySelector('input[maxlength="8"]') as HTMLInputElement;

    // Byte bajo 0x00 < ratio → hembra; 0xFF ≥ ratio → macho.
    input.value = '00000100';
    input.dispatchEvent(new Event('change'));
    expect(ratio).toBeGreaterThan(0);
    expect(pokemon.pid).toBe(0x100);
    expect(pokemon.gender).toBe(1);

    input.value = '000001FF';
    input.dispatchEvent(new Event('change'));
    expect(pokemon.gender).toBe(0);
  });
});

describe('modelo del entrenador', () => {
  test('un pase creado ya trae un personaje válido, no "None"', async () => {
    await persist(makeEntry(BattlePass.create('Nuevo').data));
    const pass = new BattlePass(state.stored[0]!.data);
    expect(pass.model).toBeGreaterThan(0);
    // Con "None" (0) el vestuario no significaría nada; el reseteo lo evita desde el principio.
    expect(pass.gear.hands).toBeGreaterThanOrEqual(0);
  });

  test('cambiar de modelo repone el vestuario de fábrica', async () => {
    await persist(makeEntry(BattlePass.create('Vestuario').data));
    const node = renderPassEditor(state.stored[0]!);
    const modelSelect = [...node.querySelectorAll('select')]
      .find((s) => [...s.options].some((o) => o.text === 'Forzudo')) as HTMLSelectElement;

    modelSelect.value = '3'; // Forzudo
    modelSelect.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 10));

    const pass = new BattlePass((await store.list())[0]!.data);
    expect(pass.model).toBe(3);
    expect(pass.gear).toEqual({ head: 0, hair: 0, face: 0, top: 0, bottom: 0, shoes: 0, hands: 1, bag: 1, glasses: 0, badge: 0 });
  });
});

/**
 * En la primera visita no hay idioma elegido y manda el navegador. Importa que esto funcione: la
 * interfaz está en seis idiomas y antes abría siempre en castellano, con lo que los otros cinco
 * solo los encontraba quien fuera a buscarlos al selector.
 */
describe('idioma de la primera visita', () => {
  test('se coge el primero que hablemos, no el primero a secas', () => {
    expect(preferredLanguage(['pt-BR', 'ja-JP', 'en-US'])).toBe('ja');
  });

  test('la region da igual: es-419 y es-ES son los dos español', () => {
    expect(preferredLanguage(['es-419'])).toBe('es');
    expect(preferredLanguage(['ES-es'])).toBe('es');
  });

  test('si no hablamos ninguno, inglés y no castellano', () => {
    expect(preferredLanguage(['pl-PL', 'ru'])).toBe('en');
    expect(preferredLanguage([])).toBe('en');
  });
});

describe('sprites', () => {
  test('cada Pokémon del pase sale con su sprite, sin perder el nombre', async () => {
    await persist(makeEntry(samplePass('Con dibujos')));
    const node = renderPassList();
    const mons = [...node.querySelectorAll('.pass-card .mon')];
    expect(mons).toHaveLength(6);
    // El nombre sigue ahí para quien no ve la imagen.
    expect(mons.every((m) => m.querySelector('.sprite') !== null)).toBe(true);
    expect(mons.every((m) => speciesNames.includes(m.textContent ?? ''))).toBe(true);
  });

  test('cada forma tiene su recorte', () => {
    // Giratina normal y Giratina origen comparten especie: si el recorte no mirase la forma,
    // saldrían iguales.
    const alterada = sprite(487, { form: 0 }).getAttribute('style');
    const origen = sprite(487, { form: 1 }).getAttribute('style');
    expect(alterada).not.toBe(origen);
    expect(spriteCell(487, 1)).toBe(spriteCell(487, 0) + 1);
  });

  test('la hoja de variocolor solo se usa si el Pokémon brilla', () => {
    expect(sprite(448).className).toBe('sprite');
    expect(sprite(448, { shiny: true }).className).toBe('sprite shiny');
  });

  test('una especie sin sprite cae en el hueco de reserva', () => {
    // 494 es de la generación 5: no existe en PBR y no debe pintar a otro Pokémon.
    expect(spriteCell(494)).toBe(0);
    expect(spriteCell(1)).not.toBe(0);
  });

  test('el modo secreto tampoco enseña el sprite', async () => {
    await persist(makeEntry(samplePass('Oculto'), { secret: true }));
    const node = renderPassList();
    expect(node.querySelectorAll('.pass-card .sprite')).toHaveLength(0);
  });
});

describe('nombres del lote', () => {
  test('{n} coloca el número donde se pida', () => {
    expect(passName('random{n}', 0, 3)).toBe('random1');
    expect(passName('random{n}', 2, 3)).toBe('random3');
    expect(passName('{n}-{n}', 0, 5)).toBe('1-1');
  });

  test('sin marcador se mantiene lo de antes', () => {
    expect(passName('ANIA+', 0, 1)).toBe('ANIA+');
    expect(passName('ANIA+', 1, 4)).toBe('ANIA+ 2');
  });
});

describeSaves('pantalla de la Wii', () => {
  test('sin guardado, pide dirección o fichero', () => {
    const node = renderWii();
    expect(node.textContent).toContain('Conectar con la Wii');
    expect(node.textContent).toContain('Abrir fichero');
  });

  test('con un guardado cargado, lista las ranuras y ofrece la copia de seguridad', () => {
    const raw = loadRaw('europa');
    update({ save: PbrSave.load(raw), backup: raw, saveSource: 'Fichero' });

    const node = renderWii();
    expect(node.textContent).toContain('Descargar copia original');
    expect(node.textContent).toContain('PKTOPIA');
    // 37 ranuras de pase personal en un guardado occidental.
    expect(node.querySelectorAll('.pass-grid .pass-card')).toHaveLength(37);
    expect(node.textContent).toContain('Desbloqueo');
  });

  test('no deja transferir sin haber seleccionado pases', () => {
    const raw = loadRaw('europa');
    update({ save: PbrSave.load(raw), backup: raw, saveSource: 'Fichero' });

    const node = renderWii();
    const transfer = [...node.querySelectorAll('button')].find((b) => b.textContent?.includes('Transferir'))!;
    expect(transfer.disabled).toBe(true);
    expect(node.textContent).toContain('selecciona antes los pases');
  });

  test('enseña qué pase va a cada ranura antes de transferir', async () => {
    const raw = loadRaw('europa');
    await persist(makeEntry(samplePass('PRIMERO')));
    await persist(makeEntry(samplePass('SEGUNDO')));
    update({
      save: PbrSave.load(raw), backup: raw, saveSource: 'Fichero',
      selected: new Set(state.stored.map((p) => p.id)),
    });

    // Sin ranuras marcadas, la cola ya dice a quién le falta destino y el botón no deja seguir.
    let node = renderWii();
    expect(node.querySelectorAll('.transfer-row')).toHaveLength(2);
    expect(node.textContent).toContain('sin ranura');
    let transfer = [...node.querySelectorAll('button')].find((b) => b.textContent?.includes('Transferir'))!;
    expect(transfer.disabled).toBe(true);

    // Se marcan dos ranuras: cada pase pasa a decir cuál le toca, y cada ranura a quién recibe.
    const slots = [...node.querySelectorAll('.pass-grid .pass-card')] as HTMLButtonElement[];
    slots[3]!.click();
    node = renderWii();
    ([...node.querySelectorAll('.pass-grid .pass-card')] as HTMLButtonElement[])[5]!.click();
    node = renderWii();

    expect(node.textContent).toContain('→ ranura 4');
    expect(node.textContent).toContain('→ ranura 6');
    // Sin orden fijo: `state.stored` viene del almacén, ordenado por su clave (un uuid).
    expect(new Set([...node.querySelectorAll('.incoming')].map((n) => n.textContent)))
      .toEqual(new Set(['← PRIMERO', '← SEGUNDO']));
    expect(node.textContent).toContain('todo listo');
    transfer = [...node.querySelectorAll('button')].find((b) => b.textContent?.includes('Transferir'))!;
    expect(transfer.disabled).toBe(false);
  });

  test('una ranura marcada de más se marca como sin usar', async () => {
    const raw = loadRaw('europa');
    await persist(makeEntry(samplePass('UNICO')));
    update({
      save: PbrSave.load(raw), backup: raw, saveSource: 'Fichero',
      selected: new Set(state.stored.map((p) => p.id)),
    });

    let node = renderWii();
    ([...node.querySelectorAll('.pass-grid .pass-card')] as HTMLButtonElement[])[0]!.click();
    node = renderWii();
    ([...node.querySelectorAll('.pass-grid .pass-card')] as HTMLButtonElement[])[1]!.click();
    node = renderWii();

    expect(node.querySelectorAll('.pass-card.spare')).toHaveLength(1);
    expect(node.textContent).toContain('sin usar');
  });

  test('enviar a la Wii solo se ofrece si el origen es la Wii', () => {
    const raw = loadRaw('europa');
    update({ save: PbrSave.load(raw), backup: raw, saveSource: 'Fichero' });

    const node = renderWii();
    const send = [...node.querySelectorAll('button')].find((b) => b.textContent === 'Enviar a la Wii')!;
    expect(send.disabled).toBe(true);
  });
});

describe('ventana de progreso', () => {
  test('enseña la fase, el avance y se cierra sola', () => {
    const progress = progressDialog('Leyendo el guardado de la Wii');
    const dialog = document.querySelector('dialog.dialog.progress')!;
    const bar = dialog.querySelector('progress')!;

    // Fase sin bytes que contar: barra indeterminada, es decir, sin `value`.
    progress.set('La Wii está leyendo su guardado…', 0, 0);
    expect(dialog.textContent).toContain('La Wii está leyendo su guardado');
    expect(bar.hasAttribute('value')).toBe(false);

    progress.set('Transfiriendo…', 1_798_280, 3_596_560);
    expect(bar.value).toBeCloseTo(0.5);
    expect(dialog.textContent).toContain('1.7 MB de 3.4 MB');

    progress.close();
    expect(document.querySelector('dialog.dialog.progress')).toBeNull();
  });

  test('no se cierra con Esc: no hay nada que cancelar', () => {
    const progress = progressDialog('Enviando el guardado a la Wii');
    const dialog = document.querySelector('dialog.dialog.progress')!;

    const event = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.querySelector('dialog.dialog.progress')).not.toBeNull();

    progress.close();
  });
});

/**
 * Con qué idioma se crea contenido nuevo.
 *
 * Los motes y el sello de idioma del pase los va a enseñar el juego, no ANIA+, así que siguen al
 * guardado cargado y no al idioma de los menús. Sin guardado no hay a quién seguir y manda la
 * interfaz.
 */
describeSaves('idioma del contenido que se genera', () => {
  afterEach(() => { update({ save: null }); setLanguage('es'); });

  test('sin guardado cargado manda la interfaz', () => {
    expect(contentLang()).toBe('es');
    setLanguage('fr');
    expect(contentLang()).toBe('fr');
  });

  test('con un guardado japonés cargado, manda el guardado', () => {
    update({ save: PbrSave.load(loadRaw('japon')) });
    expect(contentLang()).toBe('ja');
    // Y el idioma de los menús sigue siendo el suyo, que son cosas distintas.
    expect(currentLang()).toBe('es');
  });

  test('un pase nuevo sale con el idioma del guardado, y sus Pokémon con motes de ese idioma', () => {
    update({ save: PbrSave.load(loadRaw('japon')) });
    const pass = BattlePass.create('テスト', contentLang());
    expect(pass.language).toBe('ja');

    const pk = defaultPokemon(1, 0, { lang: contentLang() });
    expect(pk.nickname).toBe(speciesNamesFn('ja')[1]);
    expect(pk.language).toBe(bk4FromLang('ja'));
  });
});
