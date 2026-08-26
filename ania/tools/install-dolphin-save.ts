/**
 * Instala en la NAND de Dolphin un guardado generado por ANIA+, para probar de verdad que el
 * juego lo acepta. Conserva siempre una copia intacta de la plantilla.
 *
 *   npx tsx tools/install-dolphin-save.ts [--region pal|usa|jap] [--modify]
 *
 * La región elige qué guardado se instala y **en qué carpeta**: cada versión del juego tiene su
 * propio título en la NAND, y el emulador solo mira el de la versión que arranques.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BK4 } from '../src/core/bk4.ts';
import { BattlePass, TrainerModel } from '../src/core/pass.ts';
import { PbrSave } from '../src/core/save.ts';
import { getPersonal, speciesNames } from '../src/data/index.ts';
import { buildBK4, defaultPokemon, findPid, genderFromPid, setShiny, type Gender } from '../src/gen/build.ts';
import { DEFAULT_OPTIONS, generatePasses } from '../src/gen/random.ts';
import { Rng } from '../src/gen/rng.ts';

const PROJECT = join(import.meta.dirname, '..', '..');

/**
 * Plantilla y título en la NAND de cada versión del juego.
 *
 * El identificador es el ASCII de RPBP/RPBE/RPBJ, y la `a` final del japonés va en **minúscula**:
 * las carpetas de `/title` son hexadecimal en minúsculas y ahí sí se distingue.
 */
const REGIONS = {
  pal: {
    title: '52504250',
    template: join(
      PROJECT, 'Español (SPA) ARCHIVOS GUARDADOS PBR [RESTORER FOREVER]',
      '¬ Español EUROPA (EUR)', '(ARCHIVO PRINCIPAL) Wii o Dolphin', '0001000052504250',
    ),
  },
  usa: {
    title: '52504245',
    template: join(PROJECT, 'RPBE01 (NTSC-U) Save Post Game', '00010000', '52504245', 'data'),
  },
  jap: {
    title: '5250424a',
    template: join(
      PROJECT, '日本語版 (JAP) ポケモンバトルレボリューション ファイルを保存 [修復者 フォレル]',
      '(日本語版) バトレボ セーブ ファイル',
      '(メインのゲームセーブファイル)   すべてのファイルを WIIのSD カードのルートにコピー＆ペーストしてください (DOLPHIN の場合は README ファイルを参照してください)',
      '000100005250424a',
    ),
  },
} as const;

type Region = keyof typeof REGIONS;

const regionArg = process.argv[process.argv.indexOf('--region') + 1];
const region: Region = process.argv.includes('--region') && regionArg !== undefined && regionArg in REGIONS
  ? (regionArg as Region)
  : 'pal';
const { title, template: TEMPLATE } = REGIONS[region];

/**
 * Los guardados de plantilla **no viajan en el repositorio**: son ficheros de consolas de verdad.
 * Sin el de la región pedida no hay nada que instalar, y conviene decirlo aquí y no dejar que
 * reviente más abajo con un ENOENT sobre una ruta larguísima.
 */
if (!existsSync(join(TEMPLATE, 'GeniusPbr', 'PbrSaveData'))) {
  console.error(`No encuentro el guardado de plantilla de ${region.toUpperCase()}:`);
  console.error(`  ${join(TEMPLATE, 'GeniusPbr', 'PbrSaveData')}`);
  console.error('No viaja en el repositorio; mira «The sample saves» en el README (README.es.md: «Los guardados de ejemplo»).');
  process.exit(1);
}

/**
 * Carpeta de usuario de Dolphin.
 *
 * Cada sistema la pone en un sitio, y desde WSL además hay que llegar a la de Windows, que no
 * está en ninguna ruta estándar (depende de la letra de la unidad y del nombre de usuario). Se
 * prueban las tres ubicaciones habituales y se coge la primera que exista; si no aparece
 * ninguna —el caso de WSL, entre otros— se pone a mano con `DOLPHIN_USER`.
 */
const HOME = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
const DOLPHIN_CANDIDATES = [
  join(HOME, '.local', 'share', 'dolphin-emu'),          // Linux
  join(HOME, 'Library', 'Application Support', 'Dolphin'), // macOS
  join(HOME, 'Documents', 'Dolphin Emulator'),           // Windows
];
const DOLPHIN_USER = process.env['DOLPHIN_USER']
  ?? DOLPHIN_CANDIDATES.find((c) => existsSync(c))
  ?? DOLPHIN_CANDIDATES[0]!;
const NAND = join(DOLPHIN_USER, 'Wii', 'title', '00010000', title, 'data');
if (!existsSync(DOLPHIN_USER)) {
  console.error(`No encuentro la carpeta de usuario de Dolphin: ${DOLPHIN_USER}`);
  console.error('Ponla con DOLPHIN_USER="/ruta/a/Dolphin Emulator"');
  process.exit(1);
}
console.log(`region ${region.toUpperCase()} -> /title/00010000/${title}`);

mkdirSync(join(NAND, 'GeniusPbr'), { recursive: true });
if (existsSync(join(TEMPLATE, 'banner.bin'))) {
  copyFileSync(join(TEMPLATE, 'banner.bin'), join(NAND, 'banner.bin'));
}

const raw = new Uint8Array(readFileSync(join(TEMPLATE, 'GeniusPbr', 'PbrSaveData')));
// Copia intacta de referencia, por si hay que volver atrás.
const backup = join(NAND, 'PbrSaveData.plantilla');
if (!existsSync(backup)) writeFileSync(backup, raw);

let out: Uint8Array<ArrayBufferLike> = raw;
if (process.argv.includes('--modify')) {
  const save = PbrSave.load(raw);
  save.selectSlot(0);
  const pass = save.getPass(0);
  console.log(`pase 0 antes: "${pass.trainerName}"`);
  pass.trainerName = 'ANIA+';
  pass.setPhrase('greeting', 'Hecho con ANIA+');
  out = save.serialize();
  console.log(`pase 0 ahora: "ANIA+", contador ${save.saveCount} -> ${PbrSave.load(out).saveCount}`);
}

if (process.argv.includes('--random')) {
  const save = PbrSave.load(raw);
  const rng = new Rng(2026);
  const [generated] = generatePasses(1, { ...DEFAULT_OPTIONS, moves: 'legales', atLeastOneLegendary: true, item: 'aleatorio' }, 2026);

  // Se escribe en los cuatro perfiles para no depender de cuál cargue el juego al arrancar.
  for (let slot = 0; slot < 4; slot++) {
    save.selectSlot(slot);
    const pass = save.getPass(0);
    for (let i = 5; i >= 0; i--) pass.deletePokemon(i);
    pass.trainerName = 'AZAR';
    pass.setPhrase('greeting', 'Equipo generado al azar');
    pass.available = true;
    pass.issued = true;
    generated!.pokemon.forEach((draft, i) => pass.setPokemon(i, buildBK4(new Rng(2026 + i), draft)));
  }
  save.selectSlot(0);
  console.log('pase 0 de los 4 perfiles =', generated!.pokemon.map((p) => speciesNames('es')[p.species]).join(', '));
  void rng;
  out = save.serialize();
}

if (process.argv.includes('--manual')) {
  // Recorre exactamente el camino nuevo de la interfaz: pase creado en blanco, Pokémon añadido
  // a mano, naturaleza elegida, variocolor y IV tocados uno a uno.
  const save = PbrSave.load(raw);
  const rng = new Rng(7);
  const team: BK4[] = [];
  for (const [index, species] of [448, 445, 149, 130, 94, 65].entries()) {
    const pk = defaultPokemon(species);
    const info = getPersonal(species);
    // Naturaleza Firme (3) sin mover habilidad ni género.
    pk.pid = findPid(rng, {
      nature: 3, abilitySlot: pk.abilitySlot, gender: pk.gender as Gender, genderRatio: info.genderRatio,
    });
    pk.gender = genderFromPid(pk.pid, info.genderRatio);
    // Solo el primero brilla: así se ve que el interruptor distingue, no que todo salga igual.
    setShiny(pk, index === 0, rng);
    pk.ivs = { ...pk.ivs, atk: 31, spa: 0 };
    pk.refreshChecksum();
    team.push(pk);
  }

  for (let slot = 0; slot < 4; slot++) {
    save.selectSlot(slot);
    const built = BattlePass.create('A MANO');
    built.setPhrase('greeting', 'Pase montado a mano');
    // Comprueba también el selector de modelo nuevo: Forzudo en vez del "Chico" por defecto.
    built.model = TrainerModel.MuscleMan;
    built.resetGearToDefault();
    team.forEach((pk, i) => built.setPokemon(i, pk));
    // El diseño pertenece a la ranura del guardado, no al pase: se conserva.
    const target = save.getPass(0);
    const design = target.design;
    target.data.set(built.data);
    target.design = design;
  }
  save.selectSlot(0);
  console.log('pase 0 «A MANO» =', team.map((p) => `${speciesNames('es')[p.species]}${p.isShiny ? ' ✦' : ''}`).join(', '));
  console.log('naturaleza de todos =', team.map((p) => p.nature).join(', '), '(3 = Firme)');
  out = save.serialize();
}

writeFileSync(join(NAND, 'GeniusPbr', 'PbrSaveData'), out);
console.log(`escritos ${out.length} bytes en la NAND de Dolphin`);
