import type { Vehicle } from '../types/models'
import { checkVin, normalizeVin } from '../lib/vin'

/**
 * VIN decoding seam. Only runs when the user taps "Decode VIN" (needs a network connection) and the
 * result is shown as *suggestions* – nothing is written to the vehicle until the user accepts it.
 * Default provider: the free NHTSA vPIC API (no key). Swap by implementing `VinDecoder`.
 */
export interface DecodedVin {
  fields: Partial<Pick<Vehicle, 'year' | 'make' | 'model' | 'trim' | 'engine' | 'drivetrain' | 'transmission' | 'horsepower' | 'fuelType'>>
  /** Plain list for display: label, value */
  details: Array<[string, string]>
  errors: string[]
}

export interface VinDecoder { readonly name: string; decode(vin: string): Promise<DecodedVin> }

const clean = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim() !== 'Not Applicable' ? v.trim() : '')

export const NhtsaVinDecoder: VinDecoder = {
  name: 'NHTSA vPIC',
  async decode(raw) {
    const vin = normalizeVin(raw)
    const check = checkVin(vin)
    if (vin.length !== 17 || !check.ok) throw new Error(check.message || 'Enter a valid 17-character VIN first')
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`)
    if (!res.ok) throw new Error(`VIN service returned ${res.status}`)
    const j = await res.json() as { Results?: Array<Record<string, string>> }
    const r = j.Results?.[0]
    if (!r) throw new Error('VIN service returned no data')
    const year = Number(clean(r.ModelYear)) || undefined
    const disp = clean(r.DisplacementL)
    const cyl = clean(r.EngineCylinders)
    const turbo = clean(r.Turbo)
    const engineModel = clean(r.EngineModel)
    const engine = [engineModel, disp && `${Number(disp).toFixed(1)}L`, turbo.toLowerCase() === 'yes' ? 'Turbo' : '', cyl && `${cyl}-cyl`].filter(Boolean).join(' ')
    const hp = Number(clean(r.EngineHP)) || undefined
    const fields: DecodedVin['fields'] = {
      year, make: clean(r.Make) || undefined, model: clean(r.Model) || undefined, trim: clean(r.Trim) || clean(r.Series) || undefined,
      engine: engine || undefined, drivetrain: clean(r.DriveType) || undefined, transmission: clean(r.TransmissionStyle) || undefined,
      horsepower: hp, fuelType: clean(r.FuelTypePrimary) || undefined
    }
    const details: Array<[string, string]> = Object.entries({
      Year: clean(r.ModelYear), Make: clean(r.Make), Model: clean(r.Model), Trim: clean(r.Trim) || clean(r.Series), Body: clean(r.BodyClass),
      Engine: engine, Drive: clean(r.DriveType), Transmission: clean(r.TransmissionStyle), 'Fuel': clean(r.FuelTypePrimary),
      Plant: [clean(r.PlantCity), clean(r.PlantCountry)].filter(Boolean).join(', '), 'Horsepower': clean(r.EngineHP)
    }).filter(([, v]) => v) as Array<[string, string]>
    const errors = clean(r.ErrorCode) && clean(r.ErrorCode) !== '0' ? [clean(r.ErrorText)] : []
    return { fields, details, errors }
  }
}

let decoder: VinDecoder = NhtsaVinDecoder
export const getVinDecoder = () => decoder
export const setVinDecoder = (d: VinDecoder) => { decoder = d }
