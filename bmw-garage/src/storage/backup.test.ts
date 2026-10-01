import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { GarageDB } from './db'
import { ensureBaseline } from './seed'
import { buildDemoData, seedDemo } from './demo'
import { exportCsv, exportSnapshot, importSnapshot, parseSnapshot, ImportError } from './backup'
import { analyzeFuel } from '../calc/fuel'
import { collectReadings, computeMileageStats, projectAhead } from '../calc/mileage'

let seq = 0
async function freshDb() {
  // fake-indexeddb: unique name per test via dataset trick -> open 'live' then wipe
  const db = await GarageDB.open(seq++ % 2 === 0 ? 'live' : 'demo')
  await db.clearEverything()
  return db
}

describe('storage + backup', () => {
  let db: GarageDB
  beforeEach(async () => { db = await freshDb() })

  it('bootstraps a live database with the vehicle, settings and catalog but no fake history', async () => {
    await ensureBaseline(db)
    expect((await db.getAll('vehicle'))[0].model).toBe('X3')
    expect((await db.getAll('maintItems')).length).toBeGreaterThan(10)
    expect(await db.getAll('mileage')).toHaveLength(0)
    expect(await db.getAll('fuel')).toHaveLength(0)
    await ensureBaseline(db) // idempotent
    expect((await db.getAll('vehicle'))).toHaveLength(1)
  })

  it('persists records and blobs and reads them back', async () => {
    await db.put('mileage', { id: 'a', date: '2025-10-01', odometer: 65482, note: '', createdAt: '', updatedAt: '' })
    await db.putBlob('b1', new Blob(['hello'], { type: 'text/plain' }))
    expect((await db.get('mileage', 'a'))!.odometer).toBe(65482)
    expect(await (await db.getBlob('b1'))!.text()).toBe('hello')
    await db.delete('mileage', 'a')
    expect(await db.get('mileage', 'a')).toBeUndefined()
  })

  it('exports everything to JSON and restores it exactly (replace)', async () => {
    await seedDemo(db, '2025-10-01')
    await db.putBlob('blob-x', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }))
    const snap = await exportSnapshot(db)
    const text = JSON.stringify(snap)
    const other = await freshDb()
    await other.put('mileage', { id: 'junk', date: '2024-01-01', odometer: 1, note: '', createdAt: '', updatedAt: '' })
    const sum = await importSnapshot(other, parseSnapshot(text), 'replace')
    expect(sum.counts.fuel).toBe(snap.data.fuel.length)
    expect(await other.get('mileage', 'junk')).toBeUndefined() // replace wipes first
    expect(await other.getAll('services')).toEqual(snap.data.services)
    expect(await other.getAll('maintRecords')).toEqual(snap.data.maintRecords)
    expect(Array.from(new Uint8Array(await (await other.getBlob('blob-x'))!.arrayBuffer()))).toEqual([1, 2, 3, 4])
    // calculations on restored data are identical
    const a = analyzeFuel(await db.getAll('fuel')), b = analyzeFuel(await other.getAll('fuel'))
    expect(b.averageMpg).toBe(a.averageMpg)
  })

  it('merge keeps local-only records and prefers the newer updatedAt', async () => {
    await db.put('mileage', { id: 'a', date: '2025-10-01', odometer: 100, note: 'local', createdAt: '', updatedAt: '2025-10-02T00:00:00Z' })
    await db.put('mileage', { id: 'only-local', date: '2025-10-03', odometer: 120, note: '', createdAt: '', updatedAt: '2025-10-03T00:00:00Z' })
    const snap = await exportSnapshot(await (async () => { const o = await freshDb(); await o.put('mileage', { id: 'a', date: '2025-10-01', odometer: 999, note: 'older backup', createdAt: '', updatedAt: '2025-09-01T00:00:00Z' }); await o.put('mileage', { id: 'new', date: '2025-10-05', odometer: 150, note: '', createdAt: '', updatedAt: '2025-10-05T00:00:00Z' }); return o })())
    await importSnapshot(db, snap, 'merge')
    const all = await db.getAll('mileage')
    expect(all.map(m => m.id).sort()).toEqual(['a', 'new', 'only-local'])
    expect(all.find(m => m.id === 'a')!.odometer).toBe(100) // local was newer
  })

  it('rejects bad or foreign files with a clear message and leaves the DB untouched', async () => {
    await db.put('mileage', { id: 'a', date: '2025-10-01', odometer: 1, note: '', createdAt: '', updatedAt: '' })
    expect(() => parseSnapshot('not json')).toThrow(ImportError)
    expect(() => parseSnapshot('{"app":"other"}')).toThrow(/not a BMW Garage backup/)
    expect(() => parseSnapshot(JSON.stringify({ app: 'bmw-garage', schema: 99, data: {} }))).toThrow(/newer version/)
    expect(() => parseSnapshot(JSON.stringify({ app: 'bmw-garage', schema: 1, data: { fuel: [{ nope: 1 }] } }))).toThrow(/without an id/)
    expect(await db.getAll('mileage')).toHaveLength(1)
  })

  it('exports CSV for every collection', async () => {
    await seedDemo(db, '2025-10-01')
    for (const k of ['fuel', 'maintenance', 'services', 'parts', 'mods', 'mileage'] as const) {
      const csv = await exportCsv(db, k)
      expect(csv.split('\r\n').length).toBeGreaterThan(2)
    }
    expect((await exportCsv(db, 'fuel')).startsWith('date,odometer,gallons')).toBe(true)
  })
})

describe('demo dataset', () => {
  it('is flagged, internally consistent and reproduces the worked examples', () => {
    const d = buildDemoData('2025-10-01')
    expect(d.mileage.every(m => m.demo) && d.fuel.every(f => f.demo) && d.services.every(s => s.demo)).toBe(true)
    const readings = collectReadings({ mileage: d.mileage, fuel: d.fuel, services: d.services, vehicle: d.vehicle })
    expect(readings.filter(r => !r.valid)).toEqual([])
    const stats = computeMileageStats(readings)
    expect(stats.latest!.odometer).toBe(65482)
    expect(stats.weeklyAvg!).toBeGreaterThan(440)
    expect(stats.weeklyAvg!).toBeLessThan(540)
    expect(projectAhead(stats, 7)!).toBeGreaterThan(65482)
    const fuel = analyzeFuel(d.fuel)
    const row = fuel.rows.find(r => r.entry.odometer === 65180)!
    expect(row.miles).toBe(280)
    expect(row.mpg!).toBeCloseTo(21.54, 2)
    expect(fuel.averageMpg!).toBeGreaterThan(18)
    expect(fuel.averageMpg!).toBeLessThan(26)
    expect(fuel.rows.some(r => r.status === 'partial')).toBe(true)
  })
})
