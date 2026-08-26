/**
 * Prueba del transporte contra un servidor que imita al asistente Wii.
 *
 * El homebrew en sí no se puede probar sin consola, pero el protocolo sí: aquí se levanta un
 * servidor HTTP real que responde como el asistente (mismas rutas, mismos códigos de error) y se
 * usa el cliente de verdad contra él. Así queda cubierto lo que hay entre los dos.
 */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { SIZE_SAVE } from '../src/core/constants.ts';
import { PbrSave } from '../src/core/save.ts';
import { FileTransport, WiiTransport, lastReleaseAttempt, loadFrom, parseWiiAddress, type TransferStatus } from '../src/transport/index.ts';
import { describeSaves, HAVE_SAVES, loadRaw } from './fixtures.ts';

/** Estado del "asistente Wii" simulado, con la misma logica de sesion que el homebrew. */
let nand: Uint8Array;
let server: Server;
let port: number;
let sessionToken: string | null = null;
let sessionCounter = 0;
/** Segundos que el asistente dice que lleva la sesion sin latir. Las pruebas lo mueven a mano. */
let sessionIdle = 0;
const SESSION_TIMEOUT = 45;

beforeAll(async () => {
  // Este hook es de fichero, así que corre aunque los bloques de abajo estén saltados por
  // faltar los guardados de ejemplo. Sin guardado no hay servidor que levantar: se sale.
  if (!HAVE_SAVES) return;
  nand = loadRaw('europa');

  server = createServer((request, response) => {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    const token = request.headers['x-ania-session'] as string | undefined;

    if (request.url === '/api/session') {
      if (request.method === 'POST') {
        if (sessionToken !== null && token !== sessionToken) {
          response.writeHead(409, cors).end('otro dispositivo esta editando el guardado');
          return;
        }
        sessionToken ??= `token-${++sessionCounter}`;
        sessionIdle = 0;
        response.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
          .end(JSON.stringify({ token: sessionToken, timeout: SESSION_TIMEOUT }));
        return;
      }
      if (request.method === 'DELETE') {
        if (sessionToken !== null && token !== sessionToken) {
          response.writeHead(409, cors).end('la sesion es de otro dispositivo');
          return;
        }
        sessionToken = null;
        response.writeHead(200, cors).end('sesion cerrada');
        return;
      }
      /* Consultar sin tomarla: es lo que permite decir cuanto le queda a la sesion de otro. */
      response.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
        .end(JSON.stringify({
          busy: sessionToken !== null,
          mine: sessionToken !== null && token === sessionToken,
          timeout: SESSION_TIMEOUT,
          idle: sessionToken === null ? 0 : sessionIdle,
        }));
      return;
    }

    /* Relevo: solo si la sesion lleva un rato sin latir. Mismo umbral que el homebrew. */
    if (request.url === '/api/session/takeover' && request.method === 'POST') {
      if (sessionToken !== null && sessionIdle < 15) {
        response.writeHead(409, cors).end('el otro dispositivo sigue conectado');
        return;
      }
      sessionToken = `token-${++sessionCounter}`;
      sessionIdle = 0;
      response.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
        .end(JSON.stringify({ token: sessionToken, timeout: SESSION_TIMEOUT }));
      return;
    }

    /*
     * Soltar la sesion al cerrarse la web: POST con el token en la ruta, sin cabeceras, que es lo
     * unico que `sendBeacon` sabe mandar. Misma logica que el DELETE, otro sobre.
     */
    if (request.url?.startsWith('/api/session/release/') && request.method === 'POST') {
      const given = request.url.slice('/api/session/release/'.length);
      if (sessionToken === null) {
        response.writeHead(200, cors).end('no habia sesion');
        return;
      }
      if (given !== sessionToken) {
        response.writeHead(409, cors).end('la sesion es de otro dispositivo');
        return;
      }
      sessionToken = null;
      response.writeHead(200, cors).end('sesion cerrada');
      return;
    }

    /* Sin el token de la sesion viva no se toca el guardado. */
    if (request.url === '/api/save' && (sessionToken === null || token !== sessionToken)) {
      response.writeHead(409, cors)
        .end(sessionToken === null ? 'abre una sesion antes de tocar el guardado' : 'otro dispositivo esta editando el guardado');
      return;
    }

    if (request.url === '/api/status') {
      response.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
        .end(JSON.stringify({ app: 'ANIA+ Asistente Wii', version: '0.1.0', saveFound: true, saveSize: nand.length }));
      return;
    }

    if (request.url === '/api/save' && request.method === 'GET') {
      response.writeHead(200, { ...cors, 'Content-Type': 'application/octet-stream', 'Content-Length': nand.length });
      response.end(Buffer.from(nand));
      return;
    }

    if (request.url === '/api/save' && request.method === 'PUT') {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const body = Buffer.concat(chunks);
        if (body.length !== SIZE_SAVE) {
          response.writeHead(400, cors).end('el guardado no tiene el tamano correcto');
          return;
        }
        nand = new Uint8Array(body);
        response.writeHead(200, cors).end('guardado escrito');
      });
      return;
    }

    response.writeHead(404, cors).end('no existe');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
});

/* Sin esto, una prueba que deje la sesión tomada hace fallar a todas las siguientes. */
beforeEach(() => { sessionToken = null; sessionIdle = 0; });

afterAll(async () => {
  if (!HAVE_SAVES) return;  // no se llego a levantar el servidor
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function transport(): WiiTransport {
  return new WiiTransport({ host: '127.0.0.1', port, timeoutMs: 30_000 });
}

describeSaves('transporte por red', () => {
  test('detecta que el asistente está disponible', async () => {
    expect(await transport().probe()).toBe(true);
  });

  test('detecta que no lo está', async () => {
    // Puerto donde no hay nada escuchando.
    const dead = new WiiTransport({ host: '127.0.0.1', port: 1, timeoutMs: 2000 });
    expect(await dead.probe()).toBe(false);
  });

  test('lee el guardado completo y es válido', async () => {
    const wii = transport();
    await wii.acquire();
    const { save, backup } = await loadFrom(wii);
    expect(backup).toHaveLength(SIZE_SAVE);
    expect(save.slots.map((s) => s.trainerName)).toEqual(['PKTOPIA', 'Joro', 'Azul', 'Verde']);
    await wii.release();
  });

  /*
   * Lo que alimenta la ventana de progreso de la web. Aqui se comprueba el contrato, no la ventana:
   * que se avise de que la consola esta leyendo la NAND antes de que llegue ningun byte, y que la
   * cuenta avance sin retroceder hasta los 3,5 MB.
   */
  test('leer va informando de por donde va', async () => {
    const wii = transport();
    await wii.acquire();

    const avisos: TransferStatus[] = [];
    const data = await wii.read((status) => avisos.push({ ...status }));
    await wii.release();

    expect(data).toHaveLength(SIZE_SAVE);
    expect(avisos[0]).toEqual({ phase: 'nand', loaded: 0, total: 0 });

    const bytes = avisos.filter((a) => a.phase === 'datos');
    expect(bytes.length).toBeGreaterThan(1);
    expect(bytes.every((a, i) => i === 0 || a.loaded >= bytes[i - 1]!.loaded)).toBe(true);
    expect(bytes.at(-1)).toEqual({ phase: 'datos', loaded: SIZE_SAVE, total: SIZE_SAVE });
  });

  /*
   * En Node no hay `XMLHttpRequest`, asi que este es el camino de reserva: los bytes salen igual
   * pero no hay forma de contarlos. Se avisa una vez, con total 0 (barra indeterminada).
   */
  test('escribir avisa aunque no se puedan contar los bytes', async () => {
    const wii = transport();
    await wii.acquire();

    const avisos: TransferStatus[] = [];
    // Se devuelve el guardado bueno, no ceros: la NAND de mentira la comparten todas las pruebas.
    await wii.write(loadRaw('europa'), (status) => avisos.push({ ...status }));
    await wii.release();

    expect(avisos).toEqual([{ phase: 'datos', loaded: 0, total: 0 }]);
  });

  test('el ciclo completo: leer, editar, escribir y volver a leer', async () => {
    const wii = transport();
    await wii.acquire();

    const { save } = await loadFrom(wii);
    save.selectSlot(0);
    save.getPass(0).trainerName = 'POR RED';
    await wii.write(save.serialize());

    const { save: after } = await loadFrom(wii);
    after.selectSlot(0);
    expect(after.getPass(0).trainerName).toBe('POR RED');
    // Y sigue siendo un guardado válido para el juego.
    expect(after.getPass(0).pokemon.every((pk) => pk.checksumValid)).toBe(true);
    await wii.release();
  });

  test('rechaza escribir algo que no es un guardado', async () => {
    await expect(transport().write(new Uint8Array(100))).rejects.toThrow(/3670016 bytes/);
  });

  /*
   * Esta es la prueba del requisito: mientras un dispositivo tiene el guardado abierto en ANIA+
   * —aunque pasen minutos sin hacer ninguna peticion, porque esta montando equipos— ningun otro
   * puede empezar a editarlo. Si dos pudieran, el segundo en escribir borraria el trabajo del
   * primero sin que ninguno se enterase.
   */
  test('un segundo dispositivo no puede editar mientras el primero tiene la sesión', async () => {
    const primero = transport();
    await primero.acquire();

    const segundo = transport();
    await expect(segundo.acquire()).rejects.toThrow(/otro dispositivo/i);
    await expect(segundo.read()).rejects.toThrow(/otro dispositivo/i);
    await expect(segundo.write(new Uint8Array(SIZE_SAVE))).rejects.toThrow(/otro dispositivo/i);

    // Y en cuanto el primero suelta, el segundo entra sin problema.
    await primero.release();
    await segundo.acquire();
    expect(segundo.hasSession).toBe(true);
    await segundo.release();
  });

  test('sin sesión abierta no se puede tocar el guardado', async () => {
    await expect(transport().read()).rejects.toThrow(/abre una sesion/i);
  });

  test('el mismo dispositivo puede renovar su sesión sin perderla', async () => {
    const wii = transport();
    await wii.acquire();
    await wii.acquire(); // el latido reutiliza el mismo token
    expect(wii.hasSession).toBe(true);
    await wii.release();
  });

  /*
   * Al cerrar la pestaña no hay tiempo de esperar una respuesta, así que la sesión se suelta con
   * `sendBeacon`. Aquí se comprueba que lo que manda es lo que el asistente entiende: si el
   * cliente y la ruta dejan de coincidir, la Wii se quedaría bloqueada hasta agotar el plazo.
   */
  test('al cerrar la web se suelta la sesión con sendBeacon', async () => {
    const wii = transport();
    await wii.acquire();

    const sent: string[] = [];
    vi.stubGlobal('navigator', {
      sendBeacon: (url: string) => { sent.push(url); return true; },
    });
    wii.releaseOnUnload();
    vi.unstubAllGlobals();

    expect(sent).toHaveLength(1);
    // El token viaja en la ruta: sin cabeceras propias no hay preflight, y sendBeacon solo manda
    // peticiones simples.
    expect(sent[0]).toContain('/api/session/release/');

    // Se manda a mano lo mismo que habría mandado el navegador, para ver que el asistente lo acepta.
    const response = await fetch(sent[0]!, { method: 'POST' });
    expect(response.status).toBe(200);

    // Y la sesión queda libre de verdad: otro dispositivo puede entrar.
    const otro = transport();
    await otro.acquire();
    expect(otro.hasSession).toBe(true);
    await otro.release();
  });

  /*
   * El rastro que hizo falta para perseguir el aviso que no llegaba. La Wii no registraba nada y en
   * la web el registro moria con la pestaña, asi que no habia forma de saber si el navegador ni lo
   * intento o si lo intento y se perdio por el camino, que piden arreglos opuestos.
   */
  test('el intento de soltar deja un rastro que se puede leer al volver', async () => {
    const guardado: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => guardado[key] ?? null,
      setItem: (key: string, value: string) => { guardado[key] = value; },
    });
    vi.stubGlobal('navigator', { sendBeacon: () => true });

    const wii = transport();
    await wii.acquire();
    wii.releaseOnUnload('pagehide-persisted', true);

    const nota = lastReleaseAttempt();
    expect(nota).toMatchObject({ event: 'pagehide-persisted', persisted: true, beacon: true });

    // Y si no hay nada que soltar se distingue de un aviso rechazado: `beacon` queda en null.
    wii.releaseOnUnload();
    expect(lastReleaseAttempt()).toMatchObject({ beacon: null });
    vi.unstubAllGlobals();
  });

  test('preguntar por la sesión dice de quién es y cuánto lleva callada', async () => {
    const wii = transport();
    await wii.acquire();
    expect(await wii.sessionStatus()).toEqual({ busy: true, mine: true, timeout: SESSION_TIMEOUT, idle: 0 });

    const otro = transport();
    expect(await otro.sessionStatus()).toMatchObject({ busy: true, mine: false });
    await wii.release();
    expect(await otro.sessionStatus()).toMatchObject({ busy: false, idle: 0 });
  });

  /*
   * El relevo es la salida para el caso que no tiene arreglo posible: el dispositivo que se fue sin
   * avisar. Pero no puede ser un atajo para quitarle la sesion a alguien que sigue editando, asi
   * que el asistente solo lo concede cuando lleva un rato sin latir.
   */
  test('el relevo se deniega mientras el otro siga vivo, y se concede cuando ya no', async () => {
    const primero = transport();
    await primero.acquire();

    const segundo = transport();
    await expect(segundo.takeover()).rejects.toThrow(/sigue conectado/i);

    sessionIdle = 20; // el primero lleva veinte segundos sin dar señales
    await segundo.takeover();
    expect(segundo.hasSession).toBe(true);
    // Y la sesion es suya de verdad: puede leer, y el primero ya no.
    expect((await segundo.read()).length).toBe(SIZE_SAVE);
    await expect(primero.read()).rejects.toThrow(/otro dispositivo/i);
    await segundo.release();
  });

  /*
   * Un latido perdido no significa nada —un corte momentaneo de wifi— y por eso no suelta la
   * sesion. Dos seguidos si merecen decirse: sin eso, un corte se manifiesta como que el boton de
   * enviar falla sin explicacion.
   */
  test('dos latidos perdidos avisan, y el primero bueno lo desmiente', async () => {
    const wii = transport();
    await wii.acquire();

    const avisos: boolean[] = [];
    wii.onContact = (ok) => avisos.push(ok);

    const real = globalThis.fetch;
    vi.stubGlobal('fetch', () => Promise.reject(new Error('sin red')));
    await wii.beat();
    expect(avisos).toEqual([]); // uno solo no dice nada
    await wii.beat();
    expect(avisos).toEqual([false]);
    await wii.beat();
    expect(avisos).toEqual([false]); // y no se repite en cada latido

    vi.stubGlobal('fetch', real);
    await wii.beat();
    expect(avisos).toEqual([false, true]);
    await wii.release();
  });

  test('sin sendBeacon se suelta igual, con keepalive', async () => {
    const wii = transport();
    await wii.acquire();

    vi.stubGlobal('navigator', {});
    wii.releaseOnUnload();
    vi.unstubAllGlobals();

    // El `fetch` sale sin esperarse; se le da un respiro antes de comprobar el efecto.
    await new Promise((r) => setTimeout(r, 50));
    const otro = transport();
    await otro.acquire();
    expect(otro.hasSession).toBe(true);
    await otro.release();
  });

  test('un token que no es el de la sesión no la suelta', async () => {
    const wii = transport();
    await wii.acquire();

    const response = await fetch(`http://127.0.0.1:${port}/api/session/release/token-de-otro`, { method: 'POST' });
    expect(response.status).toBe(409);

    // Sigue siendo del primero.
    await expect(transport().acquire()).rejects.toThrow(/otro dispositivo/i);
    await wii.release();
  });

  test('al volver de segundo plano se recupera la sesión, con token nuevo si caducó', async () => {
    const wii = transport();
    await wii.acquire();

    // La pestaña se congela: sin latidos, la sesión caduca sola en la Wii.
    sessionToken = null;

    await wii.resume();
    expect(wii.hasSession).toBe(true);
    // Y con la sesión recuperada se vuelve a poder leer.
    expect((await wii.read()).length).toBe(SIZE_SAVE);
    await wii.release();
  });

  test('si otro dispositivo se ha quedado la sesión, volver del segundo plano lo dice', async () => {
    const wii = transport();
    await wii.acquire();

    const otro = transport();
    await expect(otro.acquire()).rejects.toThrow(/otro dispositivo/i);

    // El intruso se hace con ella tras caducar la del primero.
    await wii.release();
    await otro.acquire();

    await expect(wii.resume()).rejects.toThrow(/otro dispositivo/i);
    await otro.release();
  });

  /*
   * El asistente da la sesion del guardado al primer cliente que lee, y responde 409 a los
   * demas: si no, dos moviles podrian leer el mismo guardado, editar cada uno lo suyo, y el
   * segundo en escribir se cargaria los cambios del primero sin que nadie se enterase.
   */
  test('avisa si el asistente no responde a tiempo', async () => {
    // 10.255.255.1 no es enrutable: la conexión se queda colgada hasta el tiempo límite.
    const slow = new WiiTransport({ host: '10.255.255.1', port: 8080, timeoutMs: 300 });
    await expect(slow.read()).rejects.toThrow(/no ha respondido a tiempo/);
  });
});

describeSaves('transporte por fichero', () => {
  test('carga un guardado y permite descargar la copia', async () => {
    const file = new FileTransport(loadRaw('sudamerica'));
    const { save, backup, source } = await loadFrom(file);
    expect(source).toBe('Fichero');
    expect(backup).toHaveLength(SIZE_SAVE);
    expect(save.slots[0]?.trainerName).toBe('PKTOPIA');
  });

  test('rechaza un fichero que no es un guardado de PBR', async () => {
    const file = new FileTransport();
    await expect(file.write(new Uint8Array(1234))).rejects.toThrow(/3670016/);
  });

  test('lo escrito se puede volver a leer', async () => {
    const file = new FileTransport(loadRaw('europa'));
    const save = PbrSave.load(await file.read());
    save.selectSlot(1);
    save.getPass(0).trainerName = 'FICHERO';
    await file.write(save.serialize());

    const reloaded = PbrSave.load(await file.read());
    reloaded.selectSlot(1);
    expect(reloaded.getPass(0).trainerName).toBe('FICHERO');
  });
});

describe('direcciones escritas a mano', () => {
  test('acepta IPs, nombres de dominio y la URL entera del asistente', () => {
    expect(parseWiiAddress('192.168.1.50')).toEqual({ host: '192.168.1.50', port: null });
    expect(parseWiiAddress('  wii.local ')).toEqual({ host: 'wii.local', port: null });
    expect(parseWiiAddress('mi-wii')).toEqual({ host: 'mi-wii', port: null });
    expect(parseWiiAddress('wii.local:8080')).toEqual({ host: 'wii.local', port: 8080 });
    expect(parseWiiAddress('http://wii.local:9000/api/save')).toEqual({ host: 'wii.local', port: 9000 });
    expect(parseWiiAddress('[fe80::1]:8080')).toEqual({ host: 'fe80::1', port: 8080 });
    expect(parseWiiAddress('fe80::1')).toEqual({ host: 'fe80::1', port: null });
  });

  test('rechaza lo que no es una direccion', () => {
    for (const bad of ['', '   ', 'wii .local', 'wii.local:puerto', 'wii.local:0', 'wii.local:99999', '-wii.local', 'http://']) {
      expect(parseWiiAddress(bad), bad).toBeNull();
    }
  });

  /* Una IPv6 sin corchetes daria una URL invalida y el fetch ni saldria. */
  test('pone corchetes a la IPv6 al construir la URL', () => {
    const wii = new WiiTransport({ host: 'fe80::1', port: 8080 });
    expect((wii as unknown as { base: string }).base).toBe('http://[fe80::1]:8080');
  });
});
