import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  Attachment, FuelEntry, ID, MaintenanceItem, MaintenanceRecord, MileageEntry, Mod, Part, Receipt, Reminder,
  ServiceRecord, Settings, Shop, StoreMap, StoreName, Vehicle
} from '../types/models'
import { GarageDB } from '../storage/db'
import { getDataset, setDataset, type DatasetId } from '../storage/dataset'
import { ensureBaseline } from '../storage/seed'
import { seedDemo } from '../storage/demo'
import { exportSnapshot, importSnapshot, parseSnapshot, type ImportSummary } from '../storage/backup'
import { uid, nowIso } from '../lib/id'
import { processImage } from '../lib/image'
import { todayStr } from '../lib/dates'
import { defaultSettings, SETTINGS_ID } from '../data/settingsDefaults'
import { VEHICLE_ID, newVehicle } from '../data/vehicleDefaults'
import { collectReadings, computeMileageStats, currentActualMileage, type MileageStats, type Reading } from '../calc/mileage'
import { analyzeFuel, indexRows, type FuelRow, type FuelStats } from '../calc/fuel'
import { evaluateAll, groupMaintenance, type MaintEval, type MaintGroups } from '../calc/maintenance'
import { evaluateReminder, type ReminderEval } from '../calc/reminders'
import { ownershipCosts, serviceTotal, type Ownership } from '../calc/costs'

export interface GarageData {
  vehicle: Vehicle
  settings: Settings
  mileage: MileageEntry[]
  fuel: FuelEntry[]
  maintItems: MaintenanceItem[]
  maintRecords: MaintenanceRecord[]
  services: ServiceRecord[]
  receipts: Receipt[]
  attachments: Attachment[]
  mods: Mod[]
  parts: Part[]
  reminders: Reminder[]
  shops: Shop[]
}

type ListStore = Exclude<StoreName, 'vehicle' | 'settings'>
/** Fields every caller omits; the data layer owns identity and timestamps. */
type Draft<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: ID }

export interface Derived {
  today: string
  readings: Reading[]
  mileage: MileageStats
  currentOdo: number | null
  fuel: FuelStats
  fuelRows: Map<ID, FuelRow>
  maint: MaintEval[]
  maintGroups: MaintGroups
  reminders: ReminderEval[]
  /** items needing attention: overdue maintenance + overdue/due-soon reminders */
  attentionCount: number
  ownership: Ownership
  maintenanceSpend: number
  receiptsById: Map<ID, Receipt>
  shopsById: Map<ID, Shop>
  partsById: Map<ID, Part>
  itemsById: Map<ID, MaintenanceItem>
}

export interface GarageActions {
  save<K extends ListStore>(store: K, draft: Draft<StoreMap[K]>): Promise<StoreMap[K]>
  remove(store: ListStore, id: ID): Promise<void>
  saveVehicle(patch: Partial<Vehicle>): Promise<void>
  saveSettings(patch: Partial<Settings>): Promise<void>
  /** Save a service and keep its MaintenanceRecords in sync with `maintenanceItemIds`. */
  saveService(draft: Draft<ServiceRecord>): Promise<ServiceRecord>
  removeService(id: ID): Promise<void>
  /** Resize + store a photo; returns the attachment id. */
  addPhoto(file: File): Promise<Attachment>
  /** Photo + Receipt record in one go. */
  addReceipt(file: File, fields?: Partial<Pick<Receipt, 'title' | 'vendor' | 'date' | 'amount' | 'notes'>>): Promise<Receipt>
  removeReceipt(id: ID): Promise<void>
  removeImage(attachmentId: ID): Promise<void>
  getBlob(id: ID): Promise<Blob | undefined>
  switchDataset(d: DatasetId): Promise<void>
  exportAll(): Promise<string>
  importBackup(text: string, mode: 'replace' | 'merge'): Promise<ImportSummary>
  resetAll(): Promise<void>
  markBackedUp(): Promise<void>
  /** Delete photos that no record references (e.g. added in a form that was cancelled). Returns how many were removed. */
  pruneUnusedPhotos(): Promise<number>
}

interface Ctx {
  ready: boolean
  error: string | null
  dataset: DatasetId
  data: GarageData
  derived: Derived
  actions: GarageActions
  persisted: boolean | null
  demoActive: boolean
}

const GarageContext = createContext<Ctx | null>(null)

function emptyData(): GarageData {
  return {
    vehicle: newVehicle(), settings: defaultSettings(), mileage: [], fuel: [], maintItems: [], maintRecords: [], services: [],
    receipts: [], attachments: [], mods: [], parts: [], reminders: [], shops: []
  }
}

async function loadAll(db: GarageDB): Promise<GarageData> {
  const [vehicle, settings, mileage, fuel, maintItems, maintRecords, services, receipts, attachments, mods, parts, reminders, shops] = await Promise.all([
    db.get('vehicle', VEHICLE_ID), db.get('settings', SETTINGS_ID), db.getAll('mileage'), db.getAll('fuel'), db.getAll('maintItems'),
    db.getAll('maintRecords'), db.getAll('services'), db.getAll('receipts'), db.getAll('attachments'), db.getAll('mods'),
    db.getAll('parts'), db.getAll('reminders'), db.getAll('shops')
  ])
  return {
    vehicle: vehicle ?? newVehicle(), settings: { ...defaultSettings(), ...(settings ?? {}) }, mileage, fuel, maintItems, maintRecords,
    services, receipts, attachments, mods, parts, reminders, shops
  }
}

function useToday(): string {
  const [today, setToday] = useState(() => todayStr())
  useEffect(() => {
    const tick = () => setToday(t => { const n = todayStr(); return n === t ? t : n })
    document.addEventListener('visibilitychange', tick)
    const iv = setInterval(tick, 60_000)
    return () => { document.removeEventListener('visibilitychange', tick); clearInterval(iv) }
  }, [])
  return today
}

export function GarageProvider({ children }: { children: ReactNode }) {
  const [dataset, setDatasetState] = useState<DatasetId>(() => getDataset())
  const [data, setData] = useState<GarageData>(emptyData)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const dbRef = useRef<GarageDB | null>(null)
  const today = useToday()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const db = await GarageDB.open(dataset)
        if (dataset === 'demo') {
          if (!(await db.getMeta('demo-seeded'))) await seedDemo(db)
        } else await ensureBaseline(db)
        const d = await loadAll(db)
        if (cancelled) return
        dbRef.current = db
        setData(d)
        setReady(true)
        // Ask the browser not to evict our storage (important on iOS).
        try { if (navigator.storage?.persist) setPersisted(await navigator.storage.persist()) } catch { /* ignore */ }
      } catch (e) {
        console.error(e)
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { cancelled = true; dbRef.current?.close(); dbRef.current = null }
  }, [dataset])

  const db = () => {
    if (!dbRef.current) throw new Error('Database is not ready')
    return dbRef.current
  }

  /* ----------------------------- actions ----------------------------- */
  const actions = useMemo<GarageActions>(() => {
    const keyFor: Record<ListStore, keyof GarageData> = {
      mileage: 'mileage', fuel: 'fuel', maintItems: 'maintItems', maintRecords: 'maintRecords', services: 'services',
      receipts: 'receipts', attachments: 'attachments', mods: 'mods', parts: 'parts', reminders: 'reminders', shops: 'shops'
    }

    const upsertLocal = <T extends { id: ID }>(list: T[], rec: T): T[] => {
      const i = list.findIndex(x => x.id === rec.id)
      if (i === -1) return [...list, rec]
      const next = list.slice(); next[i] = rec; return next
    }

    async function save<K extends ListStore>(store: K, draft: Draft<StoreMap[K]>): Promise<StoreMap[K]> {
      const d = db()
      const key = keyFor[store]
      const t = nowIso()
      let rec: StoreMap[K]
      if (draft.id) {
        const existing = (await d.get(store, draft.id)) as StoreMap[K] | undefined
        rec = { ...(existing ?? {}), ...draft, id: draft.id, createdAt: existing?.createdAt ?? t, updatedAt: t } as StoreMap[K]
      } else rec = { ...draft, id: uid(), createdAt: t, updatedAt: t } as StoreMap[K]
      await d.put(store, rec)
      setData(prev => ({ ...prev, [key]: upsertLocal(prev[key] as Array<{ id: ID }>, rec as { id: ID }) }) as GarageData)
      return rec
    }

    async function remove(store: ListStore, id: ID) {
      await db().delete(store, id)
      const key = keyFor[store]
      setData(prev => ({ ...prev, [key]: (prev[key] as Array<{ id: ID }>).filter(x => x.id !== id) }) as GarageData)
    }

    async function saveVehicle(patch: Partial<Vehicle>) {
      const t = nowIso()
      const next = { ...data.vehicle, ...patch, id: VEHICLE_ID, updatedAt: t } as Vehicle
      await db().put('vehicle', next)
      setData(prev => ({ ...prev, vehicle: next }))
    }
    async function saveSettings(patch: Partial<Settings>) {
      const next = { ...data.settings, ...patch, id: SETTINGS_ID, updatedAt: nowIso() } as Settings
      await db().put('settings', next)
      setData(prev => ({ ...prev, settings: next }))
    }

    async function saveService(draft: Draft<ServiceRecord>) {
      const rec = await save('services', draft)
      const d = db()
      // Re-create the maintenance records that belong to this service
      const old = (await d.getAll('maintRecords')).filter(r => r.serviceId === rec.id)
      await d.deleteMany('maintRecords', old.map(r => r.id))
      const t = nowIso()
      const fresh: MaintenanceRecord[] = rec.maintenanceItemIds.map(itemId => ({
        id: uid(), itemId, date: rec.date, mileage: rec.mileage, cost: null, serviceId: rec.id, notes: '', createdAt: t, updatedAt: t
      }))
      await d.putMany('maintRecords', fresh)
      setData(prev => ({ ...prev, maintRecords: [...prev.maintRecords.filter(r => r.serviceId !== rec.id), ...fresh] }))
      return rec
    }

    async function removeService(id: ID) {
      const d = db()
      const old = (await d.getAll('maintRecords')).filter(r => r.serviceId === id)
      await d.deleteMany('maintRecords', old.map(r => r.id))
      await remove('services', id)
      setData(prev => ({ ...prev, maintRecords: prev.maintRecords.filter(r => r.serviceId !== id) }))
    }

    async function addPhoto(file: File) {
      const img = await processImage(file)
      const t = nowIso()
      const att: Attachment = { id: uid(), name: img.name, mime: 'image/jpeg', size: img.blob.size, width: img.width, height: img.height, createdAt: t, updatedAt: t }
      await db().putBlob(att.id, img.blob)
      await db().put('attachments', att)
      setData(prev => ({ ...prev, attachments: [...prev.attachments, att] }))
      return att
    }

    async function addReceipt(file: File, fields: Partial<Pick<Receipt, 'title' | 'vendor' | 'date' | 'amount' | 'notes'>> = {}) {
      const att = await addPhoto(file)
      return save('receipts', {
        attachmentId: att.id, title: fields.title ?? 'Receipt', vendor: fields.vendor ?? '', date: fields.date ?? todayStr(),
        amount: fields.amount ?? null, notes: fields.notes ?? '', ocr: { status: 'none' }
      })
    }

    /** Delete an attachment's metadata + binary. */
    async function dropAttachment(id: ID) {
      await db().deleteBlob(id)
      await remove('attachments', id)
    }

    /** Remove an image from every record that lists it, then delete it. */
    async function removeImage(attachmentId: ID) {
      const d = db()
      const touch = async <K extends 'mods' | 'parts' | 'services'>(store: K, list: StoreMap[K][], field: 'imageIds' | 'attachmentIds') => {
        for (const r of list as unknown as Array<Record<string, unknown> & { id: ID }>) {
          const ids = r[field] as ID[] | undefined
          if (ids?.includes(attachmentId)) await save(store, { ...(r as Record<string, unknown>), [field]: ids.filter(x => x !== attachmentId) } as never)
        }
      }
      await touch('mods', data.mods, 'imageIds')
      await touch('parts', data.parts, 'imageIds')
      await touch('services', data.services, 'attachmentIds')
      void d
      await dropAttachment(attachmentId)
    }

    async function removeReceipt(id: ID) {
      const rc = data.receipts.find(r => r.id === id)
      for (const s of data.services) if (s.receiptIds.includes(id)) await save('services', { ...s, receiptIds: s.receiptIds.filter(x => x !== id) })
      for (const m of data.mods) if (m.receiptIds.includes(id)) await save('mods', { ...m, receiptIds: m.receiptIds.filter(x => x !== id) })
      for (const p of data.parts) if (p.receiptIds.includes(id)) await save('parts', { ...p, receiptIds: p.receiptIds.filter(x => x !== id) })
      await remove('receipts', id)
      if (rc) await dropAttachment(rc.attachmentId)
    }

    async function switchDataset(ds: DatasetId) {
      setDataset(ds)
      setReady(false)
      setData(emptyData())
      setDatasetState(ds)
    }

    async function exportAll() {
      const snap = await exportSnapshot(db())
      await db().setMeta('lastBackupAt', snap.exportedAt)
      await saveSettings({ lastBackupAt: snap.exportedAt })
      return JSON.stringify(snap)
    }

    async function importBackup(text: string, mode: 'replace' | 'merge') {
      const snap = parseSnapshot(text)
      const summary = await importSnapshot(db(), snap, mode)
      setData(await loadAll(db()))
      return summary
    }

    async function resetAll() {
      const d = db()
      await d.clearEverything()
      if (dataset === 'demo') { await seedDemo(d) } else await ensureBaseline(d)
      setData(await loadAll(d))
    }

    async function markBackedUp() { await saveSettings({ lastBackupAt: nowIso() }) }

    async function pruneUnusedPhotos() {
      const used = new Set<ID>()
      data.receipts.forEach(r => used.add(r.attachmentId))
      data.mods.forEach(m => m.imageIds.forEach(i => used.add(i)))
      data.parts.forEach(p => p.imageIds.forEach(i => used.add(i)))
      data.services.forEach(sv => sv.attachmentIds.forEach(i => used.add(i)))
      const orphans = data.attachments.filter(a => !used.has(a.id))
      for (const a of orphans) await dropAttachment(a.id)
      return orphans.length
    }

    return {
      save, remove, saveVehicle, saveSettings, saveService, removeService, addPhoto, addReceipt, removeReceipt, removeImage,
      getBlob: id => db().getBlob(id), switchDataset, exportAll, importBackup, resetAll, markBackedUp, pruneUnusedPhotos
    }
    // `data` is read for patches / reference cleanup; recreating actions on data change is cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dataset])

  /* ----------------------------- derived ----------------------------- */
  const derived = useMemo<Derived>(() => {
    const { settings, vehicle } = data
    const readings = collectReadings({ mileage: data.mileage, fuel: data.fuel, services: data.services, vehicle, settings })
    const mileage = computeMileageStats(readings, { window: settings.mileageWindow, vehicle })
    const currentOdo = currentActualMileage(mileage)
    const fuel = analyzeFuel(data.fuel, { mpgMin: settings.mpgMin, mpgMax: settings.mpgMax })
    const maint = evaluateAll(data.maintItems, data.maintRecords, { currentMileage: currentOdo, today, stats: mileage, settings })
    const maintGroups = groupMaintenance(maint)
    const reminders = data.reminders.map(r => evaluateReminder(r, { currentMileage: currentOdo, today, dueSoonMiles: settings.dueSoonMiles, dueSoonDays: settings.dueSoonDays }))
    const attentionCount =
      maintGroups.overdue.length + maint.filter(m => m.status === 'dueSoon').length +
      reminders.filter(r => r.state === 'overdue' || r.state === 'dueSoon').length
    const ownership = ownershipCosts({ fuelTotal: fuel.totalCost, services: data.services, mods: data.mods, parts: data.parts })
    const maintenanceSpend = data.services.filter(s => s.kind !== 'modification').reduce((t, s) => t + serviceTotal(s), 0)
    return {
      today, readings, mileage, currentOdo, fuel, fuelRows: indexRows(fuel.rows), maint, maintGroups, reminders, attentionCount, ownership, maintenanceSpend,
      receiptsById: new Map(data.receipts.map(r => [r.id, r])), shopsById: new Map(data.shops.map(s => [s.id, s])),
      partsById: new Map(data.parts.map(p => [p.id, p])), itemsById: new Map(data.maintItems.map(i => [i.id, i]))
    }
  }, [data, today])

  const value = useMemo<Ctx>(
    () => ({ ready, error, dataset, data, derived, actions, persisted, demoActive: dataset === 'demo' }),
    [ready, error, dataset, data, derived, actions, persisted]
  )
  return <GarageContext.Provider value={value}>{children}</GarageContext.Provider>
}

export function useGarage(): Ctx {
  const c = useContext(GarageContext)
  if (!c) throw new Error('useGarage must be used inside <GarageProvider>')
  return c
}

/* ------------------------- attachment image hook ------------------------- */
const urlCache = new Map<ID, { url: string; refs: number }>()

export function useAttachmentUrl(id: ID | null | undefined): string | null {
  const { actions, ready } = useGarage()
  const [url, setUrl] = useState<string | null>(null)
  const getBlob = useRef(actions.getBlob)
  getBlob.current = actions.getBlob
  useEffect(() => {
    if (!id || !ready) { setUrl(null); return }
    let alive = true
    const hit = urlCache.get(id)
    if (hit) { hit.refs++; setUrl(hit.url) } else {
      getBlob.current(id).then(b => {
        if (!alive || !b) return
        const u = URL.createObjectURL(b)
        urlCache.set(id, { url: u, refs: 1 })
        setUrl(u)
      })
    }
    return () => {
      alive = false
      const c = urlCache.get(id)
      if (c && --c.refs <= 0) { setTimeout(() => { const c2 = urlCache.get(id); if (c2 && c2.refs <= 0) { URL.revokeObjectURL(c2.url); urlCache.delete(id) } }, 3000) }
    }
  }, [id, ready])
  return url
}
