import { STORE_NAMES, type StoreMap, type StoreName } from '../types/models'
import { blobToDataUrl, dataUrlToBlob } from '../lib/image'
import { toCsv, type CsvCell } from '../lib/csv'
import { serviceTotal, modTotal } from '../calc/costs'
import type { GarageDB } from './db'
import { SCHEMA_VERSION } from './db'

/**
 * Backup format (JSON, human-readable, versioned):
 * {
 *   app: 'bmw-garage', schema: 1, exportedAt, dataset: 'live'|'demo',
 *   data:  { vehicle: [...], mileage: [...], fuel: [...], ... },     // every store
 *   blobs: { '<attachmentId>': { mime, dataUrl } }                  // receipt / mod photos, embedded
 * }
 * Photos are embedded so a single file is a complete backup of the whole garage.
 */
export interface Snapshot {
  app: 'bmw-garage'
  schema: number
  exportedAt: string
  dataset: 'live' | 'demo'
  data: { [K in StoreName]: StoreMap[K][] }
  blobs: Record<string, { mime: string; dataUrl: string }>
}

export async function exportSnapshot(db: GarageDB, opts: { withBlobs?: boolean } = {}): Promise<Snapshot> {
  const data = {} as Snapshot['data']
  for (const n of STORE_NAMES) (data as Record<string, unknown[]>)[n] = await db.getAll(n)
  const blobs: Snapshot['blobs'] = {}
  if (opts.withBlobs !== false) {
    for (const row of await db.allBlobs()) blobs[row.id] = { mime: row.blob.type, dataUrl: await blobToDataUrl(row.blob) }
  }
  return { app: 'bmw-garage', schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), dataset: db.dataset, data, blobs }
}

export class ImportError extends Error {}

/** Validate shape + version. Throws ImportError with a human-readable reason; never touches the DB. */
export function parseSnapshot(text: string): Snapshot {
  let j: unknown
  try { j = JSON.parse(text) } catch { throw new ImportError('That file is not valid JSON.') }
  const o = j as Partial<Snapshot>
  if (!o || typeof o !== 'object' || o.app !== 'bmw-garage') throw new ImportError('This is not a BMW Garage backup file.')
  if (typeof o.schema !== 'number') throw new ImportError('Backup is missing its schema version.')
  if (o.schema > SCHEMA_VERSION) throw new ImportError(`This backup was made by a newer version of the app (schema ${o.schema}). Update the app first.`)
  if (!o.data || typeof o.data !== 'object') throw new ImportError('Backup contains no data.')
  const data = {} as Snapshot['data']
  for (const n of STORE_NAMES) {
    const arr = (o.data as Record<string, unknown>)[n]
    if (arr !== undefined && !Array.isArray(arr)) throw new ImportError(`Backup section "${n}" is malformed.`)
    ;(data as Record<string, unknown[]>)[n] = (arr as unknown[] | undefined) ?? []
    for (const rec of (data as Record<string, unknown[]>)[n]) {
      if (!rec || typeof (rec as { id?: unknown }).id !== 'string') throw new ImportError(`Backup section "${n}" has a record without an id.`)
    }
  }
  return { app: 'bmw-garage', schema: o.schema, exportedAt: o.exportedAt ?? '', dataset: o.dataset ?? 'live', data, blobs: o.blobs ?? {} }
}

export interface ImportSummary { mode: 'replace' | 'merge'; counts: Partial<Record<StoreName, number>>; blobs: number }

/**
 * replace: wipe the target DB and load the backup exactly.
 * merge:   add/overwrite records by id; records only present locally are kept (newer updatedAt wins).
 */
export async function importSnapshot(db: GarageDB, snap: Snapshot, mode: 'replace' | 'merge'): Promise<ImportSummary> {
  if (mode === 'replace') await db.clearEverything()
  const counts: ImportSummary['counts'] = {}
  for (const n of STORE_NAMES) {
    const incoming = snap.data[n] as Array<{ id: string; updatedAt?: string }>
    if (!incoming.length) continue
    let toWrite = incoming
    if (mode === 'merge') {
      const existing = new Map((await db.getAll(n)).map(r => [r.id, r as { id: string; updatedAt?: string }]))
      toWrite = incoming.filter(r => {
        const cur = existing.get(r.id)
        return !cur || (r.updatedAt ?? '') >= (cur.updatedAt ?? '')
      })
    }
    await db.putMany(n, toWrite as never)
    counts[n] = toWrite.length
  }
  let blobCount = 0
  for (const [id, b] of Object.entries(snap.blobs)) {
    if (mode === 'merge' && (await db.getBlob(id))) continue
    await db.putBlob(id, dataUrlToBlob(b.dataUrl))
    blobCount++
  }
  await db.setMeta('baseline-v1', true) // an imported backup is a complete garage; never re-seed over it
  return { mode, counts, blobs: blobCount }
}

/* ------------------------------ CSV export ------------------------------ */

export type CsvKind = 'fuel' | 'maintenance' | 'services' | 'parts' | 'mods' | 'mileage'
export const CSV_KINDS: Array<{ kind: CsvKind; label: string }> = [
  { kind: 'mileage', label: 'Mileage' }, { kind: 'fuel', label: 'Fuel' }, { kind: 'maintenance', label: 'Maintenance' },
  { kind: 'services', label: 'Service history' }, { kind: 'parts', label: 'Parts' }, { kind: 'mods', label: 'Mods' }
]

export async function exportCsv(db: GarageDB, kind: CsvKind): Promise<string> {
  const shops = new Map((await db.getAll('shops')).map(s => [s.id, s.name]))
  switch (kind) {
    case 'mileage': {
      const rows = (await db.getAll('mileage')).sort((a, b) => (a.date < b.date ? -1 : 1))
      return toCsv(['date', 'odometer', 'note'], rows.map(r => [r.date, r.odometer, r.note]))
    }
    case 'fuel': {
      const rows = (await db.getAll('fuel')).sort((a, b) => (a.date < b.date ? -1 : 1))
      return toCsv(
        ['date', 'odometer', 'gallons', 'price_per_gallon', 'total_price', 'fuel_type', 'station', 'full_tank', 'missed_previous', 'notes'],
        rows.map(r => [r.date, r.odometer, r.gallons, r.pricePerGallon, r.totalPrice, r.fuelType, r.station, r.full, r.missedPrevious, r.notes])
      )
    }
    case 'maintenance': {
      const items = new Map((await db.getAll('maintItems')).map(i => [i.id, i]))
      const rows = (await db.getAll('maintRecords')).sort((a, b) => (a.date < b.date ? -1 : 1))
      return toCsv(
        ['date', 'item', 'category', 'mileage', 'cost', 'notes'],
        rows.map(r => [r.date, items.get(r.itemId)?.name ?? '', items.get(r.itemId)?.category ?? '', r.mileage, r.cost, r.notes])
      )
    }
    case 'services': {
      const rows = (await db.getAll('services')).sort((a, b) => (a.date < b.date ? -1 : 1))
      return toCsv(
        ['date', 'mileage', 'title', 'type', 'shop', 'total', 'line_items', 'notes'],
        rows.map(r => [r.date, r.mileage, r.title, r.kind, r.shopId ? shops.get(r.shopId) ?? '' : '', serviceTotal(r),
          r.lineItems.map(l => `${l.name} (${l.type}) $${l.cost}`).join('; '), r.notes])
      )
    }
    case 'parts': {
      const rows = await db.getAll('parts')
      return toCsv(
        ['name', 'part_number', 'brand', 'supplier', 'price', 'quantity', 'purchase_date', 'install_date', 'mileage', 'warranty', 'url', 'notes'],
        rows.map(r => [r.name, r.partNumber, r.brand, r.supplier, r.price, r.quantity, r.purchaseDate, r.installDate, r.mileage, r.warranty, r.url, r.notes])
      )
    }
    case 'mods': {
      const rows = await db.getAll('mods')
      return toCsv(
        ['name', 'category', 'brand', 'part', 'status', 'price', 'labor', 'total', 'install_date', 'install_mileage', 'shop', 'url', 'notes'],
        rows.map(r => [r.name, r.category, r.brand, r.partName, r.status, r.price, r.laborCost, modTotal(r), r.installDate, r.installMileage,
          r.shopId ? shops.get(r.shopId) ?? '' : '', r.productUrl, r.notes] as CsvCell[])
      )
    }
  }
}

/** Trigger a browser download (works in Safari / installed PWA via the share sheet). */
export function downloadText(filename: string, text: string, mime = 'application/json') {
  downloadBlob(filename, new Blob([text], { type: mime + ';charset=utf-8' }))
}
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
