/**
 * ANIA+ — punto de entrada.
 *
 * Copyright (C) 2026 FerdinandoPH
 *
 * Software libre bajo la GNU General Public License v3.0; el texto completo está en `LICENSE`,
 * en la raíz del repositorio, y en `NOTICE.md` está de dónde viene lo que no es nuestro. Se
 * distribuye con la esperanza de que sea útil, pero SIN NINGUNA GARANTÍA.
 *
 * La aplicación es enteramente client-side: no hay servidor detrás. Al terminar la compilación
 * queda un puñado de ficheros estáticos que se pueden abrir desde el móvil, o servir desde la
 * propia Wii junto al asistente.
 */
import type { Lang } from './data/index.ts';
import { clear, el, select } from './ui/dom.ts';
import { renderGenerator } from './ui/generator.ts';
import { t } from './ui/i18n.ts';
import { renderPassEditor } from './ui/passeditor.ts';
import { renderPassList } from './ui/passlist.ts';
import { refreshStored, setLanguage, state, subscribe, update, type View } from './ui/state.ts';
import { renderWii } from './ui/wii.ts';

const TAB_KEYS: { view: View; labelKey: string; icon: string }[] = [
  { view: 'pases', labelKey: 'main.tab.passes', icon: '🎴' },
  { view: 'generar', labelKey: 'main.tab.generate', icon: '🎲' },
  { view: 'wii', labelKey: 'main.tab.wii', icon: '🎮' },
];
/** Etiquetas de pestaña en el idioma actual. Se recalcula en cada render. */
const tabs = (): { view: View; label: string; icon: string }[] =>
  TAB_KEYS.map(({ view, labelKey, icon }) => ({ view, label: t(labelKey), icon }));

/** Los cinco idiomas de la versión PAL. Cambiarlo afecta a la interfaz y a lo que se genere. */
const LANGUAGE_OPTIONS: { value: Lang; label: string }[] = [
  { value: 'es', label: '🇪🇸 Español' },
  { value: 'en', label: '🇬🇧 English' },
  { value: 'de', label: '🇩🇪 Deutsch' },
  { value: 'fr', label: '🇫🇷 Français' },
  { value: 'it', label: '🇮🇹 Italiano' },
  { value: 'ja', label: '🇯🇵 日本語' },
];

const root = document.getElementById('app');
if (root === null) throw new Error('Falta el contenedor #app');

function title(tabsNow: { view: View; label: string }[]): string {
  if (state.editing !== null) return t('main.editPass');
  return tabsNow.find((tab) => tab.view === state.view)?.label ?? 'ANIA+';
}

function render(): void {
  clear(root!);
  const TABS = tabs();

  root!.append(
    el('header', { class: 'top' },
      // El logo es una teselita blanca con esquinas redondeadas: la figura lleva blancos
      // interiores que forman parte del dibujo, asi que sobre fondo oscuro perderia la cara.
      // Con `BASE_URL`, para que funcione también servida desde un subdirectorio.
      el('img', { class: 'logo', src: `${import.meta.env.BASE_URL}icon-64.png`, alt: '', width: 28, height: 28 }),
      el('h1', {}, 'ANIA+'),
      el('span', { class: 'muted small' }, title(TABS)),
      el('span', { class: 'spacer' }),
      select(LANGUAGE_OPTIONS, state.language, (value) => setLanguage(value as Lang), { class: 'badge-select' }),
      state.save !== null ? el('span', { class: 'badge ok' }, state.saveSource ?? '') : null,
    ),
  );

  if (state.editing !== null) {
    const entry = state.stored.find((p) => p.id === state.editing);
    if (entry === undefined) {
      update({ editing: null });
      return;
    }
    root!.append(renderPassEditor(entry));
  } else if (state.view === 'pases') {
    root!.append(renderPassList());
  } else if (state.view === 'generar') {
    root!.append(renderGenerator());
  } else {
    root!.append(renderWii());
  }

  root!.append(
    el('nav', { class: 'tabs' },
      ...TABS.map((tab) =>
        el('button', {
          'aria-current': String(state.view === tab.view && state.editing === null),
          onclick: () => update({ view: tab.view, editing: null }),
        },
          el('span', { class: 'icon' }, tab.icon),
          el('span', {}, tab.label),
        ),
      ),
    ),
  );
}

subscribe(render);
void refreshStored().then(render);
render();
