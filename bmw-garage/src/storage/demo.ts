import type { Attachment, FuelEntry, MaintenanceRecord, Mod, Part, Receipt, Reminder, ServiceRecord, Shop, MileageEntry } from '../types/models'
import type { GarageDB } from './db'
import { newVehicle } from '../data/vehicleDefaults'
import { catalogItems } from '../data/maintenanceCatalog'
import { defaultSettings } from '../data/settingsDefaults'
import { addDays, addMonths, todayStr } from '../lib/dates'
import { round2 } from '../lib/format'

/**
 * EXAMPLE DATA ONLY. Lives in its own database ('bmw-garage-demo'), every record is flagged
 * `demo: true`, and the UI shows a permanent "Demo data" banner. None of this is the owner's real
 * history. Numbers are anchored on the examples used while designing the app
 * (65,482 mi, 64,900 -> 65,180 mi on 13.0 gal = 21.54 MPG, ~488 mi/week).
 */

// Deterministic pseudo-random so the demo looks the same every time.
function rng(seed: number) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }

const stamp = (i: number) => new Date(Date.UTC(2025, 0, 1, 0, 0, i)).toISOString()

export interface DemoData {
  vehicle: ReturnType<typeof newVehicle>
  mileage: MileageEntry[]
  fuel: FuelEntry[]
  services: ServiceRecord[]
  maintRecords: MaintenanceRecord[]
  mods: Mod[]
  parts: Part[]
  reminders: Reminder[]
  shops: Shop[]
  receipts: Receipt[]
  attachments: Attachment[]
  receiptSpecs: Array<{ receiptId: string; attachmentId: string; title: string; lines: Array<[string, number]>; vendor: string; date: string; total: number }>
}

export function buildDemoData(today: string = todayStr()): DemoData {
  const r = rng(7)
  let seq = 0
  const base = () => { seq++; return { createdAt: stamp(seq), updatedAt: stamp(seq), demo: true as const } }
  const LATEST = 65482
  const RATE = 69.7

  // ---- mileage: weekly readings, 14 weeks, ending on `today`
  const mileage: MileageEntry[] = []
  const odoAtDaysAgo = (d: number): number => {
    if (d <= 98) return Math.round(LATEST - d * RATE)
    // purchase (420 d ago, 52,300) -> start of the weekly log (98 d ago)
    const start = Math.round(LATEST - 98 * RATE)
    return Math.round(52300 + ((420 - d) / (420 - 98)) * (start - 52300))
  }
  for (let w = 14; w >= 0; w--) {
    const d = w * 7
    const jitter = w === 0 ? 0 : Math.round((r() - 0.5) * 36)
    mileage.push({ id: 'dm-' + w, date: addDays(today, -d), odometer: odoAtDaysAgo(d) + jitter, note: w === 0 ? 'Example reading' : '', ...base() })
  }
  mileage.sort((a, b) => a.date.localeCompare(b.date))
  for (let i = 1; i < mileage.length; i++) if (mileage[i].odometer <= mileage[i - 1].odometer) mileage[i].odometer = mileage[i - 1].odometer + 10
  mileage[mileage.length - 1].odometer = LATEST

  // ---- fuel: a full tank roughly every 6-7 days; one split (partial + full) and one missed log
  const fuel: FuelEntry[] = []
  const stations = ['Example Gas & Go', 'Example Fuel Depot', 'Example Station']
  function mkFuel(daysAgo: number, odometer: number, gallons: number, ppg: number, full: boolean, missed: boolean): FuelEntry {
    return {
      id: 'df-' + (seq + 1), date: addDays(today, -daysAgo), odometer, gallons: round2(gallons), pricePerGallon: ppg, totalPrice: round2(gallons * ppg),
      fuelType: 'premium', station: stations[Math.floor(r() * stations.length)], full, missedPrevious: missed,
      notes: !full ? 'Partial fill (example)' : missed ? 'Forgot to log the previous fill (example)' : '', ...base()
    }
  }
  let day = 92
  let prevOdo = odoAtDaysAgo(day)
  fuel.push(mkFuel(day, prevOdo, 13.4, 4.09, true, false))
  let i = 0
  while (day > 14) {
    const step = 6 + Math.floor(r() * 2)
    if (day - step < 14) break
    day -= step
    const odo = odoAtDaysAgo(day)
    const gallons = (odo - prevOdo) / (20.4 + r() * 2.6) // tank-to-tank gallons for this stretch
    const ppg = 3.89 + Math.round(r() * 30) / 100
    if (i === 4) { // split: a top-up mid-way, then the full tank for the rest
      fuel.push(mkFuel(day + 3, Math.round((odo + prevOdo) / 2), gallons * 0.4, ppg, false, false))
      fuel.push(mkFuel(day, odo, gallons * 0.6, ppg, true, false))
    } else fuel.push(mkFuel(day, odo, gallons, ppg, true, i === 8))
    prevOdo = odo
    i++
  }
  // the worked example from the spec: 64,900 -> 65,180 = 280 mi on 13.0 gal = 21.54 MPG
  fuel.push(mkFuel(9, 64900, (64900 - prevOdo) / 21.3, 4.05, true, false))
  fuel.push(mkFuel(4, 65180, 13.0, 4.12, true, false))
  const fuelFinal = fuel

  // ---- shops
  const shops: Shop[] = [
    { id: 'ds-1', name: 'Example BMW Service Center', address: '100 Example Ave, Sampletown', phone: '(555) 010-0100', website: 'https://example.com', hours: 'Mon–Fri 7:30–5:30', notes: 'Example record', favorite: true, ...base() },
    { id: 'ds-2', name: 'Example Independent Euro Shop', address: '22 Sample Rd, Sampletown', phone: '(555) 010-0222', website: '', hours: 'Mon–Sat 8–5', notes: 'Example record', favorite: false, ...base() }
  ]

  // ---- parts
  const parts: Part[] = [
    { id: 'dp-1', name: 'N55 Spark Plugs (set of 6)', partNumber: '', brand: 'NGK', supplier: 'Example Parts Supply', price: 14, quantity: 6, purchaseDate: addDays(today, -37), installDate: addDays(today, -33), mileage: odoAtDaysAgo(33), warranty: '', url: '', notes: 'Example part', imageIds: [], receiptIds: [], ...base() },
    { id: 'dp-2', name: 'Cabin Air Filter', partNumber: '', brand: 'Example Brand', supplier: 'Example Parts Supply', price: 42, quantity: 1, purchaseDate: addDays(today, -37), installDate: addDays(today, -33), mileage: odoAtDaysAgo(33), warranty: '', url: '', notes: 'Example part', imageIds: [], receiptIds: [], ...base() },
    { id: 'dp-3', name: 'Gloss Black Kidney Grilles', partNumber: '', brand: 'Example Brand', supplier: 'Example Online Store', price: 129, quantity: 1, purchaseDate: addDays(today, -210), installDate: addDays(today, -205), mileage: odoAtDaysAgo(205), warranty: '1 year', url: 'https://example.com/grilles', notes: 'Example part', imageIds: [], receiptIds: [], ...base() }
  ]

  // ---- services (+ maintenance records)
  const services: ServiceRecord[] = []
  const maintRecords: MaintenanceRecord[] = []
  const receipts: Receipt[] = []
  const attachments: Attachment[] = []
  const receiptSpecs: DemoData['receiptSpecs'] = []
  const svc = (id: string, daysAgo: number, title: string, kind: ServiceRecord['kind'], items: Array<[string, 'part' | 'labor' | 'fee', number, string?]>, shopId: string | null, itemKeys: string[], withReceipt: boolean, notes = 'Example service record') => {
    const date = addDays(today, -daysAgo)
    const mileageAt = daysAgo === 400 ? 52400 : odoAtDaysAgo(daysAgo)
    const lineItems = items.map(([name, type, cost, partId], k) => ({ id: `${id}-l${k}`, name, type, cost, partId }))
    const rec: ServiceRecord = {
      id, date, mileage: Math.round(mileageAt / 10) * 10, title, kind, lineItems, totalOverride: null, shopId,
      partIds: items.map(x => x[3]).filter(Boolean) as string[], maintenanceItemIds: itemKeys.map(k => 'mi-' + k), receiptIds: [], attachmentIds: [], notes, ...base()
    }
    if (withReceipt) {
      const rid = 'dr-' + id, aid = 'da-' + id
      const total = lineItems.reduce((t, l) => t + l.cost, 0)
      receipts.push({ id: rid, attachmentId: aid, title: title + ' – receipt', vendor: shops.find(s => s.id === shopId)?.name ?? '', date, amount: total, notes: 'Example receipt (generated image)', ocr: { status: 'none' }, ...base() })
      attachments.push({ id: aid, name: 'example-receipt.jpg', mime: 'image/jpeg', size: 0, width: 640, height: 900, ...base() })
      receiptSpecs.push({ receiptId: rid, attachmentId: aid, title, lines: items.map(([n, , c]) => [n, c] as [string, number]), vendor: shops.find(s => s.id === shopId)?.name ?? 'Example Shop', date, total })
      rec.receiptIds = [rid]
    }
    services.push(rec)
    itemKeys.forEach((k, idx) => maintRecords.push({ id: `dmr-${id}-${idx}`, itemId: 'mi-' + k, date, mileage: rec.mileage, cost: null, serviceId: id, notes: '', ...base() }))
  }
  svc('dsv-1', 400, 'Wiper blades', 'maintenance', [['Wiper blades (pair)', 'part', 38]], null, ['wipers'], false)
  svc('dsv-2', 300, 'Brake fluid flush', 'maintenance', [['Brake fluid flush', 'labor', 129]], 'ds-2', ['brake-fluid'], true)
  svc('dsv-3', 205, 'Gloss black kidney grilles installed', 'modification', [['Gloss black kidney grilles', 'part', 129, 'dp-3'], ['Install labor', 'labor', 40]], null, [], false)
  svc('dsv-4', 120, 'Coolant leak diagnosis', 'repair', [['Diagnostic + pressure test', 'labor', 165]], 'ds-2', [], true, 'Example repair record')
  svc('dsv-5', 85, 'Tire rotation + inspection', 'maintenance', [['Tire rotation', 'labor', 45]], 'ds-2', ['tire-rotation'], false)
  svc('dsv-6', 50, 'Oil + filter service', 'maintenance', [['Engine oil + filter', 'part', 74], ['Labor', 'labor', 44]], 'ds-1', ['engine-oil'], true)
  svc('dsv-7', 33, 'Spark plugs + cabin filter', 'maintenance', [['Spark plugs (6)', 'part', 284, 'dp-1'], ['Cabin filter', 'part', 42, 'dp-2'], ['Labor', 'labor', 86]], 'ds-1', ['spark-plugs', 'cabin-air-filter'], true)
  parts[0].receiptIds = ['dr-dsv-7']

  // ---- mods
  const mods: Mod[] = [
    { id: 'dmod-1', name: 'Gloss Black Kidney Grilles', category: 'Exterior', brand: 'Example Brand', partName: 'Front grille set', price: 129, installDate: addDays(today, -205), installMileage: odoAtDaysAgo(205), status: 'installed', notes: 'Example mod – clips in, no tools.', productUrl: 'https://example.com/grilles', instructions: 'Pop the hood, release the 4 retaining clips, pull straight forward.', shopId: null, laborCost: 40, partIds: ['dp-3'], imageIds: [], receiptIds: [], ...base() },
    { id: 'dmod-2', name: 'Front Lip', category: 'Exterior', brand: 'Example Brand', partName: 'Front lip spoiler', price: 260, installDate: '', installMileage: null, status: 'planned', notes: 'Example planned mod.', productUrl: 'https://example.com/lip', instructions: '', shopId: null, laborCost: null, partIds: [], imageIds: [], receiptIds: [], ...base() },
    { id: 'dmod-3', name: 'Charge Pipe', category: 'Engine', brand: 'Example Brand', partName: 'Aluminium charge pipe', price: 189, installDate: addDays(today, -60), installMileage: odoAtDaysAgo(60), status: 'installed', notes: 'Example mod.', productUrl: '', instructions: '', shopId: 'ds-2', laborCost: 120, partIds: [], imageIds: [], receiptIds: [], ...base() },
    { id: 'dmod-4', name: 'Drop-in Intake', category: 'Engine', brand: 'Example Brand', partName: 'Intake', price: 310, installDate: addDays(today, -300), installMileage: odoAtDaysAgo(300), status: 'removed', notes: 'Example: removed, back to stock airbox.', productUrl: '', instructions: '', shopId: null, laborCost: null, partIds: [], imageIds: [], receiptIds: [], ...base() }
  ]

  // ---- reminders
  const reminders: Reminder[] = [
    { id: 'drem-1', title: 'Oil change', dueMileage: 69500, dueDate: '', notes: 'Example reminder', maintenanceItemId: 'mi-engine-oil', completedAt: '', snoozedUntil: '', ...base() },
    { id: 'drem-2', title: 'Tire rotation', dueMileage: 65900, dueDate: '', notes: 'Example reminder', maintenanceItemId: 'mi-tire-rotation', completedAt: '', snoozedUntil: '', ...base() },
    { id: 'drem-3', title: 'Registration renewal', dueMileage: null, dueDate: addDays(today, 24), notes: 'Example reminder', maintenanceItemId: null, completedAt: '', snoozedUntil: '', ...base() },
    { id: 'drem-4', title: 'Brake fluid', dueMileage: null, dueDate: addMonths(addDays(today, -300), 24), notes: 'Example reminder', maintenanceItemId: 'mi-brake-fluid', completedAt: '', snoozedUntil: '', ...base() },
    { id: 'drem-5', title: 'Check tire pressures', dueMileage: null, dueDate: addDays(today, -20), notes: 'Example reminder', maintenanceItemId: null, completedAt: stamp(900), snoozedUntil: '', ...base() }
  ]

  const vehicle = newVehicle()
  vehicle.purchaseDate = addDays(today, -420)
  vehicle.purchaseMileage = 52300
  vehicle.purchasePrice = 21500
  vehicle.estimatedValue = 17800
  vehicle.valueUpdatedAt = addDays(today, -10)
  vehicle.notes = 'DEMO vehicle details – purchase info and value are examples. VIN and plate left blank.'

  return { vehicle, mileage, fuel: fuelFinal, services, maintRecords, mods, parts, reminders, shops, receipts, attachments, receiptSpecs }
}

/** Draw a believable-looking EXAMPLE receipt so the receipt UI has something to show (browser only). */
export async function renderDemoReceipt(spec: DemoData['receiptSpecs'][number]): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = 640; c.height = 900
  const g = c.getContext('2d')!
  g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 640, 900)
  g.fillStyle = '#222'; g.font = 'bold 30px ui-monospace, Menlo, monospace'; g.textAlign = 'center'
  g.fillText(spec.vendor.toUpperCase().slice(0, 28), 320, 80)
  g.font = '20px ui-monospace, Menlo, monospace'
  g.fillText('EXAMPLE RECEIPT – NOT REAL', 320, 118)
  g.fillText(spec.date, 320, 150)
  g.textAlign = 'left'
  let y = 230
  g.fillText(spec.title.slice(0, 32), 50, y); y += 50
  for (const [name, cost] of spec.lines) {
    g.fillText(name.slice(0, 26), 50, y)
    g.textAlign = 'right'; g.fillText('$' + cost.toFixed(2), 590, y); g.textAlign = 'left'
    y += 38
  }
  g.fillRect(50, y, 540, 2); y += 44
  g.font = 'bold 26px ui-monospace, Menlo, monospace'
  g.fillText('TOTAL', 50, y); g.textAlign = 'right'; g.fillText('$' + spec.total.toFixed(2), 590, y)
  g.save(); g.translate(320, 640); g.rotate(-0.35); g.font = 'bold 70px sans-serif'; g.fillStyle = 'rgba(200,0,0,.18)'; g.textAlign = 'center'; g.fillText('DEMO', 0, 0); g.restore()
  return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.8))
}

export async function seedDemo(db: GarageDB, today: string = todayStr()): Promise<void> {
  const d = buildDemoData(today)
  await db.put('vehicle', d.vehicle)
  await db.put('settings', defaultSettings())
  const items = catalogItems().map(i => ({ ...i, demo: true as const }))
  await db.putMany('maintItems', items)
  await db.putMany('mileage', d.mileage)
  await db.putMany('fuel', d.fuel)
  await db.putMany('shops', d.shops)
  await db.putMany('parts', d.parts)
  await db.putMany('services', d.services)
  await db.putMany('maintRecords', d.maintRecords)
  await db.putMany('mods', d.mods)
  await db.putMany('reminders', d.reminders)
  await db.putMany('receipts', d.receipts)
  for (const spec of d.receiptSpecs) {
    const blob = await renderDemoReceipt(spec)
    const att = d.attachments.find(a => a.id === spec.attachmentId)!
    if (blob) { att.size = blob.size; await db.putBlob(att.id, blob) }
  }
  await db.putMany('attachments', d.attachments.filter(a => a.size > 0))
  await db.setMeta('baseline-v1', true)
  await db.setMeta('demo-seeded', true)
}
