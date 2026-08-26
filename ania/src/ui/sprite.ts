/**
 * Sprites de los Pokémon, recortados de una hoja única.
 *
 * Las dos hojas (`public/pkhex/pokemon.png` y `public/pkhex/pokemon-shiny.png`) y su índice los genera
 * `tools/extract-sprites.ts` a partir de PKHeX. La de variocolor solo se descarga si aparece
 * alguno en pantalla: el navegador no pide una imagen de fondo que no usa ningún elemento.
 */
import meta from '../data/pkhex/sprites.json' with { type: 'json' };
import { el } from './dom.ts';

const [CELL_W, CELL_H] = meta.cell as [number, number];
const INDEX = meta.index as Record<string, number>;

/** Celda de una especie y forma. La 0 es el hueco de reserva de PKHeX. */
export function spriteCell(species: number, form = 0): number {
  return INDEX[`${species}-${form}`] ?? INDEX[String(species)] ?? 0;
}

export interface SpriteOptions {
  form?: number;
  shiny?: boolean;
  /** 1 = tamaño original (68×56). */
  scale?: number;
  /** Texto para quien no ve la imagen. Si se omite, el sprite es decorativo. */
  label?: string;
}

/** Recuadro con el sprite de un Pokémon. */
export function sprite(species: number, options: SpriteOptions = {}): HTMLElement {
  const { form = 0, shiny = false, scale = 1, label } = options;
  const cell = spriteCell(species, form);
  const column = cell % meta.columns;
  const row = Math.floor(cell / meta.columns);

  const node = el('span', {
    class: `sprite${shiny ? ' shiny' : ''}`,
    style: [
      `width:${CELL_W * scale}px`,
      `height:${CELL_H * scale}px`,
      `background-size:${meta.columns * CELL_W * scale}px ${meta.rows * CELL_H * scale}px`,
      `background-position:${-column * CELL_W * scale}px ${-row * CELL_H * scale}px`,
    ].join(';'),
  });
  if (label !== undefined) {
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', label);
    node.setAttribute('title', label);
  } else {
    node.setAttribute('aria-hidden', 'true');
  }
  return node;
}
