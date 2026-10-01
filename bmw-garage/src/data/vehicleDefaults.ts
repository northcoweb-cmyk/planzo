import type { Vehicle } from '../types/models'
import { nowIso } from '../lib/id'

/**
 * The single source of truth for the car's identity. Every screen reads from the stored Vehicle
 * (seeded from these defaults) – nothing is retyped per page. Spec fields are facts supplied by the
 * owner; VIN / plate / purchase info start empty and are never invented.
 */
export const VEHICLE_ID = 'vehicle'

export const VEHICLE_DEFAULTS: Omit<Vehicle, 'createdAt' | 'updatedAt'> = {
  id: VEHICLE_ID,
  year: 2017,
  make: 'BMW',
  model: 'X3',
  trim: 'xDrive35i',
  generation: 'F25 LCI',
  engine: 'N55 3.0L Turbo I6',
  drivetrain: 'xDrive AWD',
  transmission: '8-speed automatic',
  color: 'Black Sapphire Metallic',
  colorCode: '475',
  horsepower: 300,
  fuelType: 'Premium gasoline',
  vin: '',
  plate: '',
  purchaseDate: '',
  purchaseMileage: null,
  purchasePrice: null,
  estimatedValue: null,
  valueUpdatedAt: '',
  notes: ''
}

export function newVehicle(): Vehicle {
  const t = nowIso()
  return { ...VEHICLE_DEFAULTS, createdAt: t, updatedAt: t }
}

export const vehicleTitle = (v: Vehicle) => `${v.year} ${v.make} ${v.model} ${v.trim}`.trim()
export const vehicleShort = (v: Vehicle) => `${v.make} ${v.model}`
