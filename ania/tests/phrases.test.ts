/**
 * Frases del entrenador y personaje del pase.
 *
 * PBR no guarda "sin frase": guarda una bandera por frase que dice si el texto sale del pase o
 * del bloque de frases del personaje. Los pases generados salían con las seis banderas apagadas y
 * el texto vacío, así que el entrenador se quedaba callado en combate. Esto comprueba lo que hay
 * que escribir para que hable.
 */
import { describe, expect, test } from 'vitest';
import { PASS, PHRASE_ORDER } from '../src/core/constants.ts';
import { BattlePass, TRAINER_MODELS, TrainerModel } from '../src/core/pass.ts';

/** Los seis índices de frase que hay guardados ahora mismo. */
function phraseIndexes(pass: BattlePass): number[] {
  const view = new DataView(pass.data.buffer, pass.data.byteOffset, pass.data.byteLength);
  return PHRASE_ORDER.map((_, i) => view.getUint16(PASS.presetIndexes + i * 2, false));
}

describe('frases de fábrica', () => {
  test('un pase recién creado usa las seis del personaje', () => {
    const pass = BattlePass.create('NUEVO');
    for (const name of PHRASE_ORDER) expect(pass.usesPresetPhrase(name), name).toBe(true);
    // Bits 0 y 7: es un pase del jugador, no de alquiler ni una ranura sin emitir.
    expect(pass.data[PASS.presetFlags]! & 0b1000_0001).toBe(0b1000_0001);
  });

  test('los índices son los del modelo, con el reparto de los pases propios', () => {
    const pass = BattlePass.create('CHICO');
    pass.model = TrainerModel.YoungBoy;
    pass.resetPresetPhrases();
    // Base 6872 (ResetPresetIndexes en PKHeX): saludo y remates van aparte del resto.
    expect(phraseIndexes(pass)).toEqual([6878, 6873, 6874, 6875, 6879, 6880]);
  });

  test('cambiar de personaje mueve los índices a su bloque', () => {
    const pass = BattlePass.create('CAMBIA');
    const before = phraseIndexes(pass);
    pass.model = TrainerModel.LittleGirl;
    pass.resetPresetPhrases();
    expect(phraseIndexes(pass)).not.toEqual(before);
    expect(phraseIndexes(pass)[1]).toBe(7803);
  });

  test('cada modelo tiene su propio bloque, sin solaparse con los demás', () => {
    const bases = TRAINER_MODELS.map((model) => {
      const pass = BattlePass.create('X');
      pass.model = model;
      pass.resetPresetPhrases();
      return phraseIndexes(pass)[1]!;
    });
    expect(new Set(bases).size).toBe(TRAINER_MODELS.length);
  });

  test('escribir una frase propia apaga su bandera, y solo la suya', () => {
    const pass = BattlePass.create('HABLA');
    pass.setPhrase('win', '¡Toma ya!');

    expect(pass.usesPresetPhrase('win')).toBe(false);
    expect(pass.phrases.win).toBe('¡Toma ya!');
    for (const name of PHRASE_ORDER) {
      if (name !== 'win') expect(pass.usesPresetPhrase(name), name).toBe(true);
    }
  });

  test('se puede volver a la frase de fábrica', () => {
    const pass = BattlePass.create('VUELVE');
    pass.setPhrase('greeting', 'hola');
    pass.setPhrase('greeting', '');
    pass.setPresetPhrase('greeting', true);

    expect(pass.usesPresetPhrase('greeting')).toBe(true);
    expect(pass.phrases.greeting).toBe('');
  });
});
