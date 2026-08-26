/**
 * Generador de pases aleatorios, con todas las subopciones del enunciado.
 */
import { BattlePass, TRAINER_MODELS } from '../core/pass.ts';
import { speciesNames } from '../data/index.ts';
import { buildBK4 } from '../gen/build.ts';
import { DEFAULT_OPTIONS, generatePass, type RandomOptions } from '../gen/random.ts';
import { Rng } from '../gen/rng.ts';
import { randomWord } from '../gen/words.ts';
import { MAX_STORED_PASSES } from '../storage/db.ts';
import { el, select, toast } from './dom.ts';
import { t } from './i18n.ts';
import { sprite } from './sprite.ts';
import { contentLang, currentLang, makeEntry, persist, state, update } from './state.ts';

/** Opciones vivas mientras el usuario trastea con el formulario. */
let options: RandomOptions = { ...DEFAULT_OPTIONS };
let count = 1;
let seedText = '';
let trainerName = 'ANIA+';

/** Convierte un pase generado en los 0x6EC bytes nativos. */
function toPassBytes(
  rng: Rng,
  generated: ReturnType<typeof generatePass>,
  name: string,
  nickname?: string,
): Uint8Array {
  /*
   * El idioma es el del guardado cargado, no el de la interfaz: lo que se escribe aquí lo enseña
   * el juego. Ver `contentLang`.
   */
  const lang = contentLang();
  const pass = BattlePass.create(name, lang);
  /*
   * Personaje al azar, del mismo `Rng` que el equipo para que una semilla siga reproduciendo el
   * lote entero. Vestuario y frases se reponen después: los índices de ambos son de cada
   * personaje, y los de fábrica del modelo anterior no significan lo mismo en el nuevo.
   */
  pass.model = rng.pick(TRAINER_MODELS);
  pass.resetGearToDefault();
  pass.resetPresetPhrases();
  generated.pokemon.forEach((draft, i) =>
    pass.setPokemon(i, buildBK4(rng, draft, { trainerName: name, nickname, lang })));
  return pass.data;
}

/** Marcador que se sustituye por el número de pase dentro del lote. */
export const NUMBER_TOKEN = '{n}';

/**
 * Nombre del pase número `index` de un lote de `total`.
 *
 * Con `{n}` en la plantilla, el número va donde el usuario lo ponga (`random{n}` → `random1`).
 * Sin marcador se mantiene lo de siempre: numerar al final solo si hay más de uno.
 */
export function passName(template: string, index: number, total: number): string {
  if (template.includes(NUMBER_TOKEN)) return template.split(NUMBER_TOKEN).join(String(index + 1));
  return total === 1 ? template : `${template} ${index + 1}`;
}

async function generate(): Promise<void> {
  const free = MAX_STORED_PASSES - state.stored.length;
  if (free <= 0) { toast(t('generator.storageFull'), 'error'); return; }

  const toMake = Math.min(count, free);
  if (toMake < count) toast(t('generator.onlyRoomFor', { count: toMake }), 'error');

  const seed = seedText.trim() === '' ? Date.now() : Number(seedText) || hash(seedText);
  const rng = new Rng(seed);
  update({ busy: true });

  /*
   * El mote del caos se decide una vez para todo el lote, antes del bucle: la gracia es que lo
   * lleven también los Pokémon de pases distintos. Si el campo está vacío, la palabra la pone el
   * diccionario, que puede tardar y por eso se pide aquí y no dentro del bucle.
   */
  let chaos: string | undefined;
  if (options.chaosName) {
    const written = options.chaosNameText.trim();
    chaos = written === '' ? await randomWord() : written;
  }

  let saved = 0;
  for (let i = 0; i < toMake; i++) {
    const generated = generatePass(rng, options);
    const entry = makeEntry(
      toPassBytes(rng, generated, passName(trainerName, i, toMake), chaos),
      { secret: options.secret },
    );
    if (await persist(entry)) saved++;
  }

  update({ busy: false, view: 'pases' });
  const base = t(saved === 1 ? 'generator.generatedOne' : 'generator.generatedMany', { count: saved });
  const seedPart = seedText ? ` ${t('generator.withSeed', { seed })}` : '';
  const chaosPart = chaos !== undefined ? ` ${t('generator.allNamed', { name: chaos })}` : '';
  toast(`${base}${seedPart}${chaosPart}`);
}

/** Semilla a partir de un texto, para que el usuario pueda usar una palabra. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function optionField<K extends keyof RandomOptions>(
  label: string,
  key: K,
  choices: readonly { value: string; label: string }[],
  hint?: string,
): HTMLElement {
  return el('div', { class: 'field' },
    el('label', {}, label),
    select(choices, String(options[key]), (value) => {
      options = { ...options, [key]: value } as RandomOptions;
      update({});
    }),
    hint ? el('p', { class: 'small muted', style: 'margin:4px 0 0' }, hint) : null,
  );
}

/** Claves de opción que son un sí o un no. */
type BooleanOption = { [K in keyof RandomOptions]: RandomOptions[K] extends boolean ? K : never }[keyof RandomOptions];

function toggle(label: string, key: BooleanOption, hint: string): HTMLElement {
  return el('div', { class: 'field' },
    el('label', { class: 'row' },
      el('input', {
        type: 'checkbox', checked: options[key], style: 'width:auto;min-height:auto',
        onchange: (event) => {
          options = { ...options, [key]: (event.target as HTMLInputElement).checked };
          update({});
        },
      }),
      el('span', { style: 'color:var(--text);font-size:15px' }, label),
    ),
    el('p', { class: 'small muted', style: 'margin:4px 0 0' }, hint),
  );
}

export function renderGenerator(): HTMLElement {
  /** Los nombres que saldrán con lo que hay escrito ahora mismo. */
  const previewText = (): string => {
    const first = passName(trainerName, 0, count);
    if (count === 1) return t('generator.willBeCalledOne', { name: first });
    const second = passName(trainerName, 1, count);
    return t('generator.willBeCalledMany', { first, second });
  };
  const namePreview = el('p', { class: 'small' }, previewText());
  const generateButtonText = (): string => t(count === 1 ? 'generator.generateOne' : 'generator.generateMany', { count });
  const generateLabel = el('span', {}, generateButtonText());

  return el('div', {},
    el('section', { class: 'card' },
      el('h2', {}, t('generator.howMany')),
      el('div', { class: 'grid2' },
        el('div', { class: 'field' },
          el('label', {}, t('generator.passCount')),
          el('input', {
            type: 'number', min: 1, max: 100, value: count,
            oninput: (event) => {
              count = Math.max(1, Number((event.target as HTMLInputElement).value) || 1);
              namePreview.textContent = previewText();
              generateLabel.textContent = generateButtonText();
            },
          }),
        ),
        el('div', { class: 'field' },
          el('label', {}, t('generator.trainerName')),
          el('input', {
            // 10 caracteres útiles en el juego, más los 3 del marcador {n}.
            value: trainerName, maxlength: 13,
            oninput: (event) => {
              trainerName = (event.target as HTMLInputElement).value;
              namePreview.textContent = previewText();
            },
          }),
        ),
      ),
      el('div', { class: 'field' },
        namePreview,
        el('p', { class: 'small muted', style: 'margin:4px 0 0' }, t('generator.numberTokenHint')),
      ),
      el('div', { class: 'field' },
        el('label', {}, t('generator.seed')),
        el('input', {
          value: seedText, placeholder: t('generator.seedPlaceholder'),
          oninput: (event) => { seedText = (event.target as HTMLInputElement).value; },
        }),
        el('p', { class: 'small muted', style: 'margin:4px 0 0' }, t('generator.seedHint')),
      ),
    ),

    el('section', { class: 'card' },
      el('h2', {}, t('generator.pokemon')),
      optionField(t('generator.moves'), 'moves', [
        { value: 'recomendados', label: t('generator.moves.recommended') },
        { value: 'legales', label: t('generator.moves.legalRandom') },
        { value: 'todo-vale', label: t('generator.moves.anything') },
      ], t('generator.moves.hint')),
      // Solo cuando los movimientos se sortean: los recomendados son los que el Pokémon sabría de
      // verdad a nivel 50, y ahí no hay nada que garantizar.
      options.moves === 'recomendados'
        ? null
        : optionField(t('generator.damaging'), 'damaging', [
            { value: 'uno', label: t('generator.damaging.one') },
            { value: 'dos', label: t('generator.damaging.two') },
          ], t('generator.damaging.hint')),
      // Solo en el azar completo: con un movepool legal la especie ya tiende a sus propios tipos,
      // pero sacando del saco entero de Gen 4 lo raro es que lleve algo suyo.
      options.moves === 'todo-vale'
        ? toggle(t('generator.sameTypeMove'), 'sameTypeMove', t('generator.sameTypeMove.hint'))
        : null,
      optionField(t('generator.ivs'), 'ivs', [
        { value: 'perfectos', label: t('generator.ivs.perfect') },
        { value: 'aleatorios', label: t('generator.ivs.random') },
      ]),
      optionField(t('generator.evs'), 'evs', [
        { value: 'aleatorios', label: t('generator.evs.random') },
        { value: 'equitativos', label: t('generator.evs.even') },
      ]),
      optionField(t('generator.ability'), 'ability', [
        { value: 'legal', label: t('generator.ability.legal') },
        { value: 'aleatoria', label: t('generator.ability.any') },
      ]),
      optionField(t('generator.item'), 'item', [
        { value: 'ninguno', label: t('generator.item.none') },
        { value: 'aleatorio', label: t('generator.item.random') },
      ]),
      el('p', { class: 'small muted' }, t('generator.evHint')),
    ),

    el('section', { class: 'card' },
      el('h2', {}, t('generator.rules')),
      toggle(t('generator.atLeastOneLegendary'), 'atLeastOneLegendary', t('generator.atLeastOneLegendary.hint')),
      toggle(t('generator.onlyFinalForms'), 'onlyFinalForms', t('generator.onlyFinalForms.hint')),
      toggle(t('generator.secret'), 'secret', t('generator.secret.hint')),
      toggle(t('generator.chaosName'), 'chaosName', t('generator.chaosName.hint')),
      options.chaosName
        ? el('div', { class: 'field' },
            el('label', {}, t('generator.chaosNameText')),
            el('input', {
              value: options.chaosNameText, maxlength: 10, placeholder: t('generator.chaosNameText.placeholder'),
              oninput: (event) => {
                options = { ...options, chaosNameText: (event.target as HTMLInputElement).value };
              },
            }),
            el('p', { class: 'small muted', style: 'margin:4px 0 0' }, t('generator.chaosNameText.hint')),
          )
        : null,
    ),

    el('section', { class: 'card' },
      el('button', { class: 'primary', disabled: state.busy, onclick: () => void generate() },
        state.busy ? t('generator.generating') : generateLabel),
    ),

    el('section', { class: 'card' },
      el('h2', {}, t('generator.preview')),
      el('p', { class: 'small muted' }, t('generator.previewHint')),
      el('div', { class: 'row' },
        ...generatePass(new Rng(12345), options).pokemon.map((pk) => {
          const name = speciesNames(currentLang())[pk.species] ?? `#${pk.species}`;
          // En modo secreto no se enseña ni el sprite: es justo lo que el modo oculta.
          if (options.secret) return el('span', { class: 'badge' }, '?');
          return el('span', { class: 'badge pic' },
            sprite(pk.species, { form: pk.form ?? 0, scale: 0.5 }),
            el('span', {}, name),
          );
        }),
      ),
    ),
  );
}
