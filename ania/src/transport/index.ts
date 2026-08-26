/**
 * Fuentes de las que la aplicación puede leer y escribir un guardado de PBR.
 *
 * ---------------------------------------------------------------------------------------------
 * CORRECCIÓN AL PLAN INICIAL: el asistente Wii tiene que hablar HTTP, no TCP a pelo.
 *
 * El plan preveía un protocolo propio sobre TCP (HELLO/READ/WRITE/BYE). No sirve: el asistente
 * principal es una página web, y un navegador no puede abrir sockets TCP. Solo puede hacer
 * HTTP(S), WebSocket o WebRTC. De los tres, HTTP es con diferencia el más simple de implementar
 * en la Wii con libogc.
 *
 * De ahí se derivan dos consecuencias que afectan al despliegue:
 *
 *  1. El asistente Wii debe responder con `Access-Control-Allow-Origin: *`, o el navegador
 *     bloqueará las peticiones por CORS.
 *  2. `base` es siempre `http://`, porque a una IP privada no se le puede dar un certificado.
 *     La regla de contenido mixto diría que una página HTTPS no puede pedirle nada, pero está
 *     relajada para las direcciones de red local: el navegador pide permiso al usuario y, con
 *     él, la petición sale. Comprobado desde una web en HTTPS, en incógnito.
 *
 *     Aun así, el asistente Wii **sirve también los ficheros estáticos de la web**, y esa sigue
 *     siendo la vía sin sorpresas: mismo origen, sin CORS, sin permisos, sin internet y sin
 *     depender de una política de navegador que puede cambiar.
 * ---------------------------------------------------------------------------------------------
 */
import { PbrSave } from '../core/save.ts';
import { SIZE_SAVE } from '../core/constants.ts';

/**
 * En qué punto va una transferencia, para poder enseñarlo.
 *
 * Las fases son las mismas que el asistente Wii escribe en la pantalla de la tele, para que las dos
 * pantallas cuenten lo mismo a la vez:
 *
 *  - `nand`: la consola está leyendo sus 3,5 MB de la NAND y todavía no ha mandado un solo byte.
 *  - `datos`: los bytes están viajando, y `loaded`/`total` son de verdad.
 *  - `guardando`: ya se ha subido todo y la Wii está escribiendo en la NAND, que es lo que tarda.
 */
export interface TransferStatus {
  phase: 'nand' | 'datos' | 'guardando';
  loaded: number;
  total: number;
}

export type OnProgress = (status: TransferStatus) => void;

export interface SaveTransport {
  readonly name: string;
  /** Lee el guardado completo (3,5 MB). */
  read(onProgress?: OnProgress): Promise<Uint8Array>;
  /** Escribe el guardado completo. */
  write(data: Uint8Array, onProgress?: OnProgress): Promise<void>;
  /** ¿Está disponible ahora mismo? */
  probe(): Promise<boolean>;
}

/** Comprueba el tamaño antes de dar por bueno lo que venga de fuera. */
function assertSaveSize(data: Uint8Array): void {
  if (data.length !== SIZE_SAVE) {
    throw new Error(`Se esperaba un guardado de ${SIZE_SAVE} bytes y han llegado ${data.length}`);
  }
}

// ------------------------------------------------------------------- fichero

/**
 * Guardado cargado desde un fichero local. Es el transporte que funciona sin Wii, y el que se
 * usa para desarrollar y probar todo lo demás.
 */
export class FileTransport implements SaveTransport {
  readonly name = 'Fichero';
  private data: Uint8Array | null;

  constructor(data?: Uint8Array) {
    this.data = data ?? null;
  }

  static async fromFile(file: File): Promise<FileTransport> {
    const data = new Uint8Array(await file.arrayBuffer());
    assertSaveSize(data);
    return new FileTransport(data);
  }

  async probe(): Promise<boolean> {
    return this.data !== null;
  }

  async read(): Promise<Uint8Array> {
    if (this.data === null) throw new Error('No se ha cargado ningún fichero de guardado');
    return this.data;
  }

  async write(data: Uint8Array): Promise<void> {
    assertSaveSize(data);
    this.data = data;
  }

  /** Descarga el guardado como fichero. Solo tiene sentido en el navegador. */
  download(fileName = 'PbrSaveData'): void {
    if (this.data === null) throw new Error('No hay nada que descargar');
    const blob = new Blob([this.data as BlobPart], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }
}

// ----------------------------------------------------------------------- red

export interface WiiTransportOptions {
  host: string;
  port?: number;
  /** El guardado son 3,5 MB por una red doméstica: hay que ser generoso. */
  timeoutMs?: number;
}

export const DEFAULT_WII_PORT = 8080;

/**
 * La dirección tal y como se escribe, convertida en anfitrión y puerto.
 *
 * Al principio aquí solo cabía una IP, pero la Wii casi nunca tiene una fija: con mDNS o con el
 * nombre que le haya puesto el router, `wii.local` es más estable que el `192.168.1.x` que cambia
 * cada vez que se reinicia. Así que se admite cualquier nombre de dominio, y de paso lo que la
 * gente acaba pegando: la URL entera del asistente, con esquema y con puerto dentro.
 *
 * Devuelve `null` si no hay forma de sacar un anfitrión de ahí. El puerto es `null` cuando no
 * venía escrito, para que quien llama pueda usar el del formulario en vez de imponer el suyo.
 */
export function parseWiiAddress(text: string): { host: string; port: number | null } | null {
  // Fuera el esquema, y fuera la ruta: `http://wii.local:8080/` es lo que da copiar del navegador.
  let rest = text.trim().replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '').split(/[/?#]/, 1)[0] ?? '';
  if (rest === '') return null;

  let host: string;
  let portText = '';
  if (rest.startsWith('[')) {
    // IPv6 entre corchetes: los dos puntos de dentro no separan el puerto.
    const end = rest.indexOf(']');
    if (end < 0) return null;
    host = rest.slice(1, end);
    rest = rest.slice(end + 1);
    if (rest !== '') {
      if (!rest.startsWith(':')) return null;
      portText = rest.slice(1);
    }
    if (!/^[0-9a-fA-F:.]+$/.test(host)) return null;
  } else {
    const colon = rest.lastIndexOf(':');
    // Sin corchetes y con más de un `:` solo puede ser una IPv6 escrita a pelo; se acepta entera.
    if (colon >= 0 && rest.indexOf(':') === colon) {
      host = rest.slice(0, colon);
      portText = rest.slice(colon + 1);
    } else {
      host = rest;
    }
    if (host === '') return null;
    const ipv6 = /^[0-9a-fA-F:]*:[0-9a-fA-F:.]+$/.test(host);
    // Un nombre de dominio: etiquetas de letras, dígitos y guiones. El punto final es legítimo.
    const name = /^(?!-)[a-zA-Z0-9-]+(?:\.(?!-)[a-zA-Z0-9-]+)*\.?$/.test(host)
      && !host.split('.').some((label) => label.endsWith('-'));
    if (!ipv6 && !name) return null;
  }

  if (portText === '') return { host, port: null };
  if (!/^\d+$/.test(portText)) return null;
  const port = Number(portText);
  if (port < 1 || port > 65_535) return null;
  return { host, port };
}

/** Lo que el asistente cuenta de la sesión de edición cuando se le pregunta sin tomarla. */
export interface SessionStatus {
  busy: boolean;
  mine: boolean;
  /** Segundos que aguanta sin latido. */
  timeout: number;
  /** Segundos desde el último latido de quien la tenga. */
  idle: number;
}

/**
 * Rastro del último intento de soltar la sesión al cerrar la pestaña.
 *
 * Existe porque el fallo que había que perseguir era justo el que no deja rastro: la Wii no
 * registraba nada, así que no se podía saber si el aviso no llegó o si el navegador ni lo intentó.
 * Un `console.log` no vale —la pestaña se está muriendo y el registro se va con ella—, así que se
 * apunta aquí y se lee en el siguiente arranque de la web.
 */
export interface ReleaseAttempt {
  when: number;
  /** Qué lo disparó: `pagehide`, `pagehide-persisted`… */
  event: string;
  /** La página se congelaba (bfcache) en vez de morir. */
  persisted: boolean;
  /**
   * `true` si `sendBeacon` aceptó encolarlo, `false` si lo rechazó o no existe (y se cayó al
   * `fetch` con `keepalive`), `null` si no había ninguna sesión que soltar.
   */
  beacon: boolean | null;
}

export const RELEASE_NOTE_KEY = 'ania.lastRelease';

/** Lee el rastro del último cierre, si lo hay. Nunca lanza: es diagnóstico, no funcionalidad. */
export function lastReleaseAttempt(): ReleaseAttempt | null {
  try {
    const raw = globalThis.localStorage?.getItem(RELEASE_NOTE_KEY);
    return raw === null || raw === undefined ? null : (JSON.parse(raw) as ReleaseAttempt);
  } catch {
    return null;
  }
}

/**
 * Fallo con el código HTTP a mano.
 *
 * El texto ya venía bien, pero la interfaz necesita distinguir el 409 —«la tiene otro
 * dispositivo», que se puede resolver ofreciendo el relevo— de cualquier otro fallo, y adivinarlo
 * mirando el mensaje sería atarse a unas palabras concretas.
 */
export class WiiHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'WiiHttpError';
  }
}

/** Qué decir cuando la respuesta no ha ido bien. Lo comparten `fetch` y `XMLHttpRequest`. */
function failure(status: number, body: string): WiiHttpError {
  if (status === 409) {
    return new WiiHttpError(status, body.trim() || 'Otro dispositivo está editando el guardado.');
  }
  return new WiiHttpError(status, `El asistente Wii ha respondido ${status}`);
}

/**
 * Asistente Wii por HTTP.
 *
 *   GET  /api/save    -> 3,5 MB con el guardado (application/octet-stream)
 *   PUT  /api/save    <- 3,5 MB con el guardado nuevo
 *   GET  /api/status  -> JSON con versión y estado
 *
 * Y la sesión de edición, que es lo que impide que dos dispositivos editen a la vez:
 *   POST   /api/session -> abre la sesión y devuelve un token (409 si la tiene otro)
 *   DELETE /api/session -> la suelta
 *
 * El token viaja en la cabecera `X-Ania-Session` y hay que renovarlo con un latido: editar son
 * minutos sin tocar el guardado, así que el asistente no puede deducir de las peticiones si
 * seguimos ahí. Sin latido, la sesión caducaría en mitad de la edición y otro móvil podría
 * entrar; con él, solo caduca si este dispositivo desaparece de verdad.
 */
export class WiiTransport implements SaveTransport {
  readonly name = 'Wii';
  private readonly base: string;
  private readonly timeoutMs: number;
  private token: string | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  /** Cuánto aguanta la sesión sin latido, según lo que diga el asistente. */
  private timeoutSeconds = 45;
  /** Latidos seguidos que no han llegado. */
  private failedBeats = 0;
  /** Se avisa cuando se pierde y cuando se recupera el contacto con la consola. */
  onContact: ((ok: boolean) => void) | null = null;

  constructor(options: WiiTransportOptions) {
    const port = options.port ?? DEFAULT_WII_PORT;
    // Una IPv6 necesita corchetes en la URL; un nombre o una IPv4, no.
    const host = options.host.includes(':') && !options.host.startsWith('[')
      ? `[${options.host}]`
      : options.host;
    this.base = `http://${host}:${port}`;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = new Headers(init?.headers);
      if (this.token !== null) headers.set('X-Ania-Session', this.token);

      const response = await fetch(this.base + path, { ...init, headers, signal: controller.signal });
      if (!response.ok) throw failure(response.status, await response.text());
      return response;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('El asistente Wii no ha respondido a tiempo');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async probe(): Promise<boolean> {
    try {
      await this.request('/api/status');
      return true;
    } catch {
      return false;
    }
  }

  get hasSession(): boolean {
    return this.token !== null;
  }

  /**
   * Toma la sesión de edición. Lanza si la tiene otro dispositivo.
   * A partir de aquí se late solo hasta llamar a `release()`.
   */
  async acquire(): Promise<void> {
    await this.claim('/api/session');
  }

  /**
   * Toma el relevo de una sesión que parece abandonada.
   *
   * El asistente solo lo concede si lleva un rato sin latir, así que esto no le quita la sesión a
   * nadie que siga editando: es la misma decisión que el botón 2 del mando, tomada desde donde
   * está el usuario en vez de desde el salón.
   */
  async takeover(): Promise<void> {
    await this.claim('/api/session/takeover');
  }

  private async claim(path: string): Promise<void> {
    const response = await this.request(path, { method: 'POST' });
    const data = (await response.json()) as { token: string; timeout?: number };
    this.token = data.token;
    if (typeof data.timeout === 'number') this.timeoutSeconds = data.timeout;
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    // Se late a un tercio del plazo: así se toleran dos latidos perdidos sin perder la sesión.
    const everyMs = Math.max(5_000, (this.timeoutSeconds / 3) * 1000);
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => void this.beat(), everyMs);
  }

  /**
   * Un latido. Se llama sola cada tercio del plazo, y a mano justo antes de que el navegador
   * congele la pestaña, que es cuando los temporizadores dejan de ser de fiar.
   *
   * Un latido perdido no suelta la sesión —puede ser un corte momentáneo de wifi—, pero sí se
   * cuenta: dos seguidos ya merecen decírselo al usuario, porque si no, un corte se manifiesta
   * como que el botón de enviar falla sin explicación.
   */
  async beat(): Promise<void> {
    if (this.token === null) return;
    try {
      await this.request('/api/session', { method: 'POST' });
      const wasFailing = this.failedBeats >= 2;
      this.failedBeats = 0;
      if (wasFailing) this.onContact?.(true);
    } catch {
      this.failedBeats++;
      if (this.failedBeats === 2) this.onContact?.(false);
    }
  }

  /** Estado de la sesión sin tomarla: quién la tiene y desde cuándo no da señales. */
  async sessionStatus(): Promise<SessionStatus> {
    const response = await this.request('/api/session');
    const data = (await response.json()) as Partial<SessionStatus>;
    return {
      busy: data.busy === true,
      mine: data.mine === true,
      timeout: typeof data.timeout === 'number' ? data.timeout : this.timeoutSeconds,
      idle: typeof data.idle === 'number' ? data.idle : 0,
    };
  }

  /**
   * Suelta la sesión desde `pagehide`, cuando la página se cierra **o se congela**.
   *
   * No puede esperar a nada: no hay `await` que valga si el navegador está desmontando la página.
   * `sendBeacon` es lo único que garantiza que la petición salga, y solo manda peticiones simples
   * —POST, sin cabeceras propias—, de ahí que el token vaya en la ruta y no en `X-Ania-Session`.
   * Así, además, no hay preflight, que es lo que más estorba cuando la web viene de otro servidor.
   *
   * Se suelta también cuando la página solo se congela (`event.persisted`, la bfcache del móvil),
   * y no es un descuido: distinguir los dos casos es imposible desde aquí —cerrar una pestaña en el
   * móvil también la mete en la bfcache—, y la asimetría de castigos manda. Soltar de más cuesta un
   * `acquire()` transparente al volver, que es lo que hace `pageshow`. Soltar de menos deja la Wii
   * bloqueada hasta que caduque, que es el fallo que se estaba persiguiendo.
   */
  releaseOnUnload(event = 'pagehide', persisted = false): void {
    this.stopHeartbeat();
    if (this.token === null) {
      this.noteRelease({ event, persisted, beacon: null });
      return;
    }

    const url = `${this.base}/api/session/release/${this.token}`;
    this.token = null;

    const beacon = globalThis.navigator?.sendBeacon?.bind(globalThis.navigator);
    const sent = beacon !== undefined ? beacon(url) : false;
    this.noteRelease({ event, persisted, beacon: sent });
    if (sent) return;

    // Sin sendBeacon (o con su cola llena), `keepalive` pide lo mismo con otras palabras.
    void fetch(url, { method: 'POST', keepalive: true }).catch(() => {
      // Si tampoco sale, la sesión caducará sola por falta de latido. Es la red de seguridad.
    });
  }

  /** Deja el rastro del intento. Best-effort de principio a fin: si falla, no pasa nada. */
  private noteRelease(note: Omit<ReleaseAttempt, 'when'>): void {
    try {
      globalThis.localStorage?.setItem(RELEASE_NOTE_KEY, JSON.stringify({ when: Date.now(), ...note }));
    } catch {
      // Modo privado, cuota llena… nada de esto puede impedir soltar la sesión.
    }
  }

  /**
   * Recupera la sesión tras volver de la bfcache.
   *
   * Mientras la pestaña está congelada no hay latidos, así que la sesión puede haber caducado. El
   * asistente hace lo correcto con un POST: si sigue siendo nuestra, cuenta como latido; si había
   * caducado, abre una nueva y devuelve otro token, que hay que adoptar; y si la tiene otro
   * dispositivo, contesta 409 y esto lanza.
   */
  async resume(): Promise<void> {
    await this.acquire();
  }

  /** Suelta la sesión para que otro dispositivo pueda editar. */
  async release(): Promise<void> {
    this.stopHeartbeat();
    if (this.token === null) return;
    try {
      await this.request('/api/session', { method: 'DELETE' });
    } catch {
      // Si no se puede avisar, la sesión caducará sola por falta de latido.
    } finally {
      this.token = null;
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  async read(onProgress?: OnProgress): Promise<Uint8Array> {
    /*
     * `fetch` se resuelve con las cabeceras, no con el cuerpo, y el asistente no manda las cabeceras
     * hasta haber leído la NAND entera. Ese hueco —varios segundos— es la primera fase, y es lo
     * único que la web puede saber de lo que hace la consola antes de que empiecen a llegar bytes.
     */
    onProgress?.({ phase: 'nand', loaded: 0, total: 0 });
    const response = await this.request('/api/save');

    // Sin cuerpo que ir leyendo a trozos —o sin nadie a quien contárselo— se pide de una vez, que
    // es lo que se hacía siempre.
    const body = response.body;
    if (onProgress === undefined || !body) {
      const data = new Uint8Array(await response.arrayBuffer());
      assertSaveSize(data);
      return data;
    }

    const total = Number(response.headers.get('Content-Length')) || SIZE_SAVE;
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress({ phase: 'datos', loaded, total });
    }

    // Se junta con lo que ha llegado de verdad, no con lo que decía la cabecera: si el asistente
    // se quedara corto, `assertSaveSize` tiene que enterarse.
    const data = new Uint8Array(loaded);
    let at = 0;
    for (const chunk of chunks) {
      data.set(chunk, at);
      at += chunk.length;
    }
    assertSaveSize(data);
    return data;
  }

  async write(data: Uint8Array, onProgress?: OnProgress): Promise<void> {
    assertSaveSize(data);
    if (onProgress !== undefined && typeof XMLHttpRequest !== 'undefined') {
      await this.upload(data, onProgress);
      return;
    }

    // Sin XHR (Node, donde corren las pruebas del protocolo) los bytes salen igual, pero no hay
    // forma de contarlos: se avisa de que la cosa está en marcha y ya.
    onProgress?.({ phase: 'datos', loaded: 0, total: 0 });
    await this.request('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: data as BodyInit,
    });
  }

  /**
   * El PUT con `XMLHttpRequest` en vez de con `fetch`, por una sola razón: `fetch` no informa de
   * cómo va la subida y XHR sí (`xhr.upload`). Manda las mismas cabeceras, así que provoca el mismo
   * preflight que el asistente ya sabe contestar.
   */
  private upload(data: Uint8Array, onProgress: OnProgress): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `${this.base}/api/save`);
      xhr.timeout = this.timeoutMs;
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      if (this.token !== null) xhr.setRequestHeader('X-Ania-Session', this.token);

      xhr.upload.addEventListener('progress', (event) => {
        onProgress({ phase: 'datos', loaded: event.loaded, total: event.total || data.length });
      });
      /*
       * Subido todo: a partir de aquí la Wii está escribiendo en la NAND y no contesta hasta
       * terminar. No hay nada que contar, solo que se sepa que el silencio es trabajo.
       */
      xhr.upload.addEventListener('load', () => {
        onProgress({ phase: 'guardando', loaded: data.length, total: 0 });
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(failure(xhr.status, xhr.responseText));
      });
      xhr.addEventListener('error', () => reject(new Error('No se ha podido llegar al asistente Wii')));
      xhr.addEventListener('timeout', () => reject(new Error('El asistente Wii no ha respondido a tiempo')));

      xhr.send(data as XMLHttpRequestBodyInit);
    });
  }
}

// ------------------------------------------------------------------ utilidad

/**
 * Carga un guardado desde cualquier transporte, con una copia de seguridad del original.
 * La copia se devuelve siempre: nunca se escribe en una Wii sin poder deshacerlo.
 */
export interface LoadedSave {
  save: PbrSave;
  /** Bytes originales tal como llegaron, para poder restaurar. */
  backup: Uint8Array;
  source: string;
}

export async function loadFrom(transport: SaveTransport, onProgress?: OnProgress): Promise<LoadedSave> {
  const raw = await transport.read(onProgress);
  return { save: PbrSave.load(raw), backup: raw.slice(), source: transport.name };
}
