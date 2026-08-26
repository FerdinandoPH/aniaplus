/**
 * Almacenamiento local de los pases diseñados (hasta 100, según el enunciado).
 *
 * Se usa IndexedDB y no localStorage porque un pase son 1772 bytes binarios: en localStorage
 * habría que pasarlo a base64 (un 33% más) y el límite ronda los 5 MB. IndexedDB guarda
 * `Uint8Array` directamente.
 *
 * El backend está detrás de una interfaz para poder probarlo en Node sin IndexedDB.
 */
import { SIZE_PASS } from '../core/constants.ts';

export const MAX_STORED_PASSES = 100;
const DB_NAME = 'ania-plus';
const STORE = 'passes';
/** Se versiona el esquema desde el principio para poder migrar sin perder los pases. */
const DB_VERSION = 1;

export interface StoredPass {
  id: string;
  /** Nombre para la lista; se copia del pase al guardar, para no tener que decodificarlo. */
  name: string;
  /** Los 0x6EC bytes del pase, tal cual van en el guardado. */
  data: Uint8Array;
  createdAt: number;
  updatedAt: number;
  /** Modo secreto: la interfaz no debe mostrar el contenido hasta transferirlo. */
  secret: boolean;
}

export interface PassStore {
  list(): Promise<StoredPass[]>;
  get(id: string): Promise<StoredPass | undefined>;
  put(pass: StoredPass): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Comprueba lo que la aplicación asume de un pase antes de guardarlo. */
export function assertValidPass(pass: StoredPass): void {
  if (pass.data.length !== SIZE_PASS) {
    throw new Error(`Un pase debe medir ${SIZE_PASS} bytes, no ${pass.data.length}`);
  }
}

// ------------------------------------------------------------------ IndexedDB

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Migraciones futuras: comparar `event.oldVersion` y transformar en vez de recrear.
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la base de datos'));
  });
}

function run<T>(store: IDBObjectStore, request: IDBRequest<T>): Promise<T> {
  void store;
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Error de IndexedDB'));
  });
}

export class IndexedDbPassStore implements PassStore {
  private async withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE, mode);
      return await run(tx.objectStore(STORE), fn(tx.objectStore(STORE)));
    } finally {
      db.close();
    }
  }

  async list(): Promise<StoredPass[]> {
    const all = await this.withStore('readonly', (s) => s.getAll() as IDBRequest<StoredPass[]>);
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): Promise<StoredPass | undefined> {
    return this.withStore('readonly', (s) => s.get(id) as IDBRequest<StoredPass | undefined>);
  }

  async put(pass: StoredPass): Promise<void> {
    assertValidPass(pass);
    await this.withStore('readwrite', (s) => s.put(pass) as IDBRequest<IDBValidKey>);
  }

  async delete(id: string): Promise<void> {
    await this.withStore('readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
  }

  async clear(): Promise<void> {
    await this.withStore('readwrite', (s) => s.clear() as IDBRequest<undefined>);
  }
}

// ------------------------------------------------------- almacén en memoria

/** Implementación equivalente sin IndexedDB, para los tests y para navegadores que la bloqueen. */
export class MemoryPassStore implements PassStore {
  private readonly items = new Map<string, StoredPass>();

  async list(): Promise<StoredPass[]> {
    return [...this.items.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<StoredPass | undefined> {
    return this.items.get(id);
  }

  async put(pass: StoredPass): Promise<void> {
    assertValidPass(pass);
    this.items.set(pass.id, pass);
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  async clear(): Promise<void> {
    this.items.clear();
  }
}

/** El almacén que toca según el entorno. */
export function createPassStore(): PassStore {
  return typeof indexedDB === 'undefined' ? new MemoryPassStore() : new IndexedDbPassStore();
}

/**
 * Guarda respetando el límite de 100 pases.
 * Devuelve `false` sin guardar si no cabe, para que la interfaz avise en vez de borrar algo.
 */
export async function savePass(store: PassStore, pass: StoredPass): Promise<boolean> {
  const existing = await store.get(pass.id);
  if (existing === undefined) {
    const all = await store.list();
    if (all.length >= MAX_STORED_PASSES) return false;
  }
  await store.put(pass);
  return true;
}
