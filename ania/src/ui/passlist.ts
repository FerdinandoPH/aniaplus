/**
 * Lista de pases guardados, con selección múltiple estilo galería de fotos: la transferencia por
 * lotes a la Wii la necesita, y en el móvil es el gesto que la gente ya conoce.
 */
import { BattlePass } from '../core/pass.ts';
import { speciesNames } from '../data/index.ts';
import { packPasses, suggestFileName } from '../storage/passfile.ts';
import { unpackPasses } from '../storage/passfile.ts';
import { confirmDialog, el, toast } from './dom.ts';
import { t } from './i18n.ts';
import { sprite } from './sprite.ts';
import { contentLang, currentLang, makeEntry, passOf, persist, refreshStored, remove, state, toggleSelected, update } from './state.ts';
import type { StoredPass } from '../storage/db.ts';

function teamPreview(entry: StoredPass): HTMLElement {
  const pass = passOf(entry);
  const team = el('div', { class: 'team' });

  if (entry.secret) {
    // Modo secreto: el contenido no se revela hasta transferirlo a la Wii.
    for (let i = 0; i < 6; i++) team.append(el('span', { class: 'mon' }, '?'));
    return team;
  }

  const pokemon = pass.pokemon;
  if (pokemon.length === 0) {
    team.append(el('span', { class: 'mon muted' }, t('passlist.noPokemon')));
    return team;
  }
  for (const pk of pokemon) {
    const name = speciesNames(currentLang())[pk.species] ?? `#${pk.species}`;
    // El nombre queda para lectores de pantalla: en una ficha de 150 px no cabe escrito.
    team.append(el('span', { class: 'mon pic', title: name },
      sprite(pk.species, { form: pk.form, shiny: pk.isShiny, scale: 0.5 }),
      el('span', { class: 'sr-only' }, name),
    ));
  }
  return team;
}

/** Milisegundos que hay que mantener pulsado para seleccionar sin tocar el redondel. */
const LONG_PRESS_MS = 450;

function card(entry: StoredPass): HTMLElement {
  const selected = state.selected.has(entry.id);

  /*
   * Mantener pulsado selecciona, en el móvil y con el ratón. El clic que llega al soltar hay que
   * tragárselo, o abriría el editor justo después de haber seleccionado.
   */
  let timer: ReturnType<typeof setTimeout> | null = null;
  let longPressed = false;
  const cancelPress = (): void => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };

  /*
   * La tarjeta es un `div` con `role="button"` y no un `<button>` porque lleva dentro otro botón
   * —el redondel— y anidar botones no es HTML válido: el navegador no garantiza qué recibe el
   * clic. Con `tabindex` y el manejo de Enter/Espacio se comporta igual con el teclado.
   */
  const node = el('div', {
    class: `pass-card${entry.secret ? ' secret' : ''}`,
    role: 'button',
    tabindex: 0,
    'data-selected': String(selected),
    onclick: () => {
      if (longPressed) { longPressed = false; return; }
      // Con selección ya activa, tocar alterna; si no, abre el editor.
      if (state.selected.size > 0) toggleSelected(entry.id);
      else update({ editing: entry.id });
    },
    onkeydown: (event) => {
      const key = (event as KeyboardEvent).key;
      if (key !== 'Enter' && key !== ' ') return;
      event.preventDefault();
      if (state.selected.size > 0) toggleSelected(entry.id);
      else update({ editing: entry.id });
    },
    onpointerdown: () => {
      longPressed = false;
      timer = setTimeout(() => { longPressed = true; toggleSelected(entry.id); }, LONG_PRESS_MS);
    },
    onpointerup: cancelPress,
    onpointerleave: cancelPress,
    onpointercancel: cancelPress,
    // Al mantener pulsado en el móvil, el navegador saca su propio menú encima. Estorba.
    oncontextmenu: (event) => event.preventDefault(),
  },
    el('button', {
      class: 'check',
      'aria-pressed': String(selected),
      title: selected ? t('passlist.deselect') : t('passlist.select'),
      onclick: (event) => {
        // Sin esto, el clic llegaría también a la tarjeta y abriría el editor.
        event.stopPropagation();
        toggleSelected(entry.id);
      },
      onpointerdown: (event) => event.stopPropagation(),
    },
      el('span', { 'aria-hidden': 'true' }, selected ? '✓' : ''),
      el('span', { class: 'sr-only' }, selected ? t('passlist.selected') : t('passlist.notSelected')),
    ),
    el('span', { class: 'name' }, entry.name),
    entry.secret ? el('span', { class: 'badge warn' }, t('passlist.secret')) : null,
    teamPreview(entry),
  );
  return node;
}

/** Crea un pase en blanco y lo abre para montarlo a mano. */
async function createEmptyPass(): Promise<void> {
  const entry = makeEntry(BattlePass.create('ANIA+', contentLang()).data);
  if (!(await persist(entry))) {
    toast(t('passlist.storageFull'), 'error');
    return;
  }
  update({ editing: entry.id, selected: new Set() });
}

async function exportSelected(): Promise<void> {
  const chosen = state.stored.filter((p) => state.selected.has(p.id));
  if (chosen.length === 0) return;

  const secretos = chosen.filter((p) => p.secret);
  if (secretos.length > 0) {
    const ok = await confirmDialog(
      t('passlist.secretPassesTitle'),
      t('passlist.secretPassesBody', { count: secretos.length }),
      t('passlist.exportAnyway'),
    );
    if (!ok) return;
  }

  const file = packPasses(chosen.map(passOf));
  const blob = new Blob([file as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: suggestFileName(chosen.map(passOf)) });
  link.click();
  URL.revokeObjectURL(url);
  toast(t(chosen.length === 1 ? 'passlist.exportedOne' : 'passlist.exportedMany', { count: chosen.length }));
}

async function deleteSelected(): Promise<void> {
  const count = state.selected.size;
  const ok = await confirmDialog(
    t('passlist.deleteTitle'),
    t(count === 1 ? 'passlist.deleteBodyOne' : 'passlist.deleteBodyMany', { count }),
    t('passlist.delete'),
  );
  if (!ok) return;
  for (const id of [...state.selected]) await remove(id);
  update({ selected: new Set() });
  toast(t(count === 1 ? 'passlist.deletedOne' : 'passlist.deletedMany', { count }));
}

async function importFile(file: File): Promise<void> {
  try {
    const { passes } = unpackPasses(new Uint8Array(await file.arrayBuffer()));
    let saved = 0;
    for (const pass of passes) {
      if (await persist(makeEntry(pass.data.slice()))) saved++;
    }
    if (saved < passes.length) {
      toast(t('passlist.importPartial', { saved, total: passes.length }), 'error');
    } else {
      toast(t(saved === 1 ? 'passlist.importedOne' : 'passlist.importedMany', { count: saved }));
    }
  } catch (error) {
    toast(error instanceof Error ? error.message : t('passlist.cannotReadFile'), 'error');
  }
}

export function renderPassList(): HTMLElement {
  const container = el('div', {});

  const input = el('input', {
    type: 'file', accept: '.aniapass', hidden: true,
    onchange: (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) void importFile(file);
    },
  });

  container.append(
    el('section', { class: 'card' },
      el('div', { class: 'row' },
        el('strong', {}, `${state.stored.length} / 100`),
        el('span', { class: 'muted small' }, t('passlist.storedPasses')),
        el('span', { class: 'spacer', style: 'flex:1' }),
        el('button', { class: 'ghost', onclick: () => input.click() }, t('passlist.import')),
        el('button', { onclick: () => void createEmptyPass() }, t('passlist.newPass')),
        el('button', { class: 'primary', onclick: () => update({ view: 'generar' }) }, t('passlist.generate')),
      ),
      input,
    ),
  );

  if (state.stored.length === 0) {
    container.append(
      el('section', { class: 'card empty-state' },
        /*
         * `BASE_URL` y no "/logo.png": la web puede estar servida desde un subdirectorio
         * (`ejemplo.net/aniaplus/`), y una ruta desde la raíz apuntaría fuera de la aplicación.
         * Vite arregla solo lo que ve en el HTML y el CSS, pero no una cadena escrita en el código.
         */
        el('img', {
          class: 'hero', src: `${import.meta.env.BASE_URL}logo.png`,
          alt: 'ANIA+', width: 200, height: 200,
        }),
        el('p', { class: 'muted' }, t('passlist.emptyTitle')),
        el('p', { class: 'muted small' }, t('passlist.emptyBody')),
        el('div', { class: 'row', style: 'justify-content:center;margin-top:12px' },
          el('button', { class: 'primary', onclick: () => void createEmptyPass() }, t('passlist.createPass')),
          el('button', { onclick: () => update({ view: 'generar' }) }, t('passlist.generateRandom')),
        ),
      ),
    );
    return container;
  }

  const grid = el('div', { class: 'pass-grid' });
  for (const entry of state.stored) grid.append(card(entry));
  container.append(grid);

  if (state.selected.size > 0) {
    container.append(
      el('div', { class: 'action-bar' },
        el('button', { class: 'ghost', onclick: () => update({ selected: new Set() }) },
          t('passlist.nSelected', { count: state.selected.size })),
        el('button', { onclick: () => void exportSelected() }, t('passlist.export')),
        el('button', { class: 'danger', onclick: () => void deleteSelected() }, t('passlist.delete')),
      ),
    );
  }

  void refreshStored;
  return container;
}
