/**
 * Intercambio con la Wii (y con ficheros de guardado, que es el mismo flujo).
 *
 * Regla que gobierna esta pantalla: **nunca se escribe sin poder deshacer**. Al cargar un
 * guardado se conserva una copia intacta, y hay un botón para descargarla en cualquier momento.
 */
import { PbrSave } from '../core/save.ts';
import { speciesNames, type Lang } from '../data/index.ts';
import {
  DEFAULT_WII_PORT,
  FileTransport,
  WiiHttpError,
  WiiTransport,
  lastReleaseAttempt,
  loadFrom,
  parseWiiAddress,
  type OnProgress,
  type TransferStatus,
} from '../transport/index.ts';
import { confirmDialog, el, progressDialog, select, toast } from './dom.ts';
import { t } from './i18n.ts';
import { currentLang, makeEntry, persist, state, update } from './state.ts';

let host = '';
let port = String(DEFAULT_WII_PORT);
/**
 * Transporte con la sesión abierta. Se guarda aquí porque la sesión dura toda la edición, no una
 * petición: mientras exista, ningún otro dispositivo puede tocar el guardado.
 */
let session: WiiTransport | null = null;

/**
 * Ciclo de vida de la pestaña.
 *
 * Al cerrarla se suelta la sesión para no dejar la Wii bloqueada. `pagehide` salta también cuando
 * la página solo se **congela** (la bfcache del móvil, al cambiar de aplicación), y durante un
 * tiempo eso se trató como «no soltar»: la pestaña viva sin sesión daba un «abre una sesión antes
 * de tocar el guardado» que no venía a cuento.
 *
 * El remedio resultó peor: cerrar una pestaña en el móvil **también** la mete en la bfcache, así
 * que ese `return` se estaba tragando el aviso justo en el caso que importa, y la Wii se quedaba
 * bloqueada hasta que caducase la sesión. Ahora se suelta siempre y se recupera al volver, con
 * `pageshow` llamando a `resume()`, que es un viaje de más y ningún bloqueo de menos.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', (event) => {
    session?.releaseOnUnload(event.persisted ? 'pagehide-persisted' : 'pagehide', event.persisted);
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && session !== null) void resumeSession();
  });
  /*
   * Último latido antes de que el navegador congele la pestaña. `visibilitychange` es el último
   * evento fiable en el móvil, y los temporizadores de una pestaña oculta ya no lo son: dejar la
   * sesión con el reloj recién puesto es lo que evita que caduque por un vistazo a otra aplicación.
   */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void session?.beat();
  });
}

/**
 * Al volver de la bfcache. Mientras la pestaña está congelada no hay latidos, así que la sesión
 * puede haber caducado y hasta habérsela llevado otro dispositivo.
 */
async function resumeSession(): Promise<void> {
  if (session === null) return;
  try {
    await session.resume();
  } catch (error) {
    // La sesión local ya no vale para nada; el guardado se deja cargado para poder exportarlo.
    session = null;
    toast(error instanceof Error ? error.message : t('wii.sessionLost'), 'error');
    update({});
  }
}
/** Índices de ranura del guardado marcados como destino de la transferencia. */
let targets: number[] = [];
/**
 * Guardado al que pertenecen esas marcas. Las ranuras se marcan por número, y ese número señala
 * otro pase en otro guardado: al cargar uno distinto hay que empezar de cero.
 */
let markedFor: PbrSave | null = null;

function download(data: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/octet-stream' }));
  const link = el('a', { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Lo que se enseña en cada fase. Son las mismas que el asistente escribe en la tele, para que las
 * dos pantallas cuenten lo mismo a la vez y ninguna de las dos parezca colgada.
 */
const PHRASE_KEYS: Record<TransferStatus['phase'], string> = {
  nand: 'wii.phase.nand',
  datos: 'wii.phase.data',
  guardando: 'wii.phase.saving',
};

/** Abre la ventana de progreso y devuelve con qué alimentarla y cómo cerrarla. */
function transferWindow(title: string): { onProgress: OnProgress; close: () => void } {
  const dialog = progressDialog(title);
  return {
    onProgress: (status) => dialog.set(t(PHRASE_KEYS[status.phase]), status.loaded, status.total),
    close: () => dialog.close(),
  };
}

/** El mismo umbral que aplica el asistente antes de conceder un relevo. */
const TAKEOVER_IDLE_SECONDS = 15;

/** El idioma del guardado se enseña en su propio idioma, como en el selector de la cabecera. */
const LANGUAGE_NAMES: Record<Lang, string> = {
  es: 'Español', en: 'English', de: 'Deutsch', fr: 'Français', it: 'Italiano', ja: '日本語',
};

/**
 * La sesión la tiene otro dispositivo. Devuelve `true` si se ha conseguido igualmente.
 *
 * El aviso de antes era un callejón sin salida: decía que estaba ocupada y ahí acababa todo, sin
 * decir por cuánto tiempo ni qué hacer. Casi siempre «el otro dispositivo» es la pestaña que uno
 * mismo cerró hace un minuto y cuyo aviso de cierre no llegó, así que lo que hace falta es saber
 * cuánto lleva callada y poder quedarse con ella.
 */
async function offerTakeover(transport: WiiTransport): Promise<boolean> {
  let status;
  try {
    status = await transport.sessionStatus();
  } catch {
    return false; // Si ni siquiera se puede preguntar, el problema es otro.
  }
  if (!status.busy) return false;

  const remaining = Math.max(0, status.timeout - status.idle);
  /*
   * Mientras el otro siga latiendo, la sesión es suya y no hay nada que ofrecer: el asistente
   * denegaría el relevo igualmente. Lo único que falta ahí es decir cuánto hay que esperar, que es
   * justo lo que el aviso de antes no decía.
   */
  if (status.idle < TAKEOVER_IDLE_SECONDS) {
    throw new Error(t('wii.busyActive', { idle: status.idle, remaining }));
  }

  const ok = await confirmDialog(
    t('wii.busyTitle'),
    t('wii.busyStale', { idle: status.idle, remaining }),
    t('wii.takeover'),
  );
  if (!ok) return false;

  await transport.takeover();
  return true;
}

async function connectToWii(): Promise<void> {
  if (host.trim() === '') { toast(t('wii.enterAddress'), 'error'); return; }
  /*
   * Vale tanto una IP como un nombre (`wii.local`, el que le haya puesto el router…). Y si en la
   * dirección viene ya el puerto —pegar la URL entera del asistente es lo natural—, ese manda
   * sobre el del formulario, que es lo que el usuario acaba de escribir con más detalle.
   */
  const address = parseWiiAddress(host);
  if (address === null) { toast(t('wii.badAddress'), 'error'); return; }
  const transport = new WiiTransport({
    host: address.host,
    port: address.port ?? (Number(port) || DEFAULT_WII_PORT),
  });
  transport.onContact = (ok) => toast(t(ok ? 'wii.contactBack' : 'wii.contactLost'), ok ? 'info' : 'error');
  update({ busy: true });
  // La ventana se abre después de la sesión: `acquire` es instantáneo, y si otro dispositivo está
  // editando lo suyo es enterarse con un aviso, no con una barra de progreso que sale y entra.
  let progress: ReturnType<typeof transferWindow> | null = null;
  try {
    // Primero la sesión: si otro dispositivo está editando, mejor enterarse antes de leer 3,5 MB.
    try {
      await transport.acquire();
    } catch (error) {
      if (!(error instanceof WiiHttpError && error.status === 409)) throw error;
      if (!(await offerTakeover(transport))) throw error;
    }
    progress = transferWindow(t('wii.readingFromWii'));
    const { save, backup, source } = await loadFrom(transport, progress.onProgress);
    session = transport;
    update({ save, backup, saveSource: source, busy: false });
    toast(t('wii.readFromWii', { count: save.slots.filter((s) => !s.empty).length }));
  } catch (error) {
    await transport.release();
    update({ busy: false });
    toast(error instanceof Error ? error.message : t('wii.cannotConnect'), 'error');
  } finally {
    progress?.close();
  }
}

/** Cierra el guardado y suelta la sesión, para que otro pueda editar. */
async function closeSave(): Promise<void> {
  await session?.release();
  session = null;
  targets = [];
  update({ save: null, backup: null, saveSource: null });
}

async function openSaveFile(file: File): Promise<void> {
  update({ busy: true });
  try {
    const transport = await FileTransport.fromFile(file);
    const { save, backup, source } = await loadFrom(transport);
    update({ save, backup, saveSource: source, busy: false });
    toast(t('wii.loaded', { count: save.slots.filter((s) => !s.empty).length }));
  } catch (error) {
    update({ busy: false });
    toast(error instanceof Error ? error.message : t('wii.notAPbrSave'), 'error');
  }
}

/** Guarda en local los pases seleccionados del guardado. */
async function importFromSave(save: PbrSave, indexes: number[]): Promise<void> {
  let saved = 0;
  for (const index of indexes) {
    const pass = save.getPass(index);
    if (pass.isEmpty) continue;
    if (await persist(makeEntry(pass.data.slice()))) saved++;
  }
  toast(saved > 0 ? t('wii.savedLocally', { count: saved }) : t('wii.nothingSaved'), saved > 0 ? 'info' : 'error');
}

/** Escribe los pases seleccionados de la biblioteca en las ranuras elegidas. */
async function transferToSave(save: PbrSave): Promise<void> {
  const chosen = state.stored.filter((p) => state.selected.has(p.id));
  if (chosen.length === 0) { toast(t('wii.selectInPassesTab'), 'error'); return; }
  if (targets.length < chosen.length) { toast(t('wii.chooseNSlots', { count: chosen.length }), 'error'); return; }

  const overwriting = targets.slice(0, chosen.length).filter((i) => !save.getPass(i).isEmpty);
  if (overwriting.length > 0) {
    const ok = await confirmDialog(
      t('wii.overwriteTitle'),
      t('wii.overwriteBody', {
        count: overwriting.length,
        names: overwriting.map((i) => save.getPass(i).trainerName || t('wii.slotN', { n: i })).join(', '),
      }),
      t('wii.overwrite'),
    );
    if (!ok) return;
  }

  chosen.forEach((entry, i) => {
    const target = save.getPass(targets[i]!);
    const design = target.design; // el diseño pertenece a la ranura, no al pase
    target.data.set(entry.data);
    target.design = design;
    target.available = true;
    target.issued = true;
  });

  // El modo secreto se levanta al transferir: es justo cuando el usuario puede ver el equipo.
  for (const entry of chosen) {
    if (entry.secret) await persist({ ...entry, secret: false });
  }

  update({ selected: new Set() });
  toast(t('wii.written', { count: chosen.length }));
}

/**
 * Qué pasó la última vez que se cerró la pestaña con una sesión abierta.
 *
 * Se enseña porque el fallo que hubo que perseguir no dejaba rastro por ningún lado: la Wii no
 * registraba nada y en la web el registro moría con la pestaña. Con esta línea, «la Wii sigue
 * bloqueada» se convierte en «el navegador ni lo intentó» o «lo intentó y se perdió por el
 * camino», que piden arreglos opuestos.
 */
function releaseNote(): HTMLElement | null {
  const note = lastReleaseAttempt();
  if (note === null) return null;
  const what = note.beacon === null ? t('wii.releaseNothing')
    : note.beacon ? t('wii.releaseSent') : t('wii.releaseFallback');
  return el('p', { class: 'small muted' }, t('wii.releaseNote', {
    when: new Date(note.when).toLocaleTimeString(),
    event: note.event,
    what,
  }));
}

export function renderWii(): HTMLElement {
  const container = el('div', {});

  // --- origen del guardado
  const fileInput = el('input', {
    type: 'file', hidden: true,
    onchange: (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) void openSaveFile(file);
    },
  });

  container.append(
    el('section', { class: 'card' },
      el('h2', {}, t('wii.save')),
      state.save === null
        ? el('div', {},
            el('p', { class: 'small muted' }, t('wii.loadHint')),
            el('div', { class: 'grid2' },
              el('div', { class: 'field' },
                el('label', {}, t('wii.wiiAddress')),
                el('input', {
                  value: host, placeholder: '192.168.1.50 · wii.local', inputmode: 'url',
                  autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false',
                  oninput: (event) => { host = (event.target as HTMLInputElement).value; },
                }),
              ),
              el('div', { class: 'field' },
                el('label', {}, t('wii.port')),
                el('input', {
                  value: port, inputmode: 'numeric',
                  oninput: (event) => { port = (event.target as HTMLInputElement).value; },
                }),
              ),
            ),
            // El aviso va aqui, pegado a los campos y antes del boton: es justo lo que hay que
            // saber antes de escribir una direccion, no despues de que falle la conexion.
            el('p', { class: 'small muted' }, t('wii.sameNetwork')),
            el('div', { class: 'row' },
              el('button', { class: 'primary', disabled: state.busy, onclick: () => void connectToWii() },
                state.busy ? t('wii.connecting') : t('wii.connect')),
              el('button', { onclick: () => fileInput.click() }, t('wii.openFile')),
            ),
            releaseNote(),
            fileInput,
          )
        : el('div', {},
            el('div', { class: 'row' },
              el('span', { class: 'badge ok' }, t('wii.source', { source: state.saveSource ?? '' })),
              session !== null ? el('span', { class: 'badge ok' }, t('wii.editSessionOpen')) : null,
              el('span', { class: 'badge' }, t('wii.partition', { n: state.save.partition })),
              el('span', { class: 'badge' }, t('wii.saveNumber', { n: state.save.saveCount })),
              /*
               * De qué versión del juego es. No es un adorno: de ahí salen los motes y el sello de
               * idioma de lo que se genere, y en la japonesa cambia hasta cuántos pases personales
               * hay (32 en vez de 37).
               */
              el('span', { class: 'badge' }, t('wii.gameVersion', {
                version: t(state.save.japanese ? 'wii.version.jp' : 'wii.version.int'),
                lang: LANGUAGE_NAMES[state.save.language],
              })),
            ),
            el('div', { class: 'field', style: 'margin-top:12px' },
              el('label', {}, t('wii.profile')),
              select(
                state.save.slots.map((s) => ({
                  value: s.index,
                  label: s.empty ? t('wii.emptyFile', { n: s.index + 1 }) : `${s.trainerName}`,
                })),
                state.save.currentSlot,
                (value) => { state.save?.selectSlot(Number(value)); update({}); },
              ),
            ),
            el('div', { class: 'row' },
              el('button', { class: 'ghost', onclick: () => void closeSave() }, t('wii.close')),
              el('button', {
                onclick: () => {
                  if (state.backup) download(state.backup, 'PbrSaveData.copia-de-seguridad');
                },
              }, t('wii.downloadBackup')),
            ),
          ),
    ),
  );

  if (state.save === null) return container;
  const save = state.save;
  if (markedFor !== save) {
    targets = [];
    markedFor = save;
  }

  /*
   * El emparejamiento es posicional: el pase i-ésimo de la selección va a la ranura i-ésima que
   * se haya marcado. Eso lo hacía ya `transferToSave`, pero en silencio; aquí se calcula lo mismo
   * para poder enseñarlo, de forma que la pantalla diga exactamente lo que va a pasar.
   */
  const chosen = state.stored.filter((p) => state.selected.has(p.id));
  const pairedTargets = targets.slice(0, chosen.length);
  const missingSlots = chosen.length - pairedTargets.length;

  // --- pases elegidos para transferir
  const queue = el('section', { class: 'card' }, el('h2', {}, t('wii.queueTitle')));
  if (chosen.length === 0) {
    queue.append(el('p', { class: 'small muted' }, t('wii.queueEmpty')));
  } else {
    const list = el('ol', { class: 'transfer-queue' });
    chosen.forEach((entry, i) => {
      const slot = targets[i];
      list.append(
        el('li', { class: 'transfer-row' },
          el('span', { class: 'order' }, String(i + 1)),
          el('span', { class: 'name' }, entry.name),
          el('span', { class: slot === undefined ? 'badge warn' : 'badge ok' },
            slot === undefined ? t('wii.noSlot') : t('wii.toSlot', { n: slot + 1 })),
          el('button', {
            class: 'ghost small',
            title: t('wii.removeFromTransfer'),
            onclick: () => { state.selected.delete(entry.id); update({}); },
          }, '✕'),
        ),
      );
    });
    queue.append(list);
    queue.append(el('p', { class: 'small muted' },
      missingSlots > 0
        ? t(missingSlots === 1 ? 'wii.markOneMoreSlot' : 'wii.markNMoreSlots', { count: missingSlots })
        : t('wii.allSlotsPaired')));
  }
  container.append(queue);

  // --- pases que hay en la Wii
  const customIndexes = save.customPassIndexes;
  const used = customIndexes.filter((i) => !save.getPass(i).isEmpty);

  const listCard = el('section', { class: 'card' },
    el('h2', {}, t('wii.passesInSave', { used: used.length, total: customIndexes.length })),
  );
  const grid = el('div', { class: 'pass-grid' });
  for (const index of customIndexes) {
    const pass = save.getPass(index);
    const order = targets.indexOf(index);
    const selected = order >= 0;
    // Marcada de más: hay más ranuras elegidas que pases, así que a esta no le toca ninguno.
    const spare = selected && order >= chosen.length;
    const incoming = selected && !spare ? chosen[order] : undefined;

    grid.append(
      el('button', {
        class: `pass-card${pass.isEmpty ? ' empty' : ''}${spare ? ' spare' : ''}`,
        'data-selected': String(selected),
        onclick: () => {
          targets = selected ? targets.filter((i) => i !== index) : [...targets, index];
          update({});
        },
      },
        el('span', { class: 'check' }, selected ? String(order + 1) : ''),
        el('span', { class: 'name' }, pass.isEmpty ? t('wii.slotN', { n: index + 1 }) : pass.trainerName),
        el('span', { class: 'small muted' },
          `${t('wii.design', { n: pass.design })}${pass.available ? '' : ` · ${t('wii.locked')}`}`),
        incoming !== undefined
          ? el('span', { class: 'incoming' }, `← ${incoming.name}`)
          : spare ? el('span', { class: 'small muted' }, t('wii.unused')) : null,
        incoming !== undefined && !pass.isEmpty
          ? el('span', { class: 'small danger-text' },
              t('wii.replaces', { name: pass.trainerName || t('wii.theSlotN', { n: index + 1 }) }))
          : null,
        el('div', { class: 'team' },
          ...pass.pokemon.map((pk) => el('span', { class: 'mon' }, speciesNames(currentLang())[pk.species] ?? `#${pk.species}`))),
      ),
    );
  }
  listCard.append(grid);
  container.append(listCard);

  // --- acciones
  const blocked = chosen.length === 0 || missingSlots > 0;
  container.append(
    el('section', { class: 'card' },
      el('h2', {}, t('wii.actions')),
      el('div', { class: 'row' },
        el('button', {
          disabled: targets.length === 0,
          onclick: () => void importFromSave(save, targets),
        }, t('wii.saveNLocally', { n: targets.length || '' })),
        el('button', {
          class: 'primary',
          disabled: blocked,
          onclick: () => void transferToSave(save),
        }, chosen.length === 0 ? t('wii.transfer') : t('wii.transferNToSlots', { n: chosen.length })),
      ),
      el('p', { class: 'small muted' },
        chosen.length === 0
          ? t('wii.selectFirstHint')
          : t('wii.transferSummary', {
              passes: t(chosen.length === 1 ? 'wii.nPassOne' : 'wii.nPassMany', { n: chosen.length }),
              slots: t(pairedTargets.length === 1 ? 'wii.nSlotOne' : 'wii.nSlotMany', { n: pairedTargets.length }),
              status: missingSlots > 0
                ? t(missingSlots === 1 ? 'wii.missingOne' : 'wii.missingMany', { n: missingSlots })
                : t('wii.allReady'),
            })),
    ),

    el('section', { class: 'card' },
      el('h2', {}, t('wii.unlock')),
      el('p', { class: 'small muted' }, t('wii.unlockHint')),
      el('div', { class: 'row' },
        el('button', {
          onclick: async () => {
            const ok = await confirmDialog(
              t('wii.unlockSlotsTitle'),
              t('wii.unlockSlotsBody', { n: customIndexes.length }),
              t('wii.unlock.button'),
            );
            if (!ok) return;
            save.unlockAllCustomPasses();
            update({});
            toast(t('wii.slotsUnlocked'));
          },
        }, t('wii.allSlots')),
        el('button', {
          onclick: async () => {
            const ok = await confirmDialog(
              t('wii.unlockColosseumsTitle'),
              t('wii.unlockColosseumsBody'),
              t('wii.unlock.button'),
            );
            if (!ok) return;
            save.unlockAllColosseums();
            update({});
            toast(t('wii.colosseumsUnlocked'));
          },
        }, t('wii.allColosseums')),
      ),
    ),

    el('section', { class: 'card' },
      el('h2', {}, t('wii.send')),
      el('p', { class: 'small muted' }, t('wii.sendHint')),
      session !== null
        ? el('p', { class: 'small muted' }, t('wii.sessionOpenHint'))
        : null,
      el('div', { class: 'row' },
        el('button', {
          onclick: () => download(save.serialize(), 'PbrSaveData'),
        }, t('wii.downloadSave')),
        el('button', {
          class: 'primary',
          disabled: state.saveSource !== 'Wii',
          onclick: async () => {
            const ok = await confirmDialog(
              t('wii.sendToWiiTitle'),
              t('wii.sendToWiiBody'),
              t('wii.send.button'),
            );
            if (!ok) return;
            if (session === null) { toast(t('wii.noSession'), 'error'); return; }
            update({ busy: true });
            const progress = transferWindow(t('wii.sendingToWii'));
            try {
              await session.write(save.serialize(), progress.onProgress);
              toast(t('wii.sentToWii'));
            } catch (error) {
              toast(error instanceof Error ? error.message : t('wii.cannotSend'), 'error');
            } finally {
              progress.close();
              update({ busy: false });
            }
          },
        }, t('wii.sendToWii')),
      ),
    ),
  );

  return container;
}
