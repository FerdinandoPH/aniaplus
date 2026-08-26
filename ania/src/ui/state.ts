/**
 * Estado de la aplicación. Un objeto y un suscriptor: no hace falta más.
 *
 * Los pases se guardan como los 0x6EC bytes nativos y se envuelven en `BattlePass` para leerlos
 * o editarlos, en vez de mantener una representación paralela. Así lo que se ve en pantalla es
 * siempre lo que se va a escribir en la Wii.
 */
import { SIZE_PASS } from '../core/constants.ts';
import { BattlePass } from '../core/pass.ts';
import { PbrSave } from '../core/save.ts';
import { LANGUAGES, type Lang } from '../data/index.ts';
import { createPassStore, newId, savePass, type PassStore, type StoredPass } from '../storage/db.ts';
import { dictionaries } from './strings/index.ts';

/**
 * Traducción mínima sin parámetros, para no depender de `i18n.ts` aquí: `t()` lee `currentLang()`
 * de este mismo módulo, y una importación circular es más frágil que este atajo de una línea.
 */
function noNameLabel(): string {
  return dictionaries[state.language]['state.noName'] ?? dictionaries.es['state.noName']!;
}

export type View = 'pases' | 'generar' | 'wii';

const LANGUAGE_KEY = 'ania-plus:language';

/**
 * Idiomas que ANIA+ no habla pero que tienen un vecino evidente, más cerca que el inglés.
 *
 * Un dispositivo en catalán es casi con seguridad un dispositivo de España: el castellano le sirve
 * mejor. Gallego, euskera y aranés seguirían el mismo razonamiento el día que haga falta.
 */
const NEAREST: Record<string, Lang> = { ca: 'es' };

/**
 * El idioma con el que abrir para quien llega por primera vez.
 *
 * **Manda el idioma del dispositivo y solo ese**, que es `tags[0]`. Recorrer la lista entera
 * quedándose con el primero que se hablara parecía más listo y era peor: en un dispositivo en
 * catalán, `ca` no está entre los seis, así que la búsqueda seguía bajando por las preferencias
 * hasta dar con cualquier cosa conocida —japonés, si alguna vez se añadió al navegador— y la
 * aplicación abría en un idioma que el usuario no había pedido en ninguna parte.
 *
 * Se compara solo la parte de idioma: `es-419` y `es-ES` son los dos `es`. Si no hablamos ese,
 * inglés, salvo los de `NEAREST`: es la lengua franca del sitio, y alguien que hable polaco
 * entiende antes «Battle passes» que «Pases de batalla».
 */
export function preferredLanguage(tags: readonly string[]): Lang {
  const base = (tags[0] ?? '').toLowerCase().split('-')[0] ?? '';
  if (LANGUAGES.includes(base as Lang)) return base as Lang;
  return NEAREST[base] ?? 'en';
}

/**
 * Idioma con el que abre la aplicación.
 *
 * Manda lo que el usuario eligiera la última vez. En la primera visita no hay nada elegido, y
 * entonces manda el navegador: la interfaz está en seis idiomas, y abrir siempre en castellano
 * dejaba los otros cinco donde no los ve nadie que no vaya a buscarlos al selector.
 */
function loadLanguage(): Lang {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  if (LANGUAGES.includes(stored as Lang)) return stored as Lang;
  return preferredLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

export interface AppState {
  view: View;
  /** Idioma de la interfaz y de los datos del juego que se generan de nuevas. */
  language: Lang;
  /** Pases guardados en local. */
  stored: StoredPass[];
  /** Selección múltiple en la lista, por id. */
  selected: Set<string>;
  /** Pase abierto en el editor, si hay alguno. */
  editing: string | null;
  /** Guardado cargado desde fichero o desde la Wii. */
  save: PbrSave | null;
  /** Copia intacta del guardado tal como llegó, para poder restaurar. */
  backup: Uint8Array | null;
  saveSource: string | null;
  busy: boolean;
}

const listeners = new Set<() => void>();

export const store: PassStore = createPassStore();

export const state: AppState = {
  view: 'pases',
  language: loadLanguage(),
  stored: [],
  selected: new Set(),
  editing: null,
  save: null,
  backup: null,
  saveSource: null,
  busy: false,
};

export function subscribe(listener: () => void): void {
  listeners.add(listener);
}

/** Aplica un cambio y repinta. */
export function update(changes: Partial<AppState>): void {
  Object.assign(state, changes);
  for (const listener of listeners) listener();
}

export async function refreshStored(): Promise<void> {
  update({ stored: await store.list() });
}

/** Idioma actual de la interfaz, para pasarlo a las funciones de datos/generación. */
export function currentLang(): Lang {
  return state.language;
}

/**
 * Idioma con el que se **crea** contenido nuevo: motes de los Pokémon y sello de idioma del pase.
 *
 * Manda el guardado cargado, no la interfaz. Lo que se escribe ahí lo va a enseñar el juego, no
 * ANIA+: meter motes latinos en una partida japonesa —o al revés— queda raro dentro del propio
 * juego, y el byte de idioma dejaría de decir la verdad. Sin guardado cargado no hay a quién
 * seguir, así que manda la interfaz.
 *
 * Ojo con no usarlo para lo que solo se enseña en pantalla (listas de especies, avisos): eso va
 * siempre en el idioma de la interfaz.
 */
export function contentLang(): Lang {
  return state.save?.language ?? state.language;
}

/**
 * Deja el `lang` del documento a juego con la interfaz.
 *
 * El `index.html` no puede traerlo puesto —es un fichero estático y el idioma se decide al
 * arrancar—, así que declara inglés y aquí se corrige. No es cosmético: de ese atributo salen la
 * pronunciación de los lectores de pantalla, la separación silábica y la corrección ortográfica de
 * los campos de texto.
 */
function applyDocumentLang(lang: Lang): void {
  document.documentElement.lang = lang;
}

applyDocumentLang(state.language);

/** Cambia el idioma de la app y lo recuerda para la próxima vez. */
export function setLanguage(lang: Lang): void {
  localStorage.setItem(LANGUAGE_KEY, lang);
  applyDocumentLang(lang);
  update({ language: lang });
}

/** Envuelve los bytes guardados para poder leerlos. */
export function passOf(entry: StoredPass): BattlePass {
  return new BattlePass(entry.data);
}

/** Crea una entrada nueva a partir de los bytes de un pase. */
export function makeEntry(data: Uint8Array, options: { secret?: boolean } = {}): StoredPass {
  if (data.length !== SIZE_PASS) throw new Error(`Un pase debe medir ${SIZE_PASS} bytes`);
  const now = Date.now();
  const name = new BattlePass(data).trainerName;
  return {
    id: newId(),
    name: name === '' ? noNameLabel() : name,
    data,
    createdAt: now,
    updatedAt: now,
    secret: options.secret ?? false,
  };
}

/** Guarda y refresca. Devuelve `false` si no cabe (límite de 100). */
export async function persist(entry: StoredPass): Promise<boolean> {
  const pass = new BattlePass(entry.data);
  const name = pass.trainerName;
  const ok = await savePass(store, { ...entry, name: name === '' ? noNameLabel() : name, updatedAt: Date.now() });
  await refreshStored();
  return ok;
}

export async function remove(id: string): Promise<void> {
  await store.delete(id);
  state.selected.delete(id);
  await refreshStored();
}

export function toggleSelected(id: string): void {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  update({});
}
