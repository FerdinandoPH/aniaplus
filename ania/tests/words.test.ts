/**
 * Diccionario de palabras al azar para el «caos de nombre».
 *
 * Lo que aquí se comprueba no es que la API funcione —eso no depende de nosotros— sino que la
 * función **siempre devuelve un mote válido**: la web se abre desde la propia Wii, muchas veces en
 * una red sin salida a internet, y el generador no puede quedarse esperando ni fallar por eso.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { decodeG4String, encodeG4String } from '../src/core/text.ts';
import { randomWord } from '../src/gen/words.ts';

/** Sustituye `fetch` por uno que responde lo que se le diga, y devuelve las URL pedidas. */
function stubFetch(...responses: (unknown[] | Error)[]): string[] {
  const urls: string[] = [];
  let call = 0;
  vi.stubGlobal('fetch', (url: string) => {
    urls.push(url);
    const response = responses[Math.min(call++, responses.length - 1)]!;
    if (response instanceof Error) return Promise.reject(response);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(response) });
  });
  return urls;
}

/** ¿Se puede escribir tal cual en el mote de un BK4? */
function survivesEncoding(word: string): boolean {
  const buffer = new Uint8Array(22);
  encodeG4String(buffer, 0, buffer.length, word, 10);
  return decodeG4String(buffer, 0, buffer.length) === word;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('palabra al azar', () => {
  test('pide una longitud que quepa en el mote', async () => {
    const urls = stubFetch(['chorizo']);
    // Sale en mayúsculas, que es como se guarda el mote.
    expect(await randomWord()).toBe('CHORIZO');

    const length = Number(new URL(urls[0]!).searchParams.get('length'));
    expect(urls[0]).toContain('lang=es');
    // Diez es lo que guarda el formato; menos de cuatro letras no es un mote, es un ruido.
    expect(length).toBeGreaterThanOrEqual(4);
    expect(length).toBeLessThanOrEqual(10);
  });

  test('descarta lo que no vale como mote y reintenta', async () => {
    // La lista `es` del diccionario trae compuestas con espacios; esas no sirven.
    const urls = stubFetch(['huella dac'], ['pepino']);
    expect(await randomWord()).toBe('PEPINO');
    expect(urls).toHaveLength(2);
  });

  test('sin internet devuelve una de la reserva, sin lanzar', async () => {
    stubFetch(new Error('offline'));
    const word = await randomWord();
    expect(word.length).toBeGreaterThanOrEqual(4);
    expect(word.length).toBeLessThanOrEqual(10);
    // También la reserva sale en mayúsculas: el mote no debe delatar de dónde ha salido.
    expect(word).toBe(word.toUpperCase());
  });

  test('si el diccionario solo devuelve basura, tampoco se queda sin palabra', async () => {
    stubFetch([''], [null]);
    expect(await randomWord()).not.toBe('');
  });

  test('lo que devuelve siempre se puede escribir como mote', async () => {
    for (const responses of [['chorizo'], ['bigote']] as const) {
      stubFetch([...responses]);
      expect(survivesEncoding(await randomWord())).toBe(true);
    }
    // Y también cuando la palabra sale de la reserva.
    stubFetch(new Error('offline'));
    for (let i = 0; i < 20; i++) expect(survivesEncoding(await randomWord())).toBe(true);
  });
});
