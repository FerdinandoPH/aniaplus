/**
 * Advertencias de legalidad para el editor.
 *
 * Deliberadamente NO bloquea nada: el enunciado pide que un movimiento ilegal se pueda poner,
 * solo que salga marcado. Devolver advertencias y no errores mantiene esa decisión en la UI.
 */
import {
  getPersonal,
  heldItems,
  isDamagingMove,
  type Lang,
  MAX_ABILITY,
  MAX_ITEM,
  MAX_MOVE,
  MAX_SPECIES,
  moveNames,
  needsDamagingMove,
  PBR_LEVEL,
} from '../data/index.ts';
import { getLegalMovepool } from './learn.ts';

export type WarningKind =
  | 'movimiento-ilegal'
  | 'movimiento-repetido'
  | 'movimiento-vacio'
  | 'sin-movimiento-ofensivo'
  | 'habilidad-ilegal'
  | 'objeto-ilegal'
  | 'ev-excedidos'
  | 'especie-invalida';

export interface Warning {
  kind: WarningKind;
  message: string;
  /** Índice del movimiento (0-3) al que se refiere la advertencia, si aplica. */
  moveIndex?: number;
}

export interface PokemonDraft {
  species: number;
  form?: number;
  level?: number;
  /** 0-24. En Gen 4 se deriva del PID, así que al construir el BK4 hay que buscar uno que encaje. */
  nature?: number;
  moves: number[];
  ability: number;
  heldItem: number;
  evs: { hp: number; atk: number; def: number; spe: number; spa: number; spd: number };
  ivs: { hp: number; atk: number; def: number; spe: number; spa: number; spd: number };
}

/** Tope de EV de Gen 4: 510 en total, 252 por estadística. */
export const EV_TOTAL_MAX = 510;
export const EV_SINGLE_MAX = 252;

export function validatePokemon(draft: PokemonDraft, lang: Lang = 'es'): Warning[] {
  const warnings: Warning[] = [];
  const { species, form = 0, level = PBR_LEVEL } = draft;
  const names = moveNames(lang);

  if (species < 1 || species > MAX_SPECIES) {
    return [{ kind: 'especie-invalida', message: `La especie ${species} no existe en la generación 4.` }];
  }

  // --- movimientos
  const pool = getLegalMovepool(species, form, { level });
  const seen = new Set<number>();
  let hasDamaging = false;

  draft.moves.forEach((move, index) => {
    if (move === 0) {
      warnings.push({ kind: 'movimiento-vacio', message: 'Hueco de movimiento vacío.', moveIndex: index });
      return;
    }
    if (move > MAX_MOVE || !pool.has(move)) {
      warnings.push({
        kind: 'movimiento-ilegal',
        message: `${names[move] ?? move} no es legal para esta especie.`,
        moveIndex: index,
      });
    }
    if (seen.has(move)) {
      warnings.push({
        kind: 'movimiento-repetido',
        message: `${names[move] ?? move} está repetido.`,
        moveIndex: index,
      });
    }
    seen.add(move);
    if (isDamagingMove(move)) hasDamaging = true;
  });

  if (!hasDamaging && needsDamagingMove(species)) {
    warnings.push({
      kind: 'sin-movimiento-ofensivo',
      message: 'Ningún movimiento hace daño: este Pokémon no puede ganar un combate por sí solo.',
    });
  }

  // --- habilidad
  const info = getPersonal(species, form);
  if (draft.ability < 1 || draft.ability > MAX_ABILITY) {
    warnings.push({ kind: 'habilidad-ilegal', message: `La habilidad ${draft.ability} no existe.` });
  } else if (!info.abilities.includes(draft.ability)) {
    warnings.push({
      kind: 'habilidad-ilegal',
      message: 'Esta especie no puede tener esta habilidad.',
    });
  }

  // --- objeto
  if (draft.heldItem !== 0 && (draft.heldItem > MAX_ITEM || !heldItems.includes(draft.heldItem))) {
    warnings.push({ kind: 'objeto-ilegal', message: 'Este objeto no se puede equipar en la generación 4.' });
  }

  // --- EV
  const evValues = Object.values(draft.evs);
  const total = evValues.reduce((a, b) => a + b, 0);
  if (total > EV_TOTAL_MAX || evValues.some((v) => v > EV_SINGLE_MAX)) {
    warnings.push({
      kind: 'ev-excedidos',
      message: `Los EV suman ${total} (máximo ${EV_TOTAL_MAX}, y ${EV_SINGLE_MAX} por estadística).`,
    });
  }

  return warnings;
}

/** Solo las advertencias que afectan a un movimiento concreto, para pintar la marca al lado. */
export function warningsForMove(warnings: Warning[], index: number): Warning[] {
  return warnings.filter((w) => w.moveIndex === index);
}
