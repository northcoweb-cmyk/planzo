import { openDB, type IDBPDatabase } from 'idb'
import { STORE_NAMES, type StoreMap, type StoreName } from '../types/models'
import { dbNameFor, type DatasetId } from './dataset'

export const SCHEMA_VERSION = 1
const DB_VERSION = 1

export interface BlobRow { id: string; blob: Blob }

/**
 * Thin, typed wrapper over IndexedDB. All app code goes through this (never touches IDB directly),
 * so a cloud-sync backend can later be slotted in behind the same interface.
 *
 * Stores: one per model (keyPath 'id'), 'blobs' (attachment binaries, kept apart from metadata so
 * lists stay light) and 'meta' (key/value flags).
 */
export class GarageDB {
  private constructor(private db: IDBPDatabase, readonly dataset: DatasetId) {}

  static async open(dataset: DatasetId): Promise<GarageDB> {
    const db = await openDB(dbNameFor(dataset), DB_VERSION, {
      upgrade(d, oldVersion) {
        // Future migrations: switch on oldVersion and alter stores here, never delete user stores.
        if (oldVersion < 1) {
          for (const name of STORE_NAMES) {
            const s = d.createObjectStore(name, { keyPath: 'id' })
            if (name === 'mileage' || name === 'fuel' || name === 'services' || name === 'maintRecords') s.createIndex('by-date', 'date')
          }
          d.createObjectStore('blobs', { keyPath: 'id' })
          d.createObjectStore('meta')
        }
      }
    })
    return new GarageDB(db, dataset)
  }

  close() { this.db.close() }

  getAll<K extends StoreName>(store: K): Promise<StoreMap[K][]> { return this.db.getAll(store) as Promise<StoreMap[K][]> }
  get<K extends StoreName>(store: K, id: string): Promise<StoreMap[K] | undefined> { return this.db.get(store, id) as Promise<StoreMap[K] | undefined> }
  async put<K extends StoreName>(store: K, rec: StoreMap[K]): Promise<void> { await this.db.put(store, rec) }
  async putMany<K extends StoreName>(store: K, recs: StoreMap[K][]): Promise<void> {
    const tx = this.db.transaction(store, 'readwrite')
    for (const r of recs) tx.store.put(r)
    await tx.done
  }
  async delete(store: StoreName, id: string): Promise<void> { await this.db.delete(store, id) }
  async deleteMany(store: StoreName, ids: string[]): Promise<void> {
    const tx = this.db.transaction(store, 'readwrite')
    for (const id of ids) tx.store.delete(id)
    await tx.done
  }
  async clear(store: StoreName): Promise<void> { await this.db.clear(store) }

  async putBlob(id: string, blob: Blob): Promise<void> { await this.db.put('blobs', { id, blob } satisfies BlobRow) }
  async getBlob(id: string): Promise<Blob | undefined> { return (await this.db.get('blobs', id) as BlobRow | undefined)?.blob }
  async deleteBlob(id: string): Promise<void> { await this.db.delete('blobs', id) }
  async allBlobs(): Promise<BlobRow[]> { return this.db.getAll('blobs') as Promise<BlobRow[]> }
  async clearBlobs(): Promise<void> { await this.db.clear('blobs') }

  async getMeta<T = unknown>(key: string): Promise<T | undefined> { return this.db.get('meta', key) as Promise<T | undefined> }
  async setMeta(key: string, value: unknown): Promise<void> { await this.db.put('meta', value, key) }

  /** Wipe every store. Used by import-replace and the reset action. */
  async clearEverything(): Promise<void> {
    const tx = this.db.transaction([...STORE_NAMES, 'blobs', 'meta'], 'readwrite')
    for (const n of [...STORE_NAMES, 'blobs', 'meta']) tx.objectStore(n).clear()
    await tx.done
  }
}

export async function deleteDatabase(dataset: DatasetId): Promise<void> {
  await new Promise<void>((res, rej) => {
    const r = indexedDB.deleteDatabase(dbNameFor(dataset))
    r.onsuccess = () => res()
    r.onerror = () => rej(r.error)
    r.onblocked = () => res()
  })
}
