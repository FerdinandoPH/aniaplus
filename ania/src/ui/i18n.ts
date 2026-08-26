/**
 * Traducción de los textos de la interfaz.
 *
 * Sin dependencias nuevas, en línea con el resto de la app (helpers hechos a mano, sin
 * framework). Si falta una clave en el idioma actual, cae al español; si tampoco está ahí, se
 * enseña la propia clave (mejor eso que romper la pantalla).
 */
import { dictionaries } from './strings/index.ts';
import { currentLang } from './state.ts';

export function t(key: string, params?: Record<string, string | number>): string {
  const dict = dictionaries[currentLang()];
  let str = dict[key] ?? dictionaries.es[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) str = str.replaceAll(`{${name}}`, String(value));
  }
  return str;
}
