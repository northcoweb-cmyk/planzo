import type { MaintenanceCategory, MaintenanceItem } from '../types/models'
import { nowIso } from '../lib/id'

/**
 * Starting maintenance catalog for an N55 / 8HP F25 X3. Intervals are TYPICAL values used by owners
 * and independent shops – they are NOT a substitute for the owner's manual or the car's Condition
 * Based Service (CBS) readout. Every interval is editable (Settings > Maintenance Intervals) and
 * items with no fixed interval are "condition based" (inspect, never "due").
 */
export interface CatalogEntry {
  key: string
  name: string
  category: MaintenanceCategory
  intervalMiles: number | null
  intervalMonths: number | null
  basis: 'typical' | 'condition'
  notes: string
}

export const MAINTENANCE_CATALOG: CatalogEntry[] = [
  { key: 'engine-oil', name: 'Engine Oil + Filter', category: 'Engine', intervalMiles: 7500, intervalMonths: 12, basis: 'typical', notes: 'BMW CBS often allows ~10,000 mi; many N55 owners shorten it.' },
  { key: 'spark-plugs', name: 'Spark Plugs', category: 'Engine', intervalMiles: 60000, intervalMonths: null, basis: 'typical', notes: 'N55 turbo engines are commonly done 40–60k mi.' },
  { key: 'engine-air-filter', name: 'Engine Air Filter', category: 'Filters', intervalMiles: 30000, intervalMonths: 36, basis: 'typical', notes: '' },
  { key: 'cabin-air-filter', name: 'Cabin Air Filter', category: 'Filters', intervalMiles: 20000, intervalMonths: 24, basis: 'typical', notes: '' },
  { key: 'brake-fluid', name: 'Brake Fluid', category: 'Brakes', intervalMiles: null, intervalMonths: 24, basis: 'typical', notes: 'Time-based: fluid absorbs moisture.' },
  { key: 'transmission-service', name: 'Transmission Service', category: 'Drivetrain', intervalMiles: 60000, intervalMonths: null, basis: 'typical', notes: 'ZF 8HP; BMW calls it "lifetime" – most specialists recommend a fluid + filter service.' },
  { key: 'transfer-case-fluid', name: 'Transfer Case Fluid', category: 'Drivetrain', intervalMiles: 60000, intervalMonths: null, basis: 'typical', notes: 'xDrive.' },
  { key: 'differential-fluid', name: 'Differential Fluid (Front + Rear)', category: 'Drivetrain', intervalMiles: 60000, intervalMonths: null, basis: 'typical', notes: '' },
  { key: 'coolant', name: 'Coolant', category: 'Fluids', intervalMiles: 60000, intervalMonths: 48, basis: 'typical', notes: '' },
  { key: 'brake-pads', name: 'Brake Pads', category: 'Brakes', intervalMiles: null, intervalMonths: null, basis: 'condition', notes: 'Replace by wear sensor / thickness, not by mileage.' },
  { key: 'brake-rotors', name: 'Brake Rotors', category: 'Brakes', intervalMiles: null, intervalMonths: null, basis: 'condition', notes: 'Replace by wear / thickness.' },
  { key: 'battery', name: 'Battery', category: 'Electrical', intervalMiles: null, intervalMonths: 60, basis: 'typical', notes: 'AGM battery; needs registration to the car after replacement.' },
  { key: 'tire-rotation', name: 'Tire Rotation', category: 'Tires & Wheels', intervalMiles: 6000, intervalMonths: 6, basis: 'typical', notes: '' },
  { key: 'tires', name: 'Tires', category: 'Tires & Wheels', intervalMiles: null, intervalMonths: null, basis: 'condition', notes: 'Replace by tread depth / age (6–10 years).' },
  { key: 'alignment', name: 'Alignment', category: 'Tires & Wheels', intervalMiles: null, intervalMonths: 12, basis: 'typical', notes: 'Also after suspension work or new tires.' },
  { key: 'wipers', name: 'Wiper Blades', category: 'Body & Wipers', intervalMiles: null, intervalMonths: 12, basis: 'typical', notes: '' }
]

export function catalogItems(): MaintenanceItem[] {
  const t = nowIso()
  return MAINTENANCE_CATALOG.map(c => ({
    id: 'mi-' + c.key,
    key: c.key,
    name: c.name,
    category: c.category,
    intervalMiles: c.intervalMiles,
    intervalMonths: c.intervalMonths,
    basis: c.basis,
    enabled: true,
    notes: c.notes,
    createdAt: t,
    updatedAt: t
  }))
}

export const CATEGORIES: MaintenanceCategory[] = [
  'Engine', 'Fluids', 'Filters', 'Brakes', 'Drivetrain', 'Tires & Wheels', 'Electrical', 'Body & Wipers', 'Other'
]
