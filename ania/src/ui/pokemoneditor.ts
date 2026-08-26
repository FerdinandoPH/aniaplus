/**
 * Editor de un Pokémon dentro de un pase, al estilo de PKHeX.
 *
 * Los movimientos ilegales se permiten: se marcan con ⚠ al lado, tal y como pide el enunciado.
 * El botón "recomendados" rellena con lo que el juego le pondría a ese nivel.
 */
import { BK4 } from '../core/bk4.ts';
import {
  abilityNames, getPersonal, heldItems, isDamagingMove, itemNames, type Lang, MAX_MOVE, moveNames,
  movePP, natureNames, PBR_LEVEL, speciesNames,
} from '../data/index.ts';
import { findPid, genderFromPid, randomSeed, setShiny, speciesNickname, type Gender } from '../gen/build.ts';
import { getEncounterMoves, getLegalMovepool } from '../gen/learn.ts';
import { langFromBk4 } from '../gen/language.ts';
import { Rng } from '../gen/rng.ts';
import { validatePokemon, warningsForMove, type PokemonDraft } from '../gen/validate.ts';
import { appendAll, el, select, toast } from './dom.ts';
import { t } from './i18n.ts';
import { sprite } from './sprite.ts';
import { currentLang } from './state.ts';

const STAT_KEYS = [
  ['hp', 'pokemoneditor.stat.hp'], ['atk', 'pokemoneditor.stat.atk'], ['def', 'pokemoneditor.stat.def'],
  ['spa', 'pokemoneditor.stat.spa'], ['spd', 'pokemoneditor.stat.spd'], ['spe', 'pokemoneditor.stat.spe'],
] as const;
/** Etiquetas de estadística en el idioma actual. Se recalcula en cada render. */
const stats = (): (readonly [typeof STAT_KEYS[number][0], string])[] =>
  STAT_KEYS.map(([key, labelKey]) => [key, t(labelKey)] as const);

function draftOf(pk: BK4): PokemonDraft {
  return {
    species: pk.species,
    form: pk.form,
    level: PBR_LEVEL,
    nature: pk.nature,
    moves: pk.moves,
    ability: pk.ability,
    heldItem: pk.heldItem,
    evs: pk.evs,
    ivs: pk.ivs,
  };
}

/** Lista de especies ordenada por nombre, que es como la busca la gente. */
function speciesOptions(lang: Lang): { value: number; label: string }[] {
  return speciesNames(lang)
    .map((label, value) => ({ value, label }))
    .slice(1)
    .sort((a, b) => a.label.localeCompare(b.label, lang));
}

function itemOptions(lang: Lang): { value: number; label: string }[] {
  const names = itemNames(lang);
  return [{ value: 0, label: t('pokemoneditor.noItem') }, ...heldItems
    .map((id) => ({ value: id, label: names[id] ?? `#${id}` }))
    .sort((a, b) => a.label.localeCompare(b.label, lang))];
}

const GENDER_MARK = ['♂', '♀', '—'];
const genderOptions = () => [
  { value: 0, label: `♂ ${t('pokemoneditor.male')}` },
  { value: 1, label: `♀ ${t('pokemoneditor.female')}` },
];

export interface PokemonEditorOptions {
  pokemon: BK4;
  onChange: () => void;
  onBack: () => void;
  /** Repinta la pantalla. Hace falta cuando cambia el PID, del que cuelgan otros campos. */
  onRefresh?: () => void;
}

export function renderPokemonEditor({ pokemon, onChange, onBack, onRefresh }: PokemonEditorOptions): HTMLElement {
  const container = el('div', {});
  const info = getPersonal(pokemon.species, pokemon.form);
  // Los desplegables se muestran en el idioma de la interfaz. El byte de idioma grabado en el
  // Pokémon (y su mote por defecto) es aparte: usa `ownLang`, no este, para no reescribirlo con
  // el idioma que tengas puesto en ese momento — ver `gen/language.ts`.
  const lang = currentLang();
  const ownLang = langFromBk4(pokemon.language);
  const warnings = validatePokemon(draftOf(pokemon), lang);
  const STATS = stats();

  const touch = () => { pokemon.refreshChecksum(); onChange(); };
  /** Guarda y repinta: para lo que cambia valores derivados que se ven en pantalla. */
  const redraw = () => { touch(); onRefresh?.(); };

  const rng = new Rng(randomSeed());

  /**
   * Cambia el PID y actualiza con él el género, que en el BK4 es un campo aparte: si no se
   * recalcula, el Pokémon se queda con el género del PID anterior.
   */
  const applyPid = (pid: number): void => {
    pokemon.pid = pid >>> 0;
    pokemon.gender = genderFromPid(pokemon.pid, info.genderRatio);
    redraw();
  };

  // La habilidad se guarda aparte, pero en Gen 4 el bit bajo del PID dice cuál de las dos toca.
  // Solo se avisa si la elegida es legal pero de la otra ranura; que no lo sea ya lo dice `validate`.
  const expectedAbility = info.abilities[pokemon.abilitySlot] ?? 0;
  const abilityMismatch = expectedAbility !== 0
    && expectedAbility !== pokemon.ability
    && info.abilities.includes(pokemon.ability);

  // Solo tiene sentido elegir género en las especies que pueden ser macho o hembra: las de un
  // único género fijo (ratio 0 o 254) o sin género (255) no dejan nada que decidir.
  const genderChoosable = info.genderRatio > 0 && info.genderRatio < 254;

  // --- identidad
  container.append(
    el('section', { class: 'card' },
      el('div', { class: 'row' },
        el('button', { class: 'ghost', onclick: onBack }, t('pokemoneditor.back')),
        el('span', { class: 'spacer', style: 'flex:1' }),
        genderChoosable
          ? select(genderOptions(), pokemon.gender, (value) => {
              // El género también sale del PID (byte bajo contra el ratio): se busca uno nuevo
              // que dé el género pedido, conservando naturaleza y habilidad.
              try {
                applyPid(findPid(rng, {
                  nature: pokemon.nature,
                  abilitySlot: pokemon.abilitySlot,
                  gender: Number(value) as Gender,
                  genderRatio: info.genderRatio,
                }));
              } catch {
                toast(t('pokemoneditor.noPidForGender'), 'error');
                onRefresh?.();
              }
            }, { class: 'badge-select' })
          : el('span', { class: 'badge' }, GENDER_MARK[pokemon.gender] ?? '—'),
        el('span', { class: 'badge' }, t('pokemoneditor.level', { level: PBR_LEVEL })),
        pokemon.isShiny ? el('span', { class: 'badge ok' }, `✦ ${t('pokemoneditor.shinyBadge')}`) : null,
      ),
      el('div', { class: 'field' },
        el('label', {}, t('pokemoneditor.species')),
        el('div', { class: 'row', style: 'flex-wrap:nowrap' },
          sprite(pokemon.species, {
            form: pokemon.form, shiny: pokemon.isShiny,
            label: speciesNames(lang)[pokemon.species] ?? `#${pokemon.species}`,
          }),
          select(speciesOptions(lang), pokemon.species, (value) => {
            pokemon.species = Number(value);
            // Al cambiar de especie, la habilidad anterior casi nunca es válida.
            pokemon.ability = getPersonal(pokemon.species).abilities[0]!;
            // El ratio de género es distinto, así que el mismo PID puede dar otro género.
            pokemon.gender = genderFromPid(pokemon.pid, getPersonal(pokemon.species).genderRatio);
            // Sin mote propio, el campo lleva el nombre de la especie en el idioma con el que se
            // creó este Pokémon (no el de la interfaz), y la especie ha cambiado.
            if (!pokemon.isNicknamed) pokemon.nickname = speciesNickname(pokemon.species, ownLang);
            redraw();
          }, { style: 'flex:1' }),
        ),
      ),
      /*
       * El mote es un campo aparte de la bandera que dice si hay mote. PBR enseña en combate lo
       * que haya escrito, así que sin mote propio ahí va el nombre de la especie: dejarlo vacío
       * es lo que hacía que los Pokémon salieran sin nombre.
       */
      el('div', { class: 'field' },
        el('label', {}, t('pokemoneditor.nickname')),
        el('div', { class: 'row', style: 'flex-wrap:nowrap' },
          el('label', { class: 'small muted', style: 'display:flex;align-items:center;gap:6px' },
            el('input', {
              type: 'checkbox', checked: pokemon.isNicknamed,
              onchange: (event) => {
                const own = (event.target as HTMLInputElement).checked;
                pokemon.isNicknamed = own;
                if (!own) pokemon.nickname = speciesNickname(pokemon.species, ownLang);
                redraw();
              },
            }),
            t('pokemoneditor.own'),
          ),
          el('input', {
            value: pokemon.nickname, maxlength: 10, disabled: !pokemon.isNicknamed,
            style: 'flex:1',
            oninput: (event) => {
              pokemon.nickname = (event.target as HTMLInputElement).value;
              touch();
            },
          }),
        ),
      ),
      el('div', { class: 'grid2' },
        el('div', { class: 'field' },
          el('label', {}, t('pokemoneditor.nature')),
          select(
            natureNames(lang).map((label, value) => ({ value, label })),
            pokemon.nature,
            (value) => {
              // La naturaleza es `pid % 25`: hay que buscar un PID nuevo que la dé, conservando
              // la habilidad y el género para que no cambie nada más de rebote.
              try {
                applyPid(findPid(rng, {
                  nature: Number(value),
                  abilitySlot: pokemon.abilitySlot,
                  gender: pokemon.gender as Gender,
                  genderRatio: info.genderRatio,
                }));
              } catch {
                toast(t('pokemoneditor.noPidForNature'), 'error');
                onRefresh?.();
              }
            },
          ),
        ),
        el('div', { class: 'field' },
          el('label', {}, t('pokemoneditor.ability')),
          select(
            info.abilities.filter((a, i, arr) => a !== 0 && arr.indexOf(a) === i)
              .map((a) => ({ value: a, label: abilityNames(lang)[a] ?? `#${a}` })),
            pokemon.ability,
            (value) => { pokemon.ability = Number(value); touch(); },
          ),
        ),
      ),
      el('div', { class: 'field' },
        el('label', {}, t('pokemoneditor.item')),
        select(itemOptions(lang), pokemon.heldItem, (value) => { pokemon.heldItem = Number(value); touch(); }),
      ),
      el('div', { class: 'field' },
        el('label', {}, 'PID'),
        el('div', { class: 'row' },
          el('input', {
            value: pokemon.pid.toString(16).toUpperCase().padStart(8, '0'),
            maxlength: 8, spellcheck: false, style: 'flex:1;font-family:ui-monospace,monospace',
            // Se aplica al salir del campo, no en cada tecla: al cambiar el PID se repinta.
            onchange: (event) => {
              const text = (event.target as HTMLInputElement).value.trim();
              if (!/^[0-9a-fA-F]{1,8}$/.test(text)) {
                toast(t('pokemoneditor.pidNotHex'), 'error');
                onRefresh?.();
                return;
              }
              applyPid(Number.parseInt(text, 16));
            },
          }),
          el('button', { class: 'ghost', onclick: () => applyPid(rng.next()) }, t('pokemoneditor.random')),
        ),
        el('p', { class: 'small muted', style: 'margin:4px 0 0' }, t('pokemoneditor.pidHint')),
      ),
      el('label', { class: 'row' },
        el('input', {
          type: 'checkbox', checked: pokemon.isShiny, style: 'width:auto;min-height:auto',
          onchange: (event) => {
            // Se ajusta el SID, no el PID: así el brillo no arrastra naturaleza ni género.
            setShiny(pokemon, (event.target as HTMLInputElement).checked, rng);
            redraw();
          },
        }),
        el('span', { style: 'color:var(--text);font-size:15px' }, t('pokemoneditor.shinyLabel')),
      ),
      abilityMismatch
        ? el('p', { class: 'small', style: 'color:var(--warn);margin:8px 0 0' },
            t('pokemoneditor.abilityMismatch', { ability: abilityNames(lang)[expectedAbility] ?? '?' }))
        : null,
    ),
  );

  // --- movimientos
  const pool = getLegalMovepool(pokemon.species, pokemon.form, { level: PBR_LEVEL });
  const moves = moveNames(lang);
  const legalOptions = [...pool]
    .map((id) => ({ value: id, label: moves[id] ?? `#${id}` }))
    .sort((a, b) => a.label.localeCompare(b.label, lang));
  const allOptions = Array.from({ length: MAX_MOVE }, (_, i) => i + 1)
    .map((id) => ({ value: id, label: moves[id] ?? `#${id}` }))
    .sort((a, b) => a.label.localeCompare(b.label, lang));

  const movesCard = el('section', { class: 'card' },
    el('h2', {}, t('pokemoneditor.moves')),
    el('div', { class: 'row', style: 'margin-bottom:10px' },
      el('button', {
        onclick: () => {
          pokemon.moves = getEncounterMoves(pokemon.species, pokemon.form, PBR_LEVEL);
          pokemon.pp = pokemon.moves.map((m) => movePP[m] ?? 0);
          touch();
        },
      }, t('pokemoneditor.recommended')),
      el('span', { class: 'muted small' }, t('pokemoneditor.recommendedHint')),
    ),
  );

  // Un interruptor por si el usuario quiere salirse de lo legal a propósito.
  let showAll = pokemon.moves.some((m) => m > 0 && !pool.has(m));
  const movesBody = el('div', {});
  const renderMoves = (): void => {
    movesBody.replaceChildren();
    pokemon.moves.forEach((move, index) => {
      const moveWarnings = warningsForMove(warnings, index);
      movesBody.append(
        el('div', { class: 'move-row' },
          select(
            [{ value: 0, label: t('pokemoneditor.emptySlot') }, ...(showAll ? allOptions : legalOptions)],
            move,
            (value) => {
              const moves = [...pokemon.moves];
              moves[index] = Number(value);
              pokemon.moves = moves;
              const pp = [...pokemon.pp];
              pp[index] = movePP[Number(value)] ?? 0;
              pokemon.pp = pp;
              touch();
            },
          ),
          moveWarnings.length > 0
            ? el('span', { class: 'warn-mark', title: moveWarnings.map((w) => w.message).join('\n') }, '⚠')
            : el('span', { style: 'width:18px' }),
        ),
      );
    });
  };
  renderMoves();

  appendAll(movesCard,
    movesBody,
    el('label', { class: 'row', style: 'margin-top:4px' },
      el('input', {
        type: 'checkbox', checked: showAll, style: 'width:auto;min-height:auto',
        onchange: (event) => { showAll = (event.target as HTMLInputElement).checked; renderMoves(); },
      }),
      el('span', {}, t('pokemoneditor.allowIllegal')),
    ),
    !pokemon.moves.some(isDamagingMove)
      ? el('p', { class: 'small', style: 'color:var(--warn)' }, `⚠ ${t('pokemoneditor.noDamagingMove')}`)
      : null,
  );
  container.append(movesCard);

  // --- estadísticas
  const evTotal = () => Object.values(pokemon.evs).reduce((a, b) => a + b, 0);
  const statsCard = el('section', { class: 'card' },
    el('h2', {}, t('pokemoneditor.stats')),
    el('p', { class: 'small muted', style: 'margin:-4px 0 10px' }, t('pokemoneditor.statsHint')),
    el('h3', { class: 'group' }, t('pokemoneditor.ev')),
  );
  const evLabel = el('span', { class: 'small muted' }, t('pokemoneditor.evOf510', { total: evTotal() }));

  for (const [key, label] of STATS) {
    const value = el('span', { class: 'value' }, String(pokemon.evs[key]));
    statsCard.append(
      el('div', { class: 'stat-row' },
        el('span', { class: 'label' }, label),
        el('input', {
          type: 'range', min: 0, max: 255, value: pokemon.evs[key],
          oninput: (event) => {
            const next = Number((event.target as HTMLInputElement).value);
            const others = evTotal() - pokemon.evs[key];
            // Se limita en el sitio en vez de dejar pasar un total inválido.
            const clamped = Math.min(next, 510 - others);
            pokemon.evs = { ...pokemon.evs, [key]: clamped };
            value.textContent = String(clamped);
            evLabel.textContent = t('pokemoneditor.evOf510', { total: evTotal() });
            (event.target as HTMLInputElement).value = String(clamped);
            pokemon.refreshChecksum();
          },
          onchange: touch,
        }),
        value,
      ),
    );
  }
  statsCard.append(
    el('div', { class: 'row', style: 'margin-top:6px' }, evLabel),
    el('h3', { class: 'group' }, t('pokemoneditor.iv')),
  );

  // Cada IV lleva deslizador y casilla numérica: el deslizador es cómodo en el móvil y la
  // casilla permite teclear el valor exacto, que es lo que se quiere al copiar un set.
  const ivRows = new Map<typeof STAT_KEYS[number][0], { range: HTMLInputElement; box: HTMLInputElement }>();
  const setIv = (key: typeof STAT_KEYS[number][0], raw: number): void => {
    const value = Math.max(0, Math.min(31, Math.round(raw) || 0));
    pokemon.ivs = { ...pokemon.ivs, [key]: value };
    const row = ivRows.get(key)!;
    row.range.value = String(value);
    row.box.value = String(value);
    touch();
  };

  for (const [key, label] of STATS) {
    const range = el('input', {
      type: 'range', min: 0, max: 31, value: pokemon.ivs[key],
      oninput: (event) => setIv(key, Number((event.target as HTMLInputElement).value)),
    });
    const box = el('input', {
      type: 'number', min: 0, max: 31, value: pokemon.ivs[key], class: 'value-box',
      oninput: (event) => setIv(key, Number((event.target as HTMLInputElement).value)),
    });
    ivRows.set(key, { range, box });
    statsCard.append(
      el('div', { class: 'stat-row' }, el('span', { class: 'label' }, label), range, box),
    );
  }

  const setAllIvs = (produce: () => number): void => {
    for (const [key] of STATS) setIv(key, produce());
  };
  statsCard.append(
    el('div', { class: 'row', style: 'margin-top:10px' },
      el('button', { class: 'ghost', onclick: () => { setAllIvs(() => 31); toast(t('pokemoneditor.ivSetTo31')); } },
        t('pokemoneditor.perfectIvs')),
      el('button', { class: 'ghost', onclick: () => { setAllIvs(() => rng.int(32)); toast(t('pokemoneditor.ivSetRandom')); } },
        t('pokemoneditor.randomIvs')),
    ),
  );
  container.append(statsCard);

  if (warnings.length > 0) {
    container.append(
      el('section', { class: 'card' },
        el('h2', {}, t('pokemoneditor.warnings')),
        el('ul', { class: 'warnings' }, ...warnings.map((w) => el('li', {}, `⚠ ${w.message}`))),
        el('p', { class: 'small muted' }, t('pokemoneditor.warningsHint')),
      ),
    );
  }

  return container;
}
