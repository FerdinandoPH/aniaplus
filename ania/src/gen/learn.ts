/**
 * Qué movimientos puede aprender un Pokémon en Gen 4, y cuáles son los "recomendados".
 *
 * Se distinguen dos cosas que la aplicación usa para fines distintos:
 *   - `getEncounterMoves`: los 4 movimientos que el juego le pondría al llegar a ese nivel.
 *     Es lo que ofrece el botón "movimientos recomendados".
 *   - `getLegalMovepool`: todo lo que puede aprender legalmente, para el modo aleatorio
 *     "legales" y para marcar advertencias en el editor.
 */
import {
  eggMoves,
  evolutionChain,
  formIndex,
  getPersonal,
  learnsets,
  machines,
  PBR_LEVEL,
  specialTutors,
  tutors,
} from '../data/index.ts';

/** Nivel 0 en el learnset significa "se aprende al evolucionar", no "a nivel 0". */
const EVOLUTION_MOVE_LEVEL = 0;

/**
 * Los 4 movimientos con los que el juego genera un Pokémon de ese nivel.
 *
 * Reproduce `Learnset.SetEncounterMoves` de PKHeX: recorre el learnset de menor a mayor nivel
 * escribiendo en una cola circular de 4 huecos, ignora duplicados, y al final rota para que el
 * orden coincida con el del juego (el más reciente queda al final).
 */
export function getEncounterMoves(species: number, form = 0, level = PBR_LEVEL): number[] {
  const learnset = learnsets[formIndex(species, form)] ?? [];
  const moves: number[] = [0, 0, 0, 0];
  let count = 0;

  for (const [move, moveLevel] of learnset) {
    if (moveLevel <= EVOLUTION_MOVE_LEVEL) continue; // movimientos de evolución
    if (moveLevel > level) break;
    if (moves.includes(move)) continue;
    moves[count & 3] = move;
    count++;
  }

  // Si se dio más de una vuelta a la cola, hay que rotar para dejar el orden del juego.
  const shift = count & 3;
  if (count > 4 && shift !== 0) {
    return [...moves.slice(shift), ...moves.slice(0, shift)];
  }
  return moves;
}

export interface MovepoolOptions {
  level?: number;
  /** Incluir movimientos huevo. Legales en Gen 4, pero solo por cría. */
  includeEggMoves?: boolean;
}

/**
 * Todos los movimientos que la especie puede conocer legalmente a ese nivel.
 *
 * Cubre subida de nivel (de toda la cadena evolutiva, porque en Gen 4 los movimientos
 * aprendidos como pre-evolución se conservan), MT/MO, tutores y, opcionalmente, huevo.
 * No modela el motor de encuentros de PKHeX: para elegir equipos legales no hace falta.
 */
export function getLegalMovepool(species: number, form = 0, options: MovepoolOptions = {}): Set<number> {
  const { level = PBR_LEVEL, includeEggMoves = true } = options;
  const pool = new Set<number>();

  for (const stage of evolutionChain(species)) {
    const index = stage === species ? formIndex(species, form) : formIndex(stage, 0);

    for (const [move, moveLevel] of learnsets[index] ?? []) {
      // Los movimientos de evolución (nivel 0) son legales para las formas ya evolucionadas.
      if (moveLevel <= level) pool.add(move);
    }

    const info = getPersonal(stage, stage === species ? form : 0);
    for (const bit of info.machines) {
      const move = bit < 92 ? machines.tm[bit] : machines.hm[bit - 92];
      if (move !== undefined) pool.add(move);
    }

    for (const move of tutors[index] ?? []) pool.add(move);

    if (includeEggMoves) {
      for (const move of eggMoves[stage] ?? []) pool.add(move);
    }
  }

  // Tutores especiales de la Ruta 210: movimientos iniciales potenciados y Cometa Draco.
  const { moveIds } = specialTutors;
  if (specialTutors.blastBurn.includes(species)) pool.add(moveIds.blastBurn);
  if (specialTutors.hydroCannon.includes(species)) pool.add(moveIds.hydroCannon);
  if (specialTutors.frenzyPlant.includes(species)) pool.add(moveIds.frenzyPlant);
  if (specialTutors.dracoMeteor.includes(species)) pool.add(moveIds.dracoMeteor);

  pool.delete(0);
  return pool;
}

/** ¿Es legal que esta especie conozca este movimiento? */
export function canLearn(species: number, move: number, form = 0, level = PBR_LEVEL): boolean {
  return getLegalMovepool(species, form, { level }).has(move);
}
