/**
 * Utilidades mínimas de DOM. No hay framework a propósito: la aplicación es pequeña y el grueso
 * del trabajo está en el núcleo binario, no en la interfaz.
 */

import { t } from './i18n.ts';

type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | number | null | undefined | false;

/** Crea un elemento. Las claves que empiezan por "on" se registran como eventos. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'class') {
      node.className = String(value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }
  node.append(...children.filter((c): c is Node | string | number => c !== null && c !== undefined && c !== false).map((c) => (c instanceof Node ? c : document.createTextNode(String(c)))));
  return node;
}

/**
 * Añade hijos ignorando los que sean `null`/`false`. El `append` nativo no los acepta, y el
 * patrón `condicion ? nodo : null` aparece por todas partes en las vistas.
 */
export function appendAll(parent: HTMLElement, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : String(child));
  }
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

/** `<select>` a partir de una lista de opciones. */
export function select(
  options: readonly { value: number | string; label: string }[],
  current: number | string,
  onChange: (value: string) => void,
  attrs: Attrs = {},
): HTMLSelectElement {
  const node = el('select', { ...attrs, onchange: (e) => onChange((e.target as HTMLSelectElement).value) });
  for (const option of options) {
    node.append(el('option', { value: option.value, selected: option.value === current }, option.label));
  }
  return node;
}

/** Diálogo modal sencillo. Se resuelve con `true` si se confirma. */
export function confirmDialog(title: string, message: string, confirmLabel = t('dom.accept')): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = el('dialog', { class: 'dialog' },
      el('h2', {}, title),
      el('p', {}, message),
      el('div', { class: 'row end' },
        el('button', { class: 'ghost', onclick: () => { dialog.close(); resolve(false); } }, t('dom.cancel')),
        el('button', { class: 'danger', onclick: () => { dialog.close(); resolve(true); } }, confirmLabel),
      ),
    );
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  });
}

export interface PickOption<T> {
  value: T;
  label: string;
  /** Detalle a la derecha de la fila: un texto («4/6») o un nodo con miniaturas. */
  detail?: Node | string;
  /** Se enseña igual, pero no se puede elegir. Con `reason` se explica por qué. */
  disabled?: boolean;
  reason?: string;
}

/**
 * Elegir uno de una lista. Se resuelve con el valor elegido, o `null` si se cancela.
 *
 * Las opciones deshabilitadas se siguen enseñando a propósito: un pase que no aparece deja al
 * usuario preguntándose dónde está, y uno que aparece con su motivo al lado no.
 */
export function pickDialog<T>(
  title: string,
  options: readonly PickOption<T>[],
  hint?: string,
): Promise<T | null> {
  return new Promise((resolve) => {
    // Cerrar con Esc no pasa por ningún botón: sin esto la promesa se quedaría sin resolver.
    let chosen: T | null = null;
    const list = el('div', { class: 'pick-list' });
    const dialog = el('dialog', { class: 'dialog' },
      el('h2', {}, title),
      hint !== undefined ? el('p', { class: 'small muted' }, hint) : null,
      list,
      el('div', { class: 'row end' },
        el('button', { class: 'ghost', onclick: () => dialog.close() }, t('dom.cancel')),
      ),
    );

    for (const option of options) {
      list.append(
        el('button', {
          class: 'pick-row',
          disabled: option.disabled === true,
          title: option.reason,
          onclick: () => { chosen = option.value; dialog.close(); },
        },
          el('span', { class: 'name' }, option.label),
          option.disabled === true && option.reason !== undefined
            ? el('span', { class: 'badge warn' }, option.reason)
            : null,
          option.detail !== undefined
            ? (option.detail instanceof Node ? option.detail : el('span', { class: 'small muted' }, option.detail))
            : null,
        ),
      );
    }

    if (options.length === 0) {
      list.append(el('p', { class: 'small muted' }, t('dom.nothingToPick')));
    }

    dialog.addEventListener('close', () => { dialog.remove(); resolve(chosen); });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export interface ProgressHandle {
  /** Pone al día la ventana. Con `total` a 0 la barra queda indeterminada. */
  set(label: string, loaded: number, total: number): void;
  close(): void;
}

function formatSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} kB`;
}

/**
 * Ventana de progreso para las cosas que tardan: los 3,5 MB del guardado son varios segundos, y
 * unos segundos sin respuesta en un móvil se leen como que la aplicación se ha colgado.
 *
 * No tiene botón de cancelar a propósito —tampoco se cierra con Esc—: solo informa, y la cierra
 * quien la abrió cuando termina o falla la transferencia.
 */
export function progressDialog(title: string): ProgressHandle {
  const bar = el('progress', { max: 1, class: 'transfer-bar' });
  const label = el('p', { class: 'small' }, t('dom.preparing'));
  const detail = el('p', { class: 'small muted' }, '');
  const dialog = el('dialog', { class: 'dialog progress' }, el('h2', {}, title), label, bar, detail);

  dialog.addEventListener('cancel', (event) => event.preventDefault());
  document.body.append(dialog);
  dialog.showModal();

  // Para la velocidad: se cuenta desde el primer byte, no desde que se abre la ventana, para que
  // la espera de la Wii leyendo la NAND no la haga parecer más lenta de lo que es.
  let startedAt = 0;
  let startedFrom = 0;

  return {
    set(text, loaded, total) {
      label.textContent = text;
      if (total > 0) {
        bar.value = loaded / total;
        if (startedAt === 0) { startedAt = Date.now(); startedFrom = loaded; }
        const seconds = (Date.now() - startedAt) / 1000;
        const speed = seconds > 0.5 ? ` · ${formatSize((loaded - startedFrom) / seconds)}/s` : '';
        detail.textContent = `${t('dom.sizeOf', { loaded: formatSize(loaded), total: formatSize(total) })}${speed}`;
      } else {
        bar.removeAttribute('value');
        detail.textContent = '';
      }
    },
    close() {
      dialog.close();
      dialog.remove();
    },
  };
}

/** Aviso efímero en la esquina. */
export function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  const node = el('div', { class: `toast ${kind}` }, message);
  document.body.append(node);
  setTimeout(() => node.remove(), kind === 'error' ? 6000 : 3000);
}
