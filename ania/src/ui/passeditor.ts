/**
 * Editor de un pase: el entrenador, sus frases y sus seis Pokémon.
 *
 * El diseño del pase NO se edita aquí a propósito. En PBR el diseño es propiedad de la ranura del
 * guardado —igual que la PK de un Pokémon— así que se elige al transferir a la Wii, no al crear.
 */
import { BK4 } from '../core/bk4.ts';
import { BattlePass, TRAINER_MODEL_NAMES, TrainerModel } from '../core/pass.ts';
import { PHRASE_LENGTHS, PHRASE_ORDER } from '../core/constants.ts';
import { speciesNames } from '../data/index.ts';
import { defaultPokemon } from '../gen/build.ts';
import { bringFromOtherPass, sendToOtherPass } from './copymon.ts';
import { confirmDialog, el, select, toast } from './dom.ts';
import { t } from './i18n.ts';
import { sprite } from './sprite.ts';
import { renderPokemonEditor } from './pokemoneditor.ts';
import { contentLang, currentLang, passOf, persist, remove, state, update } from './state.ts';
import type { StoredPass } from '../storage/db.ts';

const PHRASE_KEYS: Record<keyof typeof PHRASE_LENGTHS, string> = {
  greeting: 'passeditor.phrase.greeting',
  sentOut: 'passeditor.phrase.sentOut',
  shift1: 'passeditor.phrase.shift1',
  shift2: 'passeditor.phrase.shift2',
  win: 'passeditor.phrase.win',
  lose: 'passeditor.phrase.lose',
};

/** Índice del Pokémon abierto dentro del editor, o null si estamos en la vista del pase. */
let openPokemon: number | null = null;

export function renderPassEditor(entry: StoredPass): HTMLElement {
  const pass = passOf(entry);
  const save = async () => { await persist(entry); };

  if (openPokemon !== null) {
    const pk = pass.getPokemon(openPokemon);
    if (pk === null) {
      openPokemon = null;
    } else {
      const index = openPokemon;
      return renderPokemonEditor({
        pokemon: pk,
        onChange: () => {
          // El editor trabaja sobre una copia descifrada: hay que devolverla al pase.
          pass.setPokemon(index, pk, pass.getSlotOrigin(index));
          void save();
        },
        onRefresh: () => update({}),
        onBack: () => { openPokemon = null; update({}); },
      });
    }
  }

  const container = el('div', {});

  container.append(
    el('section', { class: 'card' },
      el('div', { class: 'row' },
        el('button', { class: 'ghost', onclick: () => update({ editing: null }) }, t('passeditor.back')),
        el('span', { style: 'flex:1' }),
        entry.secret ? el('span', { class: 'badge warn' }, t('passeditor.secretMode')) : null,
      ),
      el('div', { class: 'field' },
        el('label', {}, t('passeditor.trainerName')),
        el('input', {
          value: pass.trainerName, maxlength: 9,
          oninput: (event) => {
            pass.trainerName = (event.target as HTMLInputElement).value;
            void save();
          },
        }),
      ),
      el('div', { class: 'field' },
        el('label', {}, t('passeditor.trainerModel')),
        select(
          Object.entries(TRAINER_MODEL_NAMES).map(([value, label]) => ({ value: Number(value), label })),
          pass.model || TrainerModel.YoungBoy,
          (value) => {
            pass.model = Number(value);
            // Cada personaje tiene su propio vestuario: los índices de ropa del anterior no
            // significan nada en el nuevo, así que se repone a lo que trae de fábrica.
            pass.resetGearToDefault();
            // Y lo mismo con las frases: los índices apuntan al bloque de frases del personaje.
            pass.resetPresetPhrases();
            void save();
            update({});
          },
        ),
        el('p', { class: 'small muted', style: 'margin:4px 0 0' }, t('passeditor.trainerModelHint')),
      ),
      el('div', { class: 'field' },
        el('label', {}, t('passeditor.selfIntroduction')),
        el('textarea', {
          oninput: (event) => {
            pass.selfIntroduction = (event.target as HTMLTextAreaElement).value;
            void save();
          },
        }, pass.selfIntroduction),
      ),
      el('p', { class: 'small muted' }, t('passeditor.currentDesign', { design: pass.design })),
    ),
  );

  /**
   * Mete un Pokémon en el equipo y abre su editor.
   *
   * El pase no admite huecos: `setPokemon` compacta, así que el nuevo cae detrás del último que
   * haya, no necesariamente en la fila que se ha pulsado. Por eso se calcula antes dónde va a
   * caer, para abrir la ficha que de verdad ha ocupado.
   */
  const addPokemon = async (pk: BK4): Promise<void> => {
    const landed = pass.pokemon.length;
    pass.setPokemon(landed, pk);
    await save();
    openPokemon = landed;
    update({});
  };

  // --- equipo
  const team = el('section', { class: 'card' }, el('h2', {}, t('passeditor.team')));
  if (entry.secret) {
    team.append(
      el('p', { class: 'muted' }, t('passeditor.secretBody')),
      el('button', {
        onclick: async () => {
          const ok = await confirmDialog(
            t('passeditor.revealTitle'),
            t('passeditor.revealBody'),
            t('passeditor.reveal'),
          );
          if (ok) { await persist({ ...entry, secret: false }); toast(t('passeditor.revealed')); }
        },
      }, t('passeditor.revealNow')),
    );
  } else {
    for (let i = 0; i < 6; i++) {
      const pk = pass.getPokemon(i);
      team.append(
        el('div', { class: `mon-row${pk === null ? ' empty' : ''}` },
          el('span', { class: 'idx' }, `${i + 1}`),
          pk !== null ? sprite(pk.species, { form: pk.form, shiny: pk.isShiny, scale: 0.55 }) : null,
          pk === null
            ? el('span', { class: 'name row' },
                el('button', { class: 'ghost small', onclick: () => void addPokemon(defaultPokemon(1, 0, { lang: contentLang() })) }, t('passeditor.newPokemon')),
                el('button', {
                  class: 'ghost small',
                  onclick: async () => {
                    const brought = await bringFromOtherPass(entry);
                    if (brought !== null) await addPokemon(brought);
                  },
                }, t('passeditor.fromOtherPass')),
              )
            : el('button', {
                class: 'name ghost',
                style: 'border:0;background:none;min-height:auto;padding:0',
                onclick: () => { openPokemon = i; update({}); },
              }, speciesNames(currentLang())[pk.species] ?? `#${pk.species}`),
          pk !== null && !pk.checksumValid ? el('span', { class: 'badge warn' }, t('passeditor.checksum')) : null,
          pk !== null
            ? el('button', {
                class: 'ghost',
                title: t('passeditor.copyToOtherPass'),
                onclick: () => void sendToOtherPass(entry, pk),
              },
                el('span', { 'aria-hidden': 'true' }, '→'),
                el('span', { class: 'sr-only' }, t('passeditor.copyToOtherPass')),
              )
            : null,
          pk !== null
            ? el('button', {
                class: 'ghost',
                onclick: async () => {
                  const ok = await confirmDialog(
                    t('passeditor.removePokemonTitle'),
                    t('passeditor.removePokemonBody', { name: speciesNames(currentLang())[pk.species] ?? `#${pk.species}` }),
                    t('passeditor.remove'),
                  );
                  if (!ok) return;
                  pass.deletePokemon(i);
                  await save();
                  update({});
                },
              }, '✕')
            : null,
        ),
      );
    }
  }
  container.append(team);

  // --- frases
  if (!entry.secret) {
    const phrases = el('section', { class: 'card' },
      el('h2', {}, t('passeditor.phrases')),
      el('p', { class: 'small muted' }, t('passeditor.phrasesHint')),
    );
    const current = pass.phrases;
    for (const key of PHRASE_ORDER) {
      const preset = pass.usesPresetPhrase(key);
      phrases.append(
        el('div', { class: 'field' },
          el('label', {}, t(PHRASE_KEYS[key])),
          el('input', {
            value: preset ? '' : current[key],
            placeholder: preset ? t('passeditor.presetPhrase') : t('passeditor.noPhrase'),
            oninput: (event) => {
              // `setPhrase` apaga la bandera de fábrica de esta frase, y solo de esta.
              pass.setPhrase(key, (event.target as HTMLInputElement).value);
              void save();
            },
          }),
          preset
            ? null
            : el('button', {
                class: 'ghost small',
                onclick: () => {
                  pass.setPhrase(key, '');
                  pass.setPresetPhrase(key, true);
                  void save();
                  update({});
                },
              }, t('passeditor.resetToDefault')),
        ),
      );
    }
    container.append(phrases);
  }

  container.append(
    el('section', { class: 'card' },
      el('button', {
        class: 'danger',
        onclick: async () => {
          const ok = await confirmDialog(
            t('passeditor.deletePassTitle'),
            t('passeditor.deletePassBody', { name: entry.name }),
            t('passeditor.deletePass'),
          );
          if (!ok) return;
          await remove(entry.id);
          update({ editing: null });
        },
      }, t('passeditor.deleteThisPass')),
    ),
  );

  void BattlePass;
  void state;
  return container;
}
