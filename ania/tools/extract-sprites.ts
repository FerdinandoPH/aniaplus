/**
 * Monta los sprites de los Pokémon en dos hojas (normal y variocolor) y su índice.
 *
 *   npx tsx tools/extract-sprites.ts
 *
 * Las imágenes salen de PKHeX (`PKHeX.Drawing.PokeSprite`), que trae el sprite de caja de cada
 * especie y forma en el estilo de la generación 4 — la época del juego.
 *
 * Se juntan en una sola imagen a propósito. El asistente Wii atiende las peticiones **de una en
 * una**, así que 660 ficheros sueltos serían 660 idas y venidas por la red hacia una consola de
 * 2006; en una hoja es una sola petición, y el navegador la cachea.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PKHEX = join(import.meta.dirname, '..', '..', 'PKHeX-master',
  'PKHeX.Drawing.PokeSprite', 'Resources', 'img');
const OUT_PUBLIC = join(import.meta.dirname, '..', 'public', 'pkhex');
const OUT_DATA = join(import.meta.dirname, '..', 'src', 'data', 'pkhex');

/** Última especie de la generación 4. Lo de después no existe en PBR. */
const MAX_SPECIES = 493;
/** Tamaño de cada celda, que es el de los sprites de PKHeX. */
const CELL_W = 68;
const CELL_H = 56;
const COLUMNS = 26;

/** `b_25.png` → especie 25 sin forma; `b_487-1.png` → especie 487, forma 1. */
function parseName(file: string): { species: number; form: number } | null {
  const match = /^b_(\d+)(?:-(\d+))?s?\.png$/.exec(file);
  if (match === null) return null;
  return { species: Number(match[1]), form: match[2] === undefined ? 0 : Number(match[2]) };
}

/**
 * Lista de celdas en orden. La 0 es el hueco de PKHeX (`b_0.png`), que sirve de reserva para
 * cualquier especie o forma que no tenga sprite: mejor un hueco que una imagen equivocada.
 */
function cellOrder(): { species: number; form: number }[] {
  const dir = join(PKHEX, 'Big Pokemon Sprites');
  const found = new Map<number, number[]>();

  for (const file of readdirSync(dir)) {
    const parsed = parseName(file);
    if (parsed === null || parsed.species < 1 || parsed.species > MAX_SPECIES) continue;
    const forms = found.get(parsed.species) ?? [];
    forms.push(parsed.form);
    found.set(parsed.species, forms);
  }

  const cells = [{ species: 0, form: 0 }];
  for (let species = 1; species <= MAX_SPECIES; species++) {
    const forms = found.get(species);
    if (forms === undefined) throw new Error(`No hay sprite para la especie ${species}`);
    for (const form of forms.sort((a, b) => a - b)) cells.push({ species, form });
  }
  return cells;
}

/** Nombre del fichero de una celda dentro de su carpeta. */
function fileFor(cell: { species: number; form: number }, shiny: boolean): string {
  const form = cell.form === 0 ? '' : `-${cell.form}`;
  return `b_${cell.species}${form}${shiny ? 's' : ''}.png`;
}

/**
 * Monta una hoja. Se paletiza a 255 colores porque son dibujos planos: baja de 405 KB a unos 150
 * sin diferencia visible, y la transparencia sobrevive.
 */
function buildSheet(cells: { species: number; form: number }[], shiny: boolean, out: string): void {
  const dir = join(PKHEX, shiny ? 'Big Shiny Sprites' : 'Big Pokemon Sprites');
  const files = cells.map((cell) => {
    const own = join(dir, fileFor(cell, shiny));
    if (existsSync(own)) return own;
    // Algunas formas no tienen versión variocolor propia; se cae a la normal antes que dejar hueco.
    const plain = join(PKHEX, 'Big Pokemon Sprites', fileFor(cell, false));
    if (existsSync(plain)) return plain;
    return join(PKHEX, 'Big Pokemon Sprites', 'b_0.png');
  });

  execFileSync('montage', [
    ...files,
    '-tile', `${COLUMNS}x`,
    '-geometry', `${CELL_W}x${CELL_H}+0+0`,
    '-background', 'none',
    `PNG32:${out}.tmp`,
  ]);
  execFileSync('convert', [
    `${out}.tmp`, '-colors', '255', '-define', 'png:compression-level=9', `PNG8:${out}`,
  ]);
  execFileSync('rm', ['-f', `${out}.tmp`]);
}

const cells = cellOrder();
mkdirSync(OUT_PUBLIC, { recursive: true });
mkdirSync(OUT_DATA, { recursive: true });

const sheets: { file: string; shiny: boolean }[] = [
  { file: 'pokemon.png', shiny: false },
  { file: 'pokemon-shiny.png', shiny: true },
];
for (const sheet of sheets) {
  const out = join(OUT_PUBLIC, sheet.file);
  buildSheet(cells, sheet.shiny, out);
  console.log(`${sheet.file}: ${(statSync(out).size / 1024).toFixed(0)} KB`);
}

// El índice va por "especie" y "especie-forma": el segundo solo cuando esa forma tiene sprite.
const index: Record<string, number> = {};
cells.forEach((cell, i) => {
  index[cell.form === 0 ? String(cell.species) : `${cell.species}-${cell.form}`] = i;
});

const meta = {
  cell: [CELL_W, CELL_H],
  columns: COLUMNS,
  rows: Math.ceil(cells.length / COLUMNS),
  count: cells.length,
  index,
};
writeFileSync(join(OUT_DATA, 'sprites.json'), `${JSON.stringify(meta)}\n`);

console.log(`${cells.length} celdas, ${meta.columns}×${meta.rows}, índice de ${Object.keys(index).length} entradas`);
if (index['1'] !== 1) throw new Error('La celda 1 debería ser Bulbasaur');
if (index['0'] !== 0) throw new Error('La celda 0 debería ser el hueco de reserva');
