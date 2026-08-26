/**
 * Escaparate de vistas: monta todas las pantallas seguidas, con datos de mentira, para poder
 * mirar el diseño de un vistazo (`npx vite` y abrir /showcase.html).
 *
 * No entra en la compilación: Vite solo empaqueta lo que cuelga de index.html.
 */
import './ui/styles.css';
import { BattlePass } from './core/pass.ts';
import { buildBK4, defaultPokemon } from './gen/build.ts';
import { DEFAULT_OPTIONS, generatePass } from './gen/random.ts';
import { Rng } from './gen/rng.ts';
import { el } from './ui/dom.ts';
import { renderGenerator } from './ui/generator.ts';
import { renderPassEditor } from './ui/passeditor.ts';
import { renderPassList } from './ui/passlist.ts';
import { renderPokemonEditor } from './ui/pokemoneditor.ts';
import { makeEntry, update } from './ui/state.ts';

function sample(name: string, seed: number): Uint8Array {
  const pass = BattlePass.create(name);
  const rng = new Rng(seed);
  generatePass(rng, DEFAULT_OPTIONS).pokemon.forEach((draft, i) => pass.setPokemon(i, buildBK4(rng, draft)));
  return pass.data;
}

const stored = [
  makeEntry(sample('random1', 1)),
  makeEntry(sample('random2', 2)),
  makeEntry(sample('random3', 3), { secret: true }),
  makeEntry(BattlePass.create('A MANO').data),
];
// El segundo va seleccionado para ver la franja turquesa y la barra de acciones.
update({ stored, selected: new Set([stored[1]!.id]) });

const root = document.getElementById('app')!;
const heading = (text: string) => el('h2', { style: 'margin:24px 4px 8px;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px' }, text);

root.append(
  heading('Lista de pases'), renderPassList(),
  heading('Editor de pase (vacío)'), renderPassEditor(stored[3]!),
  heading('Editor de Pokémon'),
  renderPokemonEditor({ pokemon: defaultPokemon(448), onChange: () => {}, onBack: () => {} }),
  heading('Generador'), renderGenerator(),
);
