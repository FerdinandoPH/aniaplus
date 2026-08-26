/**
 * Fase 0 — extrae de PKHeX los datos de Gen 4 que necesita ANIA+ y los deja en `src/data/pkhex/*.json`.
 *
 *   npm run extract
 *
 * Todo lo que produce está pensado para PBR: especies <= 493, movimientos <= 467, nivel 50.
 * Se usa HGSS como tabla base porque es la única que trae los tutores rellenos (ver
 * PersonalTable.PopulateGen4Tutors, que solo se aplica a PersonalTable.HGSS).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openBinLinker16, openBinLinker32 } from './binlinker.ts';
import { GEN4_STATUS_MOVES, NO_DAMAGE_REQUIRED_SPECIES } from './gen4-status-moves.ts';
import {
  makeMoveResolver,
  parseArray,
  parseG4CharTable,
  parseMoveEnum,
  readBinary,
  readTextList,
} from './pkhex-source.ts';

const OUT_DIR = join(import.meta.dirname, '..', 'src', 'data', 'pkhex');
const I18N_OUT_DIR = join(OUT_DIR, 'i18n');

/**
 * Los cinco idiomas de la versión PAL más el japonés, que hace falta para los guardados de la
 * versión japonesa (RPBJ01). El español va primero: es el idioma de referencia.
 */
const LANGUAGES = ['es', 'en', 'de', 'fr', 'it', 'ja'] as const;

const MAX_SPECIES = 493;
const MAX_MOVE = 467;
const MAX_ABILITY = 123;
const MAX_ITEM = 536;
/** Filas de personal_hgss: 493 especies + 14 formas alternas + índice 0. */
const PERSONAL_ROWS = 508;
const PERSONAL_SIZE = 0x2c;
const TUTOR_COUNT = 0x34; // 52

// ---------------------------------------------------------------- utilidades

let failures = 0;
function check(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    console.error(`  FALLO ${message}`);
    failures++;
  }
}

function write(name: string, data: unknown): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, name);
  writeFileSync(path, JSON.stringify(data));
  console.log(`  -> ${name}`);
}

function writeI18n(lang: string, name: string, data: unknown): void {
  const path = join(I18N_OUT_DIR, lang, name);
  writeFileSync(path, JSON.stringify(data));
  console.log(`  -> i18n/${lang}/${name}`);
}

/** Los ficheros de texto de PKHeX están indexados por ID; recortamos al máximo de Gen 4. */
function trim(list: string[], max: number): string[] {
  return list.slice(0, max + 1);
}

// ---------------------------------------------------------------- textos

/** Valores de referencia para detectar rutas rotas o desajustes de idioma al vuelo. */
const REFERENCE = {
  es: { species1: 'Bulbasaur', ability1: 'Hedor', nature0: 'Fuerte' },
  en: { species1: 'Bulbasaur', ability1: 'Stench', nature0: 'Hardy' },
  de: { species1: 'Bisasam', ability1: 'Duftnote', nature0: 'Robust' },
  fr: { species1: 'Bulbizarre', ability1: 'Puanteur', nature0: 'Hardi' },
  it: { species1: 'Bulbasaur', ability1: 'Tanfo', nature0: 'Ardita' },
  ja: { species1: 'フシギダネ', ability1: 'あくしゅう', nature0: 'がんばりや' },
} as const;

let species: string[] = [];
let moveNames: string[] = [];
let types: string[] = [];
let abilities: string[] = [];
let items: string[] = [];
let movesEn: string[] = [];

for (const lang of LANGUAGES) {
  console.log(`\nTextos (${lang})`);
  const langSpecies = trim(readTextList(`Resources/text/other/${lang}/text_Species_${lang}.txt`), MAX_SPECIES);
  const langMoves = trim(readTextList(`Resources/text/other/${lang}/text_Moves_${lang}.txt`), MAX_MOVE);
  const langAbilities = trim(readTextList(`Resources/text/other/${lang}/text_Abilities_${lang}.txt`), MAX_ABILITY);
  const langNatures = readTextList(`Resources/text/other/${lang}/text_Natures_${lang}.txt`).slice(0, 25);
  const langTypes = readTextList(`Resources/text/other/${lang}/text_Types_${lang}.txt`);
  const langItems = trim(readTextList(`Resources/text/items/text_Items_${lang}.txt`), MAX_ITEM);

  check(langSpecies.length === MAX_SPECIES + 1, `${MAX_SPECIES} especies (última: ${langSpecies.at(-1)})`);
  check(langMoves.length === MAX_MOVE + 1, `${MAX_MOVE} movimientos (último: ${langMoves.at(-1)})`);
  check(langAbilities.length === MAX_ABILITY + 1, `${MAX_ABILITY} habilidades`);
  check(langNatures.length === 25, '25 naturalezas');
  const ref = REFERENCE[lang];
  check(langSpecies[1] === ref.species1, `especie 1 = ${ref.species1}`);
  check(langAbilities[1] === ref.ability1, `habilidad 1 = ${ref.ability1}`);
  check(langNatures[0] === ref.nature0, `naturaleza 0 = ${ref.nature0}`);

  mkdirSync(join(I18N_OUT_DIR, lang), { recursive: true });
  writeI18n(lang, 'species.json', langSpecies);
  writeI18n(lang, 'moves.json', langMoves);
  writeI18n(lang, 'abilities.json', langAbilities);
  writeI18n(lang, 'natures.json', langNatures);
  writeI18n(lang, 'types.json', langTypes);
  writeI18n(lang, 'items.json', langItems);

  if (lang === 'es') {
    species = langSpecies; moveNames = langMoves; types = langTypes;
    abilities = langAbilities; items = langItems;
  }
  if (lang === 'en') { movesEn = langMoves; }
}

// ---------------------------------------------------------------- personal data

console.log('\nPersonal data (HGSS)');
const personalRaw = readBinary('Resources/byte/personal/personal_hgss');
check(
  personalRaw.length === PERSONAL_ROWS * PERSONAL_SIZE,
  `personal_hgss = ${PERSONAL_ROWS} x 0x${PERSONAL_SIZE.toString(16)} (${personalRaw.length} B)`,
);

interface PersonalEntry {
  /** HP, ATK, DEF, SPE, SPA, SPD — ojo al orden de PKHeX: la velocidad va tercera. */
  stats: number[];
  types: [number, number];
  genderRatio: number;
  growth: number;
  eggGroups: [number, number];
  /** Gen 4 no tiene habilidad oculta; se elige con `PID & 1`. */
  abilities: [number, number];
  /** Bitflags de 92 MT + 8 MO, en bruto (13 bytes) — se expanden en `machines`. */
  machines: number[];
  formCount: number;
  formStatsIndex: number;
}

const personal: PersonalEntry[] = [];
for (let i = 0; i < PERSONAL_ROWS; i++) {
  const o = i * PERSONAL_SIZE;
  const view = new DataView(personalRaw.buffer, personalRaw.byteOffset + o, PERSONAL_SIZE);
  const flags: number[] = [];
  for (let bit = 0; bit < 100; bit++) {
    if ((personalRaw[o + 0x1c + (bit >> 3)]! >> (bit & 7)) & 1) flags.push(bit);
  }
  personal.push({
    stats: [...personalRaw.subarray(o, o + 6)],
    types: [personalRaw[o + 6]!, personalRaw[o + 7]!],
    genderRatio: personalRaw[o + 0x10]!,
    growth: personalRaw[o + 0x13]!,
    eggGroups: [personalRaw[o + 0x14]!, personalRaw[o + 0x15]!],
    abilities: [personalRaw[o + 0x16]!, personalRaw[o + 0x17]!],
    machines: flags,
    formCount: personalRaw[o + 0x29]!,
    formStatsIndex: view.getUint16(0x2a, true),
  });
}

// Bulbasaur: 45/49/49/45/65/65, tipo Planta(12)/Veneno(3), habilidad Espesura(65).
const bulbasaur = personal[1]!;
check(
  bulbasaur.stats.join(',') === '45,49,49,45,65,65',
  `stats base de ${species[1]} = ${bulbasaur.stats.join('/')}`,
);
check(bulbasaur.abilities[0] === 65, `habilidad de ${species[1]} = ${abilities[bulbasaur.abilities[0]]}`);

write('personal.json', personal);

// ---------------------------------------------------------------- learnsets

console.log('\nLearnsets (HGSS)');
const lvlup = openBinLinker16(readBinary('Resources/byte/levelup/lvlmove_hgss.pkl'), 'hs');
check(lvlup.count === PERSONAL_ROWS, `lvlmove_hgss = ${lvlup.count} entradas`);

/** [movimiento, nivel][]; nivel 0 = movimiento de evolución. */
const learnsets: [number, number][][] = [];
for (let i = 0; i < lvlup.count; i++) {
  const e = lvlup.entry(i);
  const n = e.length / 3;
  if (!Number.isInteger(n)) throw new Error(`Learnset ${i} de longitud ${e.length}, no múltiplo de 3`);
  const view = new DataView(e.buffer, e.byteOffset, e.byteLength);
  const set: [number, number][] = [];
  for (let k = 0; k < n; k++) set.push([view.getUint16(k * 2, true), e[n * 2 + k]!]);
  learnsets.push(set);
}

const bulbaLearn = learnsets[1]!;
check(
  bulbaLearn[0]?.[0] === 33 && bulbaLearn[0]?.[1] === 1,
  `${species[1]} aprende ${moveNames[bulbaLearn[0]![0]]} a nivel ${bulbaLearn[0]![1]}`,
);
write('learnsets.json', learnsets);

// ---------------------------------------------------------------- egg moves

console.log('\nEgg moves');
const eggFile = openBinLinker16(readBinary('Resources/byte/eggmove/eggmove_hgss.pkl'), 'hs');
const eggmoves: number[][] = [];
for (let i = 0; i < eggFile.count; i++) {
  const e = eggFile.entry(i);
  const view = new DataView(e.buffer, e.byteOffset, e.byteLength);
  const list: number[] = [];
  for (let k = 0; k < e.length / 2; k++) list.push(view.getUint16(k * 2, true));
  eggmoves.push(list);
}
check(eggmoves[1]!.includes(113), `${species[1]} hereda ${moveNames[113]}`);
write('eggmoves.json', eggmoves);

// ---------------------------------------------------------------- evoluciones

console.log('\nEvoluciones');
const evoFile = openBinLinker16(readBinary('Resources/byte/evolve/evos_g4.pkl'), 'g4');
interface Evolution {
  method: number;
  argument: number;
  species: number;
  /** 0xFF = conserva la forma actual. */
  form: number;
  level: number;
}
const evolutions: Evolution[][] = [];
for (let i = 0; i < evoFile.count; i++) {
  const e = evoFile.entry(i);
  const view = new DataView(e.buffer, e.byteOffset, e.byteLength);
  const list: Evolution[] = [];
  for (let o = 0; o + 8 <= e.length; o += 8) {
    list.push({
      method: e[o]!,
      argument: view.getUint16(o + 2, true),
      species: view.getUint16(o + 4, true),
      form: e[o + 6]!,
      level: e[o + 7]!,
    });
  }
  evolutions.push(list);
}
const bulbaEvo = evolutions[1]![0]!;
check(
  bulbaEvo.species === 2 && bulbaEvo.level === 16,
  `${species[1]} -> ${species[bulbaEvo.species]} a nivel ${bulbaEvo.level}`,
);
write('evolutions.json', evolutions);

// ---------------------------------------------------------------- tutores

console.log('\nTutores');
const moveEnum = parseMoveEnum();
const resolveMove = makeMoveResolver(moveEnum);

const tutorMoves = parseArray('PersonalInfo/Info/PersonalInfo4.cs', 'TutorMoves');
check(tutorMoves.length === TUTOR_COUNT, `${TUTOR_COUNT} movimientos de tutor`);

const tutorFile = openBinLinker32(readBinary('Resources/byte/personal/tutors_g4.pkl'), 'g4');
check(tutorFile.count === PERSONAL_ROWS, `tutors_g4 = ${tutorFile.count} entradas`);

/** Por fila del personal table: lista de movimientos de tutor aprendibles. */
const tutors: number[][] = [];
for (let i = 0; i < tutorFile.count; i++) {
  const e = tutorFile.entry(i);
  const list: number[] = [];
  for (let bit = 0; bit < TUTOR_COUNT; bit++) {
    if ((e[bit >> 3]! >> (bit & 7)) & 1) list.push(tutorMoves[bit]!);
  }
  tutors.push(list);
}
write('tutors.json', tutors);

// Tutores especiales de la Ruta 210 (movimientos iniciales potenciados).
const specialTutors = {
  6: parseArray('PersonalInfo/Info/PersonalInfo4.cs', 'SpecialTutorBlastBurn'), // Anillo Ígneo
  9: parseArray('PersonalInfo/Info/PersonalInfo4.cs', 'SpecialTutorHydroCannon'), // Hidrocañón
  3: parseArray('PersonalInfo/Info/PersonalInfo4.cs', 'SpecialTutorFrenzyPlant'), // Planta Feroz
  434: parseArray('PersonalInfo/Info/PersonalInfo4.cs', 'SpecialTutorDracoMeteor'), // Cometa Draco
} as const;
// Las claves son los IDs de los movimientos que enseñan; los valores, las especies que pueden aprenderlos.
const specialTutorMoves = { blastBurn: 307, hydroCannon: 308, frenzyPlant: 338, dracoMeteor: 434 };
write('special-tutors.json', {
  blastBurn: specialTutors[6],
  hydroCannon: specialTutors[9],
  frenzyPlant: specialTutors[3],
  dracoMeteor: specialTutors[434],
  moveIds: specialTutorMoves,
});

// ---------------------------------------------------------------- MT / MO

console.log('\nMáquinas');
const tm = parseArray('PersonalInfo/Info/PersonalInfo4.cs', 'MachineMovesTechnical');
const hm = parseArray('PersonalInfo/Info/PersonalInfo4.cs', 'MachineMovesHiddenHGSS', resolveMove);
check(tm.length === 92, `92 MT (MT01 = ${moveNames[tm[0]!]})`);
check(hm.length === 8, `8 MO (MO01 = ${moveNames[hm[0]!]})`);
check(hm[4] === moveEnum.get('Whirlpool'), 'MO05 de HGSS es Remolino, no Despejar');
write('machines.json', { tm, hm });

// ---------------------------------------------------------------- objetos equipables

console.log('\nObjetos equipables');
const unreleased = new Set(parseArray('Items/ItemStorage4.cs', 'Unreleased'));
// ItemStorage4Pt.GetAllHeld() = [..GeneralPt, ..Mail, ..Medicine, ..Berry, ..BallsDPPt, ..Battle, ..Machine[..^8]]
const machineItems = parseArray('Items/ItemStorage4.cs', 'Machine');
const heldItems = [
  ...parseArray('Items/ItemStorage4.cs', 'GeneralPt'),
  ...parseArray('Items/ItemStorage4.cs', 'Mail'),
  ...parseArray('Items/ItemStorage4.cs', 'Medicine'),
  ...parseArray('Items/ItemStorage4.cs', 'Berry'),
  ...parseArray('Items/ItemStorage4.cs', 'BallsDPPt'),
  ...parseArray('Items/ItemStorage4.cs', 'Battle'),
  ...machineItems.slice(0, -8), // las 8 últimas son MO: no se pueden equipar
]
  .filter((id) => id !== 0 && id <= MAX_ITEM && !unreleased.has(id))
  .sort((a, b) => a - b);

check(heldItems.includes(112), `Griseous Orb (solo desde Pt) presente: ${items[112]}`);
check(!heldItems.includes(5), 'Safari Ball excluida (no distribuida)');
write('helditems.json', heldItems);

// ---------------------------------------------------------------- categorías

console.log('\nLegendarios y míticos');
// De Legality/Tables/SpeciesCategory.cs, recortado a Gen 4.
const mythical = [151, 251, 385, 386, 489, 490, 491, 492, 493];
const legendary = [150, 249, 250, 382, 383, 384, 483, 484, 487];
const subLegendary = [144, 145, 146, 243, 244, 245, 377, 378, 379, 380, 381, 480, 481, 482, 485, 486, 488];

for (const [label, list] of [['mítico', mythical], ['legendario', legendary], ['sublegendario', subLegendary]] as const) {
  check(list.every((id) => id >= 1 && id <= MAX_SPECIES), `IDs de ${label} dentro de rango`);
}
check(species[151] === 'Mew' && species[493] === 'Arceus', `${species[151]} y ${species[493]} identificados`);
write('categories.json', { mythical, legendary, subLegendary });

// ---------------------------------------------------------------- PP y movimientos de estado

console.log('\nDatos de movimientos');
// PP: PKHeX los guarda por generación, y los de Gen 4 están en su propio fichero.
const pp = parseArray('Moves/MoveInfo4.cs', 'PP').slice(0, MAX_MOVE + 1);
check(pp.length === MAX_MOVE + 1, `PP de ${MAX_MOVE} movimientos (Placaje = ${pp[33]})`);
write('movepp.json', pp);

/*
 * Tipo de cada movimiento. La tabla vive en `MoveInfo5.cs`, que es la que `MoveInfo.GetType` usa
 * para todo `Gen2..Gen5` —o sea, la buena para Gen 4—, y numera los tipos igual que el personal
 * table: 0 Normal, 1 Lucha, ... 16 Siniestro. Tinieblas figura como Normal, porque su tipo real
 * sale de los IV y no está en ninguna tabla; para lo único que se usa esto (garantizar un
 * movimiento del tipo del Pokémon al sortear) da igual.
 */
const moveTypes = parseArray('Moves/MoveInfo5.cs', 'Type').slice(0, MAX_MOVE + 1);
check(moveTypes.length === MAX_MOVE + 1, `tipo de ${MAX_MOVE} movimientos`);
check(
  moveTypes[33] === 0 && moveTypes[7] === 9 && moveTypes[85] === 12,
  `tipos en la numeración de Gen 4 (Puño Fuego = ${types[moveTypes[7]!]}, Rayo = ${types[moveTypes[85]!]})`,
);
write('movetypes.json', moveTypes);

// Los nombres en inglés (ya extraídos arriba) solo se usan para resolver la lista de
// movimientos de estado.
const idByName = new Map(movesEn.map((n, i) => [n, i]));

const statusMoves: number[] = [];
const unknown: string[] = [];
for (const name of GEN4_STATUS_MOVES) {
  const id = idByName.get(name);
  if (id === undefined || id === 0) unknown.push(name);
  else statusMoves.push(id);
}
check(unknown.length === 0, `todos los nombres de movimiento de estado existen${unknown.length ? `: faltan ${unknown.join(', ')}` : ''}`);
check(
  new Set(statusMoves).size === statusMoves.length,
  `sin duplicados en la lista de estado (${statusMoves.length} movimientos)`,
);
statusMoves.sort((a, b) => a - b);
write('statusmoves.json', {
  status: statusMoves,
  noDamageRequired: [...NO_DAMAGE_REQUIRED_SPECIES],
});

// ---------------------------------------------------------------- experiencia

console.log('\nTablas de experiencia');
// Seis curvas de crecimiento, indexadas por el byte 0x13 del personal data.
const growth = [0, 1, 2, 3, 4, 5].map((i) => parseArray('PKM/Util/Experience.cs', `Growth${i}`));
check(growth.every((t) => t.length === 100), `6 curvas de 100 niveles`);
// Comprobación: a nivel 50 la curva "rápido" da 100000 y la "lento" 156250.
check(growth[4]![49] === 100000 && growth[5]![49] === 156250, `EXP a nivel 50 correcta (rápido ${growth[4]![49]}, lento ${growth[5]![49]})`);
write('experience.json', growth);

// ---------------------------------------------------------------- tabla de caracteres G4

console.log('\nTabla de caracteres Gen 4');
const g4chars = parseG4CharTable();
// La tabla llega hasta 0x1EC (ver el comentario final de TableINT en PKHeX).
check(g4chars.length === 0x1ed, `TableINT = ${g4chars.length} entradas (esperaba 0x1ED)`);
check(g4chars[0] === '￿', 'índice 0 = terminador');
// Comprobación semántica: el alfabeto latino tiene que ser contiguo y estar en el sitio correcto.
const upperA = g4chars.indexOf('A');
const lowerA = g4chars.indexOf('a');
check(
  g4chars.slice(upperA, upperA + 26).join('') === 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  `A-Z contiguas desde 0x${upperA.toString(16).toUpperCase()}`,
);
check(
  g4chars.slice(lowerA, lowerA + 26).join('') === 'abcdefghijklmnopqrstuvwxyz',
  `a-z contiguas desde 0x${lowerA.toString(16).toUpperCase()}`,
);
check(g4chars.includes('ñ') && g4chars.includes('¡'), 'caracteres del español presentes (ñ, ¡)');
write('g4chars.json', g4chars);

// ---------------------------------------------------------------- final

console.log(`\n${failures === 0 ? 'Todo correcto.' : `${failures} comprobación(es) fallida(s).`}`);
if (failures > 0) process.exit(1);
