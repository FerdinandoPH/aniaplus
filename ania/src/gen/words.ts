/**
 * Una palabra española al azar, para el «caos de nombre» del generador.
 *
 * Viene de un diccionario por internet, pero **nunca falla**: la web se sirve desde la propia Wii
 * y el móvil puede estar en una red sin salida, así que hay plazo corto y lista de reserva. Que no
 * haya internet no puede dejar colgado al generador.
 */
import { decodeG4String, encodeG4String } from '../core/text.ts';
import { nicknameCase } from './build.ts';

const API = 'https://random-word-api.herokuapp.com/word';

/** El mote guarda 10 caracteres; por abajo, menos de cuatro letras no tiene ninguna gracia. */
const MIN_LENGTH = 4;
const MAX_LENGTH = 10;

/** Plazo de la petición. Pasado esto se tira de la reserva sin más. */
const TIMEOUT_MS = 4000;

/**
 * Reserva para cuando no hay internet, que es el caso normal si la web se abre desde la Wii y el
 * router no tiene salida. Palabras cortas, escribibles en la tabla de Gen 4 y con su punto.
 */
const FALLBACK = [
  'chorizo', 'pelusa', 'bigote', 'morcilla', 'zapato', 'tortilla', 'chancla', 'pepino',
  'bombilla', 'gaviota', 'cachalote', 'merluza', 'tuerca', 'chichon', 'pinguino', 'sardina',
  'calcetin', 'mostacho', 'butano', 'trompeta', 'nabo', 'rosquilla', 'chispa', 'lechuga',
] as const;

/** Buffer de usar y tirar para comprobar que una palabra se puede escribir tal cual como mote. */
const scratch = new Uint8Array(22);

/**
 * ¿Sobrevive esta palabra a la codificación de Gen 4?
 *
 * El codificador sustituye por `?` lo que no está en su tabla y recorta a 10 caracteres, así que
 * un ida y vuelta detecta las dos cosas de una vez, sin duplicar aquí la tabla de caracteres.
 */
function writableAsNickname(word: string): boolean {
  encodeG4String(scratch, 0, scratch.length, word, MAX_LENGTH);
  return decodeG4String(scratch, 0, scratch.length) === word;
}

function acceptable(word: unknown): word is string {
  return typeof word === 'string'
    && word.length >= MIN_LENGTH
    && word.length <= MAX_LENGTH
    && !/\s/.test(word)
    && writableAsNickname(word);
}

function fromFallback(): string {
  return nicknameCase(FALLBACK[Math.floor(Math.random() * FALLBACK.length)]!);
}

/** Una palabra de longitud exacta. La API la filtra por nosotros con `length`. */
async function fetchWord(length: number, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${API}?lang=es&length=${length}`, { signal });
  if (!response.ok) throw new Error(`El diccionario ha respondido ${response.status}`);
  const body: unknown = await response.json();
  return Array.isArray(body) ? body[0] : body;
}

/**
 * Palabra española al azar, lista para usarse como mote.
 *
 * La lista `es` del diccionario trae de todo —compuestas con espacios, algún anglicismo—, así que
 * lo que llega se comprueba; si no vale, se reintenta una vez y ya se tira de la reserva. Da igual
 * que salga alguna rareza: es justo lo que se busca aquí.
 */
export async function randomWord(): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const length = MIN_LENGTH + Math.floor(Math.random() * (MAX_LENGTH - MIN_LENGTH + 1));
      const word = await fetchWord(length, controller.signal);
      /*
       * Se comprueba ya en mayúsculas, que es como se va a guardar: pasar a mayúsculas puede
       * cambiar la longitud (la ß alemana se convierte en dos letras) y algún carácter, así que
       * validar la palabra original no garantizaría nada del mote de verdad.
       */
      if (typeof word === 'string' && acceptable(nicknameCase(word))) return nicknameCase(word);
    }
  } catch {
    /* Sin internet, con plazo vencido o con una respuesta rara: la reserva cumple igual. */
  } finally {
    clearTimeout(timer);
  }

  return fromFallback();
}
