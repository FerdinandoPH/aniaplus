/**
 * Llevar un Pokémon de un pase a otro, entre los guardados en local.
 *
 * Siempre **copia**: el pase de origen queda como estaba. Es lo que menos daño hace si uno se
 * equivoca de destino, y vaciar la ranura de origen ya se puede hacer con la ✕ del editor.
 */
import { BK4 } from '../core/bk4.ts';
import { PARTY_COUNT } from '../core/constants.ts';
import { BattlePass } from '../core/pass.ts';
import { speciesNames } from '../data/index.ts';
import type { StoredPass } from '../storage/db.ts';
import { el, pickDialog, toast, type PickOption } from './dom.ts';
import { t } from './i18n.ts';
import { sprite } from './sprite.ts';
import { currentLang, passOf, persist, state } from './state.ts';

/** Miniaturas del equipo de un pase, para reconocerlo de un vistazo en la lista. */
function teamThumbs(pass: BattlePass): HTMLElement {
  const row = el('span', { class: 'pick-team' });
  for (const pk of pass.pokemon) {
    row.append(sprite(pk.species, { form: pk.form, shiny: pk.isShiny, scale: 0.34 }));
  }
  return row;
}

/**
 * Pases que pueden participar, menos el que se está editando.
 *
 * Los secretos quedan fuera: su contenido no se puede ver hasta transferirlos a la Wii, así que ni
 * se puede elegir un Pokémon suyo ni tendría sentido meterle uno a ciegas.
 */
function candidates(exclude: StoredPass): StoredPass[] {
  return state.stored.filter((entry) => entry.id !== exclude.id && !entry.secret);
}

function passOptions(entries: readonly StoredPass[], needsRoom: boolean): PickOption<StoredPass>[] {
  return entries.map((entry) => {
    const pass = passOf(entry);
    const count = pass.pokemon.length;
    const full = needsRoom && count >= PARTY_COUNT;
    const empty = !needsRoom && count === 0;
    return {
      value: entry,
      label: entry.name,
      detail: teamThumbs(pass),
      disabled: full || empty,
      reason: full ? `${count}/${PARTY_COUNT}` : empty ? t('copymon.empty') : undefined,
    };
  });
}

/**
 * Copia `pk` al pase que elija el usuario.
 *
 * `setPokemon` compacta hacia arriba, así que entra detrás del último y el pase nunca queda con
 * huecos. El enlace con las cajas del guardado (`origin`) se queda en el valor por defecto a
 * propósito: apunta a una caja del jugador que creó el pase de origen, y en otro pase ese número
 * no señala lo mismo.
 */
export async function sendToOtherPass(source: StoredPass, pk: BK4): Promise<boolean> {
  const options = passOptions(candidates(source), true);
  if (options.length === 0) {
    toast(t('copymon.noTarget'), 'error');
    return false;
  }

  const name = speciesNames(currentLang())[pk.species] ?? `#${pk.species}`;
  const target = await pickDialog(t('copymon.copyTitle', { name }), options, t('copymon.copyHint'));
  if (target === null) return false;

  const pass = passOf(target);
  pass.setPokemon(pass.pokemon.length, pk);
  await persist(target);
  toast(t('copymon.copied', { name, pass: target.name }));
  return true;
}

/** Pide un pase y uno de sus Pokémon. Devuelve una copia suya, o `null` si se cancela. */
export async function bringFromOtherPass(current: StoredPass): Promise<BK4 | null> {
  const options = passOptions(candidates(current), false);
  if (options.length === 0) {
    toast(t('copymon.noSource'), 'error');
    return null;
  }

  const source = await pickDialog(t('copymon.whichPass'), options);
  if (source === null) return null;

  const lang = currentLang();
  const team = passOf(source).pokemon;
  const chosen = await pickDialog(
    t('copymon.whichPokemon', { pass: source.name }),
    team.map((pk) => ({
      value: pk,
      label: speciesNames(lang)[pk.species] ?? `#${pk.species}`,
      detail: sprite(pk.species, { form: pk.form, shiny: pk.isShiny, scale: 0.34 }),
    })),
    t('copymon.bringHint'),
  );
  return chosen;
}
