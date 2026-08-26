import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe } from 'vitest';

const PROJECT = join(import.meta.dirname, '..', '..');
const SAVES = join(PROJECT, 'Español (SPA) ARCHIVOS GUARDADOS PBR [RESTORER FOREVER]');
const SAVES_JP = join(
  PROJECT,
  '日本語版 (JAP) ポケモンバトルレボリューション ファイルを保存 [修復者 フォレル]',
  '(日本語版) バトレボ セーブ ファイル',
  '(メインのゲームセーブファイル)   すべてのファイルを WIIのSD カードのルートにコピー＆ペーストしてください (DOLPHIN の場合は README ファイルを参照してください)',
);

/**
 * Los guardados reales que vienen con el proyecto, uno por región del juego.
 *
 * Los dos primeros son PAL en español (RPBP01); `usa` es de la versión americana (RPBE01) y
 * `japon` de la japonesa (RPBJ01). Los tres se usan de verdad en las pruebas: la región cambia
 * dónde están las fronteras entre tipos de pase y qué idioma tiene el perfil, y eso solo se
 * comprueba con ficheros de cada una.
 */
export const SAVE_FILES = {
  europa: join(SAVES, '¬ Español EUROPA (EUR)', '(ARCHIVO PRINCIPAL) Wii o Dolphin', '0001000052504250', 'GeniusPbr', 'PbrSaveData'),
  sudamerica: join(SAVES, '¬ Español SUDAMERICA (EUR)', '(ARCHIVO PRINCIPAL) Wii o Dolphin', '0001000052504250', 'GeniusPbr', 'PbrSaveData'),
  usa: join(PROJECT, 'RPBE01 (NTSC-U) Save Post Game', '00010000', '52504245', 'data', 'GeniusPbr', 'PbrSaveData'),
  japon: join(SAVES_JP, '000100005250424a', 'GeniusPbr', 'PbrSaveData'),
} as const;

/**
 * Los guardados de ejemplo **no viajan en el repositorio**: son ficheros de consolas de verdad,
 * y además material del juego. Sin ellos, las pruebas que van contra guardados reales se saltan
 * en lugar de fallar, para que un clon recién hecho pase `npm test` igualmente. Cómo ponerlos,
 * en el README («The sample saves» / «Los guardados de ejemplo»).
 */
export const HAVE_SAVES = Object.values(SAVE_FILES).every((f) => existsSync(f));

/** `describe` que se salta el bloque entero cuando faltan los guardados de ejemplo. */
export const describeSaves = HAVE_SAVES ? describe : describe.skip;

/**
 * La base de datos de equipos competitivos que viene con el paquete de guardados en español, y
 * los nombres de movimientos en inglés de PKHeX, que hacen falta para leerla. Los usa
 * `gen.test.ts` para validar la lista de movimientos de estado contra miles de equipos reales.
 */
export const PBR_DATABASE = join(
  SAVES,
  'PC cuadros Bases de datos de texto [Lista de todos los Pokémon]',
  'Base de datos PBR.txt',
);
export const PKHEX_MOVES_EN = join(
  PROJECT, 'PKHeX-master', 'PKHeX.Core', 'Resources', 'text', 'other', 'en', 'text_Moves_en.txt',
);

/** `describe` que se salta el bloque cuando falta la base de datos o la fuente de PKHeX. */
export const describeMoveDatabase =
  existsSync(PBR_DATABASE) && existsSync(PKHEX_MOVES_EN) ? describe : describe.skip;

export function loadRaw(which: keyof typeof SAVE_FILES): Uint8Array {
  const file = SAVE_FILES[which];
  if (!existsSync(file)) {
    throw new Error(
      `falta el guardado de ejemplo «${which}»: ${file}\n` +
      'No viaja en el repositorio; mira «The sample saves» en el README (README.es.md: «Los guardados de ejemplo»).',
    );
  }
  return new Uint8Array(readFileSync(file));
}

/**
 * Compara dos buffers grandes. `expect(a).toEqual(b)` sobre 3,5 MB tarda más de diez segundos
 * en vitest porque compara elemento a elemento con su lógica genérica; esto tarda milisegundos
 * y además dice en qué byte está la primera diferencia, que es lo que uno quiere saber.
 *
 * Devuelve `null` si son idénticos, o una descripción de la primera divergencia.
 */
export function diffBuffers(actual: Uint8Array, expected: Uint8Array): string | null {
  if (actual.length !== expected.length) {
    return `longitudes distintas: ${actual.length} vs ${expected.length}`;
  }
  const mismatch = Buffer.compare(Buffer.from(actual), Buffer.from(expected));
  if (mismatch === 0) return null;

  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      let differing = 0;
      for (let k = 0; k < actual.length; k++) if (actual[k] !== expected[k]) differing++;
      const hex = (v: number) => v.toString(16).padStart(2, '0');
      return `primera diferencia en 0x${i.toString(16).toUpperCase()}: ${hex(actual[i]!)} != ${hex(expected[i]!)} (${differing} bytes distintos en total)`;
    }
  }
  return null;
}
